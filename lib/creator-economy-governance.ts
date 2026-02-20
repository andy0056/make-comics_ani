import { type CreatorEconomyAutonomousBacklog, type CreatorEconomyDecisionPolicy } from "@/lib/creator-economy-policy";
import { type CreatorEconomyPolicyLearningReport } from "@/lib/creator-economy-policy-learning";
import { type StoryCreatorEconomyRun } from "@/lib/schema";

export type CreatorEconomyGovernanceStatus = "healthy" | "watch" | "paused";

export type CreatorEconomyGovernanceReport = {
  generatedAt: string;
  status: CreatorEconomyGovernanceStatus;
  governanceScore: number;
  constraints: {
    allowAutorun: boolean;
    maxActionsCap: number;
    cooldownFloorHours: number;
  };
  signals: {
    completedRuns: number;
    positiveRate: number;
    staleOpenRuns: number;
    riskyOutcomeRate: number;
    longestOpenRunHours: number;
  };
  reasons: string[];
  recommendations: string[];
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function round(value: number, precision = 2): number {
  const power = 10 ** precision;
  return Math.round(value * power) / power;
}

function parseRunPlan(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return {};
  }
  return value as Record<string, unknown>;
}

function getCombinedDelta(run: StoryCreatorEconomyRun): number | null {
  const baseline = run.baselineMetrics?.combinedScore;
  const outcome = run.outcomeMetrics?.combinedScore;
  if (typeof baseline !== "number" || typeof outcome !== "number") {
    return null;
  }
  return outcome - baseline;
}

function isRiskyOutcome(run: StoryCreatorEconomyRun): boolean {
  const decision = run.outcomeDecision?.trim().toLowerCase();
  if (decision === "archive" || decision === "hold") {
    return true;
  }
  const delta = getCombinedDelta(run);
  if (delta === null) {
    return false;
  }
  return delta < -1;
}

function getOpenRunAgeHours(run: StoryCreatorEconomyRun, now: Date): number {
  return Math.max(0, (now.getTime() - run.createdAt.getTime()) / 3600000);
}

function isAutomationSource(run: StoryCreatorEconomyRun): boolean {
  const source = parseRunPlan(run.plan).source;
  return (
    source === "economy_automation" ||
    source === "economy_backlog" ||
    source === "economy_autorun"
  );
}

export function buildCreatorEconomyGovernanceReport({
  history,
  learning,
  policy,
  backlog,
  now = new Date(),
}: {
  history: StoryCreatorEconomyRun[];
  learning: CreatorEconomyPolicyLearningReport;
  policy: CreatorEconomyDecisionPolicy;
  backlog?: CreatorEconomyAutonomousBacklog | null;
  now?: Date;
}): CreatorEconomyGovernanceReport {
  const completedRuns = history.filter((run) => run.status === "completed");
  const completedAutomationRuns = completedRuns.filter((run) => isAutomationSource(run));
  const openRuns = history.filter((run) => run.status !== "completed");

  const riskyOutcomes = completedAutomationRuns.filter((run) => isRiskyOutcome(run)).length;
  const riskyOutcomeRate =
    completedAutomationRuns.length > 0
      ? riskyOutcomes / completedAutomationRuns.length
      : 0;

  const longestOpenRunHours = openRuns.reduce((max, run) => {
    return Math.max(max, getOpenRunAgeHours(run, now));
  }, 0);

  const staleOpenRuns = learning.totals.staleOpenRuns;
  const positiveRate = learning.totals.overallPositiveRate;

  let status: CreatorEconomyGovernanceStatus = "healthy";
  const reasons: string[] = [];
  const recommendations: string[] = [];

  if (
    staleOpenRuns >= 4 ||
    longestOpenRunHours >= 120 ||
    (completedAutomationRuns.length >= 4 && positiveRate <= 0.28)
  ) {
    status = "paused";
  } else if (
    staleOpenRuns >= 2 ||
    riskyOutcomeRate >= 0.5 ||
    (completedAutomationRuns.length >= 3 && positiveRate < 0.5)
  ) {
    status = "watch";
  }

  if (staleOpenRuns > 0) {
    reasons.push(
      `${staleOpenRuns} stale open run(s) detected; close stale cycles before scaling throughput.`,
    );
    recommendations.push("Run the outcome-closing agent before the next autonomous cycle.");
  }
  if (longestOpenRunHours >= 72) {
    reasons.push(
      `Longest open run age is ${Math.round(longestOpenRunHours)}h, signaling delayed feedback closure.`,
    );
  }
  if (riskyOutcomeRate >= 0.4) {
    reasons.push(
      `Risk-heavy outcomes are elevated (${Math.round(riskyOutcomeRate * 100)}% archive/hold/negative).`,
    );
    recommendations.push("Reduce cycle width and prioritize stabilization recommendations.");
  }
  if (positiveRate >= 0.68 && staleOpenRuns === 0) {
    recommendations.push("Healthy loop detected; controlled scale tests are safe.");
  }
  if (reasons.length === 0) {
    reasons.push("Autonomy signals are stable and within governance thresholds.");
  }
  if (recommendations.length === 0) {
    recommendations.push("Continue monitored autonomous execution with periodic policy refresh.");
  }

  const defaultMaxCap =
    status === "healthy" ? policy.maxActionsPerCycle : status === "watch" ? 2 : 1;
  const backlogReady = backlog?.summary.ready ?? 0;
  const maxActionsCap = clamp(Math.min(defaultMaxCap, Math.max(1, backlogReady || 1)), 1, 5);
  const cooldownFloorHours = clamp(
    status === "healthy" ? 6 : status === "watch" ? 12 : 18,
    4,
    24,
  );

  const governanceScore = clamp(
    Math.round(
      82 +
        (positiveRate - 0.5) * 45 -
        staleOpenRuns * 6 -
        riskyOutcomeRate * 22 -
        (longestOpenRunHours >= 72 ? 8 : 0),
    ),
    0,
    100,
  );

  return {
    generatedAt: now.toISOString(),
    status,
    governanceScore,
    constraints: {
      allowAutorun: status !== "paused",
      maxActionsCap,
      cooldownFloorHours,
    },
    signals: {
      completedRuns: completedRuns.length,
      positiveRate: round(positiveRate),
      staleOpenRuns,
      riskyOutcomeRate: round(riskyOutcomeRate),
      longestOpenRunHours: round(longestOpenRunHours, 1),
    },
    reasons,
    recommendations,
  };
}

export function applyGovernanceToDecisionPolicy({
  policy,
  governance,
}: {
  policy: CreatorEconomyDecisionPolicy;
  governance: CreatorEconomyGovernanceReport;
}): CreatorEconomyDecisionPolicy {
  const cappedMaxActions = Math.min(
    policy.maxActionsPerCycle,
    governance.constraints.maxActionsCap,
  );
  const guardedCooldown = Math.max(
    policy.cooldownHours,
    governance.constraints.cooldownFloorHours,
  );

  return {
    ...policy,
    confidence: clamp(
      policy.confidence - (governance.status === "watch" ? 6 : governance.status === "paused" ? 14 : 0),
      15,
      99,
    ),
    maxActionsPerCycle: cappedMaxActions,
    cooldownHours: guardedCooldown,
    rationale: [
      ...policy.rationale,
      `Governance ${governance.status}: score ${governance.governanceScore}.`,
    ],
    guardrails: [
      ...policy.guardrails,
      "Honor governance action caps and cooldown floor before each autonomous run.",
      ...(governance.status === "paused"
        ? ["Autorun paused by governance; force-run should be used only for emergency interventions."]
        : []),
    ],
  };
}
