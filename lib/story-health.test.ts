import { describe, expect, it } from "vitest";
import { buildStoryHealthReport } from "@/lib/story-health";
import { type CharacterDnaProfile, type Page, type StoryCharacter } from "@/lib/schema";

function createPage(overrides: Partial<Page> = {}): Page {
  return {
    id: "page-1",
    storyId: "story-1",
    pageNumber: 1,
    prompt:
      "Nova reaches the old observatory, studies a coded map, and prepares for the next confrontation.",
    characterImageUrls: [],
    generatedImageUrl: "https://example.com/page-1.jpg",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

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

function createDna(overrides: Partial<CharacterDnaProfile> = {}): CharacterDnaProfile {
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

describe("story-health", () => {
  it("returns bounded scores and actionable guidance", () => {
    const report = buildStoryHealthReport({
      storyId: "story-1",
      pages: [createPage()],
      world: {
        timeline: [],
        locations: [],
        canonRules: [],
      },
      storyCharacters: [createCharacter()],
      dnaProfiles: [],
    });

    expect(report.clarityScore).toBeGreaterThanOrEqual(0);
    expect(report.clarityScore).toBeLessThanOrEqual(100);
    expect(report.continuityScore).toBeGreaterThanOrEqual(0);
    expect(report.continuityScore).toBeLessThanOrEqual(100);
    expect(report.pacingScore).toBeGreaterThanOrEqual(0);
    expect(report.pacingScore).toBeLessThanOrEqual(100);
    expect(report.nextActions.length).toBeGreaterThan(0);
  });

  it("improves continuity score when DNA and canon rules exist", () => {
    const base = buildStoryHealthReport({
      storyId: "story-1",
      pages: [createPage()],
      world: {
        timeline: [],
        locations: [],
        canonRules: [],
      },
      storyCharacters: [createCharacter()],
      dnaProfiles: [],
    });

    const improved = buildStoryHealthReport({
      storyId: "story-1",
      pages: [createPage()],
      world: {
        timeline: [],
        locations: [{ id: "l1", name: "Old Observatory" }],
        canonRules: ["No time travel"],
      },
      storyCharacters: [createCharacter()],
      dnaProfiles: [createDna()],
    });

    expect(improved.continuityScore).toBeGreaterThanOrEqual(base.continuityScore);
  });
});
