import { describe, expect, it } from "vitest";
import {
  buildAdvancedMerchabilityDetectorReport,
  buildMerchExperimentPlan,
} from "@/lib/merchability-detector";

describe("merchability-detector", () => {
  it("builds detector report with motif signals and candidates", () => {
    const report = buildAdvancedMerchabilityDetectorReport({
      story: {
        id: "story-1",
        slug: "steel-oath",
        title: "Steel Oath",
        description: "A masked sentinel protects a neon district.",
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
            "A masked hero raises a silver emblem above the city tower and says \"The oath still stands.\"",
          characterImageUrls: [],
          generatedImageUrl: "https://example.com/1.png",
          createdAt: new Date("2026-02-15T00:00:00.000Z"),
          updatedAt: new Date("2026-02-15T00:00:00.000Z"),
        },
        {
          id: "page-2",
          storyId: "story-1",
          pageNumber: 2,
          prompt:
            "The guild crest burns while the hero grips a blade near the old district station.",
          characterImageUrls: [],
          generatedImageUrl: "https://example.com/2.png",
          createdAt: new Date("2026-02-15T00:00:00.000Z"),
          updatedAt: new Date("2026-02-15T00:00:00.000Z"),
        },
      ],
      world: {
        id: "world-1",
        storyId: "story-1",
        timeline: [{ id: "t1", title: "Oath", order: 1 }],
        locations: [{ id: "l1", name: "Neon District" }],
        canonRules: ["Never remove the emblem in battle."],
        createdAt: new Date("2026-02-15T00:00:00.000Z"),
        updatedAt: new Date("2026-02-15T00:00:00.000Z"),
      },
      characters: [
        {
          id: "char-1",
          storyId: "story-1",
          name: "Kade",
          role: "Sentinel",
          appearance: "Masked with emblem cloak",
          personality: "Focused",
          speechStyle: "Short, direct",
          referenceImageUrl: "https://example.com/kade.png",
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
          name: "Kade DNA",
          visualTraits: ["silver emblem", "cloak"],
          behaviorTraits: ["protective"],
          speechTraits: ["short"],
          lockedFields: ["visualTraits"],
          createdAt: new Date("2026-02-15T00:00:00.000Z"),
          updatedAt: new Date("2026-02-15T00:00:00.000Z"),
        },
      ],
      remixLineage: {
        parentStory: null,
        remixCount: 1,
        latestRemixes: [],
      },
    });

    expect(report.overallScore).toBeGreaterThan(0);
    expect(report.signals.motifSignals.length).toBeGreaterThan(0);
    expect(report.candidates.length).toBeGreaterThanOrEqual(3);
    expect(report.readinessBand).toMatch(/market_ready|pilot_ready|emerging|early_concept/);
  });

  it("builds a bounded experiment plan from report candidate", () => {
    const report = buildAdvancedMerchabilityDetectorReport({
      story: {
        id: "story-2",
        slug: "echo-city",
        title: "Echo City",
        description: null,
        style: "manga",
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
    });

    const plan = buildMerchExperimentPlan({
      report,
      candidateId: report.candidates[0]?.id,
      objective: "validate_demand",
      budgetTier: "low",
      durationDays: 31,
      channels: ["x_thread"],
      generatedAt: "2026-02-15T12:00:00.000Z",
    });

    expect(plan.durationDays).toBe(30);
    expect(plan.selectedChannels).toEqual(["x_thread"]);
    expect(plan.phases).toHaveLength(3);
    expect(plan.assetChecklist.length).toBeGreaterThan(2);
    expect(plan.successDecisionRule.length).toBeGreaterThan(10);
  });
});
