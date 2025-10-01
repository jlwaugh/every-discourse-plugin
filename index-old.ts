import { createTestPluginRuntime } from "every-plugin/testing";
import { Effect, Stream } from "every-plugin/effect";
import DiscoursePlugin from "./src";

type DiscourseState = {
  phase: "historical" | "realtime";
  lastTopicId?: number;
  lastChecked?: string;
} | null;

const { runtime, PluginRuntime } = createTestPluginRuntime(
  {
    registry: {
      "discourse-source": {
        remoteUrl: "mock://discourse-source",
        type: "source",
        version: "1.0.0",
      },
    },
    secrets: {},
  },
  {
    "discourse-source": DiscoursePlugin,
  }
);

// Example 1: Fetch
const fetchExample = Effect.gen(function* () {
  const pluginRuntime = yield* PluginRuntime;

  console.log("\n=== Fetch Demo ===\n");

  const plugin = yield* pluginRuntime.usePlugin("discourse-source", {
    secrets: {},
    variables: { baseUrl: "https://gov.near.org" },
  });

  const result = (yield* pluginRuntime.executePlugin(plugin, {
    procedure: "getTopic",
    input: { id: 7 },
    state: null,
  })) as { topic: { title: string } | null; posts: any[] };

  console.log(`Topic: ${result.topic?.title}`);
  console.log(`Posts: ${result.posts.length}`);
});

// Example 2: Streaming
const streamingExample = Effect.gen(function* () {
  const pluginRuntime = yield* PluginRuntime;

  console.log("\n=== Streaming Demo ===");
  console.log("Watch the phase transitions!\n");

  const stream = yield* pluginRuntime.streamPlugin(
    "discourse-source",
    {
      secrets: {},
      variables: {
        baseUrl: "https://gov.near.org",
        batchSize: 10,
        timeout: 15000,
      },
    },
    {
      procedure: "monitor",
      input: { category: "governance" },
      state: null,
    },
    {
      maxItems: 50,
      onStateChange: (newState: DiscourseState, items: any[]) =>
        Effect.sync(() => {
          if (items.length > 0) {
            console.log(`\nBatch: ${items.length} topics`);
            console.log(`Phase: ${newState?.phase}`);
            if (newState?.lastTopicId) {
              console.log(`Progress: ${newState.lastTopicId} topics processed`);
            }
            if (newState?.lastChecked) {
              console.log(`Last Checked: ${newState.lastChecked}`);
            }
          }
        }),
    }
  );

  const topics = yield* stream.pipe(
    Stream.tap((topic: any) =>
      Effect.sync(() => {
        console.log(`  - [${topic.id}] ${topic.title}`);
      })
    ),
    Stream.runCollect
  );

  console.log(`\n✓ Total collected: ${topics.length} topics`);
});

// Example 3: Search
const searchExample = Effect.gen(function* () {
  const pluginRuntime = yield* PluginRuntime;

  console.log("\n=== Search Demo ===\n");

  const plugin = yield* pluginRuntime.usePlugin("discourse-source", {
    secrets: {},
    variables: { baseUrl: "https://gov.near.org" },
  });

  const result = (yield* pluginRuntime.executePlugin(plugin, {
    procedure: "search",
    input: {
      query: "proposal",
      filters: { minLikes: 5 },
    },
    state: null,
  })) as { topics: any[]; posts: any[]; nextState: any };

  console.log(`Found ${result.topics.length} topics`);
  console.log(`Found ${result.posts.length} posts`);
  console.log(`Has more results: ${result.nextState !== null}`);

  if (result.topics.length > 0) {
    console.log("\nFirst 3 topics:");
    result.topics.slice(0, 3).forEach((t) => {
      console.log(`  - [${t.id}] ${t.title}`);
    });
  }
});

// Main
const main = Effect.gen(function* () {
  const mode = process.env.MODE || "basic";

  if (mode === "stream") {
    yield* streamingExample;
  } else if (mode === "search") {
    yield* searchExample;
  } else {
    yield* fetchExample;
  }
});

runtime
  .runPromise(main)
  .then(() => runtime.dispose())
  .catch((error) => {
    console.error("Error:", error);
    return runtime.dispose();
  });
