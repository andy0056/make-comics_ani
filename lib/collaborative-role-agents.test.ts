import { describe, expect, it } from "vitest";
import { buildCreatorRoleAgentsBoard } from "@/lib/collaborative-role-agents";

describe("collaborative-role-agents", () => {
  it("builds a full roster and defaults owners from participants", () => {
    const board = buildCreatorRoleAgentsBoard({
      story: {
        id: "story-1",
        slug: "night-rail",
        title: "Night Rail",
        description: null,
        style: "noir",
        userId: "owner_1",
        usesOwnApiKey: false,
        createdAt: new Date("2026-02-15T00:00:00.000Z"),
        updatedAt: new Date("2026-02-15T00:00:00.000Z"),
      },
      collaborators: [
        {
          id: "col-1",
          storyId: "story-1",
          userId: "editor_1",
          role: "editor",
          invitedByUserId: "owner_1",
          createdAt: new Date("2026-02-15T00:00:00.000Z"),
          updatedAt: new Date("2026-02-15T00:00:00.000Z"),
        },
      ],
      ipReport: {
        generatedAt: "2026-02-15T00:00:00.000Z",
        storySlug: "night-rail",
        storyTitle: "Night Rail",
        band: "promising",
        overallScore: 68,
        moatStrengthScore: 70,
        retentionPotentialScore: 64,
        merchabilityScore: 62,
        expansionPotentialScore: 65,
        signals: {
          pageCount: 3,
          characterCount: 2,
          dnaProfileCount: 2,
          lockedCharacterCount: 2,
          timelineBeatCount: 2,
          locationCount: 2,
          canonRuleCount: 2,
          remixCount: 1,
        },
        pillars: [
          {
            id: "canon_strength",
            label: "Canon Strength",
            score: 66,
            status: "developing",
            insight: "Solid canon.",
            nextAction: "Add one more canon rule.",
          },
          {
            id: "character_iconicity",
            label: "Character Iconicity",
            score: 67,
            status: "developing",
            insight: "Good recall.",
            nextAction: "Sharpen visual motifs.",
          },
          {
            id: "expansion_depth",
            label: "Expansion Depth",
            score: 61,
            status: "developing",
            insight: "Branch-ready.",
            nextAction: "Add one branch challenge.",
          },
          {
            id: "commercial_surface",
            label: "Commercial Surface",
            score: 62,
            status: "developing",
            insight: "Early merch surface.",
            nextAction: "Repeat emblem motif.",
          },
        ],
        merchConcepts: [
          {
            id: "concept-1",
            title: "Hero Icon Pack",
            rationale: "High recall motif.",
            priority: "high",
          },
        ],
        nextExperiments: ["Launch a 3-page cliffhanger mini arc."],
      },
      merchReport: {
        generatedAt: "2026-02-15T00:00:00.000Z",
        storySlug: "night-rail",
        storyTitle: "Night Rail",
        readinessBand: "pilot_ready",
        overallScore: 63,
        dimensions: {
          iconicity: 65,
          collectibility: 61,
          repeatability: 62,
          channelFit: 64,
        },
        signals: {
          motifSignals: [
            {
              id: "hero_symbol",
              label: "Hero Symbol",
              category: "symbol",
              hits: 4,
              strength: "strong",
              evidence: ["Silver emblem appears on all pages."],
            },
          ],
          quoteSignals: [
            {
              quote: "The rail remembers us.",
              source: "dialogue",
              score: 70,
            },
          ],
          recurringCharacterHooks: ["Kade: anchor around silver emblem."],
        },
        candidates: [
          {
            id: "icon-pack",
            title: "Hero Icon Pack",
            format: "digital_pack",
            rationale: "Turn emblem into sticker pack.",
            confidence: 71,
            effort: "S",
            channelFit: ["x_thread", "instagram_carousel"],
            metric: "Save-to-view ratio",
            target: ">= 12%",
          },
        ],
        detectorNotes: ["Good signal health."],
      },
      sprintObjective: "ship_next_drop",
      horizonDays: 7,
      generatedAt: "2026-02-15T12:00:00.000Z",
    });

    expect(board.roster).toHaveLength(5);
    expect(board.participants.length).toBeGreaterThanOrEqual(2);
    expect(board.roster[0]?.ownerUserId).toBeTruthy();
    expect(board.syncCadence.length).toBeGreaterThan(1);
  });

  it("applies owner overrides and bounds horizon", () => {
    const board = buildCreatorRoleAgentsBoard({
      story: {
        id: "story-2",
        slug: "solo-run",
        title: "Solo Run",
        description: null,
        style: "noir",
        userId: "owner_only",
        usesOwnApiKey: false,
        createdAt: new Date("2026-02-15T00:00:00.000Z"),
        updatedAt: new Date("2026-02-15T00:00:00.000Z"),
      },
      collaborators: [],
      ipReport: {
        generatedAt: "2026-02-15T00:00:00.000Z",
        storySlug: "solo-run",
        storyTitle: "Solo Run",
        band: "concept_only",
        overallScore: 30,
        moatStrengthScore: 28,
        retentionPotentialScore: 35,
        merchabilityScore: 29,
        expansionPotentialScore: 31,
        signals: {
          pageCount: 0,
          characterCount: 0,
          dnaProfileCount: 0,
          lockedCharacterCount: 0,
          timelineBeatCount: 0,
          locationCount: 0,
          canonRuleCount: 0,
          remixCount: 0,
        },
        pillars: [
          {
            id: "canon_strength",
            label: "Canon Strength",
            score: 20,
            status: "needs_work",
            insight: "Weak canon.",
            nextAction: "Add canon rules.",
          },
          {
            id: "character_iconicity",
            label: "Character Iconicity",
            score: 20,
            status: "needs_work",
            insight: "Weak characters.",
            nextAction: "Define character DNA.",
          },
          {
            id: "expansion_depth",
            label: "Expansion Depth",
            score: 20,
            status: "needs_work",
            insight: "Weak expansion.",
            nextAction: "Create branch arcs.",
          },
          {
            id: "commercial_surface",
            label: "Commercial Surface",
            score: 20,
            status: "needs_work",
            insight: "Weak merch surface.",
            nextAction: "Add motifs.",
          },
        ],
        merchConcepts: [],
        nextExperiments: ["Start with one short arc."],
      },
      merchReport: {
        generatedAt: "2026-02-15T00:00:00.000Z",
        storySlug: "solo-run",
        storyTitle: "Solo Run",
        readinessBand: "early_concept",
        overallScore: 25,
        dimensions: {
          iconicity: 24,
          collectibility: 20,
          repeatability: 22,
          channelFit: 30,
        },
        signals: {
          motifSignals: [],
          quoteSignals: [],
          recurringCharacterHooks: [],
        },
        candidates: [
          {
            id: "icon-pack",
            title: "Icon Pack",
            format: "digital_pack",
            rationale: "Seed motif test.",
            confidence: 30,
            effort: "S",
            channelFit: ["x_thread"],
            metric: "Save-to-view ratio",
            target: ">= 5%",
          },
        ],
        detectorNotes: ["Need motif recurrence."],
      },
      sprintObjective: "launch_merch_pilot",
      horizonDays: 99,
      ownerOverrides: {
        merch_operator: "owner_only",
      },
      generatedAt: "2026-02-15T12:00:00.000Z",
    });

    expect(board.horizonDays).toBe(30);
    expect(
      board.roster.find((role) => role.id === "merch_operator")?.ownerUserId,
    ).toBe("owner_only");
    expect(board.coordinationRisks.length).toBeGreaterThan(0);
  });
});
