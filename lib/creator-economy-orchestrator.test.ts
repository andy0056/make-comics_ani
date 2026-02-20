import { describe, expect, it } from "vitest";
import {
  buildCreatorEconomyOperatingPlan,
  buildCreatorEconomyRunDeltaReport,
} from "@/lib/creator-economy-orchestrator";

describe("creator-economy-orchestrator", () => {
  it("builds a unified operating plan with metrics and tracks", () => {
    const plan = buildCreatorEconomyOperatingPlan({
      story: {
        id: "story-1",
        slug: "ember-city",
        title: "Ember City",
        description: null,
        style: "noir",
        userId: "owner_1",
        usesOwnApiKey: false,
        createdAt: new Date("2026-02-15T00:00:00.000Z"),
        updatedAt: new Date("2026-02-15T00:00:00.000Z"),
      },
      ipReport: {
        generatedAt: "2026-02-15T00:00:00.000Z",
        storySlug: "ember-city",
        storyTitle: "Ember City",
        band: "promising",
        overallScore: 72,
        moatStrengthScore: 70,
        retentionPotentialScore: 68,
        merchabilityScore: 65,
        expansionPotentialScore: 67,
        signals: {
          pageCount: 4,
          characterCount: 2,
          dnaProfileCount: 2,
          lockedCharacterCount: 2,
          timelineBeatCount: 3,
          locationCount: 2,
          canonRuleCount: 2,
          remixCount: 1,
        },
        pillars: [
          {
            id: "canon_strength",
            label: "Canon Strength",
            score: 70,
            status: "strong",
            insight: "Good canon.",
            nextAction: "Promote canon snippets.",
          },
          {
            id: "character_iconicity",
            label: "Character Iconicity",
            score: 68,
            status: "developing",
            insight: "Good recall.",
            nextAction: "Sharpen one trait.",
          },
          {
            id: "expansion_depth",
            label: "Expansion Depth",
            score: 66,
            status: "developing",
            insight: "Branches possible.",
            nextAction: "Add hook.",
          },
          {
            id: "commercial_surface",
            label: "Commercial Surface",
            score: 65,
            status: "developing",
            insight: "Surface exists.",
            nextAction: "Repeat motifs.",
          },
        ],
        merchConcepts: [
          {
            id: "m1",
            title: "Icon Pack",
            rationale: "Strong emblem.",
            priority: "high",
          },
        ],
        nextExperiments: ["Ship cliffhanger mini arc."],
      },
      merchReport: {
        generatedAt: "2026-02-15T00:00:00.000Z",
        storySlug: "ember-city",
        storyTitle: "Ember City",
        readinessBand: "pilot_ready",
        overallScore: 66,
        dimensions: {
          iconicity: 68,
          collectibility: 62,
          repeatability: 64,
          channelFit: 67,
        },
        signals: {
          motifSignals: [
            {
              id: "hero_symbol",
              label: "Hero Symbol",
              category: "symbol",
              hits: 4,
              strength: "strong",
              evidence: ["Silver mark appears in all pages."],
            },
          ],
          quoteSignals: [
            {
              quote: "Keep the flame alive.",
              source: "dialogue",
              score: 72,
            },
          ],
          recurringCharacterHooks: ["Lia: anchor around silver mark."],
        },
        candidates: [
          {
            id: "icon-pack",
            title: "Icon Pack",
            format: "digital_pack",
            rationale: "Test saves.",
            confidence: 70,
            effort: "S",
            channelFit: ["x_thread", "instagram_carousel"],
            metric: "Save-to-view ratio",
            target: ">= 12%",
          },
        ],
        detectorNotes: ["Signal quality is healthy."],
      },
      roleBoard: {
        generatedAt: "2026-02-15T00:00:00.000Z",
        storySlug: "ember-city",
        storyTitle: "Ember City",
        sprintObjective: "ship_next_drop",
        horizonDays: 7,
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
            objective: "Keep narrative coherent.",
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
            objective: "Keep visuals consistent.",
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
            checklist: ["Validate one candidate."],
          },
          {
            id: "distribution_operator",
            label: "Distribution Operator",
            ownerUserId: "owner_1",
            ownerRole: "owner",
            priority: "low",
            objective: "Ship distribution.",
            focusArea: "Channel execution",
            checklist: ["Schedule launches."],
          },
        ],
        coordinationRisks: ["No critical blockers."],
        syncCadence: ["Daily sync", "Mid-sprint review"],
      },
      merchPlan: null,
      previousMetrics: {
        combinedScore: 60,
        merchSignal: 58,
      },
      generatedAt: "2026-02-15T12:00:00.000Z",
    });

    expect(plan.storySlug).toBe("ember-city");
    expect(plan.baselineMetrics.combinedScore).toBeGreaterThan(0);
    expect(plan.priorityTracks).toHaveLength(3);
    expect(plan.metricDeltas.find((metric) => metric.key === "combinedScore")?.delta).not.toBeNull();
    expect(plan.executionLoop.length).toBeGreaterThan(0);
  });

  it("builds run delta report from baseline/outcome metrics", () => {
    const report = buildCreatorEconomyRunDeltaReport({
      runId: "run-1",
      status: "completed",
      baselineMetrics: {
        combinedScore: 64,
        ipOverall: 62,
        retentionPotential: 60,
        merchSignal: 58,
        roleCoverage: 80,
        collaboratorCount: 2,
        remixCount: 1,
        pageCount: 4,
      },
      outcomeMetrics: {
        combinedScore: 70,
        ipOverall: 68,
        retentionPotential: 65,
        merchSignal: 62,
        roleCoverage: 100,
        collaboratorCount: 3,
        remixCount: 2,
        pageCount: 6,
      },
    });

    expect(report.deltas.find((delta) => delta.key === "combinedScore")?.delta).toBe(6);
    expect(report.summary.length).toBeGreaterThan(5);
    expect(report.status).toBe("completed");
  });
});
