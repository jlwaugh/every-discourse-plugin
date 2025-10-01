import { createPlugin } from "every-plugin";
import { Effect } from "every-plugin/effect";
import { implement } from "every-plugin/orpc";
import { z } from "every-plugin/zod";
import {
  DiscourseTopicSchema,
  DiscoursePostSchema,
  discourseContract,
  type DiscourseTopic,
  type DiscoursePost,
} from "./schemas";

const ONE_HOUR_MS = 60 * 60 * 1000;

// Helper functions
const parseTopics = (data: any[]): DiscourseTopic[] => {
  return data
    .map((t) => {
      try {
        return DiscourseTopicSchema.parse({
          id: t.id,
          title: t.title,
          slug: t.slug,
          posts_count: t.posts_count,
          views: t.views,
          like_count: t.like_count || 0,
          created_at: t.created_at,
          last_posted_at: t.last_posted_at,
          category_id: t.category_id,
          tags: t.tags || [],
        });
      } catch (error) {
        console.error("Failed to parse topic:", error, t);
        return null;
      }
    })
    .filter((t): t is DiscourseTopic => t !== null);
};

const parseTopic = (data: any): DiscourseTopic | null => {
  try {
    return DiscourseTopicSchema.parse({
      id: data.id,
      title: data.title,
      slug: data.slug,
      posts_count: data.posts_count,
      views: data.views,
      like_count: data.like_count || 0,
      created_at: data.created_at,
      last_posted_at: data.last_posted_at,
      category_id: data.category_id,
      tags: data.tags || [],
    });
  } catch (error) {
    console.error("Failed to parse topic:", error, data);
    return null;
  }
};

const parsePosts = (data: any[]): DiscoursePost[] => {
  return data
    .map((p) => {
      try {
        return DiscoursePostSchema.parse({
          id: p.id,
          topic_id: p.topic_id,
          username: p.username,
          cooked: p.cooked || p.blurb,
          created_at: p.created_at,
          like_count: p.like_count || 0,
        });
      } catch (error) {
        console.error("Failed to parse post:", error, p);
        return null;
      }
    })
    .filter((p): p is DiscoursePost => p !== null);
};

const callAPI = (
  baseUrl: string,
  timeout: number,
  apiKey: string | undefined,
  apiUsername: string | undefined,
  endpoint: string,
  params?: Record<string, any>,
  retryCount = 0
): Effect.Effect<any, never> => {
  return Effect.gen(function* () {
    const url = new URL(endpoint, baseUrl);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    const headers: Record<string, string> = {
      Accept: "application/json",
    };

    if (apiKey) {
      headers["Api-Key"] = apiKey;
      headers["Api-Username"] = apiUsername || "system";
    }

    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(url.toString(), {
          headers,
          signal: AbortSignal.timeout(timeout),
        }),
      catch: (error) => {
        console.error(
          `Discourse API error: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        return error;
      },
    }).pipe(Effect.orDie);

    if (response.status === 429 && retryCount < 3) {
      const backoffMs = Math.pow(2, retryCount) * 1000;
      console.log(`[Discourse] Rate limited, retrying in ${backoffMs}ms...`);
      yield* Effect.sleep(`${backoffMs} millis`);
      return yield* callAPI(
        baseUrl,
        timeout,
        apiKey,
        apiUsername,
        endpoint,
        params,
        retryCount + 1
      );
    }

    if (!response.ok) {
      console.error(`HTTP ${response.status}: ${response.statusText}`);
      return { post_stream: { posts: [] }, topic_list: { topics: [] } };
    }

    return yield* Effect.tryPromise({
      try: () => response.json(),
      catch: (error) => {
        console.error(
          `Failed to parse JSON: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        return error;
      },
    }).pipe(Effect.orDie);
  });
};

// NEW: Extract router logic into testable functions
type PluginContext = {
  baseUrl: string;
  timeout: number;
  batchSize: number;
  apiKey?: string;
  apiUsername?: string;
};

type MonitorState = {
  phase: "historical" | "realtime";
  lastTopicId?: number;
  lastChecked?: string;
};

const handleGetTopic = (
  context: PluginContext,
  topicId: number
): Effect.Effect<
  { topic: DiscourseTopic | null; posts: DiscoursePost[] },
  never
> => {
  return Effect.gen(function* () {
    const result = yield* callAPI(
      context.baseUrl,
      context.timeout,
      context.apiKey,
      context.apiUsername,
      `/t/${topicId}.json`
    );

    const topic = parseTopic(result);
    const posts = parsePosts(result.post_stream?.posts || []);

    return { topic, posts };
  });
};

const handleMonitor = (
  context: PluginContext,
  input: { category?: string; tags?: string[] },
  state: MonitorState | null
): Effect.Effect<
  {
    items: DiscourseTopic[];
    nextState: MonitorState | null;
  },
  never
> => {
  return Effect.gen(function* () {
    const currentState = state ?? {
      phase: "historical" as const,
      lastTopicId: undefined,
      lastChecked: undefined,
    };

    console.log(`[Discourse] Monitor - Phase: ${currentState.phase}`);

    // HISTORICAL PHASE
    if (currentState.phase === "historical") {
      const page = currentState.lastTopicId
        ? Math.floor(currentState.lastTopicId / context.batchSize)
        : 0;

      const result = yield* callAPI(
        context.baseUrl,
        context.timeout,
        context.apiKey,
        context.apiUsername,
        "/latest.json",
        {
          category: input.category,
          page: page,
        }
      );

      const topics = parseTopics(result.topic_list?.topics || []);

      if (topics.length === 0) {
        console.log("[Discourse] Historical complete → realtime");
        return {
          items: [],
          nextState: {
            phase: "realtime" as const,
            lastChecked: new Date().toISOString(),
          },
        };
      }

      const newLastTopicId = (currentState.lastTopicId || 0) + topics.length;

      return {
        items: topics,
        nextState: {
          ...currentState,
          lastTopicId: newLastTopicId,
        },
      };
    }

    // REALTIME PHASE
    const result = yield* callAPI(
      context.baseUrl,
      context.timeout,
      context.apiKey,
      context.apiUsername,
      "/latest.json",
      {
        category: input.category,
        per_page: context.batchSize,
      }
    );

    const allTopics = parseTopics(result.topic_list?.topics || []);
    const lastChecked = currentState.lastChecked
      ? new Date(currentState.lastChecked).getTime()
      : Date.now() - ONE_HOUR_MS;

    const newTopics = allTopics.filter(
      (t) => new Date(t.created_at).getTime() > lastChecked
    );

    console.log(`[Discourse] Realtime: ${newTopics.length} new topics`);

    return {
      items: newTopics,
      nextState: {
        phase: "realtime" as const,
        lastChecked: new Date().toISOString(),
      },
    };
  });
};

const handleSearch = (
  context: PluginContext,
  input: {
    query: string;
    filters?: {
      username?: string;
      minLikes?: number;
      after?: string;
    };
  },
  state: { phase: "historical" | "realtime"; lastTopicId?: number } | null
): Effect.Effect<
  {
    topics: DiscourseTopic[];
    posts: DiscoursePost[];
    nextState: {
      phase: "historical" | "realtime";
      lastTopicId?: number;
    } | null;
  },
  never
> => {
  return Effect.gen(function* () {
    const currentState = state ?? {
      phase: "historical" as const,
      lastTopicId: undefined,
      lastChecked: undefined,
    };

    let query = input.query;
    if (input.filters?.username) query += ` @${input.filters.username}`;
    if (input.filters?.after)
      query += ` after:${input.filters.after.split("T")[0]}`;

    const result = yield* callAPI(
      context.baseUrl,
      context.timeout,
      context.apiKey,
      context.apiUsername,
      "/search.json",
      {
        q: query,
        page: currentState.lastTopicId
          ? Math.floor(currentState.lastTopicId / 20)
          : 0,
      }
    );

    const topics = parseTopics(result.topics || []);
    const posts = parsePosts(result.posts || []);
    const hasMore = topics.length >= 20;

    return {
      topics,
      posts,
      nextState: hasMore
        ? {
            ...currentState,
            lastTopicId: (currentState.lastTopicId || 0) + topics.length,
          }
        : null,
    };
  });
};

export default createPlugin({
  id: "discourse-source",
  type: "source",

  variables: z.object({
    baseUrl: z.string().url().default("https://discourse.example.com"),
    timeout: z.number().min(1000).max(60000).default(10000),
    category: z.string().optional(),
    batchSize: z.number().min(1).max(100).default(20),
  }),

  secrets: z.object({
    apiKey: z.string().optional(),
    apiUsername: z.string().optional(),
  }),

  contract: discourseContract,

  initialize: (config) =>
    Effect.gen(function* () {
      console.log(`[Discourse] Initialized for ${config.variables.baseUrl}`);

      return {
        baseUrl: config.variables.baseUrl,
        timeout: config.variables.timeout,
        batchSize: config.variables.batchSize,
        apiKey: config.secrets.apiKey,
        apiUsername: config.secrets.apiUsername,
      };
    }),

  shutdown: (context) =>
    Effect.gen(function* () {
      console.log("[Discourse] Shutting down");
    }),

  createRouter: (context) => {
    const os = implement(discourseContract);

    const getTopic = os.getTopic.handler(({ input }) =>
      Effect.runPromise(handleGetTopic(context, input.id))
    );

    const monitor = os.monitor.handler(({ input, context: routerContext }) =>
      Effect.runPromise(
        handleMonitor(context, input, (routerContext as any)?.state ?? null)
      )
    );

    const search = os.search.handler(({ input, context: routerContext }) =>
      Effect.runPromise(
        handleSearch(context, input, (routerContext as any)?.state ?? null)
      )
    );

    return os.router({
      getTopic,
      monitor,
      search,
    });
  },
});

// Export for testing
export const testHelpers = {
  callAPI,
  parseTopics,
  parseTopic,
  parsePosts,
  handleGetTopic,
  handleMonitor,
  handleSearch,
};
