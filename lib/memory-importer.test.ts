import { describe, expect, it } from "vitest";
import {
  extractFallbackMemoryFromNotes,
  mergeImportedCharacters,
  mergeStoryWorld,
  normalizeImportedMemory,
  toStoryWorldPayload,
} from "@/lib/memory-importer";
import { type StoryCharacter } from "@/lib/schema";

describe("memory-importer", () => {
  it("extracts fallback memory from labeled notes", () => {
    const notes = [
      "rule: The hero never abandons civilians.",
      "location: Neon Alley - Rain-soaked market district.",
      "character: Mira - Lead detective",
    ].join("\n");

    const payload = extractFallbackMemoryFromNotes(notes);
    expect(payload.world.canonRules[0]).toContain("never abandons civilians");
    expect(payload.world.locations[0]?.name).toBe("Neon Alley");
    expect(payload.characters[0]?.name).toBe("Mira");
  });

  it("falls back when model payload is invalid", () => {
    const result = normalizeImportedMemory(
      { broken: true },
      "rule: Keep continuity intact.",
    );
    expect(result.source).toBe("fallback");
    expect(result.payload.world.canonRules.length).toBeGreaterThan(0);
  });

  it("merges world and characters without duplicate names", () => {
    const existingWorld = toStoryWorldPayload({
      timeline: [{ title: "Start", note: "" }],
      locations: [{ name: "Neon Alley", description: "" }],
      canonRules: ["No time travel."],
    });
    const incomingWorld = toStoryWorldPayload({
      timeline: [{ title: "Start", note: "same beat" }, { title: "Twist", note: "" }],
      locations: [{ name: "Neon Alley", description: "same place" }],
      canonRules: ["No time travel.", "Keep the mystery grounded."],
    });

    const mergedWorld = mergeStoryWorld(existingWorld, incomingWorld);
    expect(mergedWorld.timeline).toHaveLength(2);
    expect(mergedWorld.locations).toHaveLength(1);
    expect(mergedWorld.canonRules).toHaveLength(2);

    const existingCharacters: StoryCharacter[] = [
      {
        id: "c1",
        storyId: "s1",
        name: "Mira",
        role: "Lead",
        appearance: null,
        personality: null,
        speechStyle: null,
        referenceImageUrl: null,
        isLocked: true,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const mergedCharacters = mergeImportedCharacters(existingCharacters, [
      {
        name: "Mira",
        role: "Duplicate",
        appearance: "",
        personality: "",
        speechStyle: "",
        isLocked: true,
      },
      {
        name: "Kade",
        role: "Support",
        appearance: "",
        personality: "",
        speechStyle: "",
        isLocked: true,
      },
    ]);

    expect(mergedCharacters).toHaveLength(2);
    expect(mergedCharacters[0]?.name).toBe("Mira");
    expect(mergedCharacters[1]?.name).toBe("Kade");
  });
});

