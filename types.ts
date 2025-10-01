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
