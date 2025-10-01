import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { _testHelpers } from "../index";
import { Effect } from "every-plugin/effect";

const { callAPI, parseTopics, parseTopic, parsePosts } = _testHelpers;

describe("Discourse Plugin - Helper Functions", () => {
  let mockFetch: ReturnType<typeof mock>;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    mockFetch = mock();
    globalThis.fetch = mockFetch as any;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    mockFetch.mockRestore();
  });

  describe("callAPI", () => {
    it("should make successful API call with credentials", async () => {
      const mockResponse = { data: "test" };
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      const result = await Effect.runPromise(
        callAPI(
          "https://discourse.example.com",
          10000,
          "test-key",
          "test-user",
          "/test.json"
        )
      );

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("https://discourse.example.com/test.json"),
        expect.objectContaining({
          headers: expect.objectContaining({
            "Api-Key": "test-key",
            "Api-Username": "test-user",
          }),
        })
      );
    });

    it("should make API call without credentials", async () => {
      const mockResponse = { data: "test" };
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      const result = await Effect.runPromise(
        callAPI(
          "https://discourse.example.com",
          10000,
          undefined,
          undefined,
          "/test.json"
        )
      );

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.not.objectContaining({
            "Api-Key": expect.anything(),
          }),
        })
      );
    });

    it("should append query parameters correctly", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      } as Response);

      await Effect.runPromise(
        callAPI(
          "https://discourse.example.com",
          10000,
          undefined,
          undefined,
          "/test.json",
          { page: 2, category: "general" }
        )
      );

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("page=2"),
        expect.anything()
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("category=general"),
        expect.anything()
      );
    });

    it("should skip null and undefined parameters", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      } as Response);

      await Effect.runPromise(
        callAPI(
          "https://discourse.example.com",
          10000,
          undefined,
          undefined,
          "/test.json",
          { page: 1, nullParam: null, undefinedParam: undefined }
        )
      );

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).not.toContain("nullParam");
      expect(calledUrl).not.toContain("undefinedParam");
    });

    it("should return empty response on HTTP errors", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      } as Response);

      const result = await Effect.runPromise(
        callAPI(
          "https://discourse.example.com",
          10000,
          undefined,
          undefined,
          "/test.json"
        )
      );

      expect(result).toEqual({
        post_stream: { posts: [] },
        topic_list: { topics: [] },
      });
    });
  });

  describe("parseTopics", () => {
    it("should parse valid topics", () => {
      const rawTopics = [
        {
          id: 1,
          title: "Test Topic 1",
          slug: "test-topic-1",
          posts_count: 5,
          views: 100,
          like_count: 10,
          created_at: "2024-01-01T00:00:00Z",
          last_posted_at: "2024-01-02T00:00:00Z",
          category_id: 1,
          tags: ["test"],
        },
        {
          id: 2,
          title: "Test Topic 2",
          slug: "test-topic-2",
          posts_count: 3,
          like_count: 5,
          created_at: "2024-01-03T00:00:00Z",
          last_posted_at: "2024-01-04T00:00:00Z",
        },
      ];

      const parsed = parseTopics(rawTopics);

      expect(parsed).toHaveLength(2);
      expect(parsed[0].id).toBe(1);
      expect(parsed[0].title).toBe("Test Topic 1");
      expect(parsed[1].tags).toEqual([]);
    });

    it("should filter out invalid topics", () => {
      const rawTopics = [
        {
          id: 1,
          title: "Valid Topic",
          slug: "valid-topic",
          posts_count: 5,
          like_count: 10,
          created_at: "2024-01-01T00:00:00Z",
          last_posted_at: "2024-01-02T00:00:00Z",
        },
        {
          id: "invalid",
          title: "Invalid Topic",
        },
      ];

      const parsed = parseTopics(rawTopics);

      expect(parsed).toHaveLength(1);
      expect(parsed[0].title).toBe("Valid Topic");
    });

    it("should handle empty array", () => {
      const parsed = parseTopics([]);
      expect(parsed).toEqual([]);
    });

    it("should default like_count to 0", () => {
      const rawTopics = [
        {
          id: 1,
          title: "Test Topic",
          slug: "test-topic",
          posts_count: 5,
          created_at: "2024-01-01T00:00:00Z",
          last_posted_at: "2024-01-02T00:00:00Z",
        },
      ];

      const parsed = parseTopics(rawTopics);

      expect(parsed[0].like_count).toBe(0);
    });
  });

  describe("parseTopic", () => {
    it("should parse valid topic", () => {
      const rawTopic = {
        id: 1,
        title: "Test Topic",
        slug: "test-topic",
        posts_count: 5,
        views: 100,
        like_count: 10,
        created_at: "2024-01-01T00:00:00Z",
        last_posted_at: "2024-01-02T00:00:00Z",
        category_id: 1,
        tags: ["test"],
      };

      const parsed = parseTopic(rawTopic);

      expect(parsed).not.toBeNull();
      expect(parsed?.id).toBe(1);
      expect(parsed?.title).toBe("Test Topic");
    });

    it("should return null for invalid topic", () => {
      const rawTopic = {
        id: "invalid",
        title: 123,
      };

      const parsed = parseTopic(rawTopic);

      expect(parsed).toBeNull();
    });

    it("should handle missing optional fields", () => {
      const rawTopic = {
        id: 1,
        title: "Minimal Topic",
        slug: "minimal-topic",
        posts_count: 1,
        like_count: 0,
        created_at: "2024-01-01T00:00:00Z",
        last_posted_at: null,
      };

      const parsed = parseTopic(rawTopic);

      expect(parsed).not.toBeNull();
      expect(parsed?.tags).toEqual([]);
      expect(parsed?.last_posted_at).toBeNull();
    });
  });

  describe("parsePosts", () => {
    it("should parse valid posts", () => {
      const rawPosts = [
        {
          id: 1,
          topic_id: 123,
          username: "user1",
          cooked: "<p>Post content</p>",
          created_at: "2024-01-01T00:00:00Z",
          like_count: 5,
        },
        {
          id: 2,
          topic_id: 123,
          username: "user2",
          created_at: "2024-01-02T00:00:00Z",
        },
      ];

      const parsed = parsePosts(rawPosts);

      expect(parsed).toHaveLength(2);
      expect(parsed[0].id).toBe(1);
      expect(parsed[0].username).toBe("user1");
      expect(parsed[1].like_count).toBe(0);
    });

    it("should use blurb when cooked is missing", () => {
      const rawPosts = [
        {
          id: 1,
          topic_id: 123,
          username: "user1",
          blurb: "Preview text",
          created_at: "2024-01-01T00:00:00Z",
        },
      ];

      const parsed = parsePosts(rawPosts);

      expect(parsed).toHaveLength(1);
      expect(parsed[0].cooked).toBe("Preview text");
    });

    it("should filter out invalid posts", () => {
      const rawPosts = [
        {
          id: 1,
          topic_id: 123,
          username: "valid_user",
          created_at: "2024-01-01T00:00:00Z",
        },
        {
          id: "invalid",
          username: "invalid_user",
        },
      ];

      const parsed = parsePosts(rawPosts);

      expect(parsed).toHaveLength(1);
      expect(parsed[0].username).toBe("valid_user");
    });

    it("should handle empty array", () => {
      const parsed = parsePosts([]);
      expect(parsed).toEqual([]);
    });
  });

  describe("Integration - callAPI with parsing", () => {
    it("should fetch and parse topics successfully", async () => {
      const mockTopicsResponse = {
        topic_list: {
          topics: [
            {
              id: 1,
              title: "Topic 1",
              slug: "topic-1",
              posts_count: 5,
              like_count: 10,
              created_at: "2024-01-01T00:00:00Z",
              last_posted_at: "2024-01-02T00:00:00Z",
            },
          ],
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockTopicsResponse,
      } as Response);

      const result = await Effect.runPromise(
        callAPI(
          "https://discourse.example.com",
          10000,
          undefined,
          undefined,
          "/latest.json"
        )
      );

      const topics = parseTopics(result.topic_list.topics);

      expect(topics).toHaveLength(1);
      expect(topics[0].title).toBe("Topic 1");
    });

    it("should fetch and parse topic with posts successfully", async () => {
      const mockTopicResponse = {
        id: 123,
        title: "Test Topic",
        slug: "test-topic",
        posts_count: 2,
        like_count: 10,
        created_at: "2024-01-01T00:00:00Z",
        last_posted_at: "2024-01-02T00:00:00Z",
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
          ],
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockTopicResponse,
      } as Response);

      const result = await Effect.runPromise(
        callAPI(
          "https://discourse.example.com",
          10000,
          undefined,
          undefined,
          "/t/123.json"
        )
      );

      const topic = parseTopic(result);
      const posts = parsePosts(result.post_stream.posts);

      expect(topic).not.toBeNull();
      expect(topic?.id).toBe(123);
      expect(posts).toHaveLength(1);
      expect(posts[0].username).toBe("user1");
    });
  });
});
