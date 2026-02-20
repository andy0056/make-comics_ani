import {
  type CreatorEconomyOptimizationObjective,
} from "@/lib/creator-economy-optimizer";
import { type CreatorEconomyAutonomousBacklog, type CreatorEconomyDecisionPolicy } from "@/lib/creator-economy-policy";
import { type CreatorEconomyGovernanceReport } from "@/lib/creator-economy-governance";
import { type CreatorEconomyPolicyLearningReport } from "@/lib/creator-economy-policy-learning";
import { type CreatorEconomyExecutionWindowReport } from "@/lib/creator-economy-window-loop";
import { type CreatorEconomyStrategyLoopReport } from "@/lib/creator-economy-strategy-loop";

export type CreatorEconomySelfHealingSeverity = "none" | "watch" | "critical";

export type CreatorEconomySelfHealingRecoveryItem = {
  recommendationId: string;
  title: string;
  priority: "high" | "medium" | "low";
  status: "ready" | "blocked" | "cooldown";
  reason: string;
  targetObjective: CreatorEconomyOptimizationObjective;
  expectedRoiLift: number;
};

export type CreatorEconomySelfHealingReport = {
  generatedAt: string;
  severity: CreatorEconomySelfHealingSeverity;
  roiGapScore: number;
  triggers: string[];
  policyPatch: {
    objective: CreatorEconomyOptimizationObjective;
    cadenceHours: number;
    mode: CreatorEconomyDecisionPolicy["mode"];
    maxActionsPerCycle: number;
    cooldownHours: number;
  };
  recoveryPlan: CreatorEconomySelfHealingRecoveryItem[];
  notes: string[];
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function computeSeverity({
  governance,
  learning,
  windowReport,
}: {
  governance: CreatorEconomyGovernanceReport;
  learning: CreatorEconomyPolicyLearningReport;
  windowReport: CreatorEconomyExecutionWindowReport;
}): CreatorEconomySelfHealingSeverity {
  if (
    governance.status === "paused" ||
    windowReport.gate.status === "blocked" ||
    learning.totals.staleOpenRuns >= 3
  ) {
    return "critical";
  }

  if (
    governance.status === "watch" ||
    windowReport.gate.status === "hold" ||
    learning.totals.overallPositiveRate < 0.58
  ) {
    return "watch";
  }

  return "none";
}

function buildPatch({
  severity,
  policy,
  governance,
  strategyLoop,
  windowReport,
}: {
  severity: CreatorEconomySelfHealingSeverity;
  policy: CreatorEconomyDecisionPolicy;
  governance: CreatorEconomyGovernanceReport;
  strategyLoop: CreatorEconomyStrategyLoopReport;
  windowReport: CreatorEconomyExecutionWindowReport;
}) {
  if (severity === "critical") {
    return {
      objective: "stabilize" as const,
      cadenceHours: Math.max(windowReport.adaptation.nextCadenceHours, strategyLoop.cadenceHours),
      mode: "assist" as const,
      maxActionsPerCycle: 1,
      cooldownHours: Math.max(
        governance.constraints.cooldownFloorHours,
        policy.cooldownHours + 4,
      ),
    };
  }

  if (severity === "watch") {
    return {
      objective: "balanced" as const,
      cadenceHours: Math.max(windowReport.adaptation.nextCadenceHours, strategyLoop.cadenceHours),
      mode: policy.mode === "auto" ? "assist" : policy.mode,
      maxActionsPerCycle: clamp(
        Math.min(policy.maxActionsPerCycle, governance.constraints.maxActionsCap),
        1,
        3,
      ),
      cooldownHours: Math.max(
        governance.constraints.cooldownFloorHours,
        policy.cooldownHours + 2,
      ),
    };
  }

  return {
    objective: windowReport.adaptation.recommendedObjective,
    cadenceHours: windowReport.adaptation.nextCadenceHours,
    mode: policy.mode,
    maxActionsPerCycle: clamp(
      Math.min(policy.maxActionsPerCycle, governance.constraints.maxActionsCap),
      1,
      5,
    ),
    cooldownHours: Math.max(policy.cooldownHours, governance.constraints.cooldownFloorHours),
  };
}

function estimateRoiLift(priority: "high" | "medium" | "low"): number {
  if (priority === "high") {
    return 8;
  }
  if (priority === "medium") {
    return 5;
  }
  return 3;
}

export function buildCreatorEconomySelfHealingReport({
  policy,
  governance,
  learning,
  strategyLoop,
  windowReport,
  backlog,
  now = new Date(),
}: {
  policy: CreatorEconomyDecisionPolicy;
  governance: CreatorEconomyGovernanceReport;
  learning: CreatorEconomyPolicyLearningReport;
  strategyLoop: CreatorEconomyStrategyLoopReport;
  windowReport: CreatorEconomyExecutionWindowReport;
  backlog: CreatorEconomyAutonomousBacklog;
  now?: Date;
}): CreatorEconomySelfHealingReport {
  const severity = computeSeverity({
    governance,
    learning,
    windowReport,
  });

  const roiGapScore = clamp(
    Math.round(
      100 -
        learning.totals.overallPositiveRate * 60 -
        (1 - governance.signals.riskyOutcomeRate) * 20 -
        Math.max(0, 10 - backlog.summary.ready * 3),
    ),
    0,
    100,
  );

  const triggers: string[] = [];
  if (governance.status !== "healthy") {
    triggers.push(`Governance status is ${governance.status}.`);
  }
  if (windowReport.gate.status !== "ready") {
    triggers.push(`Execution gate is ${windowReport.gate.status}.`);
  }
  if (learning.totals.staleOpenRuns > 0) {
    triggers.push(
      `${learning.totals.staleOpenRuns} stale open run(s) need closure to recover ROI loop speed.`,
    );
  }
  if (learning.totals.overallPositiveRate < 0.6) {
    triggers.push(
      `Positive outcome rate is ${Math.round(learning.totals.overallPositiveRate * 100)}%.`,
    );
  }
  if (triggers.length === 0) {
    triggers.push("Loop is healthy; self-healing remains in observation mode.");
  }

  const policyPatch = buildPatch({
    severity,
    policy,
    governance,
    strategyLoop,
    windowReport,
  });

  const recoveryPlan = backlog.items
    .slice()
    .sort((left, right) => right.score - left.score)
    .slice(0, 4)
    .map((item) => ({
      recommendationId: item.recommendationId,
      title: item.title,
      priority: item.priority,
      status: item.status,
      reason: item.reason,
      targetObjective: policyPatch.objective,
      expectedRoiLift: estimateRoiLift(item.priority),
    }));

  const notes: string[] = [];
  notes.push(
    `Self-healing severity is ${severity}; ROI gap score is ${roiGapScore}.`,
  );
  notes.push(
    `Patch proposes ${policyPatch.mode} mode with ${policyPatch.maxActionsPerCycle} max action(s) and ${policyPatch.cooldownHours}h cooldown.`,
  );
  notes.push(
    `Cadence adapts toward ${policyPatch.cadenceHours}h with objective ${policyPatch.objective}.`,
  );

  return {
    generatedAt: now.toISOString(),
    severity,
    roiGapScore,
    triggers,
    policyPatch,
    recoveryPlan,
    notes,
  };
}

export function applyCreatorEconomySelfHealingPatch({
  policy,
  report,
}: {
  policy: CreatorEconomyDecisionPolicy;
  report: CreatorEconomySelfHealingReport;
}): CreatorEconomyDecisionPolicy {
  return {
    ...policy,
    mode: report.policyPatch.mode,
    maxActionsPerCycle: report.policyPatch.maxActionsPerCycle,
    cooldownHours: report.policyPatch.cooldownHours,
    confidence: clamp(
      report.severity === "critical"
        ? policy.confidence - 12
        : report.severity === "watch"
          ? policy.confidence - 6
          : policy.confidence + 2,
      10,
      99,
    ),
    rationale: [
      ...policy.rationale,
      `Self-healing patch applied (${report.severity}) toward ${report.policyPatch.objective}.`,
    ],
    guardrails: [
      ...policy.guardrails,
      "Self-healing patch active: close recovery plan items before next escalation.",
    ],
  };
}
