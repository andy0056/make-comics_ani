import { type CreatorEconomyMetrics } from "@/lib/creator-economy-orchestrator";
import { type CreatorEconomyPolicyLearningReport } from "@/lib/creator-economy-policy-learning";
import { type StoryCreatorEconomyRun } from "@/lib/schema";

export type CreatorEconomyOutcomeAgentCandidate = {
  runId: string;
  sprintObjective: string;
  ageHours: number;
  baselineCombined: number | null;
  currentCombined: number | null;
  combinedDelta: number | null;
  suggestedOutcomeDecision: "scale" | "iterate" | "hold" | "archive";
  suggestedOutcomeNotes: string;
  suggestedOutcomeMetrics: Partial<CreatorEconomyMetrics>;
};

export type CreatorEconomyOutcomeAgentPlan = {
  generatedAt: string;
  candidates: CreatorEconomyOutcomeAgentCandidate[];
  summary: {
    totalOpenRuns: number;
    staleOpenRuns: number;
    closeCandidates: number;
  };
  notes: string[];
};

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function parseBaselineCombined(run: StoryCreatorEconomyRun): number | null {
  const metrics = run.baselineMetrics as Record<string, unknown>;
  return toNumber(metrics.combinedScore);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function round(value: number, precision = 2): number {
  const power = 10 ** precision;
  return Math.round(value * power) / power;
}

function buildSuggestedDecision({
  ageHours,
  combinedDelta,
  learning,
}: {
  ageHours: number;
  combinedDelta: number | null;
  learning: CreatorEconomyPolicyLearningReport;
}): "scale" | "iterate" | "hold" | "archive" {
  if (combinedDelta !== null) {
    if (combinedDelta >= 6) {
      return "scale";
    }
    if (combinedDelta <= -10 && ageHours >= 72) {
      return "archive";
    }
    if (combinedDelta <= -4) {
      return "hold";
    }
    return "iterate";
  }

  if (learning.recommendations.recommendedOutcomeBias === "archive" && ageHours >= 96) {
    return "archive";
  }

  if (ageHours >= 72 && learning.totals.overallPositiveRate < 0.45) {
    return "hold";
  }

  return learning.recommendations.recommendedOutcomeBias;
}

export function buildCreatorEconomyOutcomeAgentPlan({
  history,
  currentMetrics,
  learning,
  staleAfterHours = 18,
  now = new Date(),
}: {
  history: StoryCreatorEconomyRun[];
  currentMetrics: CreatorEconomyMetrics;
  learning: CreatorEconomyPolicyLearningReport;
  staleAfterHours?: number;
  now?: Date;
}): CreatorEconomyOutcomeAgentPlan {
  const openRuns = history.filter((run) => run.status !== "completed");
  const staleRuns = openRuns.filter((run) => {
    const anchor = run.createdAt.getTime();
    return now.getTime() - anchor >= staleAfterHours * 3600000;
  });

  const candidates = staleRuns
    .map<CreatorEconomyOutcomeAgentCandidate>((run) => {
      const baselineCombined = parseBaselineCombined(run);
      const currentCombined = currentMetrics.combinedScore;
      const combinedDelta =
        baselineCombined === null ? null : round(currentCombined - baselineCombined);
      const ageHours = round((now.getTime() - run.createdAt.getTime()) / 3600000, 1);

      const suggestedOutcomeDecision = buildSuggestedDecision({
        ageHours,
        combinedDelta,
        learning,
      });

      const suggestedOutcomeNotes =
        suggestedOutcomeDecision === "scale"
          ? "Auto-close as scale: combined signal improved materially since baseline."
          : suggestedOutcomeDecision === "iterate"
            ? "Auto-close as iterate: partial progress detected; continue next cycle with refinements."
            : suggestedOutcomeDecision === "hold"
              ? "Auto-close as hold: weak progression signal; pause and rebalance before next run."
              : "Auto-close as archive: prolonged stagnation with negative signal drift.";

      const suggestedOutcomeMetrics: Partial<CreatorEconomyMetrics> = {
        combinedScore: currentMetrics.combinedScore,
        ipOverall: currentMetrics.ipOverall,
        retentionPotential: currentMetrics.retentionPotential,
        merchSignal: currentMetrics.merchSignal,
        roleCoverage: currentMetrics.roleCoverage,
        collaboratorCount: currentMetrics.collaboratorCount,
        remixCount: currentMetrics.remixCount,
        pageCount: currentMetrics.pageCount,
      };

      return {
        runId: run.id,
        sprintObjective: run.sprintObjective,
        ageHours,
        baselineCombined,
        currentCombined,
        combinedDelta,
        suggestedOutcomeDecision,
        suggestedOutcomeNotes,
        suggestedOutcomeMetrics,
      };
    })
    .sort((left, right) => right.ageHours - left.ageHours);

  const notes: string[] = [];
  if (candidates.length > 0) {
    notes.push(
      `${candidates.length} stale run(s) can be auto-closed to keep learning and policy loops current.`,
    );
  } else {
    notes.push("No stale open runs detected; outcome-closing agent is idle.");
  }
  if (learning.totals.staleOpenRuns > 0) {
    notes.push(
      `Learning flagged ${learning.totals.staleOpenRuns} stale run(s); close these before the next autorun cycle.`,
    );
  }

  return {
    generatedAt: now.toISOString(),
    candidates,
    summary: {
      totalOpenRuns: openRuns.length,
      staleOpenRuns: staleRuns.length,
      closeCandidates: candidates.length,
    },
    notes,
  };
}

export function selectCreatorEconomyOutcomeAgentCandidates({
  plan,
  maxRuns = 3,
}: {
  plan: CreatorEconomyOutcomeAgentPlan;
  maxRuns?: number;
}): CreatorEconomyOutcomeAgentCandidate[] {
  const boundedMax = clamp(Math.round(maxRuns), 1, 10);
  return plan.candidates.slice(0, boundedMax);
}
