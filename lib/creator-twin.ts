import { z } from "zod";

export const creatorTwinDialogueModeSchema = z.enum([
  "concise",
  "balanced",
  "cinematic",
]);
export const creatorTwinAudienceModeSchema = z.enum([
  "general",
  "kids",
  "teen",
]);

export const creatorTwinPreferencesSchema = z.object({
  pageCount: z.union([z.literal(2), z.literal(3), z.literal(4)]),
  dialogueMode: creatorTwinDialogueModeSchema,
  audienceMode: creatorTwinAudienceModeSchema,
});

export type CreatorTwinPreferences = z.infer<typeof creatorTwinPreferencesSchema>;
export type CreatorTwinDialogueMode = z.infer<typeof creatorTwinDialogueModeSchema>;
export type CreatorTwinAudienceMode = z.infer<typeof creatorTwinAudienceModeSchema>;

export function getDefaultCreatorTwinPreferences(): CreatorTwinPreferences {
  return {
    pageCount: 3,
    dialogueMode: "balanced",
    audienceMode: "general",
  };
}

export function normalizeCreatorTwinPreferences(
  value: unknown,
): CreatorTwinPreferences {
  const parsed = creatorTwinPreferencesSchema.safeParse(value);
  if (!parsed.success) {
    return getDefaultCreatorTwinPreferences();
  }

  return parsed.data;
}
