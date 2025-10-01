import { describe, test, expect, beforeEach, mock } from "bun:test";
import { DiscoursePlugin } from "./src";
import { Effect } from "effect";

describe("DiscoursePlugin", () => {
  let plugin: DiscoursePlugin;

  beforeEach(() => {
    plugin = new DiscoursePlugin();
  });

  describe("Initialization", () => {
    test("should initialize with config", async () => {
      const config = {
        variables: { baseUrl: "https://test.discourse.com", timeout: 10000 },
        secrets: {},
      };

      await Effect.runPromise(plugin.initialize(config));
      expect(plugin["config"]).toBeDefined();
      expect(plugin["config"].variables.baseUrl).toBe(
        "https://test.discourse.com"
      );
    });

    test("should have correct plugin metadata", () => {
      expect(plugin.id).toBe("discourse-source");
      expect(plugin.type).toBe("source");
    });

    test("should initialize with API credentials", async () => {
      const config = {
        variables: { baseUrl: "https://test.discourse.com" },
        secrets: { apiKey: "test-key", apiUsername: "test-user" },
      };

      await Effect.runPromise(plugin.initialize(config));
      expect(plugin["config"].secrets.apiKey).toBe("test-key");
      expect(plugin["config"].secrets.apiUsername).toBe("test-user");
    });
  });

  describe("Topic Parsing", () => {
    test("should parse valid topics", () => {
      const mockData = [
        {
          id: 1,
          title: "Test Topic",
          slug: "test-topic",
          posts_count: 5,
          views: 100,
          like_count: 10,
          created_at: "2025-01-01T00:00:00Z",
          last_posted_at: "2025-01-02T00:00:00Z",
          category_id: 1,
          tags: ["test"],
        },
      ];

      const topics = plugin["parseTopics"](mockData);
      expect(topics).toHaveLength(1);
      expect(topics[0].title).toBe("Test Topic");
      expect(topics[0].id).toBe(1);
      expect(topics[0].tags).toEqual(["test"]);
    });

    test("should handle topics without optional fields", () => {
      const mockData = [
        {
          id: 2,
          title: "Minimal Topic",
          slug: "minimal",
          posts_count: 1,
          like_count: 0,
          created_at: "2025-01-01T00:00:00Z",
          last_posted_at: null,
        },
      ];

      const topics = plugin["parseTopics"](mockData);
      expect(topics).toHaveLength(1);
      expect(topics[0].views).toBeUndefined();
      expect(topics[0].category_id).toBeUndefined();
      expect(topics[0].tags).toEqual([]);
    });

    test("should filter out invalid topics", () => {
      const mockData = [
        { id: 1, title: "Valid" },
        null,
        { id: "invalid" },
        undefined,
      ];

      const topics = plugin["parseTopics"](mockData as any);
      expect(topics).toHaveLength(0);
    });

    test("should default missing like_count to 0", () => {
      const mockData = [
        {
          id: 1,
          title: "Test",
          slug: "test",
          posts_count: 1,
          created_at: "2025-01-01T00:00:00Z",
          last_posted_at: null,
        },
      ];

      const topics = plugin["parseTopics"](mockData);
      expect(topics[0].like_count).toBe(0);
    });

    test("should handle empty tags array", () => {
      const mockData = [
        {
          id: 1,
          title: "Test",
          slug: "test",
          posts_count: 1,
          like_count: 0,
          created_at: "2025-01-01T00:00:00Z",
          last_posted_at: null,
          tags: [],
        },
      ];

      const topics = plugin["parseTopics"](mockData);
      expect(topics[0].tags).toEqual([]);
    });
  });

  describe("Post Parsing", () => {
    test("should parse valid posts", () => {
      const mockData = [
        {
          id: 1,
          topic_id: 1,
          username: "testuser",
          cooked: "<p>Test content</p>",
          created_at: "2025-01-01T00:00:00Z",
          like_count: 5,
        },
      ];

      const posts = plugin["parsePosts"](mockData);
      expect(posts).toHaveLength(1);
      expect(posts[0].username).toBe("testuser");
      expect(posts[0].like_count).toBe(5);
    });

    test("should handle posts without cooked field", () => {
      const mockData = [
        {
          id: 1,
          topic_id: 1,
          username: "testuser",
          created_at: "2025-01-01T00:00:00Z",
        },
      ];

      const posts = plugin["parsePosts"](mockData);
      expect(posts).toHaveLength(1);
      expect(posts[0].cooked).toBeUndefined();
    });

    test("should use blurb as fallback for cooked", () => {
      const mockData = [
        {
          id: 1,
          topic_id: 1,
          username: "testuser",
          blurb: "Preview text",
          created_at: "2025-01-01T00:00:00Z",
        },
      ];

      const posts = plugin["parsePosts"](mockData);
      expect(posts[0].cooked).toBe("Preview text");
    });

    test("should filter out invalid posts", () => {
      const mockData = [{ id: 1 }, null, { username: "incomplete" }];

      const posts = plugin["parsePosts"](mockData as any);
      expect(posts).toHaveLength(0);
    });

    test("should default missing like_count to 0", () => {
      const mockData = [
        {
          id: 1,
          topic_id: 1,
          username: "testuser",
          created_at: "2025-01-01T00:00:00Z",
        },
      ];

      const posts = plugin["parsePosts"](mockData);
      expect(posts[0].like_count).toBe(0);
    });
  });

  describe("State Machine", () => {
    beforeEach(async () => {
      const config = {
        variables: { baseUrl: "https://test.discourse.com", batchSize: 20 },
        secrets: {},
      };
      await Effect.runPromise(plugin.initialize(config));
    });

    test("should start in historical phase with no state", async () => {
      const mockFetch = mock(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            topic_list: {
              topics: [
                {
                  id: 1,
                  title: "Test",
                  slug: "test",
                  posts_count: 1,
                  like_count: 0,
                  created_at: "2025-01-01T00:00:00Z",
                  last_posted_at: null,
                },
              ],
            },
          }),
        } as Response)
      );

      globalThis.fetch = mockFetch as any;

      const result = await plugin["monitor"]({}, null);

      expect(result.items).toHaveLength(1);
      expect(result.nextState.phase).toBe("historical");
      expect(result.nextState.lastTopicId).toBe(1);
    });

    test("should transition to realtime when no more topics", async () => {
      const mockFetch = mock(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            topic_list: { topics: [] },
          }),
        } as Response)
      );

      globalThis.fetch = mockFetch as any;

      const result = await plugin["monitor"](
        {},
        { phase: "historical", lastTopicId: 100 }
      );

      expect(result.items).toHaveLength(0);
      expect(result.nextState.phase).toBe("realtime");
      expect(result.nextState.lastChecked).toBeDefined();
    });

    test("should calculate correct page from lastTopicId", async () => {
      const mockFetch = mock(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            topic_list: { topics: [] },
          }),
        } as Response)
      );

      globalThis.fetch = mockFetch as any;

      await plugin["monitor"]({}, { phase: "historical", lastTopicId: 40 });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("page=2"),
        expect.anything()
      );
    });

    test("should filter new topics in realtime phase", async () => {
      const now = new Date();
      const oldTopic = new Date(now.getTime() - 2 * 60 * 60 * 1000); // 2 hours ago
      const newTopic = new Date(now.getTime() - 30 * 60 * 1000); // 30 min ago

      const mockFetch = mock(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            topic_list: {
              topics: [
                {
                  id: 1,
                  title: "Old",
                  slug: "old",
                  posts_count: 1,
                  like_count: 0,
                  created_at: oldTopic.toISOString(),
                  last_posted_at: null,
                },
                {
                  id: 2,
                  title: "New",
                  slug: "new",
                  posts_count: 1,
                  like_count: 0,
                  created_at: newTopic.toISOString(),
                  last_posted_at: null,
                },
              ],
            },
          }),
        } as Response)
      );

      globalThis.fetch = mockFetch as any;

      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const result = await plugin["monitor"](
        {},
        {
          phase: "realtime",
          lastChecked: oneHourAgo.toISOString(),
        }
      );

      expect(result.items).toHaveLength(1);
      expect(result.items[0].title).toBe("New");
    });
  });

  describe("HTTP Client", () => {
    beforeEach(async () => {
      const config = {
        variables: { baseUrl: "https://test.discourse.com", timeout: 10000 },
        secrets: {},
      };
      await Effect.runPromise(plugin.initialize(config));
    });

    test("should throw error when baseUrl not configured", async () => {
      const uninitializedPlugin = new DiscoursePlugin();

      await expect(
        uninitializedPlugin["callAPI"]("/test.json")
      ).rejects.toThrow("Base URL not configured");
    });

    test("should include API credentials in headers when provided", async () => {
      const configWithAuth = {
        variables: { baseUrl: "https://test.discourse.com" },
        secrets: { apiKey: "secret-key", apiUsername: "admin" },
      };

      await Effect.runPromise(plugin.initialize(configWithAuth));

      const mockFetch = mock(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({}),
        } as Response)
      );

      globalThis.fetch = mockFetch as any;

      await plugin["callAPI"]("/test.json");

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            "Api-Key": "secret-key",
            "Api-Username": "admin",
          }),
        })
      );
    });

    test("should retry on 429 with exponential backoff", async () => {
      let callCount = 0;
      const mockFetch = mock(() => {
        callCount++;
        if (callCount < 3) {
          return Promise.resolve({
            ok: false,
            status: 429,
            statusText: "Too Many Requests",
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ success: true }),
        } as Response);
      });

      globalThis.fetch = mockFetch as any;

      const result = await plugin["callAPI"]("/test.json");

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(result).toEqual({ success: true });
    });

    test("should give up after 3 retries on 429", async () => {
      const mockFetch = mock(() =>
        Promise.resolve({
          ok: false,
          status: 429,
          statusText: "Too Many Requests",
        } as Response)
      );

      globalThis.fetch = mockFetch as any;

      await expect(plugin["callAPI"]("/test.json")).rejects.toThrow("HTTP 429");

      expect(mockFetch).toHaveBeenCalledTimes(4); // initial + 3 retries
    });

    test("should throw on non-ok status codes", async () => {
      const mockFetch = mock(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
        } as Response)
      );

      globalThis.fetch = mockFetch as any;

      await expect(plugin["callAPI"]("/test.json")).rejects.toThrow("HTTP 500");
    });

    test("should handle network errors", async () => {
      const mockFetch = mock(() =>
        Promise.reject(new Error("Network failure"))
      );

      globalThis.fetch = mockFetch as any;

      await expect(plugin["callAPI"]("/test.json")).rejects.toThrow(
        "Discourse API error"
      );
    });

    test("should append query parameters correctly", async () => {
      const mockFetch = mock(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({}),
        } as Response)
      );

      globalThis.fetch = mockFetch as any;

      await plugin["callAPI"]("/test.json", { page: 2, category: "dev" });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("page=2"),
        expect.anything()
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("category=dev"),
        expect.anything()
      );
    });

    test("should skip null and undefined parameters", async () => {
      const mockFetch = mock(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({}),
        } as Response)
      );

      globalThis.fetch = mockFetch as any;

      await plugin["callAPI"]("/test.json", {
        page: 1,
        category: null,
        tags: undefined,
      });

      expect(mockFetch).toHaveBeenCalled();

      const calls = mockFetch.mock.calls as unknown as Array<[string, any]>;
      expect(calls.length).toBeGreaterThan(0);

      const callUrl = calls[0][0];

      expect(callUrl).toBeDefined();
      expect(callUrl).not.toContain("category");
      expect(callUrl).not.toContain("tags");
    });
  });

  describe("Search", () => {
    beforeEach(async () => {
      const config = {
        variables: { baseUrl: "https://test.discourse.com" },
        secrets: {},
      };
      await Effect.runPromise(plugin.initialize(config));
    });

    test("should build query with username filter", async () => {
      const mockFetch = mock(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ topics: [], posts: [] }),
        } as Response)
      );

      globalThis.fetch = mockFetch as any;

      await plugin["search"](
        {
          query: "test",
          filters: { username: "admin" },
        },
        null
      );

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("q=test+%40admin"),
        expect.anything()
      );
    });

    test("should build query with date filter", async () => {
      const mockFetch = mock(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ topics: [], posts: [] }),
        } as Response)
      );

      globalThis.fetch = mockFetch as any;

      await plugin["search"](
        {
          query: "test",
          filters: { after: "2025-01-01T00:00:00Z" },
        },
        null
      );

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("after%3A2025-01-01"),
        expect.anything()
      );
    });

    test("should return null nextState when no more results", async () => {
      const mockFetch = mock(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            topics: Array(10).fill({
              id: 1,
              title: "Test",
              slug: "test",
              posts_count: 1,
              like_count: 0,
              created_at: "2025-01-01T00:00:00Z",
              last_posted_at: null,
            }),
            posts: [],
          }),
        } as Response)
      );

      globalThis.fetch = mockFetch as any;

      const result = await plugin["search"]({ query: "test" }, null);

      expect(result.nextState).toBeNull();
    });

    test("should return nextState when more results available", async () => {
      const mockFetch = mock(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            topics: Array(20).fill({
              id: 1,
              title: "Test",
              slug: "test",
              posts_count: 1,
              like_count: 0,
              created_at: "2025-01-01T00:00:00Z",
              last_posted_at: null,
            }),
            posts: [],
          }),
        } as Response)
      );

      globalThis.fetch = mockFetch as any;

      const result = await plugin["search"]({ query: "test" }, null);

      expect(result.nextState).not.toBeNull();
      expect(result.nextState.lastTopicId).toBe(20);
    });
  });

  describe("Router", () => {
    test("should create router with all procedures", () => {
      const router = plugin.createRouter();
      expect(router).toBeDefined();
    });

    test("should return topic and posts on successful getTopic", async () => {
      const config = {
        variables: { baseUrl: "https://test.discourse.com" },
        secrets: {},
      };
      await Effect.runPromise(plugin.initialize(config));

      const mockFetch = mock(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            id: 123,
            title: "Test Topic",
            slug: "test-topic",
            posts_count: 3,
            views: 100,
            like_count: 5,
            created_at: "2025-01-01T00:00:00Z",
            last_posted_at: "2025-01-02T00:00:00Z",
            post_stream: {
              posts: [
                {
                  id: 1,
                  topic_id: 123,
                  username: "user1",
                  cooked: "<p>First post</p>",
                  created_at: "2025-01-01T00:00:00Z",
                  like_count: 2,
                },
                {
                  id: 2,
                  topic_id: 123,
                  username: "user2",
                  cooked: "<p>Second post</p>",
                  created_at: "2025-01-01T01:00:00Z",
                  like_count: 3,
                },
              ],
            },
          }),
        } as Response)
      );

      globalThis.fetch = mockFetch as any;

      const result = await plugin["getTopic"](123);

      expect(result.topic).toBeDefined();
      expect(result.topic?.title).toBe("Test Topic");
      expect(result.topic?.id).toBe(123);
      expect(result.posts).toHaveLength(2);
      expect(result.posts[0].username).toBe("user1");
      expect(result.posts[1].username).toBe("user2");
    });

    test("should return empty results on getTopic error", async () => {
      const config = {
        variables: { baseUrl: "https://test.discourse.com" },
        secrets: {},
      };
      await Effect.runPromise(plugin.initialize(config));

      const mockFetch = mock(() =>
        Promise.resolve({
          ok: false,
          status: 404,
          statusText: "Not Found",
        } as Response)
      );

      globalThis.fetch = mockFetch as any;

      const router = plugin.createRouter();
      const handler = router.getTopic as any;
      const result = await handler({ input: { id: 999 }, context: {} });

      expect(result.topic).toBeNull();
      expect(result.posts).toEqual([]);
    });
  });
});
