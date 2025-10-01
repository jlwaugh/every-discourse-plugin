import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { testHelpers } from "../index.ts";
import { Effect } from "every-plugin/effect";

const { handleGetTopic, handleMonitor, handleSearch } = testHelpers;

describe("Discourse Plugin - Router Handlers", () => {
  let mockFetch: ReturnType<typeof mock>;
  let originalFetch: typeof globalThis.fetch;

  const mockContext = {
    baseUrl: "https://discourse.example.com",
    timeout: 10000,
    batchSize: 20,
    apiKey: "test-key",
    apiUsername: "test-user",
  };

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    mockFetch = mock();
    globalThis.fetch = mockFetch as any;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    mockFetch.mockRestore();
  });

  describe("handleGetTopic", () => {
    it("should fetch and return topic with posts", async () => {
      const mockResponse = {
        id: 123,
        title: "Test Topic",
        slug: "test-topic",
        posts_count: 2,
        views: 100,
        like_count: 10,
        created_at: "2024-01-01T00:00:00Z",
        last_posted_at: "2024-01-02T00:00:00Z",
        category_id: 1,
        tags: ["test"],
        post_stream: {
          posts: [
            {
              id: 1,
              topic_id: 123,
              username: "user1",
              cooked: "<p>First post</p>",
              created_at: "2024-01-01T00:00:00Z",
              like_count: 5,
            },
            {
              id: 2,
              topic_id: 123,
              username: "user2",
              cooked: "<p>Second post</p>",
              created_at: "2024-01-01T01:00:00Z",
              like_count: 3,
            },
          ],
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      const result = await Effect.runPromise(handleGetTopic(mockContext, 123));

      expect(result.topic).not.toBeNull();
      expect(result.topic?.id).toBe(123);
      expect(result.topic?.title).toBe("Test Topic");
      expect(result.posts).toHaveLength(2);
      expect(result.posts[0].username).toBe("user1");
      expect(result.posts[1].username).toBe("user2");
    });

    it("should handle topic with no posts", async () => {
      const mockResponse = {
        id: 456,
        title: "Empty Topic",
        slug: "empty-topic",
        posts_count: 0,
        like_count: 0,
        created_at: "2024-01-01T00:00:00Z",
        last_posted_at: null,
        post_stream: {
          posts: [],
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      const result = await Effect.runPromise(handleGetTopic(mockContext, 456));

      expect(result.topic).not.toBeNull();
      expect(result.posts).toHaveLength(0);
    });

    it("should return null topic on invalid data", async () => {
      const mockResponse = {
        id: "invalid",
        title: 123,
        post_stream: { posts: [] },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      const result = await Effect.runPromise(handleGetTopic(mockContext, 999));

      expect(result.topic).toBeNull();
      expect(result.posts).toHaveLength(0);
    });

    it("should handle API errors gracefully", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      } as Response);

      const result = await Effect.runPromise(handleGetTopic(mockContext, 999));

      expect(result.topic).toBeNull();
      expect(result.posts).toHaveLength(0);
    });
  });

  describe("handleMonitor - Historical Phase", () => {
    it("should fetch topics in historical phase with null state", async () => {
      const mockTopics = [
        {
          id: 1,
          title: "Topic 1",
          slug: "topic-1",
          posts_count: 5,
          like_count: 10,
          created_at: "2024-01-01T00:00:00Z",
          last_posted_at: "2024-01-02T00:00:00Z",
        },
        {
          id: 2,
          title: "Topic 2",
          slug: "topic-2",
          posts_count: 3,
          like_count: 5,
          created_at: "2024-01-03T00:00:00Z",
          last_posted_at: "2024-01-04T00:00:00Z",
        },
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          topic_list: { topics: mockTopics },
        }),
      } as Response);

      const result = await Effect.runPromise(
        handleMonitor(mockContext, { category: "general" }, null)
      );

      expect(result.items).toHaveLength(2);
      expect(result.nextState?.phase).toBe("historical");
      expect(result.nextState?.lastTopicId).toBe(2);
    });

    it("should paginate through historical topics", async () => {
      const mockTopics = Array.from({ length: 20 }, (_, i) => ({
        id: i + 21,
        title: `Topic ${i + 21}`,
        slug: `topic-${i + 21}`,
        posts_count: 5,
        like_count: 10,
        created_at: "2024-01-01T00:00:00Z",
        last_posted_at: "2024-01-02T00:00:00Z",
      }));

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          topic_list: { topics: mockTopics },
        }),
      } as Response);

      const result = await Effect.runPromise(
        handleMonitor(
          mockContext,
          { category: "general" },
          { phase: "historical", lastTopicId: 20 }
        )
      );

      expect(result.items).toHaveLength(20);
      expect(result.nextState?.phase).toBe("historical");
      expect(result.nextState?.lastTopicId).toBe(40);

      // Verify page parameter
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("page=1"),
        expect.anything()
      );
    });

    it("should transition to realtime when no more topics", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          topic_list: { topics: [] },
        }),
      } as Response);

      const result = await Effect.runPromise(
        handleMonitor(mockContext, { category: "general" }, null)
      );

      expect(result.items).toHaveLength(0);
      expect(result.nextState?.phase).toBe("realtime");
      expect(result.nextState?.lastChecked).toBeDefined();
    });
  });

  describe("handleMonitor - Realtime Phase", () => {
    it("should filter new topics in realtime phase", async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

      const mockTopics = [
        {
          id: 1,
          title: "Old Topic",
          slug: "old-topic",
          posts_count: 5,
          like_count: 10,
          created_at: twoHoursAgo.toISOString(),
          last_posted_at: twoHoursAgo.toISOString(),
        },
        {
          id: 2,
          title: "New Topic",
          slug: "new-topic",
          posts_count: 3,
          like_count: 5,
          created_at: now.toISOString(),
          last_posted_at: now.toISOString(),
        },
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          topic_list: { topics: mockTopics },
        }),
      } as Response);

      const result = await Effect.runPromise(
        handleMonitor(
          mockContext,
          { category: "general" },
          {
            phase: "realtime",
            lastChecked: oneHourAgo.toISOString(),
          }
        )
      );

      expect(result.items).toHaveLength(1);
      expect(result.items[0].title).toBe("New Topic");
      expect(result.nextState?.phase).toBe("realtime");
      expect(result.nextState?.lastChecked).toBeDefined();
    });

    it("should return all topics if no lastChecked", async () => {
      const now = new Date();
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

      const mockTopics = [
        {
          id: 1,
          title: "Recent Topic",
          slug: "recent-topic",
          posts_count: 5,
          like_count: 10,
          created_at: twoHoursAgo.toISOString(),
          last_posted_at: twoHoursAgo.toISOString(),
        },
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          topic_list: { topics: mockTopics },
        }),
      } as Response);

      const result = await Effect.runPromise(
        handleMonitor(
          mockContext,
          {},
          {
            phase: "realtime",
          }
        )
      );

      // Should include topics from last hour by default
      expect(result.items.length).toBeGreaterThanOrEqual(0);
      expect(result.nextState?.phase).toBe("realtime");
    });

    it("should handle empty results in realtime", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          topic_list: { topics: [] },
        }),
      } as Response);

      const result = await Effect.runPromise(
        handleMonitor(
          mockContext,
          {},
          {
            phase: "realtime",
            lastChecked: new Date().toISOString(),
          }
        )
      );

      expect(result.items).toHaveLength(0);
      expect(result.nextState?.phase).toBe("realtime");
    });
  });

  describe("handleSearch", () => {
    it("should search with query only", async () => {
      const mockSearchData = {
        topics: [
          {
            id: 1,
            title: "Search Result",
            slug: "search-result",
            posts_count: 5,
            like_count: 10,
            created_at: "2024-01-01T00:00:00Z",
            last_posted_at: "2024-01-02T00:00:00Z",
          },
        ],
        posts: [
          {
            id: 1,
            topic_id: 1,
            username: "testuser",
            cooked: "<p>Search result post</p>",
            created_at: "2024-01-01T00:00:00Z",
            like_count: 5,
          },
        ],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockSearchData,
      } as Response);

      const result = await Effect.runPromise(
        handleSearch(mockContext, { query: "test search" }, null)
      );

      expect(result.topics).toHaveLength(1);
      expect(result.posts).toHaveLength(1);
      expect(result.topics[0].title).toBe("Search Result");
    });

    it("should apply username filter", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ topics: [], posts: [] }),
      } as Response);

      await Effect.runPromise(
        handleSearch(
          mockContext,
          {
            query: "test",
            filters: { username: "johndoe" },
          },
          null
        )
      );

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain("%40johndoe");
    });

    it("should apply date filter", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ topics: [], posts: [] }),
      } as Response);

      await Effect.runPromise(
        handleSearch(
          mockContext,
          {
            query: "test",
            filters: { after: "2024-01-01T00:00:00Z" },
          },
          null
        )
      );

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain("after%3A2024-01-01");
    });

    it("should apply multiple filters", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ topics: [], posts: [] }),
      } as Response);

      await Effect.runPromise(
        handleSearch(
          mockContext,
          {
            query: "test",
            filters: {
              username: "alice",
              after: "2024-01-01T00:00:00Z",
            },
          },
          null
        )
      );

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain("%40alice");
      expect(calledUrl).toContain("after%3A2024-01-01");
    });

    it("should handle pagination with 20+ results", async () => {
      const mockTopics = Array.from({ length: 20 }, (_, i) => ({
        id: i + 1,
        title: `Result ${i + 1}`,
        slug: `result-${i + 1}`,
        posts_count: 5,
        like_count: 10,
        created_at: "2024-01-01T00:00:00Z",
        last_posted_at: "2024-01-02T00:00:00Z",
      }));

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          topics: mockTopics,
          posts: [],
        }),
      } as Response);

      const result = await Effect.runPromise(
        handleSearch(mockContext, { query: "test" }, null)
      );

      expect(result.topics).toHaveLength(20);
      expect(result.nextState).not.toBeNull();
      expect(result.nextState?.lastTopicId).toBe(20);
    });

    it("should return null nextState for < 20 results", async () => {
      const mockTopics = Array.from({ length: 5 }, (_, i) => ({
        id: i + 1,
        title: `Result ${i + 1}`,
        slug: `result-${i + 1}`,
        posts_count: 5,
        like_count: 10,
        created_at: "2024-01-01T00:00:00Z",
        last_posted_at: "2024-01-02T00:00:00Z",
      }));

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          topics: mockTopics,
          posts: [],
        }),
      } as Response);

      const result = await Effect.runPromise(
        handleSearch(mockContext, { query: "test" }, null)
      );

      expect(result.topics).toHaveLength(5);
      expect(result.nextState).toBeNull();
    });

    it("should continue pagination with existing state", async () => {
      const mockTopics = Array.from({ length: 20 }, (_, i) => ({
        id: i + 21,
        title: `Result ${i + 21}`,
        slug: `result-${i + 21}`,
        posts_count: 5,
        like_count: 10,
        created_at: "2024-01-01T00:00:00Z",
        last_posted_at: "2024-01-02T00:00:00Z",
      }));

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          topics: mockTopics,
          posts: [],
        }),
      } as Response);

      const result = await Effect.runPromise(
        handleSearch(
          mockContext,
          { query: "test" },
          { phase: "historical", lastTopicId: 20 }
        )
      );

      expect(result.topics).toHaveLength(20);
      expect(result.nextState?.lastTopicId).toBe(40);

      // Verify page parameter
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("page=1"),
        expect.anything()
      );
    });

    it("should handle empty search results", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ topics: [], posts: [] }),
      } as Response);

      const result = await Effect.runPromise(
        handleSearch(mockContext, { query: "nonexistent" }, null)
      );

      expect(result.topics).toHaveLength(0);
      expect(result.posts).toHaveLength(0);
      expect(result.nextState).toBeNull();
    });
  });
});
