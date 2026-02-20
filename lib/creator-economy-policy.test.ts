import { describe, expect, it } from "vitest";
import {
  buildCreatorEconomyAutonomousBacklog,
  buildCreatorEconomyDecisionPolicy,
  selectCreatorEconomyBacklogExecutionItems,
} from "@/lib/creator-economy-policy";

describe("creator-economy-policy", () => {
  it("builds assist policy and backlog with blocked/cooldown guards", () => {
    const now = new Date("2026-02-15T18:10:00.000Z");

    const automationPlan = {
      generatedAt: now.toISOString(),
      storySlug: "ember-city",
      storyTitle: "Ember City",
      triggerSummary: {
        active: 3,
        total: 6,
        riskActive: 3,
        opportunityActive: 0,
      },
      triggers: [
        {
          id: "foundation_gap",
          label: "Foundation",
          kind: "risk",
          status: "fired",
          severity: "high",
          reason: "low combined",
          metricKey: "combinedScore",
          current: 52,
          threshold: 58,
          direction: "below",
        },
      ],
      recommendations: [
        {
          id: "stabilize-core-loop",
          title: "Stabilize Core Story Loop",
          priority: "high",
          ownerRoleAgentId: "continuity_director",
          triggerIds: ["foundation_gap"],
          summary: "Fix story drift",
          rationale: "High risk",
          checklist: ["do work"],
          execution: {
            sprintObjective: "stabilize_world",
            horizonDays: 6,
            requireMerchPlan: false,
            merchCandidateId: null,
            merchChannels: [],
            defaultOutcomeDecision: "iterate",
          },
        },
        {
          id: "run-merch-probe",
          title: "Run Triggered Merch Probe",
          priority: "medium",
          ownerRoleAgentId: "merch_operator",
          triggerIds: ["merch_signal_gap"],
          summary: "Probe demand",
          rationale: "Signal low",
          checklist: ["run"],
          execution: {
            sprintObjective: "launch_merch_pilot",
            horizonDays: 7,
            requireMerchPlan: true,
            merchCandidateId: "icon-pack",
            merchChannels: ["x_thread"],
            defaultOutcomeDecision: "iterate",
          },
        },
      ],
      queue: [
        {
          id: "queue-stabilize-core-loop",
          recommendationId: "stabilize-core-loop",
          ownerRoleAgentId: "continuity_director",
          ownerUserId: "owner_1",
          status: "ready",
          reason: "Ready",
        },
        {
          id: "queue-run-merch-probe",
          recommendationId: "run-merch-probe",
          ownerRoleAgentId: "merch_operator",
          ownerUserId: null,
          status: "blocked",
          reason: "owner missing",
        },
      ],
      notes: [],
    } as const;

    const operatingPlan = {
      generatedAt: now.toISOString(),
      storySlug: "ember-city",
      storyTitle: "Ember City",
      sprintObjective: "ship_next_drop",
      horizonDays: 7,
      scoreBand: "stabilize",
      baselineMetrics: {
        combinedScore: 52,
        ipOverall: 57,
        retentionPotential: 54,
        merchSignal: 49,
        roleCoverage: 70,
        collaboratorCount: 1,
        remixCount: 0,
        pageCount: 2,
      },
      metricDeltas: [],
      priorityTracks: [],
      executionLoop: [],
      blockerWatchlist: [],
      rolloutNote: "Stabilize",
    } as const;

    const history = [
      {
        id: "run-1",
        storyId: "story-1",
        createdByUserId: "owner_1",
        sprintObjective: "stabilize_world",
        horizonDays: 6,
        status: "planned",
        plan: {
          source: "economy_automation",
          recommendation: { id: "stabilize-core-loop" },
        },
        baselineMetrics: {},
        outcomeMetrics: {},
        outcomeNotes: null,
        outcomeDecision: null,
        completedAt: null,
        createdAt: new Date("2026-02-15T15:00:00.000Z"),
        updatedAt: new Date("2026-02-15T15:00:00.000Z"),
      },
    ];

    const policy = buildCreatorEconomyDecisionPolicy({
      mode: "assist",
      automationPlan,
      operatingPlan,
      history,
      now,
    });

    expect(policy.mode).toBe("assist");
    expect(policy.recommendedOutcome).toBe("iterate");
    expect(policy.cooldownHours).toBeGreaterThan(0);

    const backlog = buildCreatorEconomyAutonomousBacklog({
      mode: "assist",
      automationPlan,
      policy,
      history,
      now,
    });

    expect(backlog.summary.total).toBe(2);
    expect(backlog.items.find((item) => item.recommendationId === "run-merch-probe")?.status).toBe(
      "blocked",
    );
    expect(
      backlog.items.find((item) => item.recommendationId === "stabilize-core-loop")?.status,
    ).toBe("cooldown");
  });

  it("selects ready items for auto execution", () => {
    const backlog = {
      generatedAt: "2026-02-15T18:10:00.000Z",
      mode: "auto",
      policy: {
        mode: "auto",
        recommendedOutcome: "scale",
        confidence: 88,
        rationale: ["scale"],
        guardrails: ["gates"],
        maxActionsPerCycle: 3,
        cooldownHours: 8,
      },
      summary: {
        total: 3,
        ready: 2,
        blocked: 1,
        cooldown: 0,
      },
      items: [
        {
          id: "backlog-1",
          recommendationId: "scale-distribution-window",
          title: "Exploit Scale Window",
          priority: "high",
          ownerRoleAgentId: "distribution_operator",
          ownerUserId: "owner_1",
          status: "ready",
          score: 120,
          reason: "Ready",
          execution: {
            sprintObjective: "scale_distribution",
            horizonDays: 10,
            requireMerchPlan: false,
            merchCandidateId: null,
            merchChannels: [],
            defaultOutcomeDecision: "scale",
          },
          triggerIds: ["scale_window"],
          lastExecutedAt: null,
          cooldownUntil: null,
        },
        {
          id: "backlog-2",
          recommendationId: "close-feedback-loop",
          title: "Close Feedback Loop",
          priority: "medium",
          ownerRoleAgentId: "distribution_operator",
          ownerUserId: "owner_1",
          status: "ready",
          score: 95,
          reason: "Ready",
          execution: {
            sprintObjective: "ship_next_drop",
            horizonDays: 5,
            requireMerchPlan: false,
            merchCandidateId: null,
            merchChannels: [],
            defaultOutcomeDecision: "iterate",
          },
          triggerIds: ["stale_execution_loop"],
          lastExecutedAt: null,
          cooldownUntil: null,
        },
        {
          id: "backlog-3",
          recommendationId: "run-merch-probe",
          title: "Run Triggered Merch Probe",
          priority: "medium",
          ownerRoleAgentId: "merch_operator",
          ownerUserId: null,
          status: "blocked",
          score: 40,
          reason: "Blocked",
          execution: {
            sprintObjective: "launch_merch_pilot",
            horizonDays: 7,
            requireMerchPlan: true,
            merchCandidateId: "icon-pack",
            merchChannels: ["x_thread"],
            defaultOutcomeDecision: "iterate",
          },
          triggerIds: ["merch_signal_gap"],
          lastExecutedAt: null,
          cooldownUntil: null,
        },
      ],
    } as const;

    const selected = selectCreatorEconomyBacklogExecutionItems({
      backlog,
      maxActions: 1,
    });

    expect(selected).toHaveLength(1);
    expect(selected[0]?.recommendationId).toBe("scale-distribution-window");
  });
});
