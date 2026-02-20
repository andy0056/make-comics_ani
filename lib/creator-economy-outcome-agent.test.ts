import { describe, expect, it } from "vitest";
import {
  buildCreatorEconomyOutcomeAgentPlan,
  selectCreatorEconomyOutcomeAgentCandidates,
} from "@/lib/creator-economy-outcome-agent";
import { buildCreatorEconomyPolicyLearningReport } from "@/lib/creator-economy-policy-learning";
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

describe("creator-economy-outcome-agent", () => {
  it("produces stale run closure candidates with decisions", () => {
    const now = new Date("2026-02-15T18:00:00.000Z");
    const history: StoryCreatorEconomyRun[] = [
      makeRun({
        id: "run-stale",
        status: "in_progress",
        sprintObjective: "scale_distribution",
        baselineMetrics: { combinedScore: 84 },
        createdAt: new Date("2026-02-12T09:00:00.000Z"),
      }),
      makeRun({
        id: "run-fresh",
        status: "planned",
        sprintObjective: "stabilize_world",
        baselineMetrics: { combinedScore: 58 },
        createdAt: new Date("2026-02-15T16:30:00.000Z"),
      }),
      makeRun({
        id: "run-completed",
        status: "completed",
        baselineMetrics: { combinedScore: 62 },
        outcomeMetrics: { combinedScore: 67 },
        outcomeDecision: "iterate",
        completedAt: new Date("2026-02-15T12:00:00.000Z"),
        createdAt: new Date("2026-02-15T10:00:00.000Z"),
      }),
    ];

    const learning = buildCreatorEconomyPolicyLearningReport({
      history,
      now,
    });

    const plan = buildCreatorEconomyOutcomeAgentPlan({
      history,
      currentMetrics: {
        combinedScore: 70,
        ipOverall: 72,
        retentionPotential: 68,
        merchSignal: 60,
        roleCoverage: 88,
        collaboratorCount: 2,
        remixCount: 1,
        pageCount: 6,
      },
      learning,
      staleAfterHours: 18,
      now,
    });

    expect(plan.summary.totalOpenRuns).toBe(2);
    expect(plan.summary.staleOpenRuns).toBe(1);
    expect(plan.candidates).toHaveLength(1);
    expect(plan.candidates[0]?.runId).toBe("run-stale");
    expect(plan.candidates[0]?.suggestedOutcomeDecision).toBe("archive");
  });

  it("selects bounded candidate subset", () => {
    const plan = {
      generatedAt: "2026-02-15T18:00:00.000Z",
      candidates: [
        {
          runId: "r1",
          sprintObjective: "a",
          ageHours: 30,
          baselineCombined: 50,
          currentCombined: 52,
          combinedDelta: 2,
          suggestedOutcomeDecision: "iterate" as const,
          suggestedOutcomeNotes: "n1",
          suggestedOutcomeMetrics: { combinedScore: 52 },
        },
        {
          runId: "r2",
          sprintObjective: "b",
          ageHours: 26,
          baselineCombined: 53,
          currentCombined: 55,
          combinedDelta: 2,
          suggestedOutcomeDecision: "iterate" as const,
          suggestedOutcomeNotes: "n2",
          suggestedOutcomeMetrics: { combinedScore: 55 },
        },
        {
          runId: "r3",
          sprintObjective: "c",
          ageHours: 20,
          baselineCombined: 57,
          currentCombined: 63,
          combinedDelta: 6,
          suggestedOutcomeDecision: "scale" as const,
          suggestedOutcomeNotes: "n3",
          suggestedOutcomeMetrics: { combinedScore: 63 },
        },
      ],
      summary: {
        totalOpenRuns: 3,
        staleOpenRuns: 3,
        closeCandidates: 3,
      },
      notes: [],
    };

    const selected = selectCreatorEconomyOutcomeAgentCandidates({
      plan,
      maxRuns: 2,
    });

    expect(selected).toHaveLength(2);
    expect(selected[0]?.runId).toBe("r1");
    expect(selected[1]?.runId).toBe("r2");
  });
});
