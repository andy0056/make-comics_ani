import { z } from "zod";
import { COMIC_STYLES, PANEL_LAYOUTS } from "@/lib/constants";

const MAX_PROMPT_CHARS = 6000;
const MAX_CONTEXT_CHARS = 2000;
const MAX_MESSAGE_CHARS = 3000;
const MAX_TOTAL_MESSAGE_CHARS = 12000;
const MAX_SLUG_CHARS = 160;
const MAX_ID_CHARS = 160;
const MAX_URL_CHARS = 2048;

const styleIds = new Set(COMIC_STYLES.map((style) => style.id));
const panelLayoutIds = new Set(PANEL_LAYOUTS.map((layout) => layout.id));

const safeString = z.string().trim().min(1);

const storySlugSchema = safeString.max(MAX_SLUG_CHARS);
const storyIdSchema = safeString.max(MAX_ID_CHARS);
const pageIdSchema = safeString.max(MAX_ID_CHARS);
const characterImageSchema = z.string().trim().url().max(MAX_URL_CHARS);

const styleSchema = z
  .string()
  .trim()
  .max(64)
  .default("noir")
  .refine((style) => styleIds.has(style), {
    message: "Invalid style",
  });

const panelLayoutSchema = z
  .string()
  .trim()
  .max(64)
  .optional()
  .refine((panelLayout) => panelLayout === undefined || panelLayoutIds.has(panelLayout), {
    message: "Invalid panel layout",
  });

export const generateComicRequestSchema = z.object({
  storyId: storyIdSchema.optional(),
  prompt: z.string().trim().min(1).max(MAX_PROMPT_CHARS),
  style: styleSchema,
  panelLayout: panelLayoutSchema,
  characterImages: z.array(characterImageSchema).max(2).default([]),
  isContinuation: z.boolean().default(false),
  previousContext: z.string().max(MAX_CONTEXT_CHARS).default(""),
});

export const addPageRequestSchema = z.object({
  storyId: storySlugSchema,
  pageId: pageIdSchema.optional(),
  prompt: z.string().trim().min(1).max(MAX_PROMPT_CHARS),
  panelLayout: panelLayoutSchema,
  characterImages: z.array(characterImageSchema).max(2).default([]),
});

const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(MAX_MESSAGE_CHARS),
});

export const chatGuideRequestSchema = z
  .object({
    messages: z.array(chatMessageSchema).min(1).max(24),
    context: z.string().max(MAX_CONTEXT_CHARS).optional(),
    storySlug: storySlugSchema.nullish(),
  })
  .superRefine((value, ctx) => {
    const totalMessageChars = value.messages.reduce(
      (total, message) => total + message.content.length,
      0,
    );
    if (totalMessageChars > MAX_TOTAL_MESSAGE_CHARS) {
      ctx.addIssue({
        code: "custom",
        path: ["messages"],
        message: "Messages exceed allowed size",
      });
    }
  });

export const deletePageRequestSchema = z.object({
  storySlug: storySlugSchema,
  pageId: pageIdSchema,
});

export function getRequestValidationErrorMessage(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) {
    return "Invalid request payload";
  }

  if (issue.path.length === 0) {
    return issue.message;
  }

  return `${issue.path.join(".")}: ${issue.message}`;
}
