import { CommonPluginErrors } from "every-plugin";
import { oc } from "every-plugin/orpc";
import { z } from "every-plugin/zod";

export const DiscourseTopicSchema = z.object({
  id: z.number(),
  title: z.string(),
  slug: z.string(),
  posts_count: z.number(),
  views: z.number().optional(),
  like_count: z.number(),
  created_at: z.string().datetime(),
  last_posted_at: z.string().datetime().nullable(),
  category_id: z.number().optional(),
  tags: z.array(z.string()).default([]),
});

export const DiscoursePostSchema = z.object({
  id: z.number(),
  topic_id: z.number(),
  username: z.string(),
  cooked: z.string().optional(),
  created_at: z.string().datetime(),
  like_count: z.number().default(0),
});

export type DiscourseTopic = z.infer<typeof DiscourseTopicSchema>;
export type DiscoursePost = z.infer<typeof DiscoursePostSchema>;

// Router output types
export type GetTopicResult = {
  topic: DiscourseTopic | null;
  posts: DiscoursePost[];
};

export type MonitorResult = {
  items: DiscourseTopic[];
  nextState: {
    phase: "historical" | "realtime";
    lastTopicId?: number;
    lastChecked?: string;
  } | null;
};

export type SearchResult = {
  topics: DiscourseTopic[];
  posts: DiscoursePost[];
  nextState: {
    phase: "historical" | "realtime";
    lastTopicId?: number;
  } | null;
};

// Contract definition
export const discourseContract = oc.router({
  getTopic: oc
    .route({ method: "POST", path: "/getTopic" })
    .input(z.object({ id: z.number() }))
    .output(
      z.object({
        topic: DiscourseTopicSchema.nullable(),
        posts: z.array(DiscoursePostSchema),
      })
    )
    .errors(CommonPluginErrors),

  monitor: oc
    .route({ method: "POST", path: "/monitor" })
    .input(
      z.object({
        category: z.string().optional(),
        tags: z.array(z.string()).optional(),
      })
    )
    .output(
      z.object({
        items: z.array(DiscourseTopicSchema),
        nextState: z
          .object({
            phase: z.enum(["historical", "realtime"]),
            lastTopicId: z.number().optional(),
            lastChecked: z.string().optional(),
          })
          .nullable(),
      })
    )
    .errors(CommonPluginErrors),

  search: oc
    .route({ method: "POST", path: "/search" })
    .input(
      z.object({
        query: z.string().min(1),
        filters: z
          .object({
            username: z.string().optional(),
            minLikes: z.number().optional(),
            after: z.string().datetime().optional(),
          })
          .optional(),
      })
    )
    .output(
      z.object({
        topics: z.array(DiscourseTopicSchema),
        posts: z.array(DiscoursePostSchema),
        nextState: z
          .object({
            phase: z.enum(["historical", "realtime"]),
            lastTopicId: z.number().optional(),
            lastChecked: z.string().optional(),
          })
          .nullable(),
      })
    )
    .errors(CommonPluginErrors),
});

export type DiscourseContract = typeof discourseContract;
