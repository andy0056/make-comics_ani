import { normalizeCreatorEconomyMetrics } from "@/lib/creator-economy-orchestrator";
import {
  type CreatorEconomyAutonomyMode,
  type CreatorEconomyDecisionPolicy,
} from "@/lib/creator-economy-policy";
import { type StoryCreatorEconomyRun } from "@/lib/schema";

export type CreatorEconomyPolicyLearningRecommendationPerformance = {
  recommendationId: string;
  runs: number;
  completedRuns: number;
  positiveRate: number;
  avgCombinedDelta: number;
};

export type CreatorEconomyPolicyLearningModePerformance = {
  mode: CreatorEconomyAutonomyMode;
  runs: number;
  completedRuns: number;
  positiveRate: number;
  avgCombinedDelta: number;
};

export type CreatorEconomyPolicyLearningReport = {
  generatedAt: string;
  totals: {
    totalRuns: number;
    completedRuns: number;
    staleOpenRuns: number;
    positiveCompletedRuns: number;
    overallPositiveRate: number;
    avgCombinedDelta: number;
  };
  recommendations: {
    recommendedMode: CreatorEconomyAutonomyMode;
    suggestedCooldownHours: number;
    suggestedMaxActionsPerCycle: number;
    recommendedOutcomeBias: "scale" | "iterate" | "hold" | "archive";
  };
  modePerformance: CreatorEconomyPolicyLearningModePerformance[];
  recommendationPerformance: CreatorEconomyPolicyLearningRecommendationPerformance[];
  notes: string[];
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function round(value: number, precision = 2): number {
  const power = 10 ** precision;
  return Math.round(value * power) / power;
}

function toTimestamp(value: Date | string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function parseRunPlan(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return {};
  }
  return value as Record<string, unknown>;
}

function getRunMode(run: StoryCreatorEconomyRun): CreatorEconomyAutonomyMode {
  const plan = parseRunPlan(run.plan);
  const mode = plan.autonomyMode;
  if (mode === "manual" || mode === "assist" || mode === "auto") {
    return mode;
  }

  const source = plan.source;
  if (source === "economy_autorun") {
    return "auto";
  }
  if (source === "economy_backlog" || source === "economy_automation") {
    return "assist";
  }
  return "manual";
}

function getRunRecommendationId(run: StoryCreatorEconomyRun): string | null {
  const plan = parseRunPlan(run.plan);

  const directId = plan.executedRecommendationId;
  if (typeof directId === "string" && directId.trim().length > 0) {
    return directId;
  }

  const recommendation = plan.recommendation;
  if (recommendation && typeof recommendation === "object") {
    const candidateId = (recommendation as Record<string, unknown>).id;
    if (typeof candidateId === "string" && candidateId.trim().length > 0) {
      return candidateId;
    }
  }

  return null;
}

function getCombinedDelta(run: StoryCreatorEconomyRun): number | null {
  const baseline = normalizeCreatorEconomyMetrics(run.baselineMetrics).combinedScore;
  const outcome = normalizeCreatorEconomyMetrics(run.outcomeMetrics).combinedScore;
  if (baseline === undefined || outcome === undefined) {
    return null;
  }
  return outcome - baseline;
}

function isPositiveOutcome(run: StoryCreatorEconomyRun): boolean {
  const delta = getCombinedDelta(run);
  const decision = run.outcomeDecision?.trim().toLowerCase();

  if (decision === "archive") {
    return false;
  }

  if (delta !== null) {
    if (decision === "scale") {
      return delta >= -2;
    }
    if (decision === "hold") {
      return delta >= -1;
    }
    return delta >= 0;
  }

  return decision === "scale" || decision === "iterate";
}

function getRecommendedOutcomeBias(history: StoryCreatorEconomyRun[]):
  | "scale"
  | "iterate"
  | "hold"
  | "archive" {
  const decisionScores = new Map<string, { runs: number; positive: number }>();

  for (const run of history) {
    if (run.status !== "completed") {
      continue;
    }
    const decision = run.outcomeDecision?.trim().toLowerCase();
    if (!decision) {
      continue;
    }

    const current = decisionScores.get(decision) ?? { runs: 0, positive: 0 };
    current.runs += 1;
    if (isPositiveOutcome(run)) {
      current.positive += 1;
    }
    decisionScores.set(decision, current);
  }

  const ranked = [...decisionScores.entries()]
    .map(([decision, stat]) => ({
      decision,
      score: stat.runs > 0 ? stat.positive / stat.runs : 0,
      runs: stat.runs,
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return right.runs - left.runs;
    });

  const top = ranked[0]?.decision;
  if (top === "scale" || top === "iterate" || top === "hold" || top === "archive") {
    return top;
  }

  return "iterate";
}

export function buildCreatorEconomyPolicyLearningReport({
  history,
  now = new Date(),
}: {
  history: StoryCreatorEconomyRun[];
  now?: Date;
}): CreatorEconomyPolicyLearningReport {
  const completedRuns = history.filter((run) => run.status === "completed");
  const openRuns = history.filter((run) => run.status !== "completed");

  const staleOpenRuns = openRuns.filter((run) => {
    const anchor = toTimestamp(run.createdAt);
    if (anchor === null) {
      return false;
    }
    return now.getTime() - anchor > 18 * 3600000;
  }).length;

  const completedWithDelta = completedRuns
    .map((run) => ({
      run,
      delta: getCombinedDelta(run),
      positive: isPositiveOutcome(run),
    }));

  const positiveCompletedRuns = completedWithDelta.filter((sample) => sample.positive).length;
  const overallPositiveRate =
    completedRuns.length > 0 ? positiveCompletedRuns / completedRuns.length : 0;

  const deltas = completedWithDelta
    .map((sample) => sample.delta)
    .filter((value): value is number => value !== null);
  const avgCombinedDelta =
    deltas.length > 0 ? deltas.reduce((sum, value) => sum + value, 0) / deltas.length : 0;

  const modeStats = new Map<CreatorEconomyAutonomyMode, { runs: number; completed: number; positive: number; deltas: number[] }>();
  const recommendationStats = new Map<string, { runs: number; completed: number; positive: number; deltas: number[] }>();

  for (const run of history) {
    const mode = getRunMode(run);
    const modeEntry = modeStats.get(mode) ?? {
      runs: 0,
      completed: 0,
      positive: 0,
      deltas: [],
    };
    modeEntry.runs += 1;
    if (run.status === "completed") {
      modeEntry.completed += 1;
      if (isPositiveOutcome(run)) {
        modeEntry.positive += 1;
      }
      const delta = getCombinedDelta(run);
      if (delta !== null) {
        modeEntry.deltas.push(delta);
      }
    }
    modeStats.set(mode, modeEntry);

    const recommendationId = getRunRecommendationId(run);
    if (!recommendationId) {
      continue;
    }

    const recommendationEntry = recommendationStats.get(recommendationId) ?? {
      runs: 0,
      completed: 0,
      positive: 0,
      deltas: [],
    };
    recommendationEntry.runs += 1;
    if (run.status === "completed") {
      recommendationEntry.completed += 1;
      if (isPositiveOutcome(run)) {
        recommendationEntry.positive += 1;
      }
      const delta = getCombinedDelta(run);
      if (delta !== null) {
        recommendationEntry.deltas.push(delta);
      }
    }
    recommendationStats.set(recommendationId, recommendationEntry);
  }

  const modeOrder: CreatorEconomyAutonomyMode[] = ["manual", "assist", "auto"];
  const modePerformance: CreatorEconomyPolicyLearningModePerformance[] = modeOrder.map((mode) => {
    const stat = modeStats.get(mode) ?? {
      runs: 0,
      completed: 0,
      positive: 0,
      deltas: [],
    };
    return {
      mode,
      runs: stat.runs,
      completedRuns: stat.completed,
      positiveRate:
        stat.completed > 0 ? round(stat.positive / stat.completed) : 0,
      avgCombinedDelta:
        stat.deltas.length > 0
          ? round(stat.deltas.reduce((sum, value) => sum + value, 0) / stat.deltas.length)
          : 0,
    };
  });

  const recommendationPerformance = [...recommendationStats.entries()]
    .map(([recommendationId, stat]) => ({
      recommendationId,
      runs: stat.runs,
      completedRuns: stat.completed,
      positiveRate: stat.completed > 0 ? round(stat.positive / stat.completed) : 0,
      avgCombinedDelta:
        stat.deltas.length > 0
          ? round(stat.deltas.reduce((sum, value) => sum + value, 0) / stat.deltas.length)
          : 0,
    }))
    .sort((left, right) => right.runs - left.runs)
    .slice(0, 12);

  let recommendedMode: CreatorEconomyAutonomyMode = "assist";
  if (completedRuns.length >= 4 && overallPositiveRate >= 0.68 && staleOpenRuns <= 1) {
    recommendedMode = "auto";
  } else if (completedRuns.length >= 4 && overallPositiveRate < 0.4) {
    recommendedMode = "manual";
  }

  const suggestedCooldownHours = clamp(
    Math.round(
      12 +
        (overallPositiveRate >= 0.65 ? -3 : 0) +
        (overallPositiveRate < 0.45 ? 4 : 0) +
        (staleOpenRuns >= 2 ? 3 : 0),
    ),
    6,
    24,
  );

  const suggestedMaxActionsPerCycle =
    recommendedMode === "manual"
      ? 1
      : recommendedMode === "assist"
        ? overallPositiveRate >= 0.6
          ? 2
          : 1
        : overallPositiveRate >= 0.75
          ? 3
          : 2;

  const notes: string[] = [];
  if (completedRuns.length < 3) {
    notes.push("Learning confidence is low; fewer than 3 completed runs are available.");
  }
  if (staleOpenRuns > 0) {
    notes.push(
      `${staleOpenRuns} open run(s) are stale and should be auto-closed to keep the loop healthy.`,
    );
  }
  if (overallPositiveRate >= 0.7) {
    notes.push("Positive outcome rate is strong; policy can safely increase throughput.");
  } else if (overallPositiveRate > 0 && overallPositiveRate < 0.45) {
    notes.push("Positive outcome rate is weak; reduce autonomy aggressiveness until metrics recover.");
  }
  if (notes.length === 0) {
    notes.push("Policy behavior is stable; continue periodic learning refresh after each cycle.");
  }

  return {
    generatedAt: now.toISOString(),
    totals: {
      totalRuns: history.length,
      completedRuns: completedRuns.length,
      staleOpenRuns,
      positiveCompletedRuns,
      overallPositiveRate: round(overallPositiveRate),
      avgCombinedDelta: round(avgCombinedDelta),
    },
    recommendations: {
      recommendedMode,
      suggestedCooldownHours,
      suggestedMaxActionsPerCycle,
      recommendedOutcomeBias: getRecommendedOutcomeBias(history),
    },
    modePerformance,
    recommendationPerformance,
    notes,
  };
}

export function applyPolicyLearningToDecisionPolicy({
  policy,
  learning,
  lockMode,
}: {
  policy: CreatorEconomyDecisionPolicy;
  learning: CreatorEconomyPolicyLearningReport;
  lockMode?: CreatorEconomyAutonomyMode;
}): CreatorEconomyDecisionPolicy {
  const resolvedMode = lockMode ?? learning.recommendations.recommendedMode;

  const adjustedConfidence = clamp(
    Math.round(
      (policy.confidence * 0.7 +
        learning.totals.overallPositiveRate * 100 * 0.3) +
        (learning.totals.staleOpenRuns > 0 ? -5 : 3),
    ),
    30,
    97,
  );

  const rationale = [
    ...policy.rationale,
    `Learning loop: overall positive rate ${Math.round(learning.totals.overallPositiveRate * 100)}%.`,
    `Learning loop: stale open runs ${learning.totals.staleOpenRuns}.`,
  ];

  return {
    ...policy,
    mode: resolvedMode,
    confidence: adjustedConfidence,
    maxActionsPerCycle: learning.recommendations.suggestedMaxActionsPerCycle,
    cooldownHours: learning.recommendations.suggestedCooldownHours,
    rationale,
    guardrails: [
      ...policy.guardrails,
      "If stale open runs exceed 2, run outcome-closing agent before next autonomous cycle.",
    ],
  };
}
