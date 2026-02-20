import { describe, expect, it } from "vitest";
import {
  applyPolicyLearningToDecisionPolicy,
  buildCreatorEconomyPolicyLearningReport,
} from "@/lib/creator-economy-policy-learning";
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

describe("creator-economy-policy-learning", () => {
  it("builds learning recommendations from run history", () => {
    const now = new Date("2026-02-15T18:00:00.000Z");
    const history: StoryCreatorEconomyRun[] = [
      makeRun({
        id: "run-1",
        status: "completed",
        plan: {
          source: "economy_autorun",
          executedRecommendationId: "scale-distribution-window",
        },
        baselineMetrics: { combinedScore: 70 },
        outcomeMetrics: { combinedScore: 79 },
        outcomeDecision: "scale",
        completedAt: new Date("2026-02-15T14:30:00.000Z"),
        createdAt: new Date("2026-02-15T14:00:00.000Z"),
      }),
      makeRun({
        id: "run-2",
        status: "completed",
        plan: {
          source: "economy_backlog",
          executedRecommendationId: "stabilize-core-loop",
        },
        baselineMetrics: { combinedScore: 60 },
        outcomeMetrics: { combinedScore: 64 },
        outcomeDecision: "iterate",
        completedAt: new Date("2026-02-15T10:00:00.000Z"),
        createdAt: new Date("2026-02-15T09:30:00.000Z"),
      }),
      makeRun({
        id: "run-3",
        status: "planned",
        plan: {
          source: "economy_backlog",
          executedRecommendationId: "run-merch-probe",
        },
        baselineMetrics: { combinedScore: 62 },
        createdAt: new Date("2026-02-14T13:00:00.000Z"),
      }),
    ];

    const report = buildCreatorEconomyPolicyLearningReport({
      history,
      now,
    });

    expect(report.totals.totalRuns).toBe(3);
    expect(report.totals.completedRuns).toBe(2);
    expect(report.totals.staleOpenRuns).toBe(1);
    expect(report.recommendations.suggestedCooldownHours).toBeGreaterThanOrEqual(6);
    expect(report.modePerformance.find((entry) => entry.mode === "auto")?.runs).toBe(1);
    expect(report.recommendationPerformance.length).toBeGreaterThan(0);
  });

  it("applies learning envelope to decision policy", () => {
    const learning = buildCreatorEconomyPolicyLearningReport({
      history: [
        makeRun({
          id: "run-a",
          status: "completed",
          plan: { source: "economy_autorun" },
          baselineMetrics: { combinedScore: 52 },
          outcomeMetrics: { combinedScore: 63 },
          outcomeDecision: "scale",
          completedAt: new Date("2026-02-15T15:00:00.000Z"),
        }),
      ],
      now: new Date("2026-02-15T18:00:00.000Z"),
    });

    const nextPolicy = applyPolicyLearningToDecisionPolicy({
      policy: {
        mode: "assist",
        recommendedOutcome: "iterate",
        confidence: 64,
        rationale: ["base rationale"],
        guardrails: ["base guardrail"],
        maxActionsPerCycle: 2,
        cooldownHours: 12,
      },
      learning,
      lockMode: "assist",
    });

    expect(nextPolicy.mode).toBe("assist");
    expect(nextPolicy.maxActionsPerCycle).toBe(
      learning.recommendations.suggestedMaxActionsPerCycle,
    );
    expect(nextPolicy.cooldownHours).toBe(
      learning.recommendations.suggestedCooldownHours,
    );
    expect(nextPolicy.rationale.length).toBeGreaterThan(1);
    expect(nextPolicy.guardrails.some((guardrail) => guardrail.includes("stale open runs"))).toBe(
      true,
    );
  });
});
