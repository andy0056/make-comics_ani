import { describe, expect, it } from "vitest";
import { buildCreatorEconomyAutomationPlan } from "@/lib/creator-economy-automation";

const baseStory = {
  id: "story-1",
  slug: "ember-city",
  title: "Ember City",
  description: null,
  style: "noir" as const,
  userId: "owner_1",
  usesOwnApiKey: false,
  createdAt: new Date("2026-02-15T00:00:00.000Z"),
  updatedAt: new Date("2026-02-15T00:00:00.000Z"),
};

const baseMerchReport = {
  generatedAt: "2026-02-15T00:00:00.000Z",
  storySlug: "ember-city",
  storyTitle: "Ember City",
  readinessBand: "pilot_ready" as const,
  overallScore: 58,
  dimensions: {
    iconicity: 60,
    collectibility: 56,
    repeatability: 54,
    channelFit: 62,
  },
  signals: {
    motifSignals: [
      {
        id: "hero_symbol",
        label: "Hero Symbol",
        category: "symbol" as const,
        hits: 3,
        strength: "moderate" as const,
        evidence: ["Silver crest appears in multiple pages."],
      },
    ],
    quoteSignals: [
      {
        quote: "Keep the flame alive.",
        source: "dialogue" as const,
        score: 72,
      },
    ],
    recurringCharacterHooks: ["Lia: anchor around silver mark."],
  },
  candidates: [
    {
      id: "icon-pack",
      title: "Icon Pack",
      format: "digital_pack" as const,
      rationale: "Low-cost visual identity probe.",
      confidence: 72,
      effort: "S" as const,
      channelFit: ["x_thread", "instagram_carousel"] as const,
      metric: "Save to view ratio",
      target: ">= 12%",
    },
  ],
  detectorNotes: ["Signal quality is emerging."],
};

describe("creator-economy-automation", () => {
  it("fires risk triggers and emits executable recommendations", () => {
    const plan = buildCreatorEconomyAutomationPlan({
      story: baseStory,
      operatingPlan: {
        generatedAt: "2026-02-15T12:00:00.000Z",
        storySlug: "ember-city",
        storyTitle: "Ember City",
        sprintObjective: "ship_next_drop",
        horizonDays: 7,
        scoreBand: "stabilize",
        baselineMetrics: {
          combinedScore: 52,
          ipOverall: 57,
          retentionPotential: 54,
          merchSignal: 49,
          roleCoverage: 64,
          collaboratorCount: 1,
          remixCount: 0,
          pageCount: 2,
        },
        metricDeltas: [],
        priorityTracks: [],
        executionLoop: [],
        blockerWatchlist: [],
        rolloutNote: "Stabilize first.",
      },
      roleBoard: {
        generatedAt: "2026-02-15T12:00:00.000Z",
        storySlug: "ember-city",
        storyTitle: "Ember City",
        sprintObjective: "ship_next_drop",
        horizonDays: 7,
        participants: [{ userId: "owner_1", role: "owner" }],
        roster: [
          {
            id: "story_architect",
            label: "Story Architect",
            ownerUserId: "owner_1",
            ownerRole: "owner",
            priority: "medium",
            objective: "Ship coherent beat.",
            focusArea: "Narrative progression",
            checklist: ["Ship one clear beat."],
          },
          {
            id: "continuity_director",
            label: "Continuity Director",
            ownerUserId: "owner_1",
            ownerRole: "owner",
            priority: "high",
            objective: "Protect canon.",
            focusArea: "Canon integrity",
            checklist: ["Review canon warnings."],
          },
          {
            id: "visual_art_director",
            label: "Visual Art Director",
            ownerUserId: "owner_1",
            ownerRole: "owner",
            priority: "medium",
            objective: "Stabilize visuals.",
            focusArea: "Visual consistency",
            checklist: ["Run visual QA."],
          },
          {
            id: "merch_operator",
            label: "Merch Operator",
            ownerUserId: null,
            ownerRole: null,
            priority: "high",
            objective: "Run merch tests.",
            focusArea: "Monetization experiments",
            checklist: ["Select one candidate."],
          },
          {
            id: "distribution_operator",
            label: "Distribution Operator",
            ownerUserId: "owner_1",
            ownerRole: "owner",
            priority: "medium",
            objective: "Ship distribution.",
            focusArea: "Channel execution",
            checklist: ["Schedule launch."],
          },
        ],
        coordinationRisks: ["Single-operator risk."],
        syncCadence: ["Daily sync."],
      },
      merchReport: baseMerchReport,
      history: [],
      generatedAt: "2026-02-15T12:00:00.000Z",
    });

    expect(plan.triggerSummary.active).toBeGreaterThan(0);
    expect(
      plan.triggers.some((trigger) => trigger.id === "foundation_gap" && trigger.status === "fired"),
    ).toBe(true);
    expect(
      plan.recommendations.some((recommendation) => recommendation.id === "stabilize-core-loop"),
    ).toBe(true);
    expect(
      plan.recommendations.some((recommendation) => recommendation.id === "run-merch-probe"),
    ).toBe(true);
    expect(plan.queue.some((item) => item.status === "blocked")).toBe(true);
  });

  it("detects scale window and emits distribution push recommendation", () => {
    const now = new Date("2026-02-15T12:00:00.000Z");

    const plan = buildCreatorEconomyAutomationPlan({
      story: baseStory,
      operatingPlan: {
        generatedAt: now.toISOString(),
        storySlug: "ember-city",
        storyTitle: "Ember City",
        sprintObjective: "scale_distribution",
        horizonDays: 10,
        scoreBand: "aggressive",
        baselineMetrics: {
          combinedScore: 84,
          ipOverall: 82,
          retentionPotential: 76,
          merchSignal: 74,
          roleCoverage: 100,
          collaboratorCount: 3,
          remixCount: 2,
          pageCount: 8,
        },
        metricDeltas: [],
        priorityTracks: [],
        executionLoop: [],
        blockerWatchlist: [],
        rolloutNote: "Scale with gates.",
      },
      roleBoard: {
        generatedAt: now.toISOString(),
        storySlug: "ember-city",
        storyTitle: "Ember City",
        sprintObjective: "scale_distribution",
        horizonDays: 10,
        participants: [
          { userId: "owner_1", role: "owner" },
          { userId: "editor_1", role: "editor" },
        ],
        roster: [
          {
            id: "story_architect",
            label: "Story Architect",
            ownerUserId: "owner_1",
            ownerRole: "owner",
            priority: "medium",
            objective: "Ship coherent beat.",
            focusArea: "Narrative progression",
            checklist: ["Ship one clear beat."],
          },
          {
            id: "continuity_director",
            label: "Continuity Director",
            ownerUserId: "editor_1",
            ownerRole: "editor",
            priority: "medium",
            objective: "Protect canon.",
            focusArea: "Canon integrity",
            checklist: ["Review canon warnings."],
          },
          {
            id: "visual_art_director",
            label: "Visual Art Director",
            ownerUserId: "editor_1",
            ownerRole: "editor",
            priority: "medium",
            objective: "Stabilize visuals.",
            focusArea: "Visual consistency",
            checklist: ["Run visual QA."],
          },
          {
            id: "merch_operator",
            label: "Merch Operator",
            ownerUserId: "owner_1",
            ownerRole: "owner",
            priority: "medium",
            objective: "Run merch tests.",
            focusArea: "Monetization experiments",
            checklist: ["Select one candidate."],
          },
          {
            id: "distribution_operator",
            label: "Distribution Operator",
            ownerUserId: "owner_1",
            ownerRole: "owner",
            priority: "medium",
            objective: "Ship distribution.",
            focusArea: "Channel execution",
            checklist: ["Schedule launch."],
          },
        ],
        coordinationRisks: [],
        syncCadence: ["Daily sync."],
      },
      merchReport: {
        ...baseMerchReport,
        overallScore: 74,
      },
      history: [
        {
          id: "run-1",
          status: "completed",
          createdAt: now,
          completedAt: now,
          baselineMetrics: {
            combinedScore: 80,
            retentionPotential: 73,
            merchSignal: 70,
            roleCoverage: 100,
          },
          outcomeMetrics: {
            combinedScore: 84,
            retentionPotential: 76,
            merchSignal: 74,
            roleCoverage: 100,
          },
        },
      ],
      generatedAt: now.toISOString(),
    });

    expect(
      plan.triggers.some((trigger) => trigger.id === "scale_window" && trigger.status === "fired"),
    ).toBe(true);
    expect(
      plan.recommendations.some(
        (recommendation) => recommendation.id === "scale-distribution-window",
      ),
    ).toBe(true);
    expect(plan.notes.some((note) => note.toLowerCase().includes("scale window"))).toBe(true);
  });
});
