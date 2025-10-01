import { expect, it, vi, beforeEach, afterEach, describe } from "vitest";
import { Effect } from "every-plugin/effect";
import { _testHelpers } from "../index";
const { callAPI } = _testHelpers;

// Mock fetch globally
const mockFetch = vi.fn();
globalThis.fetch = mockFetch as any;

describe("Discourse API Tests", () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("callAPI", () => {
    it("should make successful API call", async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: async () => ({ id: 1, title: "Test" }),
      } as Response;
      mockFetch.mockResolvedValueOnce(mockResponse);

      const result = await Effect.runPromise(
        callAPI(
          "https://example.com",
          10000,
          undefined,
          undefined,
          "/test.json"
        )
      );

      expect(result).toEqual({ id: 1, title: "Test" });
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://example.com/test.json",
        expect.objectContaining({
          headers: { Accept: "application/json" },
        })
      );
    });

    it("should include API credentials in headers", async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: async () => ({}),
      } as Response;
      mockFetch.mockResolvedValueOnce(mockResponse);

      await Effect.runPromise(
        callAPI(
          "https://example.com",
          10000,
          "test-api-key",
          "test-user",
          "/test.json"
        )
      );

      expect(mockFetch).toHaveBeenCalledWith(
        "https://example.com/test.json",
        expect.objectContaining({
          headers: {
            Accept: "application/json",
            "Api-Key": "test-api-key",
            "Api-Username": "test-user",
          },
        })
      );
    });

    it("should append query parameters correctly", async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: async () => ({}),
      } as Response;
      mockFetch.mockResolvedValueOnce(mockResponse);

      await Effect.runPromise(
        callAPI(
          "https://example.com",
          10000,
          undefined,
          undefined,
          "/test.json",
          { page: 1, category: "governance" }
        )
      );

      const callUrl = mockFetch.mock.calls[0][0];
      expect(callUrl).toContain("page=1");
      expect(callUrl).toContain("category=governance");
    });

    it("should handle HTTP errors", async () => {
      const mockResponse = {
        ok: false,
        status: 404,
        statusText: "Not Found",
      } as Response;
      mockFetch.mockResolvedValueOnce(mockResponse);

      const result = await Effect.runPromise(
        callAPI(
          "https://example.com",
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

    it("should handle network errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      await expect(
        Effect.runPromise(
          callAPI(
            "https://example.com",
            10000,
            undefined,
            undefined,
            "/test.json"
          )
        )
      ).rejects.toThrow();
    });

    it("should retry on rate limit (429)", async () => {
      const mockRateLimitResponse = {
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
      } as Response;
      const mockSuccessResponse = {
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      } as Response;

      mockFetch
        .mockResolvedValueOnce(mockRateLimitResponse)
        .mockResolvedValueOnce(mockSuccessResponse);

      const result = await Effect.runPromise(
        callAPI(
          "https://example.com",
          10000,
          undefined,
          undefined,
          "/test.json"
        )
      );

      expect(result).toEqual({ success: true });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should stop retrying after 3 attempts", async () => {
      const mockRateLimitResponse = {
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
      } as Response;

      mockFetch.mockResolvedValue(mockRateLimitResponse);

      const result = await Effect.runPromise(
        callAPI(
          "https://example.com",
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
      expect(mockFetch).toHaveBeenCalledTimes(4); // Initial + 3 retries
    }, 10000);

    it("should handle JSON parse errors", async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: async () => {
          throw new Error("Invalid JSON");
        },
      } as unknown as Response;
      mockFetch.mockResolvedValueOnce(mockResponse);

      await expect(
        Effect.runPromise(
          callAPI(
            "https://example.com",
            10000,
            undefined,
            undefined,
            "/test.json"
          )
        )
      ).rejects.toThrow();
    });

    it("should handle exponential backoff correctly", async () => {
      const mockRateLimitResponse = {
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
      } as Response;

      mockFetch
        .mockResolvedValueOnce(mockRateLimitResponse)
        .mockResolvedValueOnce(mockRateLimitResponse)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ success: true }),
        } as Response);

      const result = await Effect.runPromise(
        callAPI(
          "https://example.com",
          10000,
          undefined,
          undefined,
          "/test.json"
        )
      );

      expect(result).toEqual({ success: true });
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });
});
