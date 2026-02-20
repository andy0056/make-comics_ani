import {
  rebuildStoryPublishingPackMarkdown,
  type ChannelPublishingPack,
  type DistributionChannel,
  type StoryPublishingPack,
} from "@/lib/publishing-distribution";

export type PublishingQualitySeverity = "error" | "warning";

export type PublishingQuickFixAction =
  | "trim_primary_caption"
  | "trim_short_caption"
  | "trim_emotion_primary_caption"
  | "trim_emotion_short_caption"
  | "trim_hashtags"
  | "normalize_hashtags"
  | "ensure_sequence"
  | "ensure_cta";

export type PublishingQualityCheck = {
  id: string;
  label: string;
  passed: boolean;
  severity: PublishingQualitySeverity;
  message: string;
  suggestion?: string;
  fixAction?: PublishingQuickFixAction;
};

export type ChannelPublishingQualityResult = {
  channel: DistributionChannel;
  label: string;
  status: "ready" | "needs_fixes";
  checks: PublishingQualityCheck[];
  blockingIssueCount: number;
  warningCount: number;
};

export type PublishingQualityReport = {
  status: "ready" | "needs_fixes";
  blockingIssueCount: number;
  warningCount: number;
  channelResults: ChannelPublishingQualityResult[];
};

type ChannelQualityRule = {
  primaryCaptionMax: number;
  shortCaptionMax: number;
  emotionPrimaryCaptionMax: number;
  emotionShortCaptionMax: number;
  maxHashtags: number;
  minSequenceSteps: number;
};

const CHANNEL_RULES: Record<DistributionChannel, ChannelQualityRule> = {
  x_thread: {
    primaryCaptionMax: 500,
    shortCaptionMax: 220,
    emotionPrimaryCaptionMax: 620,
    emotionShortCaptionMax: 260,
    maxHashtags: 6,
    minSequenceSteps: 3,
  },
  instagram_carousel: {
    primaryCaptionMax: 2200,
    shortCaptionMax: 240,
    emotionPrimaryCaptionMax: 2600,
    emotionShortCaptionMax: 300,
    maxHashtags: 10,
    minSequenceSteps: 3,
  },
  linkedin_post: {
    primaryCaptionMax: 3000,
    shortCaptionMax: 240,
    emotionPrimaryCaptionMax: 3200,
    emotionShortCaptionMax: 320,
    maxHashtags: 5,
    minSequenceSteps: 3,
  },
  newsletter_blurb: {
    primaryCaptionMax: 4000,
    shortCaptionMax: 280,
    emotionPrimaryCaptionMax: 4200,
    emotionShortCaptionMax: 360,
    maxHashtags: 8,
    minSequenceSteps: 3,
  },
};

function trimTextToMaxLength(value: string, maxLength: number): string {
  const normalized = value.trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  const trimmed = normalized.slice(0, Math.max(0, maxLength - 3)).trim();
  return `${trimmed}...`;
}

function normalizeHashtags(hashtags: string[]): string[] {
  return hashtags
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0)
    .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`));
}

function createCheck({
  id,
  label,
  passed,
  severity,
  message,
  suggestion,
  fixAction,
}: PublishingQualityCheck): PublishingQualityCheck {
  return {
    id,
    label,
    passed,
    severity,
    message,
    suggestion,
    fixAction,
  };
}

function evaluateChannel(channelPack: ChannelPublishingPack): ChannelPublishingQualityResult {
  const rules = CHANNEL_RULES[channelPack.channel];
  const checks: PublishingQualityCheck[] = [];

  checks.push(
    createCheck({
      id: `${channelPack.channel}-primary-length`,
      label: "Primary caption length",
      passed: channelPack.primaryCaption.length <= rules.primaryCaptionMax,
      severity: "error",
      message:
        channelPack.primaryCaption.length <= rules.primaryCaptionMax
          ? "Within channel limits."
          : `Primary caption exceeds ${rules.primaryCaptionMax} characters.`,
      suggestion: "Trim the base primary caption.",
      fixAction: "trim_primary_caption",
    }),
  );

  checks.push(
    createCheck({
      id: `${channelPack.channel}-short-length`,
      label: "Short caption length",
      passed: channelPack.shortCaption.length <= rules.shortCaptionMax,
      severity: "error",
      message:
        channelPack.shortCaption.length <= rules.shortCaptionMax
          ? "Within channel limits."
          : `Short caption exceeds ${rules.shortCaptionMax} characters.`,
      suggestion: "Trim the short caption for channel fit.",
      fixAction: "trim_short_caption",
    }),
  );

  checks.push(
    createCheck({
      id: `${channelPack.channel}-emotion-primary-length`,
      label: "Emotion-locked primary length",
      passed:
        channelPack.emotionLockedPrimaryCaption.length <=
        rules.emotionPrimaryCaptionMax,
      severity: "warning",
      message:
        channelPack.emotionLockedPrimaryCaption.length <=
        rules.emotionPrimaryCaptionMax
          ? "Within channel limits."
          : `Emotion-locked primary caption exceeds ${rules.emotionPrimaryCaptionMax} characters.`,
      suggestion: "Trim the emotion-locked primary caption.",
      fixAction: "trim_emotion_primary_caption",
    }),
  );

  checks.push(
    createCheck({
      id: `${channelPack.channel}-emotion-short-length`,
      label: "Emotion-locked short length",
      passed:
        channelPack.emotionLockedShortCaption.length <= rules.emotionShortCaptionMax,
      severity: "warning",
      message:
        channelPack.emotionLockedShortCaption.length <= rules.emotionShortCaptionMax
          ? "Within channel limits."
          : `Emotion-locked short caption exceeds ${rules.emotionShortCaptionMax} characters.`,
      suggestion: "Trim the emotion-locked short caption.",
      fixAction: "trim_emotion_short_caption",
    }),
  );

  checks.push(
    createCheck({
      id: `${channelPack.channel}-hashtags-count`,
      label: "Hashtag count",
      passed: channelPack.hashtags.length <= rules.maxHashtags,
      severity: "error",
      message:
        channelPack.hashtags.length <= rules.maxHashtags
          ? "Hashtag count is within limits."
          : `Too many hashtags (${channelPack.hashtags.length}/${rules.maxHashtags}).`,
      suggestion: "Keep only the strongest hashtags for this channel.",
      fixAction: "trim_hashtags",
    }),
  );

  const hashtagsAreNormalized = channelPack.hashtags.every((tag) =>
    tag.trim().startsWith("#"),
  );
  checks.push(
    createCheck({
      id: `${channelPack.channel}-hashtags-format`,
      label: "Hashtag format",
      passed: hashtagsAreNormalized,
      severity: "warning",
      message: hashtagsAreNormalized
        ? "Hashtag format is consistent."
        : "Some hashtags are missing a leading #.",
      suggestion: "Normalize hashtags to #Tag format.",
      fixAction: "normalize_hashtags",
    }),
  );

  checks.push(
    createCheck({
      id: `${channelPack.channel}-sequence-min`,
      label: "Sequence coverage",
      passed: channelPack.postSequence.length >= rules.minSequenceSteps,
      severity: "error",
      message:
        channelPack.postSequence.length >= rules.minSequenceSteps
          ? "Sequence depth is sufficient."
          : `Sequence should include at least ${rules.minSequenceSteps} steps.`,
      suggestion: "Add more sequenced publishing steps.",
      fixAction: "ensure_sequence",
    }),
  );

  checks.push(
    createCheck({
      id: `${channelPack.channel}-cta-presence`,
      label: "Call-to-action",
      passed: channelPack.callToAction.trim().length >= 18,
      severity: "error",
      message:
        channelPack.callToAction.trim().length >= 18
          ? "CTA is present."
          : "CTA is too short or missing.",
      suggestion: "Add a concrete next action for the audience.",
      fixAction: "ensure_cta",
    }),
  );

  const blockingIssueCount = checks.filter(
    (check) => !check.passed && check.severity === "error",
  ).length;
  const warningCount = checks.filter(
    (check) => !check.passed && check.severity === "warning",
  ).length;

  return {
    channel: channelPack.channel,
    label: channelPack.label,
    status: blockingIssueCount > 0 ? "needs_fixes" : "ready",
    checks,
    blockingIssueCount,
    warningCount,
  };
}

function updateChannel(
  pack: StoryPublishingPack,
  channel: DistributionChannel,
  updater: (channelPack: ChannelPublishingPack) => ChannelPublishingPack,
): StoryPublishingPack {
  const nextPack = {
    ...pack,
    channels: pack.channels.map((channelPack) =>
      channelPack.channel === channel ? updater(channelPack) : channelPack,
    ),
  };

  return rebuildStoryPublishingPackMarkdown(nextPack);
}

export function evaluateStoryPublishingPackQuality(
  pack: StoryPublishingPack,
): PublishingQualityReport {
  const channelResults = pack.channels.map((channel) => evaluateChannel(channel));
  const blockingIssueCount = channelResults.reduce(
    (total, result) => total + result.blockingIssueCount,
    0,
  );
  const warningCount = channelResults.reduce(
    (total, result) => total + result.warningCount,
    0,
  );

  return {
    status: blockingIssueCount > 0 ? "needs_fixes" : "ready",
    blockingIssueCount,
    warningCount,
    channelResults,
  };
}

export function applyPublishingQuickFix({
  pack,
  channel,
  action,
}: {
  pack: StoryPublishingPack;
  channel: DistributionChannel;
  action: PublishingQuickFixAction;
}): StoryPublishingPack {
  const rules = CHANNEL_RULES[channel];

  if (!rules) {
    return pack;
  }

  return updateChannel(pack, channel, (channelPack) => {
    switch (action) {
      case "trim_primary_caption":
        return {
          ...channelPack,
          primaryCaption: trimTextToMaxLength(
            channelPack.primaryCaption,
            rules.primaryCaptionMax,
          ),
        };
      case "trim_short_caption":
        return {
          ...channelPack,
          shortCaption: trimTextToMaxLength(
            channelPack.shortCaption,
            rules.shortCaptionMax,
          ),
        };
      case "trim_emotion_primary_caption":
        return {
          ...channelPack,
          emotionLockedPrimaryCaption: trimTextToMaxLength(
            channelPack.emotionLockedPrimaryCaption,
            rules.emotionPrimaryCaptionMax,
          ),
        };
      case "trim_emotion_short_caption":
        return {
          ...channelPack,
          emotionLockedShortCaption: trimTextToMaxLength(
            channelPack.emotionLockedShortCaption,
            rules.emotionShortCaptionMax,
          ),
        };
      case "trim_hashtags":
        return {
          ...channelPack,
          hashtags: channelPack.hashtags.slice(0, rules.maxHashtags),
        };
      case "normalize_hashtags":
        return {
          ...channelPack,
          hashtags: normalizeHashtags(channelPack.hashtags),
        };
      case "ensure_sequence": {
        const nextSequence = [...channelPack.postSequence];
        const missing = Math.max(0, rules.minSequenceSteps - nextSequence.length);
        for (let i = 0; i < missing; i += 1) {
          nextSequence.push(
            `Follow-up ${nextSequence.length + 1}: reinforce the main story hook and next action.`,
          );
        }
        return {
          ...channelPack,
          postSequence: nextSequence,
        };
      }
      case "ensure_cta":
        return {
          ...channelPack,
          callToAction:
            channelPack.callToAction.trim().length >= 18
              ? channelPack.callToAction
              : `Invite audience feedback and link directly to the full story update.`,
        };
      default:
        return channelPack;
    }
  });
}
