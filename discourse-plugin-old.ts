import {
  SimplePlugin,
  createConfigSchema,
  createStateSchema,
} from "every-plugin";
import { oc } from "@orpc/contract";
import { implement } from "@orpc/server";
import { z } from "zod";
import { Effect } from "effect";
import { DiscourseTopicSchema, DiscoursePostSchema } from "./types";

// Schemas
type Topic = z.infer<typeof DiscourseTopicSchema>;
type Post = z.infer<typeof DiscoursePostSchema>;

const ConfigSchema = createConfigSchema(
  z.object({
    baseUrl: z.string().url().default("https://discourse.example.com"),
    timeout: z.number().min(1000).max(60000).default(10000),
    category: z.string().optional(),
    batchSize: z.number().min(1).max(100).default(20),
  }),
  z.object({
    apiKey: z.string().optional(),
    apiUsername: z.string().optional(),
  })
);

const StateSchema = createStateSchema(
  z.object({
    phase: z.enum(["historical", "realtime"]).default("historical"),
    lastTopicId: z.number().optional(),
    lastChecked: z.string().optional(),
  })
).nullable();

const contract = {
  getTopic: oc.input(z.object({ id: z.number() })).output(
    z.object({
      topic: DiscourseTopicSchema.nullable(),
      posts: z.array(DiscoursePostSchema),
    })
  ),

  monitor: oc
    .input(
      z.object({
        category: z.string().optional(),
        tags: z.array(z.string()).optional(),
      })
    )
    .output(
      z.object({
        items: z.array(DiscourseTopicSchema),
        nextState: StateSchema,
      })
    ),

  search: oc
    .input(
      z.object({
        query: z.string().min(1),
        filters: z
          .object({
            username: z.string().optional(),
            minLikes: z.number().optional(),
            after: z.string().datetime().optional(),
          })
          .optional(),
      })
    )
    .output(
      z.object({
        topics: z.array(DiscourseTopicSchema),
        posts: z.array(DiscoursePostSchema),
        nextState: StateSchema,
      })
    ),
};
type State = z.infer<typeof StateSchema>;

export class DiscoursePlugin extends SimplePlugin<
  typeof contract,
  typeof ConfigSchema,
  typeof StateSchema
> {
  readonly id = "discourse-source";
  readonly type = "source";
  readonly contract = contract;
  readonly configSchema = ConfigSchema;
  override readonly stateSchema = StateSchema;

  private readonly ONE_HOUR_MS = 60 * 60 * 1000;

  private config: any = null;

  override initialize(config?: any): Effect.Effect<void> {
    this.config = config;
    console.log(`[Discourse] Initialized for ${config?.variables?.baseUrl}`);
    return Effect.succeed(undefined);
  }

  override shutdown(): Effect.Effect<void> {
    console.log("[Discourse] Shutting down");
    return Effect.succeed(undefined);
  }

  // HTTP Client
  private async callAPI(
    endpoint: string,
    params?: Record<string, any>,
    retryCount = 0
  ): Promise<any> {
    if (!this.config?.variables?.baseUrl) {
      throw new Error("Base URL not configured");
    }

    const url = new URL(endpoint, this.config.variables.baseUrl);

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

    if (this.config?.secrets?.apiKey) {
      headers["Api-Key"] = this.config.secrets.apiKey;
      headers["Api-Username"] = this.config.secrets.apiUsername || "system";
    }

    try {
      const response = await fetch(url.toString(), {
        headers,
        signal: AbortSignal.timeout(this.config.variables.timeout),
      });

      if (response.status === 429 && retryCount < 3) {
        const backoffMs = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
        console.log(`[Discourse] Rate limited, retrying in ${backoffMs}ms...`);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        return this.callAPI(endpoint, params, retryCount + 1);
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Discourse API error: ${message}`);
    }
  }

  // Monitor
  private async monitor(input: any, currentState: State | null): Promise<any> {
    const state = currentState ?? {
      phase: "historical" as const,
      lastTopicId: undefined,
      lastChecked: undefined,
    };

    console.log(`[Discourse] Monitor - Phase: ${state.phase}`);

    // HISTORICAL PHASE
    if (state.phase === "historical") {
      // Calculate page number from lastTopicId
      const page = state.lastTopicId
        ? Math.floor(
            state.lastTopicId / (this.config?.variables?.batchSize || 20)
          )
        : 0;

      const result = await this.callAPI("/latest.json", {
        category: input.category,
        page: page,
      });

      const topics = this.parseTopics(result.topic_list?.topics || []);

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

      // Track how many topics we've seen
      const newLastTopicId = (state.lastTopicId || 0) + topics.length;

      return {
        items: topics,
        nextState: {
          ...state,
          lastTopicId: newLastTopicId,
        },
      };
    }

    // REALTIME PHASE
    const result = await this.callAPI("/latest.json", {
      category: input.category,
      per_page: this.config?.variables?.batchSize || 20,
    });

    const allTopics = this.parseTopics(result.topic_list?.topics || []);
    const lastChecked = state.lastChecked
      ? new Date(state.lastChecked).getTime()
      : Date.now() - this.ONE_HOUR_MS;

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
  }

  private async search(input: any, currentState: State | null): Promise<any> {
    const state = currentState ?? {
      phase: "historical" as const,
      lastTopicId: undefined,
      lastChecked: undefined,
    };

    let query = input.query;
    if (input.filters?.username) query += ` @${input.filters.username}`;
    if (input.filters?.after)
      query += ` after:${input.filters.after.split("T")[0]}`;

    const result = await this.callAPI("/search.json", {
      q: query,
      page: state.lastTopicId ? Math.floor(state.lastTopicId / 20) : 0,
    });

    const topics = this.parseTopics(result.topics || []);
    const posts = this.parsePosts(result.posts || []);
    const hasMore = topics.length >= 20;

    return {
      topics,
      posts,
      nextState: hasMore
        ? {
            ...state,
            lastTopicId: (state.lastTopicId || 0) + topics.length,
          }
        : null,
    };
  }

  private async getTopic(topicId: number): Promise<any> {
    const result = await this.callAPI(`/t/${topicId}.json`);
    const topic = this.parseTopic(result);
    const posts = this.parsePosts(result.post_stream?.posts || []);
    return { topic, posts };
  }

  private parseTopics(data: any[]): Topic[] {
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
      .filter((t): t is Topic => t !== null);
  }

  private parseTopic(data: any): Topic | null {
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
  }

  private parsePosts(data: any[]): Post[] {
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
      .filter((p): p is Post => p !== null);
  }

  // Router
  createRouter() {
    const os = implement(this.contract);

    return os.router({
      getTopic: os.getTopic.handler(async ({ input }) => {
        try {
          return await this.getTopic(input.id);
        } catch (error) {
          console.error(`Error fetching topic ${input.id}:`, error);
          return { topic: null, posts: [] };
        }
      }),

      monitor: os.monitor.handler(async ({ input, context }) => {
        try {
          const state = (context as any)?.state as State | null;
          return await this.monitor(input, state ?? null);
        } catch (error) {
          console.error("Monitor error:", error);
          return { items: [], nextState: null };
        }
      }),

      search: os.search.handler(async ({ input, context }) => {
        try {
          const state = (context as any)?.state as State | null;
          return await this.search(input, state ?? null);
        } catch (error) {
          console.error("Search error:", error);
          return { topics: [], posts: [], nextState: null };
        }
      }),
    });
  }
}

export default DiscoursePlugin;
