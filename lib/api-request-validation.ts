import { z } from "zod";
import { COMIC_STYLES, PANEL_LAYOUTS } from "@/lib/constants";

const MAX_PROMPT_CHARS = 6000;
const MAX_CONTEXT_CHARS = 2000;
const MAX_MESSAGE_CHARS = 3000;
const MAX_TOTAL_MESSAGE_CHARS = 12000;
const MAX_SLUG_CHARS = 160;
const MAX_URL_CHARS = 2048;
const MAX_TITLE_CHARS = 140;
const MAX_CHARACTER_NAME_CHARS = 60;
const MAX_CHARACTER_ROLE_CHARS = 120;
const MAX_CHARACTER_TEXT_CHARS = 500;
const MAX_CHARACTERS = 6;
const MAX_UPLOAD_FILENAME_CHARS = 180;
const MAX_UPLOAD_FILE_BYTES = 10 * 1024 * 1024;
const MAX_UNIVERSE_ACTIVITY_DAYS = 30;
const MAX_UNIVERSE_ACTIVITY_LIMIT = 100;
const MAX_UNIVERSE_INTERACTIVE_MAX_NODES = 100;
const DEFAULT_UNIVERSE_ACTIVITY_DAYS = 14;
const DEFAULT_UNIVERSE_ACTIVITY_LIMIT = 24;
const DEFAULT_UNIVERSE_INTERACTIVE_MAX_NODES = 60;

const styleIds = new Set(COMIC_STYLES.map((style) => style.id));
const panelLayoutIds = new Set(PANEL_LAYOUTS.map((layout) => layout.id));

const safeString = z.string().trim().min(1);

const storySlugSchema = safeString.max(MAX_SLUG_CHARS);
const uuidSchema = z.string().trim().uuid("Invalid UUID");
const storyIdSchema = uuidSchema;
const pageIdSchema = uuidSchema;
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

export const generateComicRequestSchema = z
  .object({
    storyId: storyIdSchema.optional(),
    prompt: z.string().trim().min(1).max(MAX_PROMPT_CHARS),
    style: styleSchema,
    panelLayout: panelLayoutSchema,
    characterImages: z.array(characterImageSchema).max(2).default([]),
    isContinuation: z.boolean().default(false),
    previousContext: z.string().max(MAX_CONTEXT_CHARS).default(""),
  })
  .strict();

export const addPageRequestSchema = z
  .object({
    storyId: storySlugSchema,
    pageId: pageIdSchema.optional(),
    prompt: z.string().trim().min(1).max(MAX_PROMPT_CHARS),
    panelLayout: panelLayoutSchema,
    characterImages: z.array(characterImageSchema).max(2).default([]),
  })
  .strict();

const chatMessageSchema = z
  .object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().min(1).max(MAX_MESSAGE_CHARS),
  })
  .strict();

export const chatGuideRequestSchema = z
  .object({
    messages: z.array(chatMessageSchema).min(1).max(24),
    context: z.string().max(MAX_CONTEXT_CHARS).optional(),
    storySlug: storySlugSchema.nullish(),
  })
  .strict()
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

export const deletePageRequestSchema = z
  .object({
    storySlug: storySlugSchema,
    pageId: pageIdSchema,
  })
  .strict();

export const downloadPdfQuerySchema = z.object({
  storySlug: storySlugSchema,
});

export const storySlugParamSchema = z.object({
  storySlug: storySlugSchema,
});

export const storyTitleUpdateRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(MAX_TITLE_CHARS),
  })
  .strict();

export const shareSettingsRequestSchema = z
  .object({
    action: z.enum(["enable", "disable", "rotate"]),
  })
  .strict();

const SHARE_TOKEN_PATTERN = /^[a-f0-9]{32}$/i;

export const shareTokenQuerySchema = z.object({
  token: z.string().trim().regex(SHARE_TOKEN_PATTERN, "Invalid share token"),
});

export const universeActivityQuerySchema = z
  .object({
    days: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_UNIVERSE_ACTIVITY_DAYS)
      .default(DEFAULT_UNIVERSE_ACTIVITY_DAYS),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_UNIVERSE_ACTIVITY_LIMIT)
      .default(DEFAULT_UNIVERSE_ACTIVITY_LIMIT),
  })
  .strict();

export const universeInteractiveQuerySchema = z
  .object({
    focusStoryId: z.string().trim().uuid("Invalid focusStoryId").optional(),
    maxNodes: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_UNIVERSE_INTERACTIVE_MAX_NODES)
      .default(DEFAULT_UNIVERSE_INTERACTIVE_MAX_NODES),
  })
  .strict();

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

const characterInputSchema = z
  .object({
    name: z.string().trim().min(1).max(MAX_CHARACTER_NAME_CHARS),
    role: z.string().trim().max(MAX_CHARACTER_ROLE_CHARS).default(""),
    appearance: longTextSchema.default(""),
    personality: longTextSchema.default(""),
    speechStyle: longTextSchema.default(""),
    referenceImageUrl: characterReferenceUrlSchema.default(""),
    isLocked: z.boolean().default(true),
  })
  .strict();

export const charactersUpdateRequestSchema = z
  .object({
    characters: z.array(characterInputSchema).max(MAX_CHARACTERS),
  })
  .strict()
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

const supportedUploadMimeTypes = ["image/jpeg", "image/png"] as const;

export const s3UploadInitRequestSchema = z.object({
  filename: z.string().trim().min(1).max(MAX_UPLOAD_FILENAME_CHARS),
  filetype: z.enum(supportedUploadMimeTypes),
  filesize: z.coerce.number().int().positive().max(MAX_UPLOAD_FILE_BYTES),
  _nextS3: z
    .object({
      strategy: z.literal("presigned"),
    })
    .optional(),
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
