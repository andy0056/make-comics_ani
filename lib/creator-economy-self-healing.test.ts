import { describe, expect, it } from "vitest";
import {
  applyCreatorEconomySelfHealingPatch,
  buildCreatorEconomySelfHealingReport,
} from "@/lib/creator-economy-self-healing";

describe("creator-economy-self-healing", () => {
  it("elevates to critical severity and patches policy to stabilization controls", () => {
    const report = buildCreatorEconomySelfHealingReport({
      policy: {
        mode: "auto",
        recommendedOutcome: "scale",
        confidence: 76,
        rationale: ["base"],
        guardrails: ["base"],
        maxActionsPerCycle: 3,
        cooldownHours: 8,
      },
      governance: {
        generatedAt: "2026-02-15T21:00:00.000Z",
        status: "paused",
        governanceScore: 34,
        constraints: {
          allowAutorun: false,
          maxActionsCap: 2,
          cooldownFloorHours: 14,
        },
        signals: {
          completedRuns: 3,
          positiveRate: 0.33,
          staleOpenRuns: 4,
          riskyOutcomeRate: 0.62,
          longestOpenRunHours: 98,
        },
        reasons: ["paused for safety"],
        recommendations: ["close stale runs first"],
      },
      learning: {
        generatedAt: "2026-02-15T21:00:00.000Z",
        totals: {
          totalRuns: 7,
          completedRuns: 3,
          staleOpenRuns: 4,
          positiveCompletedRuns: 1,
          overallPositiveRate: 0.33,
          avgCombinedDelta: -6,
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
      strategyLoop: {
        generatedAt: "2026-02-15T21:00:00.000Z",
        selectedObjective: "growth",
        recommendedCadenceHours: 18,
        cadenceHours: 18,
        autoOptimizeEnabled: false,
        safeWindow: false,
        nextRefreshAt: "2026-02-16T15:00:00.000Z",
        cycles: [
          {
            cycle: 1,
            objective: "growth",
            mode: "auto",
            maxActionsPerCycle: 3,
            cooldownHours: 8,
            scheduledWindowStart: "2026-02-15T21:00:00.000Z",
            scheduledWindowEnd: "2026-02-16T15:00:00.000Z",
            rationale: "growth phase",
          },
        ],
        guardrails: [],
        notes: [],
      },
      windowReport: {
        generatedAt: "2026-02-15T21:00:00.000Z",
        activeCycle: null,
        gate: {
          status: "blocked",
          reasons: ["Governance paused"],
          windowCompletedRuns: 0,
          windowPositiveRate: 0,
          staleOpenRuns: 4,
        },
        adaptation: {
          nextCadenceHours: 24,
          recommendedObjective: "stabilize",
          reason: "blocked",
        },
        preview: {
          readyBacklogItems: 1,
          maxActions: 1,
        },
      },
      backlog: {
        generatedAt: "2026-02-15T21:00:00.000Z",
        mode: "auto",
        policy: {
          mode: "auto",
          recommendedOutcome: "scale",
          confidence: 76,
          rationale: [],
          guardrails: [],
          maxActionsPerCycle: 3,
          cooldownHours: 8,
        },
        summary: {
          total: 3,
          ready: 1,
          blocked: 2,
          cooldown: 0,
        },
        items: [
          {
            id: "item-1",
            recommendationId: "reco-1",
            title: "Rebuild retention baseline",
            priority: "high",
            ownerRoleAgentId: "distribution_operator",
            ownerUserId: null,
            status: "ready",
            score: 94,
            reason: "Outcome debt is high",
            execution: {
              sprintObjective: "ship_next_drop",
              horizonDays: 7,
              requireMerchPlan: false,
              merchCandidateId: null,
              merchChannels: ["x_thread"],
              defaultOutcomeDecision: "iterate",
            },
            triggerIds: [],
            lastExecutedAt: null,
            cooldownUntil: null,
          },
        ],
      },
      now: new Date("2026-02-15T21:00:00.000Z"),
    });

    expect(report.severity).toBe("critical");
    expect(report.policyPatch.objective).toBe("stabilize");
    expect(report.policyPatch.mode).toBe("assist");
    expect(report.policyPatch.maxActionsPerCycle).toBe(1);
    expect(report.policyPatch.cadenceHours).toBe(24);
    expect(report.recoveryPlan[0]?.expectedRoiLift).toBeGreaterThanOrEqual(8);
  });

  it("applies self-healing patch and appends autonomous guardrails", () => {
    const nextPolicy = applyCreatorEconomySelfHealingPatch({
      policy: {
        mode: "auto",
        recommendedOutcome: "scale",
        confidence: 72,
        rationale: ["base rationale"],
        guardrails: ["base guardrail"],
        maxActionsPerCycle: 3,
        cooldownHours: 8,
      },
      report: {
        generatedAt: "2026-02-15T21:00:00.000Z",
        severity: "watch",
        roiGapScore: 62,
        triggers: ["watch"],
        policyPatch: {
          objective: "balanced",
          cadenceHours: 12,
          mode: "assist",
          maxActionsPerCycle: 2,
          cooldownHours: 10,
        },
        recoveryPlan: [],
        notes: [],
      },
    });

    expect(nextPolicy.mode).toBe("assist");
    expect(nextPolicy.maxActionsPerCycle).toBe(2);
    expect(nextPolicy.cooldownHours).toBe(10);
    expect(nextPolicy.confidence).toBe(66);
    expect(
      nextPolicy.rationale.some((entry) => entry.includes("Self-healing patch applied")),
    ).toBe(true);
    expect(
      nextPolicy.guardrails.some((entry) => entry.includes("Self-healing patch active")),
    ).toBe(true);
  });
});
