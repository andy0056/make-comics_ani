import { z } from "zod";
import { COMIC_STYLES, PANEL_LAYOUTS } from "@/lib/constants";

const MAX_PROMPT_CHARS = 6000;
const MAX_CONTEXT_CHARS = 2000;
const MAX_MESSAGE_CHARS = 3000;
const MAX_TOTAL_MESSAGE_CHARS = 12000;
const MAX_SLUG_CHARS = 160;
const MAX_ID_CHARS = 160;
const MAX_URL_CHARS = 2048;
const MAX_TITLE_CHARS = 140;
const MAX_CHARACTER_NAME_CHARS = 60;
const MAX_CHARACTER_ROLE_CHARS = 120;
const MAX_CHARACTER_TEXT_CHARS = 500;
const MAX_CHARACTERS = 6;

const styleIds = new Set(COMIC_STYLES.map((style) => style.id));
const panelLayoutIds = new Set(PANEL_LAYOUTS.map((layout) => layout.id));

const safeString = z.string().trim().min(1);

const storySlugSchema = safeString.max(MAX_SLUG_CHARS);
const storyIdSchema = safeString.max(MAX_ID_CHARS);
const pageIdSchema = safeString.max(MAX_ID_CHARS);
const characterImageSchema = z.string().trim().url().max(MAX_URL_CHARS);
const longTextSchema = z.string().trim().max(MAX_CHARACTER_TEXT_CHARS);

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

export const storyTitleUpdateRequestSchema = z.object({
  title: z.string().trim().min(1).max(MAX_TITLE_CHARS),
});

export const shareSettingsRequestSchema = z.object({
  action: z.enum(["enable", "disable", "rotate"]),
});

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

const characterReferenceUrlSchema = z
  .string()
  .max(MAX_URL_CHARS)
  .transform((value) => value.trim())
  .refine((value) => value.length === 0 || isHttpUrl(value), {
    message: "Invalid reference image URL",
  });

const characterInputSchema = z.object({
  name: z.string().trim().min(1).max(MAX_CHARACTER_NAME_CHARS),
  role: z.string().trim().max(MAX_CHARACTER_ROLE_CHARS).default(""),
  appearance: longTextSchema.default(""),
  personality: longTextSchema.default(""),
  speechStyle: longTextSchema.default(""),
  referenceImageUrl: characterReferenceUrlSchema.default(""),
  isLocked: z.boolean().default(true),
});

export const charactersUpdateRequestSchema = z
  .object({
    characters: z.array(characterInputSchema).max(MAX_CHARACTERS),
  })
  .superRefine(({ characters }, ctx) => {
    const seenNames = new Set<string>();
    for (let index = 0; index < characters.length; index += 1) {
      const normalizedName = characters[index].name.toLowerCase();
      if (seenNames.has(normalizedName)) {
        ctx.addIssue({
          code: "custom",
          path: ["characters", index, "name"],
          message: "Character names must be unique",
        });
      }
      seenNames.add(normalizedName);
    }
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
