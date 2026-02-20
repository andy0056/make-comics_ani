import { z } from "zod";

export const storyTimelineItemSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1).max(120),
  note: z.string().trim().max(240).optional().default(""),
  order: z.number().int().min(0),
});

export const storyLocationItemSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(200).optional().default(""),
});

export const storyWorldSchema = z.object({
  timeline: z.array(storyTimelineItemSchema).max(100).default([]),
  locations: z.array(storyLocationItemSchema).max(100).default([]),
  canonRules: z.array(z.string().trim().min(1).max(200)).max(100).default([]),
});

export const updateStoryWorldRequestSchema = z.object({
  timeline: z.array(storyTimelineItemSchema).max(100).default([]),
  locations: z.array(storyLocationItemSchema).max(100).default([]),
  canonRules: z.array(z.string().trim().min(1).max(200)).max(100).default([]),
});

export type StoryWorldPayload = z.infer<typeof storyWorldSchema>;

export function createDefaultStoryWorld(): StoryWorldPayload {
  return {
    timeline: [],
    locations: [],
    canonRules: [],
  };
}

export function normalizeStoryWorldPayload(payload: unknown): StoryWorldPayload {
  const parsed = storyWorldSchema.safeParse(payload);
  if (!parsed.success) {
    return createDefaultStoryWorld();
  }

  return parsed.data;
}
