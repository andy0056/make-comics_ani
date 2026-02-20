import { type CharacterDnaProfile, type Page, type Story, type StoryCharacter, type StoryWorld } from "@/lib/schema";
import { type StoryRemixLineage } from "@/lib/db-actions";
import { type DistributionChannel, DISTRIBUTION_CHANNELS } from "@/lib/publishing-distribution";

export type MerchabilityReadinessBand =
  | "market_ready"
  | "pilot_ready"
  | "emerging"
  | "early_concept";

export type MerchExperimentObjective =
  | "validate_demand"
  | "collect_feedback"
  | "preorder_signal";

export type MerchExperimentBudgetTier = "low" | "medium" | "high";

export type MerchSignalStrength = "strong" | "moderate" | "weak";

export type MerchMotifSignal = {
  id: string;
  label: string;
  category: "symbol" | "prop" | "location" | "phrase";
  hits: number;
  strength: MerchSignalStrength;
  evidence: string[];
};

export type MerchQuoteSignal = {
  quote: string;
  source: "dialogue" | "narration";
  score: number;
};

export type MerchabilityCandidate = {
  id: string;
  title: string;
  format: "digital_pack" | "print_drop" | "wearable" | "collector_bundle";
  rationale: string;
  confidence: number;
  effort: "S" | "M" | "L";
  channelFit: DistributionChannel[];
  metric: string;
  target: string;
};

export type MerchabilityDetectorReport = {
  generatedAt: string;
  storySlug: string;
  storyTitle: string;
  readinessBand: MerchabilityReadinessBand;
  overallScore: number;
  dimensions: {
    iconicity: number;
    collectibility: number;
    repeatability: number;
    channelFit: number;
  };
  signals: {
    motifSignals: MerchMotifSignal[];
    quoteSignals: MerchQuoteSignal[];
    recurringCharacterHooks: string[];
  };
  candidates: MerchabilityCandidate[];
  detectorNotes: string[];
};

export type MerchExperimentPlanPhase = {
  phase: "prep" | "launch" | "learn";
  window: string;
  actions: string[];
};

export type MerchExperimentPlan = {
  generatedAt: string;
  storySlug: string;
  candidateId: string;
  title: string;
  objective: MerchExperimentObjective;
  budgetTier: MerchExperimentBudgetTier;
  durationDays: number;
  selectedChannels: DistributionChannel[];
  hypothesis: string;
  primaryMetric: {
    name: string;
    target: string;
  };
  supportMetrics: string[];
  assetChecklist: string[];
  phases: MerchExperimentPlanPhase[];
  riskControls: string[];
  successDecisionRule: string;
};

const MOTIF_GROUPS: Array<{
  id: string;
  label: string;
  category: MerchMotifSignal["category"];
  keywords: string[];
}> = [
  {
    id: "hero_symbol",
    label: "Hero Symbol",
    category: "symbol",
    keywords: ["emblem", "symbol", "sigil", "crest", "logo"],
  },
  {
    id: "signature_prop",
    label: "Signature Prop",
    category: "prop",
    keywords: ["mask", "blade", "sword", "ring", "gadget", "helmet", "cloak"],
  },
  {
    id: "location_icon",
    label: "Location Icon",
    category: "location",
    keywords: ["tower", "district", "city", "realm", "station", "academy"],
  },
  {
    id: "catchphrase",
    label: "Catchphrase Potential",
    category: "phrase",
    keywords: ["always", "never", "rise", "remember", "oath", "legend"],
  },
];

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(Math.max(value, min), max);
}

function score(value: number): number {
  return Math.round(clamp(value));
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function toStrength(hits: number): MerchSignalStrength {
  if (hits >= 4) {
    return "strong";
  }
  if (hits >= 2) {
    return "moderate";
  }
  return "weak";
}

function countKeywordHits(corpus: string, keyword: string): number {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`\\b${escaped}\\b`, "g");
  return (corpus.match(regex) ?? []).length;
}

function extractEvidenceSnippets(pages: Page[], keywords: string[]): string[] {
  const snippets: string[] = [];

  for (const page of pages) {
    const prompt = page.prompt.trim();
    const normalizedPrompt = normalizeText(prompt);
    if (!keywords.some((keyword) => normalizedPrompt.includes(keyword))) {
      continue;
    }
    snippets.push(prompt.length > 120 ? `${prompt.slice(0, 117)}...` : prompt);
    if (snippets.length >= 2) {
      break;
    }
  }

  return snippets;
}

function extractQuoteSignals(pages: Page[]): MerchQuoteSignal[] {
  const quotes: MerchQuoteSignal[] = [];

  for (const page of pages) {
    const matches = page.prompt.match(/"([^"]{8,120})"/g) ?? [];
    for (const match of matches) {
      const quote = match.replace(/^"|"$/g, "").trim();
      if (!quote) {
        continue;
      }
      quotes.push({
        quote,
        source: "dialogue",
        score: Math.min(100, 50 + quote.split(/\s+/).length * 4),
      });
      if (quotes.length >= 6) {
        break;
      }
    }
    if (quotes.length >= 6) {
      break;
    }
  }

  if (quotes.length > 0) {
    return quotes.sort((left, right) => right.score - left.score).slice(0, 4);
  }

  const fallbacks = pages
    .map((page) => page.prompt.trim())
    .filter((prompt) => prompt.length > 0)
    .slice(0, 2)
    .map((prompt) => ({
      quote: prompt.length > 80 ? `${prompt.slice(0, 77)}...` : prompt,
      source: "narration" as const,
      score: 42,
    }));

  return fallbacks;
}

function getBand(overallScore: number): MerchabilityReadinessBand {
  if (overallScore >= 80) {
    return "market_ready";
  }
  if (overallScore >= 62) {
    return "pilot_ready";
  }
  if (overallScore >= 42) {
    return "emerging";
  }
  return "early_concept";
}

function estimateChannelFit({
  story,
  pages,
  motifSignals,
}: {
  story: Story;
  pages: Page[];
  motifSignals: MerchMotifSignal[];
}): number {
  const styleBonus = story.style === "noir" || story.style === "manga" ? 14 : 8;
  const motifBonus = Math.min(
    42,
    motifSignals.reduce((total, signal) => total + signal.hits * 3, 0),
  );
  const cadenceBonus = Math.min(24, pages.length * 4);
  const diversityBonus = Math.min(
    20,
    new Set(motifSignals.filter((signal) => signal.hits > 0).map((signal) => signal.category)).size * 6,
  );

  return score(styleBonus + motifBonus + cadenceBonus + diversityBonus);
}

function buildRecurringCharacterHooks({
  characters,
  characterDnaProfiles,
}: {
  characters: StoryCharacter[];
  characterDnaProfiles: CharacterDnaProfile[];
}): string[] {
  const dnaByCharacterId = new Map(
    characterDnaProfiles.map((profile) => [profile.characterId, profile]),
  );

  const hooks = characters
    .slice(0, 4)
    .map((character) => {
      const profile = dnaByCharacterId.get(character.id);
      const trait =
        profile?.visualTraits[0] ||
        character.appearance ||
        character.role ||
        "recognizable silhouette";
      return `${character.name}: anchor around ${trait.toLowerCase()}.`;
    });

  if (hooks.length > 0) {
    return hooks;
  }

  return ["Define one lead character visual anchor before running merch tests."];
}

function buildCandidates({
  story,
  motifs,
  quotes,
  characterHooks,
  overallScore,
  channelFitScore,
}: {
  story: Story;
  motifs: MerchMotifSignal[];
  quotes: MerchQuoteSignal[];
  characterHooks: string[];
  overallScore: number;
  channelFitScore: number;
}): MerchabilityCandidate[] {
  const topMotif = motifs.find((motif) => motif.hits > 0) ?? motifs[0];
  const topQuote = quotes[0]?.quote ?? `"${story.title}"`;
  const topHook = characterHooks[0] ?? "Lead character hook";

  const baseChannels =
    channelFitScore >= 70
      ? [...DISTRIBUTION_CHANNELS]
      : (["instagram_carousel", "x_thread"] as DistributionChannel[]);

  return [
    {
      id: "icon-pack",
      title: `${topMotif.label} Icon Pack`,
      format: "digital_pack",
      rationale: `Turn ${topMotif.label.toLowerCase()} into stickers/wallpapers and test repeat saves.`,
      confidence: score(overallScore * 0.82),
      effort: "S",
      channelFit: baseChannels,
      metric: "Save-to-view ratio",
      target: ">= 12% saves on launch post",
    },
    {
      id: "quote-print",
      title: "Quote Card Print Drop",
      format: "print_drop",
      rationale: `Use high-recall line ${topQuote} as a limited print experiment.`,
      confidence: score(overallScore * 0.76),
      effort: "M",
      channelFit: ["instagram_carousel", "newsletter_blurb"],
      metric: "Preorder intent",
      target: ">= 5% click-to-waitlist",
    },
    {
      id: "hero-wearable",
      title: "Hero Wearable Capsule",
      format: "wearable",
      rationale: `Anchor wearable concept with character identity: ${topHook}`,
      confidence: score(overallScore * 0.68),
      effort: "L",
      channelFit: ["x_thread", "instagram_carousel", "linkedin_post"],
      metric: "Comment demand signal",
      target: ">= 25 qualified demand comments",
    },
    {
      id: "collector-bundle",
      title: "Collector Bundle Pilot",
      format: "collector_bundle",
      rationale: "Bundle lore cards + quote card + emblem art to test bundled willingness-to-pay.",
      confidence: score(overallScore * 0.72),
      effort: "M",
      channelFit: ["newsletter_blurb", "x_thread"],
      metric: "Bundle reservation rate",
      target: ">= 8% reservation",
    },
  ];
}

export function buildAdvancedMerchabilityDetectorReport({
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
}): MerchabilityDetectorReport {
  const corpus = normalizeText(
    [
      ...pages.map((page) => page.prompt),
      ...(world?.canonRules ?? []),
      ...(world?.locations.map((location) => `${location.name} ${location.description ?? ""}`) ?? []),
      ...characters.map(
        (character) => `${character.name} ${character.appearance ?? ""} ${character.speechStyle ?? ""}`,
      ),
    ].join(" "),
  );

  const motifSignals: MerchMotifSignal[] = MOTIF_GROUPS.map((group) => {
    const hits = group.keywords.reduce(
      (total, keyword) => total + countKeywordHits(corpus, normalizeText(keyword)),
      0,
    );

    return {
      id: group.id,
      label: group.label,
      category: group.category,
      hits,
      strength: toStrength(hits),
      evidence: extractEvidenceSnippets(pages, group.keywords.map((keyword) => normalizeText(keyword))),
    };
  }).sort((left, right) => right.hits - left.hits);

  const quotes = extractQuoteSignals(pages);
  const characterHooks = buildRecurringCharacterHooks({
    characters,
    characterDnaProfiles,
  });

  const iconicityScore = score(
    motifSignals.reduce((total, motif) => total + motif.hits * 8, 0) +
      Math.min(28, characterHooks.length * 8),
  );
  const collectibilityScore = score(
    Math.min(54, quotes.reduce((total, quote) => total + quote.score * 0.12, 0)) +
      Math.min(24, motifSignals.filter((motif) => motif.hits >= 2).length * 8) +
      Math.min(22, remixLineage.remixCount * 6),
  );
  const repeatabilityScore = score(
    Math.min(40, pages.length * 5) +
      Math.min(36, motifSignals[0]?.hits ? motifSignals[0].hits * 6 : 0) +
      Math.min(24, (world?.canonRules.length ?? 0) * 6),
  );
  const channelFitScore = estimateChannelFit({
    story,
    pages,
    motifSignals,
  });

  const overallScore = score(
    iconicityScore * 0.33 +
      collectibilityScore * 0.27 +
      repeatabilityScore * 0.2 +
      channelFitScore * 0.2,
  );

  const candidates = buildCandidates({
    story,
    motifs: motifSignals,
    quotes,
    characterHooks,
    overallScore,
    channelFitScore,
  });

  const detectorNotes: string[] = [];
  if (motifSignals.filter((signal) => signal.hits >= 2).length < 2) {
    detectorNotes.push(
      "Low motif recurrence: repeat 1-2 symbols/props across upcoming pages before large merch tests.",
    );
  }
  if (quotes.length === 0) {
    detectorNotes.push(
      "No quote anchors detected: add at least one memorable short line per page for quote-card potential.",
    );
  }
  if (characters.length < 2) {
    detectorNotes.push(
      "Character surface is narrow: add a rival/ally dynamic to expand collectible combinations.",
    );
  }
  if (detectorNotes.length === 0) {
    detectorNotes.push(
      "Signal quality is healthy: run one low-risk merch pilot this sprint and compare against baseline engagement.",
    );
  }

  return {
    generatedAt,
    storySlug: story.slug,
    storyTitle: story.title,
    readinessBand: getBand(overallScore),
    overallScore,
    dimensions: {
      iconicity: iconicityScore,
      collectibility: collectibilityScore,
      repeatability: repeatabilityScore,
      channelFit: channelFitScore,
    },
    signals: {
      motifSignals: motifSignals.slice(0, 4),
      quoteSignals: quotes,
      recurringCharacterHooks: characterHooks,
    },
    candidates,
    detectorNotes,
  };
}

function chooseChannels({
  requested,
  candidate,
}: {
  requested: DistributionChannel[] | undefined;
  candidate: MerchabilityCandidate;
}): DistributionChannel[] {
  if (requested && requested.length > 0) {
    return requested;
  }
  return candidate.channelFit.slice(0, 3);
}

function buildBudgetChecklist(
  budgetTier: MerchExperimentBudgetTier,
  candidate: MerchabilityCandidate,
): string[] {
  const common = [
    `Create a one-page concept brief for ${candidate.title}.`,
    "Prepare 2 creative variants for A/B testing.",
    "Define clear CTA and destination link before launch.",
  ];

  if (budgetTier === "low") {
    return [...common, "Use in-house art variants and zero-paid distribution for first run."];
  }

  if (budgetTier === "medium") {
    return [
      ...common,
      "Allocate a small paid boost to top-performing channel in first 24 hours.",
      "Create a lightweight waitlist capture landing block.",
    ];
  }

  return [
    ...common,
    "Commission a polished hero creative and backup variant.",
    "Allocate paid distribution budget across 2 channels with holdout cohort.",
    "Set up post-run customer interview capture (5-10 respondents).",
  ];
}

function objectiveLabel(objective: MerchExperimentObjective): string {
  switch (objective) {
    case "validate_demand":
      return "validate market demand";
    case "collect_feedback":
      return "collect creator-community feedback";
    case "preorder_signal":
      return "test preorder willingness";
    default:
      return "run a merch pilot";
  }
}

export function buildMerchExperimentPlan({
  report,
  candidateId,
  objective,
  budgetTier,
  durationDays,
  channels,
  generatedAt = new Date().toISOString(),
}: {
  report: MerchabilityDetectorReport;
  candidateId?: string;
  objective: MerchExperimentObjective;
  budgetTier: MerchExperimentBudgetTier;
  durationDays: number;
  channels?: DistributionChannel[];
  generatedAt?: string;
}): MerchExperimentPlan {
  const selectedCandidate =
    report.candidates.find((candidate) => candidate.id === candidateId) ??
    report.candidates[0];

  if (!selectedCandidate) {
    throw new Error("No merch experiment candidates available for planning.");
  }

  const boundedDuration = Math.min(Math.max(durationDays, 3), 30);
  const selectedChannels = chooseChannels({
    requested: channels,
    candidate: selectedCandidate,
  });

  const prepDays = Math.max(1, Math.round(boundedDuration * 0.35));
  const launchDays = Math.max(1, Math.round(boundedDuration * 0.35));

  return {
    generatedAt,
    storySlug: report.storySlug,
    candidateId: selectedCandidate.id,
    title: `${selectedCandidate.title} Experiment Plan`,
    objective,
    budgetTier,
    durationDays: boundedDuration,
    selectedChannels,
    hypothesis: `If we ${objectiveLabel(objective)} with ${selectedCandidate.title.toLowerCase()}, then ${selectedCandidate.metric.toLowerCase()} should reach ${selectedCandidate.target}.`,
    primaryMetric: {
      name: selectedCandidate.metric,
      target: selectedCandidate.target,
    },
    supportMetrics: [
      "Unique visitors to merch CTA",
      "Comment quality signal (intent-focused comments)",
      "Return engagement within 7 days",
    ],
    assetChecklist: buildBudgetChecklist(budgetTier, selectedCandidate),
    phases: [
      {
        phase: "prep",
        window: `Day 1-${prepDays}`,
        actions: [
          "Lock concept variant A/B and final CTA.",
          "Prepare tracking links and baseline dashboard.",
          "Validate rendering/format quality across selected channels.",
        ],
      },
      {
        phase: "launch",
        window: `Day ${prepDays + 1}-${prepDays + launchDays}`,
        actions: [
          "Launch on selected channels in 2 timed waves.",
          "Capture early signals at +6h and +24h.",
          "Promote best-performing variant only after first checkpoint.",
        ],
      },
      {
        phase: "learn",
        window: `Day ${prepDays + launchDays + 1}-${boundedDuration}`,
        actions: [
          "Analyze conversion funnel and drop-off points.",
          "Document audience objections and requested variants.",
          "Decide scale, iterate, or archive using decision rule.",
        ],
      },
    ],
    riskControls: [
      "Do not scale spend until primary metric passes 50% of target in first launch wave.",
      "Pause experiment if negative feedback rate exceeds 20% of merch-intent comments.",
      "Keep creative scope fixed during active run to preserve metric integrity.",
    ],
    successDecisionRule:
      "Scale only if primary metric target is met and at least one support metric improves by >=15% over baseline.",
  };
}
