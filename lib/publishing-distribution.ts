import { type Page, type Story } from "@/lib/schema";

export const DISTRIBUTION_CHANNELS = [
  "x_thread",
  "instagram_carousel",
  "linkedin_post",
  "newsletter_blurb",
] as const;

export const STYLE_MORPH_MODES = ["subtle", "balanced", "bold"] as const;

export const EMOTION_LOCK_PROFILES = [
  "none",
  "suspense",
  "heroic",
  "heartfelt",
  "comedic",
] as const;

export type DistributionChannel = (typeof DISTRIBUTION_CHANNELS)[number];
export type DistributionTone = "cinematic" | "hype" | "educational";
export type StyleMorphMode = (typeof STYLE_MORPH_MODES)[number];
export type EmotionLockProfile = (typeof EMOTION_LOCK_PROFILES)[number];

export type StyleMorphTimelinePoint = {
  pageNumber: number;
  sourceStyle: string;
  evolvedStyle: string;
  direction: "hold" | "pivot" | "escalate";
  emphasis: string;
  promptSnippet: string;
};

export type ChannelPublishingPack = {
  channel: DistributionChannel;
  label: string;
  goal: string;
  primaryCaption: string;
  shortCaption: string;
  emotionLockedPrimaryCaption: string;
  emotionLockedShortCaption: string;
  emotionDirective: string;
  hashtags: string[];
  postSequence: string[];
  styleTimelinePostLine: string;
  callToAction: string;
};

export type StoryPublishingPack = {
  storySlug: string;
  storyTitle: string;
  style: string;
  styleMorphMode: StyleMorphMode;
  styleMorphSummary: string;
  styleMorphTimeline: StyleMorphTimelinePoint[];
  emotionLock: EmotionLockProfile;
  emotionLexicon: string[];
  pageCount: number;
  coverImageUrl: string;
  assetUrls: string[];
  storyHook: string;
  logline: string;
  baseHashtags: string[];
  channels: ChannelPublishingPack[];
  markdownKit: string;
  generatedAt: string;
};

const CHANNEL_LABELS: Record<DistributionChannel, string> = {
  x_thread: "X Thread",
  instagram_carousel: "Instagram Carousel",
  linkedin_post: "LinkedIn Post",
  newsletter_blurb: "Newsletter Blurb",
};

const BASE_STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "for",
  "from",
  "with",
  "that",
  "this",
  "your",
  "their",
  "they",
  "them",
  "then",
  "into",
  "onto",
  "about",
  "because",
  "while",
  "where",
  "when",
  "over",
  "under",
  "after",
  "before",
  "hero",
  "comic",
  "story",
]);

const STYLE_KEYWORDS: Array<{ label: string; keywords: string[] }> = [
  { label: "Noir", keywords: ["noir", "detective", "shadow", "smoke", "alley"] },
  { label: "Manga", keywords: ["manga", "shonen", "anime", "speed lines"] },
  { label: "Vintage", keywords: ["vintage", "retro", "halftone", "classic"] },
  { label: "Sci-Fi", keywords: ["neon", "cyber", "android", "spaceship", "future"] },
  { label: "Fantasy", keywords: ["dragon", "magic", "sorcer", "kingdom", "myth"] },
  { label: "Horror", keywords: ["horror", "haunt", "blood", "nightmare", "fear"] },
  { label: "Adventure", keywords: ["quest", "expedition", "jungle", "treasure"] },
  { label: "Comedy", keywords: ["comedy", "joke", "laugh", "funny", "chaos"] },
];

const EMOTION_PROFILES: Record<
  Exclude<EmotionLockProfile, "none">,
  {
    directive: string;
    lexicon: string[];
    ctaHint: string;
  }
> = {
  suspense: {
    directive: "Keep uncertainty high and end on a cliffhanger beat.",
    lexicon: ["tense", "volatile", "unresolved"],
    ctaHint: "Invite predictions for the next reveal.",
  },
  heroic: {
    directive: "Frame the protagonist as proactive and mission-driven.",
    lexicon: ["defiant", "driven", "rallying"],
    ctaHint: "Ask who the audience would back in the final showdown.",
  },
  heartfelt: {
    directive: "Prioritize emotional stakes and relational turning points.",
    lexicon: ["vulnerable", "intimate", "hopeful"],
    ctaHint: "Ask readers which moment felt most human.",
  },
  comedic: {
    directive: "Lean into playful rhythm, irony, and high-contrast punchlines.",
    lexicon: ["chaotic", "witty", "playful"],
    ctaHint: "Prompt readers to vote for the funniest panel.",
  },
};

function toSentence(value: string): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) {
    return "";
  }

  if (/[.!?]$/.test(trimmed)) {
    return trimmed;
  }

  return `${trimmed}.`;
}

function summarizePrompt(prompt: string | null | undefined, fallback: string): string {
  if (!prompt) {
    return fallback;
  }

  const normalized = prompt.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return fallback;
  }

  if (normalized.length <= 160) {
    return toSentence(normalized);
  }

  return toSentence(`${normalized.slice(0, 157).trim()}...`);
}

function sentenceCaseToken(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function toTitleCaseWords(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function extractThemeHashtags(
  prompts: string[],
  style: string,
  emotionLock: EmotionLockProfile,
): string[] {
  const frequency = new Map<string, number>();

  for (const prompt of prompts) {
    const tokens = prompt
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 4 && !BASE_STOP_WORDS.has(token));

    for (const token of tokens) {
      frequency.set(token, (frequency.get(token) ?? 0) + 1);
    }
  }

  const dynamic = [...frequency.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([token]) => `#${sentenceCaseToken(token)}`);

  const base = [
    "#KaBoom",
    "#AICreator",
    `#${sentenceCaseToken(style || "ComicStyle")}`,
  ];

  if (emotionLock !== "none") {
    base.push(`#${sentenceCaseToken(emotionLock)}Tone`);
  }

  return [...new Set([...base, ...dynamic])].slice(0, 8);
}

function buildTonePrefix(tone: DistributionTone): string {
  if (tone === "hype") {
    return "Big energy update:";
  }

  if (tone === "educational") {
    return "Creator note:";
  }

  return "New comic drop:";
}

function resolveEmotionProfile(emotionLock: EmotionLockProfile) {
  if (emotionLock === "none") {
    return {
      directive: "Keep delivery balanced across action, clarity, and pacing.",
      lexicon: ["balanced", "focused", "clear"],
      ctaHint: "Ask which beat should expand next.",
    };
  }

  return EMOTION_PROFILES[emotionLock];
}

function applyEmotionToCaption({
  caption,
  shortCaption,
  emotionLock,
  storyTitle,
}: {
  caption: string;
  shortCaption: string;
  emotionLock: EmotionLockProfile;
  storyTitle: string;
}) {
  if (emotionLock === "none") {
    return {
      primary: caption,
      short: shortCaption,
    };
  }

  const profile = resolveEmotionProfile(emotionLock);
  const lexiconLine = profile.lexicon.join(" / ");

  return {
    primary: `${caption}\n\nEmotion lock (${emotionLock}): ${profile.directive}\nKeywords: ${lexiconLine}`,
    short: `${toTitleCaseWords(emotionLock)} cut - ${storyTitle}: ${shortCaption}`,
  };
}

function detectPromptStyle(prompt: string, fallbackStyle: string): string {
  const normalized = prompt.toLowerCase();
  for (const signal of STYLE_KEYWORDS) {
    if (signal.keywords.some((keyword) => normalized.includes(keyword))) {
      return signal.label;
    }
  }

  return toTitleCaseWords(fallbackStyle || "comic");
}

function styleMorphEmphasis(mode: StyleMorphMode, direction: StyleMorphTimelinePoint["direction"]): string {
  if (mode === "subtle") {
    if (direction === "hold") {
      return "Maintain visual continuity with slight line-weight variation.";
    }
    return "Introduce a light style pivot while preserving core framing.";
  }

  if (mode === "bold") {
    if (direction === "hold") {
      return "Intensify contrast and texture without changing style family.";
    }
    if (direction === "escalate") {
      return "Execute a high-contrast style escalation for maximum impact.";
    }
    return "Pivot clearly into a new style silhouette and palette mood.";
  }

  if (direction === "hold") {
    return "Keep the current visual language and raise scene clarity.";
  }

  return "Shift style deliberately while preserving character identity anchors.";
}

function buildStyleMorphTimeline({
  generatedPages,
  baseStyle,
  mode,
}: {
  generatedPages: Array<{ pageNumber: number; prompt: string }>;
  baseStyle: string;
  mode: StyleMorphMode;
}): StyleMorphTimelinePoint[] {
  const baseline = toTitleCaseWords(baseStyle || "comic");
  let previousStyle = baseline;

  return generatedPages.map((page, index) => {
    const detected = detectPromptStyle(page.prompt, baseline);
    let direction: StyleMorphTimelinePoint["direction"] =
      detected === previousStyle ? "hold" : "pivot";

    if (mode === "bold" && index === generatedPages.length - 1 && direction === "pivot") {
      direction = "escalate";
    }

    const point: StyleMorphTimelinePoint = {
      pageNumber: page.pageNumber,
      sourceStyle: previousStyle,
      evolvedStyle: detected,
      direction,
      emphasis: styleMorphEmphasis(mode, direction),
      promptSnippet: summarizePrompt(page.prompt, "Panel beat.").slice(0, 120),
    };

    previousStyle = detected;
    return point;
  });
}

function buildStyleMorphSummary(
  timeline: StyleMorphTimelinePoint[],
  mode: StyleMorphMode,
): string {
  const first = timeline[0];
  const last = timeline[timeline.length - 1];
  const pivotCount = timeline.filter((point) => point.direction !== "hold").length;

  if (!first || !last) {
    return "No style timeline available.";
  }

  return `${first.evolvedStyle} -> ${last.evolvedStyle} with ${pivotCount} transition${pivotCount === 1 ? "" : "s"} (${mode} morph).`;
}

function buildChannelPack({
  channel,
  storyTitle,
  storyHook,
  logline,
  hashtags,
  storyUrl,
  tone,
  styleMorphSummary,
  emotionLock,
}: {
  channel: DistributionChannel;
  storyTitle: string;
  storyHook: string;
  logline: string;
  hashtags: string[];
  storyUrl: string;
  tone: DistributionTone;
  styleMorphSummary: string;
  emotionLock: EmotionLockProfile;
}): ChannelPublishingPack {
  const hashtagLine = hashtags.join(" ");
  const tonePrefix = buildTonePrefix(tone);
  const emotionProfile = resolveEmotionProfile(emotionLock);
  const styleTimelinePostLine = `Style morph timeline: ${styleMorphSummary}`;

  const withEmotion = (primaryCaption: string, shortCaption: string) =>
    applyEmotionToCaption({
      caption: primaryCaption,
      shortCaption,
      emotionLock,
      storyTitle,
    });

  if (channel === "x_thread") {
    const primaryCaption = `${tonePrefix} ${storyTitle}\n\n${storyHook}\n\nRead + follow the arc: ${storyUrl}\n\n${hashtagLine}`;
    const shortCaption = `${storyTitle}: ${storyHook} ${storyUrl}`;
    const locked = withEmotion(primaryCaption, shortCaption);

    return {
      channel,
      label: CHANNEL_LABELS[channel],
      goal: "Launch a narrative teaser thread and drive profile clicks.",
      primaryCaption,
      shortCaption,
      emotionLockedPrimaryCaption: locked.primary,
      emotionLockedShortCaption: locked.short,
      emotionDirective: emotionProfile.directive,
      hashtags,
      postSequence: [
        `${tonePrefix} ${storyTitle}`,
        `1/ ${storyHook}`,
        `2/ ${logline}`,
        `3/ ${styleTimelinePostLine}`,
        `4/ Full story: ${storyUrl}`,
      ],
      styleTimelinePostLine,
      callToAction: `${emotionProfile.ctaHint} Pin post 1, then reply with page snippets over the next 48 hours.`,
    };
  }

  if (channel === "instagram_carousel") {
    const primaryCaption = `${tonePrefix} ${storyTitle}\n\n${logline}\n\nSwipe through the opening pages, then read the full arc via link in bio (${storyUrl}).\n\n${hashtagLine}`;
    const shortCaption = `${storyTitle} is live. Swipe for the opening pages.`;
    const locked = withEmotion(primaryCaption, shortCaption);

    return {
      channel,
      label: CHANNEL_LABELS[channel],
      goal: "Publish a carousel preview that invites saves/shares.",
      primaryCaption,
      shortCaption,
      emotionLockedPrimaryCaption: locked.primary,
      emotionLockedShortCaption: locked.short,
      emotionDirective: emotionProfile.directive,
      hashtags,
      postSequence: [
        "Slide 1: Cover + title hook",
        "Slide 2: Setup panel with stakes",
        "Slide 3: Conflict escalation",
        `Slide 4: ${styleTimelinePostLine}`,
      ],
      styleTimelinePostLine,
      callToAction: `${emotionProfile.ctaHint} Use first comment for hashtags and ask followers which character they back.`,
    };
  }

  if (channel === "linkedin_post") {
    const primaryCaption = `${tonePrefix} I shipped a new AI comic experiment: ${storyTitle}.\n\n${logline}\n\nWhat worked: tight character continuity + page sequencing.\nWhat I am testing next: reader retention through serialized beats.\n\nPreview: ${storyUrl}\n\n${hashtagLine}`;
    const shortCaption = `Shipped ${storyTitle} and learned a lot about AI-assisted storytelling.`;
    const locked = withEmotion(primaryCaption, shortCaption);

    return {
      channel,
      label: CHANNEL_LABELS[channel],
      goal: "Frame the story as a creator/build journey update.",
      primaryCaption,
      shortCaption,
      emotionLockedPrimaryCaption: locked.primary,
      emotionLockedShortCaption: locked.short,
      emotionDirective: emotionProfile.directive,
      hashtags,
      postSequence: [
        "Opening: what launched + why",
        "Middle: one process insight",
        `Middle 2: ${styleTimelinePostLine}`,
        "Closing: invite creator feedback",
      ],
      styleTimelinePostLine,
      callToAction: `${emotionProfile.ctaHint} End with one specific question to increase comment quality.`,
    };
  }

  const primaryCaption = `${storyTitle}\n\n${logline}\n\n${storyHook}\n\nContinue reading: ${storyUrl}`;
  const shortCaption = `This week in the studio: ${storyTitle}`;
  const locked = withEmotion(primaryCaption, shortCaption);

  return {
    channel,
    label: CHANNEL_LABELS[channel],
    goal: "Seed your newsletter with a serialized comic teaser.",
    primaryCaption,
    shortCaption,
    emotionLockedPrimaryCaption: locked.primary,
    emotionLockedShortCaption: locked.short,
    emotionDirective: emotionProfile.directive,
    hashtags,
    postSequence: [
      "Subject line: [New Comic] {story title}",
      "Opening: one-line premise",
      "Middle: two preview panels + context",
      styleTimelinePostLine,
      "Closing: direct read link",
    ],
    styleTimelinePostLine,
    callToAction: `${emotionProfile.ctaHint} Add a poll asking readers which plotline should expand next week.`,
  };
}

function buildMarkdownKit(pack: StoryPublishingPack): string {
  const lines: string[] = [
    `# Publish Kit - ${pack.storyTitle}`,
    "",
    `Generated: ${pack.generatedAt}`,
    `Story URL: /story/${pack.storySlug}`,
    `Style: ${pack.style}`,
    `Style morph mode: ${pack.styleMorphMode}`,
    `Style morph summary: ${pack.styleMorphSummary}`,
    `Emotion lock: ${pack.emotionLock}`,
    `Pages ready: ${pack.pageCount}`,
    "",
    "## Story Core",
    `- Hook: ${pack.storyHook}`,
    `- Logline: ${pack.logline}`,
    `- Base hashtags: ${pack.baseHashtags.join(" ")}`,
    "",
    "## Style Morph Timeline",
  ];

  pack.styleMorphTimeline.forEach((point) => {
    lines.push(
      `- Page ${point.pageNumber}: ${point.sourceStyle} -> ${point.evolvedStyle} (${point.direction})`,
    );
    lines.push(`  - Emphasis: ${point.emphasis}`);
    lines.push(`  - Prompt cue: ${point.promptSnippet}`);
  });

  lines.push("", "## Assets");

  pack.assetUrls.forEach((assetUrl, index) => {
    lines.push(`- Page ${index + 1}: ${assetUrl}`);
  });

  for (const channel of pack.channels) {
    lines.push("", `## ${channel.label}`);
    lines.push(`Goal: ${channel.goal}`);
    lines.push(`CTA: ${channel.callToAction}`);
    lines.push(`Emotion directive: ${channel.emotionDirective}`);
    lines.push("", "Primary caption:");
    lines.push(channel.primaryCaption);
    lines.push("", "Emotion-locked primary caption:");
    lines.push(channel.emotionLockedPrimaryCaption);
    lines.push("", "Short caption:");
    lines.push(channel.shortCaption);
    lines.push("", "Emotion-locked short caption:");
    lines.push(channel.emotionLockedShortCaption);
    lines.push("", `Hashtags: ${channel.hashtags.join(" ")}`);
    lines.push("", "Sequence:");
    channel.postSequence.forEach((entry, index) => {
      lines.push(`${index + 1}. ${entry}`);
    });
  }

  return lines.join("\n");
}

export function rebuildStoryPublishingPackMarkdown(
  pack: StoryPublishingPack,
): StoryPublishingPack {
  return {
    ...pack,
    markdownKit: buildMarkdownKit(pack),
  };
}

export function buildStoryPublishingPack({
  story,
  pages,
  storyUrl,
  channels = [...DISTRIBUTION_CHANNELS],
  tone = "cinematic",
  styleMorphMode = "balanced",
  emotionLock = "none",
}: {
  story: Story;
  pages: Page[];
  storyUrl?: string;
  channels?: DistributionChannel[];
  tone?: DistributionTone;
  styleMorphMode?: StyleMorphMode;
  emotionLock?: EmotionLockProfile;
}): StoryPublishingPack {
  const generatedPages = pages
    .filter(
      (page) => page.generatedImageUrl && page.generatedImageUrl !== "/placeholder.svg",
    )
    .sort((a, b) => a.pageNumber - b.pageNumber);

  if (generatedPages.length === 0) {
    throw new Error("No generated pages available for publishing");
  }

  const prompts = generatedPages.map((page) => page.prompt || "").filter(Boolean);
  const coverImageUrl = generatedPages[0]?.generatedImageUrl ?? "";
  const assetUrls = generatedPages
    .map((page) => page.generatedImageUrl)
    .filter((value): value is string => Boolean(value));

  const firstPromptSummary = summarizePrompt(
    prompts[0],
    `A ${story.style || "comic"} story with escalating stakes.`,
  );
  const descriptionSummary = summarizePrompt(story.description, firstPromptSummary);
  const storyHook = firstPromptSummary;
  const logline = descriptionSummary;
  const resolvedStoryUrl = storyUrl || `/story/${story.slug}`;
  const styleMorphTimeline = buildStyleMorphTimeline({
    generatedPages: generatedPages.map((page) => ({
      pageNumber: page.pageNumber,
      prompt: page.prompt,
    })),
    baseStyle: story.style || "comic",
    mode: styleMorphMode,
  });
  const styleMorphSummary = buildStyleMorphSummary(styleMorphTimeline, styleMorphMode);

  const baseHashtags = extractThemeHashtags(
    prompts,
    story.style || "comic",
    emotionLock,
  );

  const selectedChannels = channels.filter(
    (channel, index, allChannels) => allChannels.indexOf(channel) === index,
  );

  const channelPacks = selectedChannels.map((channel) =>
    buildChannelPack({
      channel,
      storyTitle: story.title,
      storyHook,
      logline,
      hashtags: baseHashtags,
      storyUrl: resolvedStoryUrl,
      tone,
      styleMorphSummary,
      emotionLock,
    }),
  );

  const emotionProfile = resolveEmotionProfile(emotionLock);
  const pack: StoryPublishingPack = {
    storySlug: story.slug,
    storyTitle: story.title,
    style: story.style,
    styleMorphMode,
    styleMorphSummary,
    styleMorphTimeline,
    emotionLock,
    emotionLexicon: emotionProfile.lexicon,
    pageCount: generatedPages.length,
    coverImageUrl,
    assetUrls,
    storyHook,
    logline,
    baseHashtags,
    channels: channelPacks,
    markdownKit: "",
    generatedAt: new Date().toISOString(),
  };

  return rebuildStoryPublishingPackMarkdown(pack);
}

export type PublishingAutopipelineBundle = {
  bundleVersion: "x3-autopipeline-v1";
  generatedAt: string;
  storySlug: string;
  storyTitle: string;
  metadata: {
    tone: DistributionTone;
    styleMorphMode: StyleMorphMode;
    emotionLock: EmotionLockProfile;
    pageCount: number;
    styleMorphSummary: string;
    storyHook: string;
    logline: string;
  };
  channels: StoryPublishingPack["channels"];
  styleMorphTimeline: StoryPublishingPack["styleMorphTimeline"];
  assets: Array<{
    pageNumber: number;
    imageUrl: string;
    prompt: string;
    characterImageCount: number;
  }>;
  markdownKit: string;
  files: Array<{
    path: string;
    contentType: string;
    content: string;
  }>;
};

export function buildPublishingAutopipelineBundle({
  story,
  pages,
  storyUrl,
  channels = [...DISTRIBUTION_CHANNELS],
  tone = "cinematic",
  styleMorphMode = "balanced",
  emotionLock = "none",
}: {
  story: Story;
  pages: Page[];
  storyUrl?: string;
  channels?: DistributionChannel[];
  tone?: DistributionTone;
  styleMorphMode?: StyleMorphMode;
  emotionLock?: EmotionLockProfile;
}): {
  pack: StoryPublishingPack;
  bundle: PublishingAutopipelineBundle;
} {
  const pack = buildStoryPublishingPack({
    story,
    pages,
    storyUrl,
    channels,
    tone,
    styleMorphMode,
    emotionLock,
  });

  const generatedPages = pages
    .filter(
      (page) => page.generatedImageUrl && page.generatedImageUrl !== "/placeholder.svg",
    )
    .sort((a, b) => a.pageNumber - b.pageNumber);

  const assets = generatedPages
    .map((page) => ({
      pageNumber: page.pageNumber,
      imageUrl: page.generatedImageUrl,
      prompt: page.prompt,
      characterImageCount: page.characterImageUrls.length,
    }))
    .filter(
      (
        asset,
      ): asset is {
        pageNumber: number;
        imageUrl: string;
        prompt: string;
        characterImageCount: number;
      } => Boolean(asset.imageUrl),
    );

  const manifestPayload = {
    storySlug: pack.storySlug,
    storyTitle: pack.storyTitle,
    generatedAt: pack.generatedAt,
    style: pack.style,
    channels: pack.channels.map((channel) => ({
      channel: channel.channel,
      label: channel.label,
      hashtags: channel.hashtags,
    })),
    assets: assets.map((asset) => ({
      pageNumber: asset.pageNumber,
      imageUrl: asset.imageUrl,
    })),
  };

  const channelFileContents = pack.channels.map((channel) => ({
    path: `channels/${channel.channel}.md`,
    contentType: "text/markdown",
    content: [
      `# ${channel.label} - ${pack.storyTitle}`,
      "",
      `Goal: ${channel.goal}`,
      `Emotion directive: ${channel.emotionDirective}`,
      `CTA: ${channel.callToAction}`,
      "",
      "## Primary caption (base)",
      channel.primaryCaption,
      "",
      "## Primary caption (emotion locked)",
      channel.emotionLockedPrimaryCaption,
      "",
      "## Short caption (base)",
      channel.shortCaption,
      "",
      "## Short caption (emotion locked)",
      channel.emotionLockedShortCaption,
      "",
      `Hashtags: ${channel.hashtags.join(" ")}`,
      "",
      "## Sequence",
      ...channel.postSequence.map((entry, index) => `${index + 1}. ${entry}`),
    ].join("\n"),
  }));

  const bundle: PublishingAutopipelineBundle = {
    bundleVersion: "x3-autopipeline-v1",
    generatedAt: pack.generatedAt,
    storySlug: pack.storySlug,
    storyTitle: pack.storyTitle,
    metadata: {
      tone,
      styleMorphMode: pack.styleMorphMode,
      emotionLock: pack.emotionLock,
      pageCount: pack.pageCount,
      styleMorphSummary: pack.styleMorphSummary,
      storyHook: pack.storyHook,
      logline: pack.logline,
    },
    channels: pack.channels,
    styleMorphTimeline: pack.styleMorphTimeline,
    assets,
    markdownKit: pack.markdownKit,
    files: [
      {
        path: "manifest.json",
        contentType: "application/json",
        content: JSON.stringify(manifestPayload, null, 2),
      },
      {
        path: "publish-kit.md",
        contentType: "text/markdown",
        content: pack.markdownKit,
      },
      ...channelFileContents,
    ],
  };

  return { pack, bundle };
}
