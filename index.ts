import { createTestPluginRuntime } from "every-plugin/testing";
import { Effect } from "every-plugin/effect";
import DiscoursePlugin from "./src";
import type { GetTopicResult, MonitorResult, SearchResult } from "./types";

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

  const router = plugin.router as any;

  const result = (yield* Effect.tryPromise(() =>
    router.getTopic({
      input: { id: 7 },
    })
  )) as GetTopicResult;

  console.log(`Topic: ${result.topic?.title}`);
  console.log(`Posts: ${result.posts.length}`);
});

// Example 2: Monitor
const monitorExample = Effect.gen(function* () {
  const pluginRuntime = yield* PluginRuntime;

  console.log("\n=== Monitor Demo ===\n");

  const plugin = yield* pluginRuntime.usePlugin("discourse-source", {
    secrets: {},
    variables: {
      baseUrl: "https://gov.near.org",
      batchSize: 10,
      timeout: 15000,
    },
  });

  const router = plugin.router as any;

  const result = (yield* Effect.tryPromise(() =>
    router.monitor({
      input: { category: "governance" },
    })
  )) as MonitorResult;

  console.log(`\nBatch: ${result.items.length} topics`);
  console.log(`Phase: ${result.nextState?.phase}`);

  result.items.forEach((topic) => {
    console.log(`  - [${topic.id}] ${topic.title}`);
  });
});

// Example 3: Search
const searchExample = Effect.gen(function* () {
  const pluginRuntime = yield* PluginRuntime;

  console.log("\n=== Search Demo ===\n");

  const plugin = yield* pluginRuntime.usePlugin("discourse-source", {
    secrets: {},
    variables: { baseUrl: "https://gov.near.org" },
  });

  const router = plugin.router as any;

  const result = (yield* Effect.tryPromise(() =>
    router.search({
      input: {
        query: "proposal",
        filters: { minLikes: 5 },
      },
    })
  )) as SearchResult;

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

  if (mode === "monitor") {
    yield* monitorExample;
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
