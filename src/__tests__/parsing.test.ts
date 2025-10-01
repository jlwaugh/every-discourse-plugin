import { describe, it, expect } from "vitest";
import { testHelpers } from "../index";
const { parseTopics, parseTopic, parsePosts } = testHelpers;

describe("Discourse Parsing Functions", () => {
  describe("parseTopics", () => {
    it("should parse valid topic data", () => {
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
          tags: ["test", "sample"],
        },
      ];

      const topics = parseTopics(mockData);

      expect(topics).toHaveLength(1);
      expect(topics[0]).toEqual({
        id: 1,
        title: "Test Topic",
        slug: "test-topic",
        posts_count: 5,
        views: 100,
        like_count: 10,
        created_at: "2025-01-01T00:00:00Z",
        last_posted_at: "2025-01-02T00:00:00Z",
        category_id: 1,
        tags: ["test", "sample"],
      });
    });

    it("should handle missing optional fields", () => {
      const mockData = [
        {
          id: 1,
          title: "Test Topic",
          slug: "test-topic",
          posts_count: 5,
          like_count: 0,
          created_at: "2025-01-01T00:00:00Z",
          last_posted_at: null,
        },
      ];

      const topics = parseTopics(mockData);

      expect(topics).toHaveLength(1);
      expect(topics[0].views).toBeUndefined();
      expect(topics[0].category_id).toBeUndefined();
      expect(topics[0].tags).toEqual([]);
      expect(topics[0].last_posted_at).toBeNull();
    });

    it("should filter out invalid topics", () => {
      const mockData = [
        {
          id: 1,
          title: "Valid Topic",
          slug: "valid",
          posts_count: 5,
          like_count: 0,
          created_at: "2025-01-01T00:00:00Z",
          last_posted_at: null,
        },
        {
          id: "invalid", // Invalid ID type
          title: "Invalid Topic",
        },
        {
          id: 2,
          title: "Another Valid",
          slug: "valid-2",
          posts_count: 3,
          like_count: 0,
          created_at: "2025-01-01T00:00:00Z",
          last_posted_at: null,
        },
      ];

      const topics = parseTopics(mockData);

      expect(topics).toHaveLength(2);
      expect(topics[0].id).toBe(1);
      expect(topics[1].id).toBe(2);
    });

    it("should handle empty array", () => {
      const topics = parseTopics([]);
      expect(topics).toEqual([]);
    });
  });

  describe("parseTopic", () => {
    it("should parse a single valid topic", () => {
      const mockData = {
        id: 7,
        title: "Governance Discussion",
        slug: "governance-discussion",
        posts_count: 25,
        views: 500,
        like_count: 15,
        created_at: "2025-01-01T12:00:00Z",
        last_posted_at: "2025-01-05T18:30:00Z",
        category_id: 2,
        tags: ["governance", "proposal"],
      };

      const topic = parseTopic(mockData);

      expect(topic).not.toBeNull();
      expect(topic?.id).toBe(7);
      expect(topic?.title).toBe("Governance Discussion");
      expect(topic?.tags).toEqual(["governance", "proposal"]);
    });

    it("should return null for invalid data", () => {
      const mockData = {
        id: "not-a-number",
        title: 123, // Should be string
      };

      const topic = parseTopic(mockData);
      expect(topic).toBeNull();
    });

    it("should handle missing optional fields", () => {
      const mockData = {
        id: 1,
        title: "Minimal Topic",
        slug: "minimal",
        posts_count: 1,
        like_count: 0,
        created_at: "2025-01-01T00:00:00Z",
        last_posted_at: null,
      };

      const topic = parseTopic(mockData);

      expect(topic).not.toBeNull();
      expect(topic?.views).toBeUndefined();
      expect(topic?.tags).toEqual([]);
    });
  });

  describe("parsePosts", () => {
    it("should parse valid post data", () => {
      const mockData = [
        {
          id: 1,
          topic_id: 7,
          username: "alice",
          cooked: "<p>Hello world</p>",
          created_at: "2025-01-01T00:00:00Z",
          like_count: 5,
        },
        {
          id: 2,
          topic_id: 7,
          username: "bob",
          cooked: "<p>Great post!</p>",
          created_at: "2025-01-01T01:00:00Z",
          like_count: 3,
        },
      ];

      const posts = parsePosts(mockData);

      expect(posts).toHaveLength(2);
      expect(posts[0].id).toBe(1);
      expect(posts[0].username).toBe("alice");
      expect(posts[1].id).toBe(2);
      expect(posts[1].username).toBe("bob");
    });

    it("should handle missing optional fields", () => {
      const mockData = [
        {
          id: 1,
          topic_id: 7,
          username: "alice",
          created_at: "2025-01-01T00:00:00Z",
        },
      ];

      const posts = parsePosts(mockData);

      expect(posts).toHaveLength(1);
      expect(posts[0].cooked).toBeUndefined();
      expect(posts[0].like_count).toBe(0);
    });

    it("should use blurb when cooked is missing", () => {
      const mockData = [
        {
          id: 1,
          topic_id: 7,
          username: "alice",
          blurb: "This is a preview text",
          created_at: "2025-01-01T00:00:00Z",
          like_count: 2,
        },
      ];

      const posts = parsePosts(mockData);

      expect(posts).toHaveLength(1);
      expect(posts[0].cooked).toBe("This is a preview text");
    });

    it("should filter out invalid posts", () => {
      const mockData = [
        {
          id: 1,
          topic_id: 7,
          username: "alice",
          created_at: "2025-01-01T00:00:00Z",
        },
        {
          id: "invalid",
          username: "bob",
        },
        {
          id: 2,
          topic_id: 7,
          username: "charlie",
          created_at: "2025-01-01T00:00:00Z",
        },
      ];

      const posts = parsePosts(mockData);

      expect(posts).toHaveLength(2);
      expect(posts[0].username).toBe("alice");
      expect(posts[1].username).toBe("charlie");
    });

    it("should handle empty array", () => {
      const posts = parsePosts([]);
      expect(posts).toEqual([]);
    });
  });
});
