import { describe, expect, it } from "vitest";
import { buildIpIncubatorReport } from "@/lib/ip-incubator";

describe("ip-incubator", () => {
  it("builds a stable creator-economy report with expected scores and sections", () => {
    const report = buildIpIncubatorReport({
      story: {
        id: "story-1",
        slug: "midnight-alliance",
        title: "Midnight Alliance",
        description: "Two rivals unite in a collapsing neon city.",
        style: "noir",
        userId: "user_owner",
        usesOwnApiKey: false,
        createdAt: new Date("2026-02-15T00:00:00.000Z"),
        updatedAt: new Date("2026-02-15T00:00:00.000Z"),
      },
      pages: [
        {
          id: "page-1",
          storyId: "story-1",
          pageNumber: 1,
          prompt:
            "A masked detective confronts a guild enforcer in the neon district. Cliffhanger reveal of a hidden emblem.",
          characterImageUrls: [],
          generatedImageUrl: "https://example.com/p1.png",
          createdAt: new Date("2026-02-15T00:00:00.000Z"),
          updatedAt: new Date("2026-02-15T00:00:00.000Z"),
        },
        {
          id: "page-2",
          storyId: "story-1",
          pageNumber: 2,
          prompt:
            "The hero deploys a gadget ring and escapes to the old tower. Secret faction logo appears.",
          characterImageUrls: [],
          generatedImageUrl: "https://example.com/p2.png",
          createdAt: new Date("2026-02-15T00:00:00.000Z"),
          updatedAt: new Date("2026-02-15T00:00:00.000Z"),
        },
      ],
      world: {
        id: "world-1",
        storyId: "story-1",
        timeline: [
          { id: "t1", title: "Guild coup", order: 1 },
          { id: "t2", title: "Alliance pact", order: 2 },
        ],
        locations: [
          { id: "l1", name: "Neon District" },
          { id: "l2", name: "Clockwork Tower" },
        ],
        canonRules: ["No direct sunlight in the lower city."],
        createdAt: new Date("2026-02-15T00:00:00.000Z"),
        updatedAt: new Date("2026-02-15T00:00:00.000Z"),
      },
      characters: [
        {
          id: "char-1",
          storyId: "story-1",
          name: "Vera",
          role: "Detective",
          appearance: "Masked, long coat, silver emblem",
          personality: "Determined and guarded",
          speechStyle: "Sparse, tactical lines",
          referenceImageUrl: "https://example.com/vera.png",
          isLocked: true,
          sortOrder: 0,
          createdAt: new Date("2026-02-15T00:00:00.000Z"),
          updatedAt: new Date("2026-02-15T00:00:00.000Z"),
        },
      ],
      characterDnaProfiles: [
        {
          id: "dna-1",
          storyId: "story-1",
          characterId: "char-1",
          name: "Vera DNA",
          visualTraits: ["silver emblem", "long coat"],
          behaviorTraits: ["strategic"],
          speechTraits: ["concise"],
          lockedFields: ["visualTraits", "speechTraits"],
          createdAt: new Date("2026-02-15T00:00:00.000Z"),
          updatedAt: new Date("2026-02-15T00:00:00.000Z"),
        },
      ],
      remixLineage: {
        parentStory: null,
        remixCount: 2,
        latestRemixes: [],
      },
      generatedAt: "2026-02-15T12:00:00.000Z",
    });

    expect(report.storySlug).toBe("midnight-alliance");
    expect(report.overallScore).toBeGreaterThan(0);
    expect(report.overallScore).toBeLessThanOrEqual(100);
    expect(report.pillars).toHaveLength(4);
    expect(report.merchConcepts.length).toBeGreaterThan(1);
    expect(report.nextExperiments.length).toBeGreaterThan(0);
    expect(report.signals.remixCount).toBe(2);
  });

  it("falls back to low-band when story has minimal structure", () => {
    const report = buildIpIncubatorReport({
      story: {
        id: "story-2",
        slug: "blank-seed",
        title: "Blank Seed",
        description: null,
        style: "noir",
        userId: "user_owner",
        usesOwnApiKey: false,
        createdAt: new Date("2026-02-15T00:00:00.000Z"),
        updatedAt: new Date("2026-02-15T00:00:00.000Z"),
      },
      pages: [],
      world: null,
      characters: [],
      characterDnaProfiles: [],
      remixLineage: {
        parentStory: null,
        remixCount: 0,
        latestRemixes: [],
      },
      generatedAt: "2026-02-15T12:00:00.000Z",
    });

    expect(report.band).toBe("concept_only");
    expect(report.overallScore).toBeLessThan(42);
    expect(report.signals.pageCount).toBe(0);
  });
});
