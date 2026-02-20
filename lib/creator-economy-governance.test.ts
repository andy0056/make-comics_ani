import { describe, expect, it } from "vitest";
import {
  applyGovernanceToDecisionPolicy,
  buildCreatorEconomyGovernanceReport,
} from "@/lib/creator-economy-governance";
import { type StoryCreatorEconomyRun } from "@/lib/schema";

function makeRun(partial: Partial<StoryCreatorEconomyRun>): StoryCreatorEconomyRun {
  return {
    id: partial.id ?? crypto.randomUUID(),
    storyId: partial.storyId ?? "story-1",
    createdByUserId: partial.createdByUserId ?? "owner_1",
    sprintObjective: partial.sprintObjective ?? "ship_next_drop",
    horizonDays: partial.horizonDays ?? 7,
    status: partial.status ?? "planned",
    plan: partial.plan ?? {},
    baselineMetrics: partial.baselineMetrics ?? {},
    outcomeMetrics: partial.outcomeMetrics ?? {},
    outcomeNotes: partial.outcomeNotes ?? null,
    outcomeDecision: partial.outcomeDecision ?? null,
    completedAt: partial.completedAt ?? null,
    createdAt: partial.createdAt ?? new Date("2026-02-15T00:00:00.000Z"),
    updatedAt: partial.updatedAt ?? new Date("2026-02-15T00:00:00.000Z"),
  };
}

describe("creator-economy-governance", () => {
  it("marks governance as paused under severe stale/risk signals", () => {
    const now = new Date("2026-02-15T20:00:00.000Z");
    const history: StoryCreatorEconomyRun[] = [
      makeRun({
        id: "old-open-1",
        status: "planned",
        plan: { source: "economy_autorun" },
        createdAt: new Date("2026-02-09T10:00:00.000Z"),
      }),
      makeRun({
        id: "old-open-2",
        status: "in_progress",
        plan: { source: "economy_backlog" },
        createdAt: new Date("2026-02-10T10:00:00.000Z"),
      }),
      makeRun({
        id: "closed-risky-1",
        status: "completed",
        plan: { source: "economy_autorun" },
        baselineMetrics: { combinedScore: 72 },
        outcomeMetrics: { combinedScore: 59 },
        outcomeDecision: "archive",
        completedAt: new Date("2026-02-14T10:00:00.000Z"),
      }),
      makeRun({
        id: "closed-risky-2",
        status: "completed",
        plan: { source: "economy_backlog" },
        baselineMetrics: { combinedScore: 65 },
        outcomeMetrics: { combinedScore: 62 },
        outcomeDecision: "hold",
        completedAt: new Date("2026-02-14T14:00:00.000Z"),
      }),
    ];

    const learning = {
      generatedAt: now.toISOString(),
      totals: {
        totalRuns: 4,
        completedRuns: 2,
        staleOpenRuns: 4,
        positiveCompletedRuns: 0,
        overallPositiveRate: 0.22,
        avgCombinedDelta: -8,
      },
      recommendations: {
        recommendedMode: "manual" as const,
        suggestedCooldownHours: 20,
        suggestedMaxActionsPerCycle: 1,
        recommendedOutcomeBias: "hold" as const,
      },
      modePerformance: [],
      recommendationPerformance: [],
      notes: [],
    };

    const basePolicy = {
      mode: "assist" as const,
      recommendedOutcome: "iterate" as const,
      confidence: 61,
      rationale: ["base"],
      guardrails: ["base"],
      maxActionsPerCycle: 3,
      cooldownHours: 8,
    };

    const backlog = {
      generatedAt: now.toISOString(),
      mode: "assist" as const,
      policy: basePolicy,
      summary: {
        total: 5,
        ready: 4,
        blocked: 0,
        cooldown: 1,
      },
      items: [],
    };

    const governance = buildCreatorEconomyGovernanceReport({
      history,
      learning,
      policy: basePolicy,
      backlog,
      now,
    });

    expect(governance.status).toBe("paused");
    expect(governance.constraints.allowAutorun).toBe(false);
    expect(governance.constraints.maxActionsCap).toBe(1);

    const governedPolicy = applyGovernanceToDecisionPolicy({
      policy: basePolicy,
      governance,
    });
    expect(governedPolicy.maxActionsPerCycle).toBe(1);
    expect(governedPolicy.cooldownHours).toBeGreaterThanOrEqual(18);
  });

  it("keeps healthy governance permissive with stable loop", () => {
    const now = new Date("2026-02-15T20:00:00.000Z");
    const history: StoryCreatorEconomyRun[] = [
      makeRun({
        id: "run-1",
        status: "completed",
        plan: { source: "economy_autorun" },
        baselineMetrics: { combinedScore: 70 },
        outcomeMetrics: { combinedScore: 77 },
        outcomeDecision: "scale",
        completedAt: new Date("2026-02-15T15:00:00.000Z"),
      }),
    ];

    const learning = {
      generatedAt: now.toISOString(),
      totals: {
        totalRuns: 1,
        completedRuns: 1,
        staleOpenRuns: 0,
        positiveCompletedRuns: 1,
        overallPositiveRate: 0.9,
        avgCombinedDelta: 7,
      },
      recommendations: {
        recommendedMode: "auto" as const,
        suggestedCooldownHours: 6,
        suggestedMaxActionsPerCycle: 3,
        recommendedOutcomeBias: "scale" as const,
      },
      modePerformance: [],
      recommendationPerformance: [],
      notes: [],
    };

    const basePolicy = {
      mode: "auto" as const,
      recommendedOutcome: "scale" as const,
      confidence: 82,
      rationale: ["base"],
      guardrails: ["base"],
      maxActionsPerCycle: 3,
      cooldownHours: 6,
    };

    const governance = buildCreatorEconomyGovernanceReport({
      history,
      learning,
      policy: basePolicy,
      backlog: null,
      now,
    });

    expect(governance.status).toBe("healthy");
    expect(governance.constraints.allowAutorun).toBe(true);
    expect(governance.governanceScore).toBeGreaterThan(65);
  });
});
