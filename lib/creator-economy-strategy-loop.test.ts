import { describe, expect, it } from "vitest";
import { buildCreatorEconomyOptimizerReport } from "@/lib/creator-economy-optimizer";
import { buildCreatorEconomyStrategyLoopReport } from "@/lib/creator-economy-strategy-loop";

describe("creator-economy-strategy-loop", () => {
  it("falls back to stabilization cadence when governance is paused", () => {
    const policy = {
      mode: "assist" as const,
      recommendedOutcome: "iterate" as const,
      confidence: 58,
      rationale: ["base"],
      guardrails: ["base"],
      maxActionsPerCycle: 2,
      cooldownHours: 10,
    };

    const learning = {
      generatedAt: "2026-02-15T20:00:00.000Z",
      totals: {
        totalRuns: 10,
        completedRuns: 5,
        staleOpenRuns: 4,
        positiveCompletedRuns: 1,
        overallPositiveRate: 0.3,
        avgCombinedDelta: -5,
      },
      recommendations: {
        recommendedMode: "manual" as const,
        suggestedCooldownHours: 18,
        suggestedMaxActionsPerCycle: 1,
        recommendedOutcomeBias: "hold" as const,
      },
      modePerformance: [],
      recommendationPerformance: [],
      notes: [],
    };

    const governance = {
      generatedAt: "2026-02-15T20:00:00.000Z",
      status: "paused" as const,
      governanceScore: 28,
      constraints: {
        allowAutorun: false,
        maxActionsCap: 1,
        cooldownFloorHours: 18,
      },
      signals: {
        completedRuns: 5,
        positiveRate: 0.3,
        staleOpenRuns: 4,
        riskyOutcomeRate: 0.62,
        longestOpenRunHours: 140,
      },
      reasons: ["paused for safety"],
      recommendations: ["close stale runs"],
    };

    const backlog = {
      generatedAt: "2026-02-15T20:00:00.000Z",
      mode: "assist" as const,
      policy,
      summary: {
        total: 4,
        ready: 1,
        blocked: 2,
        cooldown: 1,
      },
      items: [],
    };

    const optimizerReport = buildCreatorEconomyOptimizerReport({
      policy,
      learning,
      governance,
      backlog,
      now: new Date("2026-02-15T20:00:00.000Z"),
    });

    const report = buildCreatorEconomyStrategyLoopReport({
      policy,
      optimizerReport,
      governance,
      learning,
      backlog,
      selectedObjective: "growth",
      now: new Date("2026-02-15T20:00:00.000Z"),
    });

    expect(report.recommendedCadenceHours).toBe(24);
    expect(report.autoOptimizeEnabled).toBe(false);
    expect(report.cycles[1]?.objective).toBe("stabilize");
    expect(report.cycles[0]?.maxActionsPerCycle).toBeLessThanOrEqual(1);
  });

  it("promotes growth objective in healthy scale windows", () => {
    const policy = {
      mode: "assist" as const,
      recommendedOutcome: "scale" as const,
      confidence: 74,
      rationale: ["base"],
      guardrails: ["base"],
      maxActionsPerCycle: 2,
      cooldownHours: 8,
    };

    const learning = {
      generatedAt: "2026-02-15T20:00:00.000Z",
      totals: {
        totalRuns: 8,
        completedRuns: 8,
        staleOpenRuns: 0,
        positiveCompletedRuns: 7,
        overallPositiveRate: 0.82,
        avgCombinedDelta: 6,
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

    const governance = {
      generatedAt: "2026-02-15T20:00:00.000Z",
      status: "healthy" as const,
      governanceScore: 90,
      constraints: {
        allowAutorun: true,
        maxActionsCap: 3,
        cooldownFloorHours: 6,
      },
      signals: {
        completedRuns: 8,
        positiveRate: 0.82,
        staleOpenRuns: 0,
        riskyOutcomeRate: 0.12,
        longestOpenRunHours: 4,
      },
      reasons: ["healthy"],
      recommendations: ["scale test"],
    };

    const backlog = {
      generatedAt: "2026-02-15T20:00:00.000Z",
      mode: "assist" as const,
      policy,
      summary: {
        total: 6,
        ready: 4,
        blocked: 1,
        cooldown: 1,
      },
      items: [],
    };

    const optimizerReport = buildCreatorEconomyOptimizerReport({
      policy,
      learning,
      governance,
      backlog,
      now: new Date("2026-02-15T20:00:00.000Z"),
    });

    const report = buildCreatorEconomyStrategyLoopReport({
      policy,
      optimizerReport,
      governance,
      learning,
      backlog,
      selectedObjective: "balanced",
      now: new Date("2026-02-15T20:00:00.000Z"),
    });

    expect(report.safeWindow).toBe(true);
    expect(report.autoOptimizeEnabled).toBe(true);
    expect(report.recommendedCadenceHours).toBe(6);
    expect(report.cycles[1]?.objective).toBe("growth");
    expect(report.cycles[1]?.mode).toBe("auto");
  });
});
