import { describe, expect, it } from "vitest";
import { runContinuityGuardian } from "@/lib/continuity-guardian";
import { type CharacterDnaProfile, type StoryCharacter } from "@/lib/schema";

function createCharacter(overrides: Partial<StoryCharacter> = {}): StoryCharacter {
  return {
    id: "char-1",
    storyId: "story-1",
    name: "Nova",
    role: "Lead",
    appearance: "red scarf",
    personality: "calm",
    speechStyle: "sharp",
    referenceImageUrl: null,
    isLocked: true,
    sortOrder: 0,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function createDna(
  overrides: Partial<CharacterDnaProfile> = {},
): CharacterDnaProfile {
  return {
    id: "dna-1",
    storyId: "story-1",
    characterId: "char-1",
    name: "Nova",
    visualTraits: ["red scarf"],
    behaviorTraits: ["calm"],
    speechTraits: ["sharp"],
    lockedFields: ["appearance", "behavior", "speech"],
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("continuity-guardian", () => {
  it("flags high-severity violations for explicit canon conflicts", () => {
    const violations = runContinuityGuardian({
      storyId: "story-1",
      prompt:
        "Nova discovers a hidden machine that enables time travel across eras.",
      storyWorld: {
        timeline: [],
        locations: [],
        canonRules: ["No time travel"],
      },
      storyCharacters: [createCharacter()],
      dnaProfiles: [createDna()],
    });

    expect(violations.some((violation) => violation.severity === "high")).toBe(
      true,
    );
    expect(
      violations.some((violation) =>
        violation.message.includes("conflicts with canon rule"),
      ),
    ).toBe(true);
  });

  it("flags locked-character death beats", () => {
    const violations = runContinuityGuardian({
      storyId: "story-1",
      prompt:
        "In the final panel, Nova is killed while protecting the city gate.",
      storyWorld: {
        timeline: [],
        locations: [],
        canonRules: [],
      },
      storyCharacters: [createCharacter()],
      dnaProfiles: [createDna()],
    });

    expect(
      violations.some((violation) =>
        violation.ruleId.startsWith("locked-character-death"),
      ),
    ).toBe(true);
  });

  it("returns no violations for a clear and compatible prompt", () => {
    const violations = runContinuityGuardian({
      storyId: "story-1",
      prompt:
        "Nova and her ally scan the old observatory, uncover a coded map, and agree to investigate the hidden chamber at dawn.",
      storyWorld: {
        timeline: [{ id: "t1", title: "Observatory arc begins", order: 1 }],
        locations: [{ id: "l1", name: "Old Observatory" }],
        canonRules: ["No time travel"],
      },
      storyCharacters: [createCharacter()],
      dnaProfiles: [createDna()],
    });

    expect(violations).toEqual([]);
  });
});
