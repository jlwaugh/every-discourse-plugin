import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { describe } from "vitest";
import { createTestPluginRuntime } from "every-plugin/testing";
import type { PluginBinding } from "every-plugin";
import DiscoursePlugin from "./src";

type DiscourseBindings = {
  "discourse-source": PluginBinding<typeof DiscoursePlugin>;
};

const TEST_PLUGIN_MAP = {
  "discourse-source": DiscoursePlugin,
};

describe("Discourse Plugin Tests", () => {
  const { runtime, PluginRuntime } = createTestPluginRuntime<DiscourseBindings>(
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
    TEST_PLUGIN_MAP
  );

  describe("Plugin Initialization", () => {
    it.effect("should initialize plugin successfully", () =>
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;
        const { initialized } = yield* pluginRuntime.usePlugin(
          "discourse-source",
          {
            secrets: {},
            variables: { baseUrl: "https://gov.near.org" },
          }
        );

        expect(initialized).toBeDefined();
        expect(initialized.plugin.id).toBe("discourse-source");
        expect(initialized.plugin.type).toBe("source");
      }).pipe(Effect.provide(runtime), Effect.timeout("10 seconds"))
    );
  });

  describe("getTopic Procedure", () => {
    it.effect("should fetch a topic successfully", () =>
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;
        const plugin = yield* pluginRuntime.usePlugin("discourse-source", {
          secrets: {},
          variables: { baseUrl: "https://gov.near.org" },
        });

        // Access router through the plugin
        const router = plugin.router as any;

        const result = yield* Effect.tryPromise(() =>
          router.getTopic({ id: 7 })
        );

        expect(result.topic).toBeDefined();
        expect(result.topic?.id).toBe(7);
        expect(result.posts).toBeDefined();
        expect(Array.isArray(result.posts)).toBe(true);
      }).pipe(Effect.provide(runtime), Effect.timeout("15 seconds"))
    );

    it.effect("should handle non-existent topic gracefully", () =>
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;
        const plugin = yield* pluginRuntime.usePlugin("discourse-source", {
          secrets: {},
          variables: { baseUrl: "https://gov.near.org" },
        });

        const router = plugin.router as any;

        const result = yield* Effect.tryPromise(() =>
          router.getTopic({ id: 999999 })
        );

        expect(result.topic).toBeNull();
        expect(result.posts).toEqual([]);
      }).pipe(Effect.provide(runtime), Effect.timeout("15 seconds"))
    );
  });

  describe("monitor Procedure", () => {
    it.effect("should fetch topics in historical phase", () =>
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;
        const plugin = yield* pluginRuntime.usePlugin("discourse-source", {
          secrets: {},
          variables: { baseUrl: "https://gov.near.org", batchSize: 5 },
        });

        const router = plugin.router as any;

        const result = yield* Effect.tryPromise(() =>
          router.monitor({ category: "governance" })
        );

        expect(result.items).toBeDefined();
        expect(Array.isArray(result.items)).toBe(true);
        expect(result.nextState).toBeDefined();
        expect(result.nextState?.phase).toBe("historical");
      }).pipe(Effect.provide(runtime), Effect.timeout("15 seconds"))
    );
  });

  describe("search Procedure", () => {
    it.effect("should search for topics", () =>
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;
        const plugin = yield* pluginRuntime.usePlugin("discourse-source", {
          secrets: {},
          variables: { baseUrl: "https://gov.near.org" },
        });

        const router = plugin.router as any;

        const result = yield* Effect.tryPromise(() =>
          router.search({
            query: "proposal",
            filters: { minLikes: 5 },
          })
        );

        expect(result.topics).toBeDefined();
        expect(Array.isArray(result.topics)).toBe(true);
        expect(result.posts).toBeDefined();
        expect(Array.isArray(result.posts)).toBe(true);
      }).pipe(Effect.provide(runtime), Effect.timeout("15 seconds"))
    );

    it.effect("should handle empty search results", () =>
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;
        const plugin = yield* pluginRuntime.usePlugin("discourse-source", {
          secrets: {},
          variables: { baseUrl: "https://gov.near.org" },
        });

        const router = plugin.router as any;

        const result = yield* Effect.tryPromise(() =>
          router.search({
            query: "xyzabc123nonexistent",
          })
        );

        expect(result.topics).toEqual([]);
        expect(result.posts).toEqual([]);
        expect(result.nextState).toBeNull();
      }).pipe(Effect.provide(runtime), Effect.timeout("15 seconds"))
    );
  });
});

// Export for testing
export const testHelpers = {
  callAPI,
  parseTopics,
  parseTopic,
  parsePosts,
};
