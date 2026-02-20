import { type CharacterDnaProfile, type Page, type Story, type StoryCharacter, type StoryWorld } from "@/lib/schema";
import { type StoryRemixLineage } from "@/lib/db-actions";

export type IpIncubatorBand =
  | "launch_ready"
  | "promising"
  | "early_signal"
  | "concept_only";

export type IpIncubatorPillarStatus = "strong" | "developing" | "needs_work";

export type IpIncubatorPillar = {
  id:
    | "canon_strength"
    | "character_iconicity"
    | "expansion_depth"
    | "commercial_surface";
  label: string;
  score: number;
  status: IpIncubatorPillarStatus;
  insight: string;
  nextAction: string;
};

export type IpIncubatorMerchConcept = {
  id: string;
  title: string;
  rationale: string;
  priority: "high" | "medium" | "low";
};

export type IpIncubatorReport = {
  generatedAt: string;
  storySlug: string;
  storyTitle: string;
  band: IpIncubatorBand;
  overallScore: number;
  moatStrengthScore: number;
  retentionPotentialScore: number;
  merchabilityScore: number;
  expansionPotentialScore: number;
  signals: {
    pageCount: number;
    characterCount: number;
    dnaProfileCount: number;
    lockedCharacterCount: number;
    timelineBeatCount: number;
    locationCount: number;
    canonRuleCount: number;
    remixCount: number;
  };
  pillars: IpIncubatorPillar[];
  merchConcepts: IpIncubatorMerchConcept[];
  nextExperiments: string[];
};

const CLIFFHANGER_TERMS = [
  "cliffhanger",
  "to be continued",
  "suddenly",
  "unknown",
  "secret",
  "mystery",
  "reveal",
  "twist",
];

const COMMERCIAL_KEYWORDS: Array<{
  id: string;
  label: string;
  keywords: string[];
}> = [
  {
    id: "signature-gear",
    label: "Signature Gear",
    keywords: ["mask", "emblem", "armor", "sword", "blade", "gadget", "weapon", "ring"],
  },
  {
    id: "world-sigil",
    label: "World Sigils",
    keywords: ["symbol", "logo", "crest", "banner", "order", "faction", "guild"],
  },
  {
    id: "location-identity",
    label: "Location Identity",
    keywords: ["city", "district", "tower", "academy", "station", "realm", "kingdom"],
  },
];

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(Math.max(value, min), max);
}

function toScore(value: number): number {
  return Math.round(clamp(value));
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function getPillarStatus(score: number): IpIncubatorPillarStatus {
  if (score >= 75) {
    return "strong";
  }
  if (score >= 45) {
    return "developing";
  }
  return "needs_work";
}

function getBand(overallScore: number): IpIncubatorBand {
  if (overallScore >= 82) {
    return "launch_ready";
  }
  if (overallScore >= 62) {
    return "promising";
  }
  if (overallScore >= 42) {
    return "early_signal";
  }
  return "concept_only";
}

function calculateCharacterDepthScore({
  characters,
  characterDnaProfiles,
}: {
  characters: StoryCharacter[];
  characterDnaProfiles: CharacterDnaProfile[];
}): number {
  if (characters.length === 0) {
    return 20;
  }

  const dnaByCharacterId = new Map(
    characterDnaProfiles.map((profile) => [profile.characterId, profile]),
  );
  const filledCharacterFields = characters.reduce((total, character) => {
    const localFilled = [
      character.role,
      character.appearance,
      character.personality,
      character.speechStyle,
      character.referenceImageUrl,
    ].filter((value) => typeof value === "string" && value.trim().length > 0).length;
    return total + localFilled;
  }, 0);

  const dnaRichness = characters.reduce((total, character) => {
    const profile = dnaByCharacterId.get(character.id);
    if (!profile) {
      return total;
    }
    return (
      total +
      profile.visualTraits.length +
      profile.behaviorTraits.length +
      profile.speechTraits.length
    );
  }, 0);

  const fieldScore = (filledCharacterFields / (characters.length * 5)) * 62;
  const dnaCoverageScore =
    (characterDnaProfiles.length / Math.max(characters.length, 1)) * 24;
  const dnaDepthScore = Math.min(14, dnaRichness * 1.4);

  return toScore(fieldScore + dnaCoverageScore + dnaDepthScore);
}

function calculateWorldDepthScore(world: StoryWorld | null): number {
  if (!world) {
    return 18;
  }

  const timelineScore = Math.min(35, world.timeline.length * 9);
  const locationScore = Math.min(30, world.locations.length * 8);
  const canonScore = Math.min(35, world.canonRules.length * 10);

  return toScore(timelineScore + locationScore + canonScore);
}

function calculateNarrativeMomentumScore({
  pages,
  remixLineage,
}: {
  pages: Page[];
  remixLineage: StoryRemixLineage;
}): number {
  const pageProgress = Math.min(56, pages.length * 8);
  const remixMomentum = Math.min(24, remixLineage.remixCount * 7);
  const corpus = normalizeText(pages.map((page) => page.prompt).join(" "));
  const cliffhangerHits = CLIFFHANGER_TERMS.reduce((total, term) => {
    if (corpus.includes(term)) {
      return total + 1;
    }
    return total;
  }, 0);
  const cliffhangerScore = Math.min(20, cliffhangerHits * 5);

  return toScore(pageProgress + remixMomentum + cliffhangerScore);
}

function calculateCommercialSignalScore({
  pages,
  world,
  characters,
}: {
  pages: Page[];
  world: StoryWorld | null;
  characters: StoryCharacter[];
}): {
  score: number;
  keywordHits: Array<{ id: string; label: string; hits: number }>;
} {
  const corpus = normalizeText(
    [
      ...pages.map((page) => page.prompt),
      ...(world?.canonRules ?? []),
      ...(world?.locations.map((location) => location.name) ?? []),
      ...characters.map((character) => `${character.name} ${character.appearance ?? ""}`),
    ].join(" "),
  );

  const keywordHits = COMMERCIAL_KEYWORDS.map((group) => {
    const hits = group.keywords.reduce((count, keyword) => {
      if (corpus.includes(keyword)) {
        return count + 1;
      }
      return count;
    }, 0);
    return {
      id: group.id,
      label: group.label,
      hits,
    };
  });

  const totalHits = keywordHits.reduce((total, group) => total + group.hits, 0);
  const signalScore = Math.min(66, totalHits * 8);
  const characterAnchorScore = Math.min(20, characters.length * 4);
  const loreAnchorScore = Math.min(
    14,
    ((world?.locations.length ?? 0) + (world?.canonRules.length ?? 0)) * 1.8,
  );

  return {
    score: toScore(signalScore + characterAnchorScore + loreAnchorScore),
    keywordHits,
  };
}

function createMerchConcepts({
  story,
  characters,
  keywordHits,
}: {
  story: Story;
  characters: StoryCharacter[];
  keywordHits: Array<{ id: string; label: string; hits: number }>;
}): IpIncubatorMerchConcept[] {
  const lead = characters[0]?.name?.trim() || "Lead Hero";
  const support = characters[1]?.name?.trim() || "Rival";
  const dominantSignal = [...keywordHits].sort((left, right) => right.hits - left.hits)[0];

  const concepts: IpIncubatorMerchConcept[] = [
    {
      id: "character-duo-pack",
      title: `${lead} / ${support} Character Duo Pack`,
      rationale:
        "Package the strongest character relationship as collectible cards, posters, and creator commentary drops.",
      priority: "high",
    },
    {
      id: "sigil-capsule",
      title: `${story.title} Sigil Capsule`,
      rationale:
        "Translate recurring faction or world symbols into wearable/iconic visual assets.",
      priority: dominantSignal?.hits && dominantSignal.hits >= 2 ? "high" : "medium",
    },
    {
      id: "scene-prop-drop",
      title: "Scene Prop Replica Drop",
      rationale:
        "Use panel-level props or gadgets as limited-run physical/digital merch anchors.",
      priority: "medium",
    },
    {
      id: "collector-lore-file",
      title: "Collector Lore File",
      rationale:
        "Ship timeline/canon cards tied to arc milestones to turn continuity into a collectible loop.",
      priority: "low",
    },
  ];

  return concepts;
}

function buildNextExperiments({
  characterScore,
  worldScore,
  momentumScore,
  commercialScore,
}: {
  characterScore: number;
  worldScore: number;
  momentumScore: number;
  commercialScore: number;
}): string[] {
  const experiments: string[] = [];

  if (characterScore < 65) {
    experiments.push(
      "Lock a protagonist voice bible: add signature phrases, speech rhythm, and two non-negotiable visual traits.",
    );
  }
  if (worldScore < 60) {
    experiments.push(
      "Expand canon scaffold: add 3 timeline beats, 2 locations, and one explicit world rule before next arc.",
    );
  }
  if (momentumScore < 58) {
    experiments.push(
      "Publish a 3-page cliffhanger micro-arc this week to improve binge continuation and remix pull.",
    );
  }
  if (commercialScore < 58) {
    experiments.push(
      "Design one merch test pack (hero emblem + key prop + quote card) and attach to next publish bundle.",
    );
  }

  if (experiments.length === 0) {
    experiments.push(
      "Run a monetization pilot: launch one collectible drop and one branch challenge tied to the current arc.",
    );
  }

  return experiments.slice(0, 4);
}

export function buildIpIncubatorReport({
  story,
  pages,
  world,
  characters,
  characterDnaProfiles,
  remixLineage,
  generatedAt = new Date().toISOString(),
}: {
  story: Story;
  pages: Page[];
  world: StoryWorld | null;
  characters: StoryCharacter[];
  characterDnaProfiles: CharacterDnaProfile[];
  remixLineage: StoryRemixLineage;
  generatedAt?: string;
}): IpIncubatorReport {
  const characterScore = calculateCharacterDepthScore({
    characters,
    characterDnaProfiles,
  });
  const worldScore = calculateWorldDepthScore(world);
  const momentumScore = calculateNarrativeMomentumScore({
    pages,
    remixLineage,
  });
  const commercialSignals = calculateCommercialSignalScore({
    pages,
    world,
    characters,
  });

  const moatStrengthScore = toScore(characterScore * 0.35 + worldScore * 0.4 + momentumScore * 0.25);
  const retentionPotentialScore = toScore(momentumScore * 0.6 + characterScore * 0.25 + worldScore * 0.15);
  const merchabilityScore = toScore(commercialSignals.score * 0.7 + characterScore * 0.2 + worldScore * 0.1);
  const expansionPotentialScore = toScore(worldScore * 0.5 + momentumScore * 0.35 + commercialSignals.score * 0.15);
  const overallScore = toScore(
    moatStrengthScore * 0.35 +
      retentionPotentialScore * 0.25 +
      merchabilityScore * 0.2 +
      expansionPotentialScore * 0.2,
  );

  const pillars: IpIncubatorPillar[] = [
    {
      id: "canon_strength",
      label: "Canon Strength",
      score: worldScore,
      status: getPillarStatus(worldScore),
      insight:
        worldScore >= 70
          ? "World canon is coherent enough for long-form franchise continuity."
          : "Canon foundation exists but needs richer timeline/location scaffolding.",
      nextAction:
        worldScore >= 70
          ? "Promote canon snippets into your publish kits to train audience memory."
          : "Add at least 2 more canon rules and 1 location anchor before next arc.",
    },
    {
      id: "character_iconicity",
      label: "Character Iconicity",
      score: characterScore,
      status: getPillarStatus(characterScore),
      insight:
        characterScore >= 70
          ? "Character identity is strong and repeatable across arcs."
          : "Characters need sharper visual/speech anchors for stronger recall.",
      nextAction:
        characterScore >= 70
          ? "Package your top duo into recurring spotlight prompts."
          : "Strengthen hero DNA locks and define one signature visual motif per lead.",
    },
    {
      id: "expansion_depth",
      label: "Expansion Depth",
      score: expansionPotentialScore,
      status: getPillarStatus(expansionPotentialScore),
      insight:
        expansionPotentialScore >= 70
          ? "Story branch potential is high for spin-offs and side arcs."
          : "Expansion paths exist but branch stakes need sharper escalation.",
      nextAction:
        expansionPotentialScore >= 70
          ? "Launch a spin-off branch prompt in the universe panel."
          : "Add unresolved faction or mystery hooks into the next two pages.",
    },
    {
      id: "commercial_surface",
      label: "Commercial Surface",
      score: merchabilityScore,
      status: getPillarStatus(merchabilityScore),
      insight:
        merchabilityScore >= 70
          ? "Narrative has enough visual anchors for early merch tests."
          : "Merch-ready motifs are emerging but not yet dominant.",
      nextAction:
        merchabilityScore >= 70
          ? "Run one emblem/prop drop with a creator-note launch post."
          : "Seed repeated symbols, props, and catchphrases in the next arc.",
    },
  ];

  return {
    generatedAt,
    storySlug: story.slug,
    storyTitle: story.title,
    band: getBand(overallScore),
    overallScore,
    moatStrengthScore,
    retentionPotentialScore,
    merchabilityScore,
    expansionPotentialScore,
    signals: {
      pageCount: pages.length,
      characterCount: characters.length,
      dnaProfileCount: characterDnaProfiles.length,
      lockedCharacterCount: characters.filter((character) => character.isLocked).length,
      timelineBeatCount: world?.timeline.length ?? 0,
      locationCount: world?.locations.length ?? 0,
      canonRuleCount: world?.canonRules.length ?? 0,
      remixCount: remixLineage.remixCount,
    },
    pillars,
    merchConcepts: createMerchConcepts({
      story,
      characters,
      keywordHits: commercialSignals.keywordHits,
    }),
    nextExperiments: buildNextExperiments({
      characterScore,
      worldScore,
      momentumScore,
      commercialScore: commercialSignals.score,
    }),
  };
}
