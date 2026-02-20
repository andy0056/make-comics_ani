import {
  type RoleAgentId,
  type RoleAgentSprintObjective,
  type CreatorRoleAgentsBoard,
} from "@/lib/collaborative-role-agents";
import {
  type CreatorEconomyMetricKey,
  type CreatorEconomyMetrics,
  type CreatorEconomyOperatingPlan,
  normalizeCreatorEconomyMetrics,
} from "@/lib/creator-economy-orchestrator";
import { type MerchabilityDetectorReport } from "@/lib/merchability-detector";
import { type DistributionChannel } from "@/lib/publishing-distribution";
import { type Story } from "@/lib/schema";

export type CreatorEconomyAutomationTriggerId =
  | "foundation_gap"
  | "retention_drift"
  | "merch_signal_gap"
  | "role_coverage_gap"
  | "stale_execution_loop"
  | "scale_window";

export type CreatorEconomyAutomationTrigger = {
  id: CreatorEconomyAutomationTriggerId;
  label: string;
  kind: "risk" | "opportunity";
  status: "fired" | "watching";
  severity: "high" | "medium" | "low";
  reason: string;
  metricKey: CreatorEconomyMetricKey;
  current: number;
  threshold: number;
  direction: "below" | "above";
};

export type CreatorEconomyAutomationExecution = {
  sprintObjective: RoleAgentSprintObjective;
  horizonDays: number;
  requireMerchPlan: boolean;
  merchCandidateId: string | null;
  merchChannels: DistributionChannel[];
  defaultOutcomeDecision: "scale" | "iterate" | "hold" | "archive";
};

export type CreatorEconomyAutomationRecommendation = {
  id: string;
  title: string;
  priority: "high" | "medium" | "low";
  ownerRoleAgentId: RoleAgentId;
  triggerIds: CreatorEconomyAutomationTriggerId[];
  summary: string;
  rationale: string;
  checklist: string[];
  execution: CreatorEconomyAutomationExecution;
};

export type CreatorEconomyAutomationQueueItem = {
  id: string;
  recommendationId: string;
  ownerRoleAgentId: RoleAgentId;
  ownerUserId: string | null;
  status: "ready" | "blocked";
  reason: string;
};

export type CreatorEconomyAutomationPlan = {
  generatedAt: string;
  storySlug: string;
  storyTitle: string;
  triggerSummary: {
    active: number;
    total: number;
    riskActive: number;
    opportunityActive: number;
  };
  triggers: CreatorEconomyAutomationTrigger[];
  recommendations: CreatorEconomyAutomationRecommendation[];
  queue: CreatorEconomyAutomationQueueItem[];
  notes: string[];
};

export type CreatorEconomyAutomationRunSnapshot = {
  id: string;
  status: string;
  createdAt: Date | string;
  completedAt: Date | string | null;
  baselineMetrics: unknown;
  outcomeMetrics: unknown;
};

function toTimestamp(value: Date | string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function hasFiredTrigger(
  triggers: CreatorEconomyAutomationTrigger[],
  triggerId: CreatorEconomyAutomationTriggerId,
): boolean {
  return triggers.some((trigger) => trigger.id === triggerId && trigger.status === "fired");
}

function clampHorizon(days: number): number {
  return Math.max(3, Math.min(30, Math.round(days)));
}

function buildTriggers({
  metrics,
  latestRun,
}: {
  metrics: CreatorEconomyMetrics;
  latestRun: CreatorEconomyAutomationRunSnapshot | null;
}): CreatorEconomyAutomationTrigger[] {
  const now = Date.now();
  const latestRunTimestamp = latestRun
    ? toTimestamp(latestRun.completedAt) ?? toTimestamp(latestRun.createdAt)
    : null;
  const hoursSinceLatestRun =
    latestRunTimestamp === null ? Number.POSITIVE_INFINITY : (now - latestRunTimestamp) / 3600000;

  const staleLoopFired =
    latestRun === null
      ? true
      : latestRun.status !== "completed"
        ? hoursSinceLatestRun > 24
        : hoursSinceLatestRun > 72;

  const scaleWindowFired =
    metrics.combinedScore >= 78 &&
    metrics.retentionPotential >= 70 &&
    metrics.merchSignal >= 66 &&
    metrics.roleCoverage >= 86;

  return [
    {
      id: "foundation_gap",
      label: "Foundation Stability",
      kind: "risk",
      status: metrics.combinedScore < 58 ? "fired" : "watching",
      severity: metrics.combinedScore < 58 ? "high" : "low",
      reason:
        metrics.combinedScore < 58
          ? "Combined score is below stabilization threshold; prioritize canon and narrative reliability before scaling."
          : "Combined score remains within a stable band.",
      metricKey: "combinedScore",
      current: metrics.combinedScore,
      threshold: 58,
      direction: "below",
    },
    {
      id: "retention_drift",
      label: "Retention Drift",
      kind: "risk",
      status: metrics.retentionPotential < 62 ? "fired" : "watching",
      severity: metrics.retentionPotential < 62 ? "high" : "medium",
      reason:
        metrics.retentionPotential < 62
          ? "Retention potential dipped under target; reinforce hook cadence and continuation prompts."
          : "Retention potential is within operating range.",
      metricKey: "retentionPotential",
      current: metrics.retentionPotential,
      threshold: 62,
      direction: "below",
    },
    {
      id: "merch_signal_gap",
      label: "Merch Signal Gap",
      kind: "risk",
      status: metrics.merchSignal < 60 ? "fired" : "watching",
      severity: metrics.merchSignal < 60 ? "medium" : "low",
      reason:
        metrics.merchSignal < 60
          ? "Merch signal is still early; run low-cost concept probes before larger experiments."
          : "Merch signals are healthy enough for staged testing.",
      metricKey: "merchSignal",
      current: metrics.merchSignal,
      threshold: 60,
      direction: "below",
    },
    {
      id: "role_coverage_gap",
      label: "Role Coverage Gap",
      kind: "risk",
      status: metrics.roleCoverage < 82 ? "fired" : "watching",
      severity: metrics.roleCoverage < 82 ? "medium" : "low",
      reason:
        metrics.roleCoverage < 82
          ? "Role ownership is incomplete; resolve assignment gaps before high-throughput runs."
          : "Role ownership coverage is healthy.",
      metricKey: "roleCoverage",
      current: metrics.roleCoverage,
      threshold: 82,
      direction: "below",
    },
    {
      id: "stale_execution_loop",
      label: "Stale Execution Loop",
      kind: "risk",
      status: staleLoopFired ? "fired" : "watching",
      severity: staleLoopFired ? "medium" : "low",
      reason:
        latestRun === null
          ? "No creator-economy run exists yet; seed one run to start measurable iteration."
          : staleLoopFired
            ? "Latest run has not closed the feedback loop in time; create and execute the next run."
            : "Execution loop cadence is current.",
      metricKey: "combinedScore",
      current: Math.max(0, 100 - Math.min(100, Math.round(hoursSinceLatestRun))),
      threshold: 28,
      direction: "below",
    },
    {
      id: "scale_window",
      label: "Scale Window",
      kind: "opportunity",
      status: scaleWindowFired ? "fired" : "watching",
      severity: scaleWindowFired ? "high" : "low",
      reason: scaleWindowFired
        ? "Metrics indicate a scale-ready window; increase distribution throughput with controlled experiments."
        : "Scale window not open yet; continue strengthening the baseline.",
      metricKey: "combinedScore",
      current: metrics.combinedScore,
      threshold: 78,
      direction: "above",
    },
  ];
}

function buildRecommendations({
  triggers,
  roleBoard,
  merchReport,
  operatingPlan,
}: {
  triggers: CreatorEconomyAutomationTrigger[];
  roleBoard: CreatorRoleAgentsBoard;
  merchReport: MerchabilityDetectorReport;
  operatingPlan: CreatorEconomyOperatingPlan;
}): CreatorEconomyAutomationRecommendation[] {
  const recommendations: CreatorEconomyAutomationRecommendation[] = [];
  const topMerchCandidate = merchReport.candidates[0] ?? null;
  const topMerchChannels = topMerchCandidate?.channelFit.slice(0, 3) ?? [];
  const coreLoopTriggerIds: CreatorEconomyAutomationTriggerId[] = [
    "foundation_gap",
    "retention_drift",
  ];

  if (hasFiredTrigger(triggers, "foundation_gap") || hasFiredTrigger(triggers, "retention_drift")) {
    recommendations.push({
      id: "stabilize-core-loop",
      title: "Stabilize Core Story Loop",
      priority: "high",
      ownerRoleAgentId: "continuity_director",
      triggerIds: coreLoopTriggerIds.filter((triggerId) =>
        hasFiredTrigger(triggers, triggerId),
      ),
      summary:
        "Run a stabilization sprint focused on canon reliability and stronger continuation hooks.",
      rationale:
        "Combined and retention signals are below target. Stabilizing this layer first improves downstream merch and distribution quality.",
      checklist: [
        "Lock one continuity rule update and ship one narrative cliffhanger within the sprint.",
        "Review all high-severity continuity warnings before each generation batch.",
        "Record outcome metrics and decide iterate/hold at sprint close.",
      ],
      execution: {
        sprintObjective: "stabilize_world",
        horizonDays: clampHorizon(Math.max(5, Math.round(operatingPlan.horizonDays * 0.85))),
        requireMerchPlan: false,
        merchCandidateId: null,
        merchChannels: [],
        defaultOutcomeDecision: "iterate",
      },
    });
  }

  if (hasFiredTrigger(triggers, "merch_signal_gap")) {
    recommendations.push({
      id: "run-merch-probe",
      title: "Run Triggered Merch Probe",
      priority: "medium",
      ownerRoleAgentId: "merch_operator",
      triggerIds: ["merch_signal_gap"],
      summary:
        "Launch a low-risk merch probe with a measurable hypothesis and fast feedback window.",
      rationale:
        "Merch signal is below readiness. A narrow pilot increases signal quality without heavy execution overhead.",
      checklist: [
        `Select candidate: ${topMerchCandidate?.title ?? "define first candidate"}.`,
        "Run prep -> launch -> learn loop and capture objections with demand metrics.",
        "Feed outcomes back into the next operating plan before scaling spend.",
      ],
      execution: {
        sprintObjective: "launch_merch_pilot",
        horizonDays: clampHorizon(Math.max(5, operatingPlan.horizonDays)),
        requireMerchPlan: true,
        merchCandidateId: topMerchCandidate?.id ?? null,
        merchChannels: topMerchChannels,
        defaultOutcomeDecision: "iterate",
      },
    });
  }

  if (hasFiredTrigger(triggers, "role_coverage_gap")) {
    recommendations.push({
      id: "rebalance-role-ownership",
      title: "Rebalance Role Ownership",
      priority: "medium",
      ownerRoleAgentId: "story_architect",
      triggerIds: ["role_coverage_gap"],
      summary:
        "Resolve owner gaps and enforce explicit role handoffs before high-volume operations.",
      rationale:
        "Role coverage below target increases execution collisions and reduces accountability across creator-economy loops.",
      checklist: [
        "Assign an explicit owner for each role card and confirm sprint objective alignment.",
        "Run one sync cycle dedicated to lock handoff and conflict-center triage.",
        "Save a fresh operating run once ownership is complete.",
      ],
      execution: {
        sprintObjective: "ship_next_drop",
        horizonDays: clampHorizon(Math.max(3, Math.round(operatingPlan.horizonDays * 0.7))),
        requireMerchPlan: false,
        merchCandidateId: null,
        merchChannels: [],
        defaultOutcomeDecision: "iterate",
      },
    });
  }

  if (hasFiredTrigger(triggers, "stale_execution_loop")) {
    recommendations.push({
      id: "close-feedback-loop",
      title: "Close Feedback Loop",
      priority: "medium",
      ownerRoleAgentId: "distribution_operator",
      triggerIds: ["stale_execution_loop"],
      summary:
        "Create a fresh run and close it with outcome metrics to restore execution cadence.",
      rationale:
        "An idle loop breaks learning momentum. A short-cycle run restores measurable iteration behavior.",
      checklist: [
        "Generate and persist a new operating run for the current sprint objective.",
        "Ship at least one action from each high-priority track.",
        "Record run outcomes within 24 hours of execution completion.",
      ],
      execution: {
        sprintObjective: "ship_next_drop",
        horizonDays: 5,
        requireMerchPlan: false,
        merchCandidateId: null,
        merchChannels: [],
        defaultOutcomeDecision: "iterate",
      },
    });
  }

  if (hasFiredTrigger(triggers, "scale_window")) {
    recommendations.push({
      id: "scale-distribution-window",
      title: "Exploit Scale Window",
      priority: "high",
      ownerRoleAgentId: "distribution_operator",
      triggerIds: ["scale_window"],
      summary:
        "Metrics are scale-ready. Increase distribution velocity while preserving quality-gate controls.",
      rationale:
        "All major readiness metrics crossed scale thresholds. This is a high-leverage moment to compound retention and reach.",
      checklist: [
        "Run autopipeline for all primary channels with quality gates green.",
        "Schedule two follow-up releases within the same horizon window.",
        "Log distribution deltas and decide scale/iterate at sprint close.",
      ],
      execution: {
        sprintObjective: "scale_distribution",
        horizonDays: clampHorizon(Math.max(7, operatingPlan.horizonDays + 2)),
        requireMerchPlan: false,
        merchCandidateId: topMerchCandidate?.id ?? null,
        merchChannels: topMerchChannels,
        defaultOutcomeDecision: "scale",
      },
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      id: "maintain-balanced-loop",
      title: "Maintain Balanced Operating Loop",
      priority: "low",
      ownerRoleAgentId: "story_architect",
      triggerIds: [],
      summary:
        "No urgent automation triggers fired. Continue measured execution and monitor for drift.",
      rationale:
        "Metrics are stable enough to maintain current cadence without emergency intervention.",
      checklist: [
        "Keep sprint execution cadence and close feedback loop on schedule.",
        "Run weekly trigger refresh and monitor any movement toward risk thresholds.",
      ],
      execution: {
        sprintObjective: roleBoard.sprintObjective,
        horizonDays: roleBoard.horizonDays,
        requireMerchPlan: false,
        merchCandidateId: null,
        merchChannels: [],
        defaultOutcomeDecision: "hold",
      },
    });
  }

  return recommendations;
}

function buildQueue({
  recommendations,
  roleBoard,
}: {
  recommendations: CreatorEconomyAutomationRecommendation[];
  roleBoard: CreatorRoleAgentsBoard;
}): CreatorEconomyAutomationQueueItem[] {
  return recommendations.map((recommendation) => {
    const ownerCard = roleBoard.roster.find(
      (roleCard) => roleCard.id === recommendation.ownerRoleAgentId,
    );
    const ownerUserId = ownerCard?.ownerUserId ?? null;
    const isReady = Boolean(ownerUserId);

    return {
      id: `queue-${recommendation.id}`,
      recommendationId: recommendation.id,
      ownerRoleAgentId: recommendation.ownerRoleAgentId,
      ownerUserId,
      status: isReady ? "ready" : "blocked",
      reason: isReady
        ? "Ready to execute."
        : "No owner assigned for this role; set owner override before execution.",
    };
  });
}

function buildNotes({
  triggers,
  queue,
}: {
  triggers: CreatorEconomyAutomationTrigger[];
  queue: CreatorEconomyAutomationQueueItem[];
}): string[] {
  const notes: string[] = [];

  const highRiskTriggerCount = triggers.filter(
    (trigger) =>
      trigger.status === "fired" && trigger.kind === "risk" && trigger.severity === "high",
  ).length;
  if (highRiskTriggerCount > 0) {
    notes.push(
      `${highRiskTriggerCount} high-severity risk trigger(s) active. Prioritize stabilization recommendations first.`,
    );
  }

  if (triggers.some((trigger) => trigger.id === "scale_window" && trigger.status === "fired")) {
    notes.push("Scale window detected. Keep quality gates and continuity checks enabled while scaling.");
  }

  const blockedQueueCount = queue.filter((item) => item.status === "blocked").length;
  if (blockedQueueCount > 0) {
    notes.push(
      `${blockedQueueCount} recommendation(s) blocked by missing role ownership. Use owner overrides before execution.`,
    );
  }

  if (notes.length === 0) {
    notes.push("Automation is healthy. Refresh triggers after each saved run or major story update.");
  }

  return notes;
}

export function buildCreatorEconomyAutomationPlan({
  story,
  operatingPlan,
  roleBoard,
  merchReport,
  history,
  generatedAt = new Date().toISOString(),
}: {
  story: Story;
  operatingPlan: CreatorEconomyOperatingPlan;
  roleBoard: CreatorRoleAgentsBoard;
  merchReport: MerchabilityDetectorReport;
  history: CreatorEconomyAutomationRunSnapshot[];
  generatedAt?: string;
}): CreatorEconomyAutomationPlan {
  const latestRun = history[0] ?? null;
  const latestMetrics =
    latestRun === null
      ? {}
      : normalizeCreatorEconomyMetrics(latestRun.outcomeMetrics).combinedScore !== undefined
        ? normalizeCreatorEconomyMetrics(latestRun.outcomeMetrics)
        : normalizeCreatorEconomyMetrics(latestRun.baselineMetrics);

  const metrics: CreatorEconomyMetrics = {
    ...operatingPlan.baselineMetrics,
    ...latestMetrics,
  };

  const triggers = buildTriggers({ metrics, latestRun });
  const recommendations = buildRecommendations({
    triggers,
    roleBoard,
    merchReport,
    operatingPlan,
  });
  const queue = buildQueue({ recommendations, roleBoard });

  const triggerSummary = {
    active: triggers.filter((trigger) => trigger.status === "fired").length,
    total: triggers.length,
    riskActive: triggers.filter(
      (trigger) => trigger.status === "fired" && trigger.kind === "risk",
    ).length,
    opportunityActive: triggers.filter(
      (trigger) => trigger.status === "fired" && trigger.kind === "opportunity",
    ).length,
  };

  return {
    generatedAt,
    storySlug: story.slug,
    storyTitle: story.title,
    triggerSummary,
    triggers,
    recommendations,
    queue,
    notes: buildNotes({ triggers, queue }),
  };
}

export function getCreatorEconomyAutomationRecommendationById({
  plan,
  recommendationId,
}: {
  plan: CreatorEconomyAutomationPlan;
  recommendationId: string;
}): CreatorEconomyAutomationRecommendation | null {
  return (
    plan.recommendations.find(
      (recommendation) => recommendation.id === recommendationId,
    ) ?? null
  );
}
