import { describe, expect, it } from "vitest";
import {
  applyCreatorEconomyOptimizerProfileToPolicy,
  buildCreatorEconomyOptimizerReport,
} from "@/lib/creator-economy-optimizer";

describe("creator-economy-optimizer", () => {
  it("recommends stabilize objective when loop health is degraded", () => {
    const report = buildCreatorEconomyOptimizerReport({
      policy: {
        mode: "assist",
        recommendedOutcome: "iterate",
        confidence: 58,
        rationale: ["base"],
        guardrails: ["base"],
        maxActionsPerCycle: 2,
        cooldownHours: 10,
      },
      learning: {
        generatedAt: "2026-02-15T20:00:00.000Z",
        totals: {
          totalRuns: 8,
          completedRuns: 5,
          staleOpenRuns: 4,
          positiveCompletedRuns: 1,
          overallPositiveRate: 0.32,
          avgCombinedDelta: -4,
        },
        recommendations: {
          recommendedMode: "manual",
          suggestedCooldownHours: 18,
          suggestedMaxActionsPerCycle: 1,
          recommendedOutcomeBias: "hold",
        },
        modePerformance: [],
        recommendationPerformance: [],
        notes: [],
      },
      governance: {
        generatedAt: "2026-02-15T20:00:00.000Z",
        status: "paused",
        governanceScore: 31,
        constraints: {
          allowAutorun: false,
          maxActionsCap: 1,
          cooldownFloorHours: 18,
        },
        signals: {
          completedRuns: 5,
          positiveRate: 0.32,
          staleOpenRuns: 4,
          riskyOutcomeRate: 0.6,
          longestOpenRunHours: 140,
        },
        reasons: ["stale loops"],
        recommendations: ["close stale runs"],
      },
      backlog: {
        generatedAt: "2026-02-15T20:00:00.000Z",
        mode: "assist",
        policy: {
          mode: "assist",
          recommendedOutcome: "iterate",
          confidence: 58,
          rationale: ["base"],
          guardrails: ["base"],
          maxActionsPerCycle: 2,
          cooldownHours: 10,
        },
        summary: {
          total: 4,
          ready: 1,
          blocked: 2,
          cooldown: 1,
        },
        items: [],
      },
      now: new Date("2026-02-15T20:00:00.000Z"),
    });

    expect(report.recommendedObjective).toBe("stabilize");
    expect(report.profiles).toHaveLength(3);
  });

  it("applies growth profile to policy settings", () => {
    const report = buildCreatorEconomyOptimizerReport({
      policy: {
        mode: "assist",
        recommendedOutcome: "scale",
        confidence: 74,
        rationale: ["base"],
        guardrails: ["base"],
        maxActionsPerCycle: 2,
        cooldownHours: 8,
      },
      learning: {
        generatedAt: "2026-02-15T20:00:00.000Z",
        totals: {
          totalRuns: 6,
          completedRuns: 6,
          staleOpenRuns: 0,
          positiveCompletedRuns: 5,
          overallPositiveRate: 0.84,
          avgCombinedDelta: 6,
        },
        recommendations: {
          recommendedMode: "auto",
          suggestedCooldownHours: 6,
          suggestedMaxActionsPerCycle: 3,
          recommendedOutcomeBias: "scale",
        },
        modePerformance: [],
        recommendationPerformance: [],
        notes: [],
      },
      governance: {
        generatedAt: "2026-02-15T20:00:00.000Z",
        status: "healthy",
        governanceScore: 88,
        constraints: {
          allowAutorun: true,
          maxActionsCap: 3,
          cooldownFloorHours: 6,
        },
        signals: {
          completedRuns: 6,
          positiveRate: 0.84,
          staleOpenRuns: 0,
          riskyOutcomeRate: 0.1,
          longestOpenRunHours: 3,
        },
        reasons: ["stable"],
        recommendations: ["scale"],
      },
      backlog: {
        generatedAt: "2026-02-15T20:00:00.000Z",
        mode: "assist",
        policy: {
          mode: "assist",
          recommendedOutcome: "scale",
          confidence: 74,
          rationale: ["base"],
          guardrails: ["base"],
          maxActionsPerCycle: 2,
          cooldownHours: 8,
        },
        summary: {
          total: 5,
          ready: 3,
          blocked: 1,
          cooldown: 1,
        },
        items: [],
      },
      now: new Date("2026-02-15T20:00:00.000Z"),
    });

    const nextPolicy = applyCreatorEconomyOptimizerProfileToPolicy({
      policy: {
        mode: "assist",
        recommendedOutcome: "scale",
        confidence: 74,
        rationale: ["base"],
        guardrails: ["base"],
        maxActionsPerCycle: 2,
        cooldownHours: 8,
      },
      report,
      objective: "growth",
    });

    expect(nextPolicy.mode).toBe("auto");
    expect(nextPolicy.maxActionsPerCycle).toBeGreaterThanOrEqual(2);
    expect(nextPolicy.cooldownHours).toBeGreaterThanOrEqual(4);
    expect(nextPolicy.rationale.some((entry) => entry.includes("Optimizer objective"))).toBe(
      true,
    );
  });
});
