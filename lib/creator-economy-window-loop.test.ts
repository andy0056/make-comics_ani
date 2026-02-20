import { describe, expect, it } from "vitest";
import { buildCreatorEconomyExecutionWindowReport } from "@/lib/creator-economy-window-loop";
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

describe("creator-economy-window-loop", () => {
  it("holds and slows cadence when active window lacks outcomes", () => {
    const report = buildCreatorEconomyExecutionWindowReport({
      strategyLoop: {
        generatedAt: "2026-02-15T20:00:00.000Z",
        selectedObjective: "balanced",
        recommendedCadenceHours: 12,
        cadenceHours: 12,
        autoOptimizeEnabled: true,
        safeWindow: true,
        nextRefreshAt: "2026-02-16T08:00:00.000Z",
        cycles: [
          {
            cycle: 1,
            objective: "balanced",
            mode: "assist",
            maxActionsPerCycle: 2,
            cooldownHours: 8,
            scheduledWindowStart: "2026-02-15T18:00:00.000Z",
            scheduledWindowEnd: "2026-02-16T06:00:00.000Z",
            rationale: "entry",
          },
          {
            cycle: 2,
            objective: "growth",
            mode: "auto",
            maxActionsPerCycle: 3,
            cooldownHours: 6,
            scheduledWindowStart: "2026-02-16T06:00:00.000Z",
            scheduledWindowEnd: "2026-02-16T18:00:00.000Z",
            rationale: "scale",
          },
        ],
        guardrails: [],
        notes: [],
      },
      history: [],
      learning: {
        generatedAt: "2026-02-15T20:00:00.000Z",
        totals: {
          totalRuns: 0,
          completedRuns: 0,
          staleOpenRuns: 0,
          positiveCompletedRuns: 0,
          overallPositiveRate: 0,
          avgCombinedDelta: 0,
        },
        recommendations: {
          recommendedMode: "assist",
          suggestedCooldownHours: 12,
          suggestedMaxActionsPerCycle: 2,
          recommendedOutcomeBias: "iterate",
        },
        modePerformance: [],
        recommendationPerformance: [],
        notes: [],
      },
      governance: {
        generatedAt: "2026-02-15T20:00:00.000Z",
        status: "healthy",
        governanceScore: 82,
        constraints: {
          allowAutorun: true,
          maxActionsCap: 3,
          cooldownFloorHours: 6,
        },
        signals: {
          completedRuns: 0,
          positiveRate: 0,
          staleOpenRuns: 0,
          riskyOutcomeRate: 0,
          longestOpenRunHours: 0,
        },
        reasons: [],
        recommendations: [],
      },
      backlog: {
        generatedAt: "2026-02-15T20:00:00.000Z",
        mode: "assist",
        policy: {
          mode: "assist",
          recommendedOutcome: "iterate",
          confidence: 60,
          rationale: [],
          guardrails: [],
          maxActionsPerCycle: 2,
          cooldownHours: 8,
        },
        summary: {
          total: 3,
          ready: 2,
          blocked: 1,
          cooldown: 0,
        },
        items: [],
      },
      now: new Date("2026-02-15T20:00:00.000Z"),
    });

    expect(report.gate.status).toBe("hold");
    expect(report.adaptation.nextCadenceHours).toBe(18);
    expect(report.adaptation.recommendedObjective).toBe("stabilize");
  });

  it("opens gate and accelerates cadence on strong outcomes", () => {
    const report = buildCreatorEconomyExecutionWindowReport({
      strategyLoop: {
        generatedAt: "2026-02-15T20:00:00.000Z",
        selectedObjective: "balanced",
        recommendedCadenceHours: 8,
        cadenceHours: 8,
        autoOptimizeEnabled: true,
        safeWindow: true,
        nextRefreshAt: "2026-02-16T04:00:00.000Z",
        cycles: [
          {
            cycle: 1,
            objective: "balanced",
            mode: "assist",
            maxActionsPerCycle: 2,
            cooldownHours: 8,
            scheduledWindowStart: "2026-02-15T16:00:00.000Z",
            scheduledWindowEnd: "2026-02-16T00:00:00.000Z",
            rationale: "entry",
          },
        ],
        guardrails: [],
        notes: [],
      },
      history: [
        makeRun({
          id: "run-1",
          status: "completed",
          createdAt: new Date("2026-02-15T17:00:00.000Z"),
          completedAt: new Date("2026-02-15T18:00:00.000Z"),
          baselineMetrics: { combinedScore: 70 },
          outcomeMetrics: { combinedScore: 77 },
          outcomeDecision: "scale",
        }),
        makeRun({
          id: "run-2",
          status: "completed",
          createdAt: new Date("2026-02-15T19:00:00.000Z"),
          completedAt: new Date("2026-02-15T20:00:00.000Z"),
          baselineMetrics: { combinedScore: 68 },
          outcomeMetrics: { combinedScore: 74 },
          outcomeDecision: "iterate",
        }),
      ],
      learning: {
        generatedAt: "2026-02-15T20:00:00.000Z",
        totals: {
          totalRuns: 2,
          completedRuns: 2,
          staleOpenRuns: 0,
          positiveCompletedRuns: 2,
          overallPositiveRate: 1,
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
        governanceScore: 91,
        constraints: {
          allowAutorun: true,
          maxActionsCap: 3,
          cooldownFloorHours: 6,
        },
        signals: {
          completedRuns: 2,
          positiveRate: 1,
          staleOpenRuns: 0,
          riskyOutcomeRate: 0,
          longestOpenRunHours: 2,
        },
        reasons: [],
        recommendations: [],
      },
      backlog: {
        generatedAt: "2026-02-15T20:00:00.000Z",
        mode: "assist",
        policy: {
          mode: "assist",
          recommendedOutcome: "scale",
          confidence: 80,
          rationale: [],
          guardrails: [],
          maxActionsPerCycle: 2,
          cooldownHours: 8,
        },
        summary: {
          total: 4,
          ready: 3,
          blocked: 1,
          cooldown: 0,
        },
        items: [],
      },
      now: new Date("2026-02-15T20:00:00.000Z"),
    });

    expect(report.gate.status).toBe("ready");
    expect(report.adaptation.nextCadenceHours).toBe(6);
    expect(report.adaptation.recommendedObjective).toBe("growth");
  });
});
