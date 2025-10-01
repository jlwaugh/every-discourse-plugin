import { describe, it, expect } from "vitest";
import { DiscourseTopicSchema, DiscoursePostSchema } from "../schemas";

describe("Discourse Schema Validation", () => {
  describe("DiscourseTopicSchema", () => {
    it("should validate complete topic data", () => {
      const validTopic = {
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
      };

      const result = DiscourseTopicSchema.safeParse(validTopic);
      expect(result.success).toBe(true);
    });

    it("should allow optional fields to be missing", () => {
      const minimalTopic = {
        id: 1,
        title: "Test Topic",
        slug: "test-topic",
        posts_count: 5,
        like_count: 10,
        created_at: "2025-01-01T00:00:00Z",
        last_posted_at: null,
      };

      const result = DiscourseTopicSchema.safeParse(minimalTopic);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.views).toBeUndefined();
        expect(result.data.category_id).toBeUndefined();
        expect(result.data.tags).toEqual([]);
      }
    });

    it("should reject invalid ID type", () => {
      const invalidTopic = {
        id: "not-a-number",
        title: "Test",
        slug: "test",
        posts_count: 5,
        like_count: 10,
        created_at: "2025-01-01T00:00:00Z",
        last_posted_at: null,
      };

      const result = DiscourseTopicSchema.safeParse(invalidTopic);
      expect(result.success).toBe(false);
    });

    it("should reject missing required fields", () => {
      const incompleteTopic = {
        id: 1,
        title: "Test",
        // Missing: slug, posts_count, like_count, created_at
      };

      const result = DiscourseTopicSchema.safeParse(incompleteTopic);
      expect(result.success).toBe(false);
    });

    it("should reject invalid datetime format", () => {
      const invalidTopic = {
        id: 1,
        title: "Test",
        slug: "test",
        posts_count: 5,
        like_count: 10,
        created_at: "not-a-datetime",
        last_posted_at: null,
      };

      const result = DiscourseTopicSchema.safeParse(invalidTopic);
      expect(result.success).toBe(false);
    });

    it("should accept null for last_posted_at", () => {
      const topic = {
        id: 1,
        title: "Test",
        slug: "test",
        posts_count: 5,
        like_count: 10,
        created_at: "2025-01-01T00:00:00Z",
        last_posted_at: null,
      };

      const result = DiscourseTopicSchema.safeParse(topic);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.last_posted_at).toBeNull();
      }
    });

    it("should default tags to empty array", () => {
      const topic = {
        id: 1,
        title: "Test",
        slug: "test",
        posts_count: 5,
        like_count: 10,
        created_at: "2025-01-01T00:00:00Z",
        last_posted_at: null,
      };

      const result = DiscourseTopicSchema.safeParse(topic);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tags).toEqual([]);
      }
    });
  });

  describe("DiscoursePostSchema", () => {
    it("should validate complete post data", () => {
      const validPost = {
        id: 1,
        topic_id: 7,
        username: "alice",
        cooked: "<p>Hello world</p>",
        created_at: "2025-01-01T00:00:00Z",
        like_count: 5,
      };

      const result = DiscoursePostSchema.safeParse(validPost);
      expect(result.success).toBe(true);
    });

    it("should allow optional cooked field", () => {
      const minimalPost = {
        id: 1,
        topic_id: 7,
        username: "alice",
        created_at: "2025-01-01T00:00:00Z",
      };

      const result = DiscoursePostSchema.safeParse(minimalPost);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.cooked).toBeUndefined();
        expect(result.data.like_count).toBe(0);
      }
    });

    it("should default like_count to 0", () => {
      const post = {
        id: 1,
        topic_id: 7,
        username: "alice",
        created_at: "2025-01-01T00:00:00Z",
      };

      const result = DiscoursePostSchema.safeParse(post);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.like_count).toBe(0);
      }
    });

    it("should reject invalid ID type", () => {
      const invalidPost = {
        id: "not-a-number",
        topic_id: 7,
        username: "alice",
        created_at: "2025-01-01T00:00:00Z",
      };

      const result = DiscoursePostSchema.safeParse(invalidPost);
      expect(result.success).toBe(false);
    });

    it("should reject missing required fields", () => {
      const incompletePost = {
        id: 1,
        username: "alice",
        // Missing: topic_id, created_at
      };

      const result = DiscoursePostSchema.safeParse(incompletePost);
      expect(result.success).toBe(false);
    });

    it("should reject non-string username", () => {
      const invalidPost = {
        id: 1,
        topic_id: 7,
        username: 123,
        created_at: "2025-01-01T00:00:00Z",
      };

      const result = DiscoursePostSchema.safeParse(invalidPost);
      expect(result.success).toBe(false);
    });

    it("should accept various datetime formats", () => {
      const post1 = {
        id: 1,
        topic_id: 7,
        username: "alice",
        created_at: "2025-01-01T00:00:00.000Z",
      };

      const post2 = {
        id: 2,
        topic_id: 7,
        username: "bob",
        created_at: "2025-01-01T00:00:00Z",
      };

      expect(DiscoursePostSchema.safeParse(post1).success).toBe(true);
      expect(DiscoursePostSchema.safeParse(post2).success).toBe(true);
    });
  });
});
