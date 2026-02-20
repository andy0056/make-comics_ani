import { randomUUID } from "crypto";
import { z } from "zod";
import {
  creatorTwinPreferencesSchema,
  type CreatorTwinPreferences,
  normalizeCreatorTwinPreferences,
} from "@/lib/creator-twin";
import { type StoryCharacter } from "@/lib/schema";
import { type StoryWorldPayload } from "@/lib/story-world";

const importedTimelineItemSchema = z.object({
  title: z.string().trim().min(1).max(120),
  note: z.string().trim().max(240).optional().default(""),
});

const importedLocationItemSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(200).optional().default(""),
});

const importedCharacterItemSchema = z.object({
  name: z.string().trim().min(1).max(80),
  role: z.string().trim().max(120).optional().default(""),
  appearance: z.string().trim().max(220).optional().default(""),
  personality: z.string().trim().max(220).optional().default(""),
  speechStyle: z.string().trim().max(220).optional().default(""),
  isLocked: z.boolean().optional().default(true),
});

const importedMemorySchema = z.object({
  world: z.object({
    timeline: z.array(importedTimelineItemSchema).max(20).default([]),
    locations: z.array(importedLocationItemSchema).max(20).default([]),
    canonRules: z.array(z.string().trim().min(1).max(200)).max(30).default([]),
  }),
  characters: z.array(importedCharacterItemSchema).max(6).default([]),
  preferences: creatorTwinPreferencesSchema.optional(),
});

export type ImportedMemoryPayload = z.infer<typeof importedMemorySchema>;

export function extractFallbackMemoryFromNotes(
  notes: string,
): ImportedMemoryPayload {
  const lines = notes
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const canonRules: string[] = [];
  const locations: Array<{ name: string; description: string }> = [];
  const timeline: Array<{ title: string; note: string }> = [];
  const characters: ImportedMemoryPayload["characters"] = [];

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.startsWith("rule:")) {
      canonRules.push(line.slice(5).trim());
      continue;
    }

    if (lower.startsWith("location:")) {
      const content = line.slice(9).trim();
      const [namePart, ...descParts] = content.split("-");
      const name = namePart.trim();
      if (name) {
        locations.push({
          name,
          description: descParts.join("-").trim(),
        });
      }
      continue;
    }

    if (lower.startsWith("character:")) {
      const content = line.slice(10).trim();
      const [namePart, ...roleParts] = content.split("-");
      const name = namePart.trim();
      if (name) {
        characters.push({
          name,
          role: roleParts.join("-").trim(),
          appearance: "",
          personality: "",
          speechStyle: "",
          isLocked: true,
        });
      }
      continue;
    }

    if (line.length > 20 && timeline.length < 8) {
      timeline.push({
        title: line.slice(0, 80),
        note: "",
      });
    }
  }

  if (canonRules.length === 0) {
    canonRules.push("Preserve continuity with imported notes.");
  }

  return {
    world: {
      timeline: timeline.slice(0, 8),
      locations: locations.slice(0, 8),
      canonRules: canonRules.slice(0, 10),
    },
    characters: characters.slice(0, 6),
    preferences: undefined,
  };
}

export function normalizeImportedMemory(
  candidate: unknown,
  notesFallback: string,
): {
  payload: ImportedMemoryPayload;
  source: "model" | "fallback";
  suggestedPreferences: CreatorTwinPreferences | null;
} {
  const parsed = importedMemorySchema.safeParse(candidate);
  if (!parsed.success) {
    const fallback = extractFallbackMemoryFromNotes(notesFallback);
    return {
      payload: fallback,
      source: "fallback",
      suggestedPreferences: null,
    };
  }

  const suggestedPreferences = parsed.data.preferences
    ? normalizeCreatorTwinPreferences(parsed.data.preferences)
    : null;

  return {
    payload: parsed.data,
    source: "model",
    suggestedPreferences,
  };
}

export function toStoryWorldPayload(
  imported: ImportedMemoryPayload["world"],
): StoryWorldPayload {
  return {
    timeline: imported.timeline.map((item, index) => ({
      id: `tl-${index + 1}-${randomUUID().slice(0, 8)}`,
      title: item.title.trim(),
      note: item.note?.trim() || "",
      order: index,
    })),
    locations: imported.locations.map((item, index) => ({
      id: `loc-${index + 1}-${randomUUID().slice(0, 8)}`,
      name: item.name.trim(),
      description: item.description?.trim() || "",
    })),
    canonRules: imported.canonRules.map((rule) => rule.trim()).filter(Boolean),
  };
}

export function mergeStoryWorld(
  existing: StoryWorldPayload,
  incoming: StoryWorldPayload,
): StoryWorldPayload {
  const timelineMap = new Map<string, { title: string; note: string }>();
  const locationMap = new Map<string, { name: string; description: string }>();
  const canonRuleMap = new Map<string, string>();

  for (const item of existing.timeline) {
    timelineMap.set(item.title.trim().toLowerCase(), {
      title: item.title.trim(),
      note: item.note?.trim() || "",
    });
  }
  for (const item of incoming.timeline) {
    const key = item.title.trim().toLowerCase();
    if (!timelineMap.has(key)) {
      timelineMap.set(key, {
        title: item.title.trim(),
        note: item.note?.trim() || "",
      });
    }
  }

  for (const item of existing.locations) {
    locationMap.set(item.name.trim().toLowerCase(), {
      name: item.name.trim(),
      description: item.description?.trim() || "",
    });
  }
  for (const item of incoming.locations) {
    const key = item.name.trim().toLowerCase();
    if (!locationMap.has(key)) {
      locationMap.set(key, {
        name: item.name.trim(),
        description: item.description?.trim() || "",
      });
    }
  }

  for (const rule of existing.canonRules) {
    const normalized = rule.trim();
    canonRuleMap.set(normalized.toLowerCase(), normalized);
  }
  for (const rule of incoming.canonRules) {
    const normalized = rule.trim();
    if (normalized.length > 0 && !canonRuleMap.has(normalized.toLowerCase())) {
      canonRuleMap.set(normalized.toLowerCase(), normalized);
    }
  }

  const timeline = Array.from(timelineMap.values())
    .slice(0, 20)
    .map((item, index) => ({
      id: `tl-${index + 1}-${randomUUID().slice(0, 8)}`,
      title: item.title,
      note: item.note,
      order: index,
    }));

  const locations = Array.from(locationMap.values())
    .slice(0, 20)
    .map((item, index) => ({
      id: `loc-${index + 1}-${randomUUID().slice(0, 8)}`,
      name: item.name,
      description: item.description,
    }));

  return {
    timeline,
    locations,
    canonRules: Array.from(canonRuleMap.values()).slice(0, 30),
  };
}

export function mergeImportedCharacters(
  existing: StoryCharacter[],
  imported: ImportedMemoryPayload["characters"],
): Array<{
  name: string;
  role?: string;
  appearance?: string;
  personality?: string;
  speechStyle?: string;
  isLocked?: boolean;
  sortOrder?: number;
}> {
  const merged = new Map<
    string,
    {
      name: string;
      role: string;
      appearance: string;
      personality: string;
      speechStyle: string;
      isLocked: boolean;
    }
  >();

  for (const character of existing) {
    const key = character.name.trim().toLowerCase();
    merged.set(key, {
      name: character.name.trim(),
      role: character.role?.trim() || "",
      appearance: character.appearance?.trim() || "",
      personality: character.personality?.trim() || "",
      speechStyle: character.speechStyle?.trim() || "",
      isLocked: character.isLocked,
    });
  }

  for (const character of imported) {
    const key = character.name.trim().toLowerCase();
    if (!merged.has(key)) {
      merged.set(key, {
        name: character.name.trim(),
        role: character.role?.trim() || "",
        appearance: character.appearance?.trim() || "",
        personality: character.personality?.trim() || "",
        speechStyle: character.speechStyle?.trim() || "",
        isLocked: character.isLocked ?? true,
      });
    }
  }

  return Array.from(merged.values())
    .slice(0, 6)
    .map((character, index) => ({
      ...character,
      sortOrder: index,
    }));
}
