import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { describe } from "vitest";
import { testHelpers } from "..";

const baseUrl = "https://gov.near.org";
const timeout = 10000;

describe("Discourse API Integration", () => {
  describe("getTopic", () => {
    it.effect("should fetch a topic successfully", () =>
      Effect.gen(function* () {
        const result = yield* testHelpers.callAPI(
          baseUrl,
          timeout,
          undefined,
          undefined,
          "/t/7.json"
        );

        const topic = testHelpers.parseTopic(result);
        const posts = testHelpers.parsePosts(result.post_stream?.posts || []);

        expect(topic).toBeDefined();
        expect(topic?.id).toBe(7);
        expect(topic?.title).toBeDefined();
        expect(posts.length).toBeGreaterThan(0);
      }).pipe(Effect.timeout("15 seconds"))
    );

    it.effect("should handle non-existent topic", () =>
      Effect.gen(function* () {
        const result = yield* testHelpers
          .callAPI(baseUrl, timeout, undefined, undefined, "/t/999999.json")
          .pipe(
            Effect.catchAll(() =>
              Effect.succeed({ post_stream: { posts: [] } })
            )
          );

        const topic = testHelpers.parseTopic(result);
        expect(topic).toBeNull();
      }).pipe(Effect.timeout("15 seconds"))
    );
  });

  describe("monitor (latest topics)", () => {
    it.effect("should fetch latest topics", () =>
      Effect.gen(function* () {
        const result = yield* testHelpers.callAPI(
          baseUrl,
          timeout,
          undefined,
          undefined,
          "/latest.json",
          { page: 0 }
        );

        const topics = testHelpers.parseTopics(result.topic_list?.topics || []);
        expect(topics.length).toBeGreaterThan(0);
        expect(topics[0]).toHaveProperty("id");
        expect(topics[0]).toHaveProperty("title");
      }).pipe(Effect.timeout("15 seconds"))
    );

    it.effect("should filter by category", () =>
      Effect.gen(function* () {
        const result = yield* testHelpers.callAPI(
          baseUrl,
          timeout,
          undefined,
          undefined,
          "/latest.json",
          { category: "governance" }
        );

        const topics = testHelpers.parseTopics(result.topic_list?.topics || []);
        expect(Array.isArray(topics)).toBe(true);
      }).pipe(Effect.timeout("15 seconds"))
    );
  });

  describe("search", () => {
    it.effect("should search for topics", () =>
      Effect.gen(function* () {
        const result = yield* testHelpers.callAPI(
          baseUrl,
          timeout,
          undefined,
          undefined,
          "/search.json",
          { q: "proposal" }
        );

        const topics = testHelpers.parseTopics(result.topics || []);
        const posts = testHelpers.parsePosts(result.posts || []);

        expect(Array.isArray(topics)).toBe(true);
        expect(Array.isArray(posts)).toBe(true);
      }).pipe(Effect.timeout("15 seconds"))
    );

    it.effect("should handle empty search results", () =>
      Effect.gen(function* () {
        const result = yield* testHelpers.callAPI(
          baseUrl,
          timeout,
          undefined,
          undefined,
          "/search.json",
          { q: "xyzabc123nonexistent" }
        );

        const topics = testHelpers.parseTopics(result.topics || []);
        expect(topics).toEqual([]);
      }).pipe(Effect.timeout("15 seconds"))
    );

    it.effect("should build query with filters", () =>
      Effect.gen(function* () {
        const result = yield* testHelpers.callAPI(
          baseUrl,
          timeout,
          undefined,
          undefined,
          "/search.json",
          { q: "proposal after:2024-01-01" }
        );

        const topics = testHelpers.parseTopics(result.topics || []);
        expect(Array.isArray(topics)).toBe(true);
      }).pipe(Effect.timeout("15 seconds"))
    );
  });

  describe("parsing", () => {
    it("should parse topics with all fields", () => {
      const mockData = [
        {
          id: 1,
          title: "Test",
          slug: "test",
          posts_count: 5,
          views: 100,
          like_count: 10,
          created_at: "2025-01-01T00:00:00Z",
          last_posted_at: "2025-01-02T00:00:00Z",
          category_id: 1,
          tags: ["test"],
        },
      ];

      const topics = testHelpers.parseTopics(mockData);
      expect(topics).toHaveLength(1);
      expect(topics[0].id).toBe(1);
      expect(topics[0].tags).toEqual(["test"]);
    });

    it("should parse posts with optional fields", () => {
      const mockData = [
        {
          id: 1,
          topic_id: 1,
          username: "user",
          created_at: "2025-01-01T00:00:00Z",
        },
      ];

      const posts = testHelpers.parsePosts(mockData);
      expect(posts).toHaveLength(1);
      expect(posts[0].like_count).toBe(0);
      expect(posts[0].cooked).toBeUndefined();
    });
  });
});
