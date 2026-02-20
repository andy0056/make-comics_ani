import { type CharacterDnaProfile, type StoryCharacter } from "@/lib/schema";
import { type StoryWorldPayload } from "@/lib/story-world";

export type ContinuityViolationSeverity = "low" | "medium" | "high";

export type ContinuityViolation = {
  storyId: string;
  pageDraft: string;
  severity: ContinuityViolationSeverity;
  ruleId: string;
  message: string;
  fixSuggestion: string;
};

const CHARACTER_DEATH_PATTERN = /\b(kill|killed|dies|dead|death)\b/i;

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function includesWholeWord(text: string, token: string): boolean {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`\\b${escaped}\\b`, "i");
  return regex.test(text);
}

function ruleToRuleId(rule: string, index: number): string {
  return `canon-rule-${index + 1}-${rule
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 30)}`;
}

function detectCanonRuleConflicts({
  storyId,
  prompt,
  canonRules,
}: {
  storyId: string;
  prompt: string;
  canonRules: string[];
}): ContinuityViolation[] {
  const normalizedPrompt = normalizeText(prompt);

  return canonRules.flatMap((rule, index) => {
    const normalizedRule = normalizeText(rule);
    const ruleId = ruleToRuleId(rule, index);
    const noPrefixMatch = normalizedRule.match(/^(?:no|never)\s+(.+)$/i);

    if (!noPrefixMatch) {
      return [];
    }

    const blockedPhrase = noPrefixMatch[1]?.trim();
    if (!blockedPhrase) {
      return [];
    }

    if (!normalizedPrompt.includes(blockedPhrase)) {
      return [];
    }

    return [
      {
        storyId,
        pageDraft: prompt,
        severity: "high" as const,
        ruleId,
        message: `Prompt conflicts with canon rule: "${rule}"`,
        fixSuggestion: `Remove or rephrase mentions of "${blockedPhrase}" unless you are intentionally changing canon.`,
      },
    ];
  });
}

function detectLockedCharacterConflicts({
  storyId,
  prompt,
  storyCharacters,
}: {
  storyId: string;
  prompt: string;
  storyCharacters: StoryCharacter[];
}): ContinuityViolation[] {
  const lockedCharacters = storyCharacters.filter((character) => character.isLocked);
  if (lockedCharacters.length === 0) {
    return [];
  }

  return lockedCharacters.flatMap((character) => {
    if (!includesWholeWord(prompt, character.name.toLowerCase())) {
      return [];
    }

    if (!CHARACTER_DEATH_PATTERN.test(prompt)) {
      return [];
    }

    return [
      {
        storyId,
        pageDraft: prompt,
        severity: "high" as const,
        ruleId: `locked-character-death-${character.id}`,
        message: `Locked character "${character.name}" appears in a death-related beat.`,
        fixSuggestion:
          "Confirm this major continuity change intentionally or adjust the scene to keep character continuity stable.",
      },
    ];
  });
}

function detectDnaDriftHints({
  storyId,
  prompt,
  dnaProfiles,
}: {
  storyId: string;
  prompt: string;
  dnaProfiles: CharacterDnaProfile[];
}): ContinuityViolation[] {
  const normalizedPrompt = normalizeText(prompt);

  return dnaProfiles.flatMap((profile) => {
    const nameMentioned = includesWholeWord(normalizedPrompt, profile.name.toLowerCase());
    if (!nameMentioned) {
      return [];
    }

    const hasContradictionHint =
      includesWholeWord(normalizedPrompt, "completely different") ||
      includesWholeWord(normalizedPrompt, "unrecognizable");

    if (!hasContradictionHint || profile.lockedFields.length === 0) {
      return [];
    }

    return [
      {
        storyId,
        pageDraft: prompt,
        severity: "medium" as const,
        ruleId: `dna-drift-${profile.characterId}`,
        message: `Prompt may drift from locked DNA traits for "${profile.name}".`,
        fixSuggestion:
          "Keep locked appearance/behavior traits stable and specify only scene-level changes.",
      },
    ];
  });
}

function detectPromptClarityRisk({
  storyId,
  prompt,
}: {
  storyId: string;
  prompt: string;
}): ContinuityViolation[] {
  const trimmedPrompt = prompt.trim();
  if (trimmedPrompt.length >= 40) {
    return [];
  }

  return [
    {
      storyId,
      pageDraft: prompt,
      severity: "low",
      ruleId: "prompt-clarity",
      message: "Prompt is very short; continuity cues may be underspecified.",
      fixSuggestion:
        "Add at least one explicit character, location, and action beat for stronger continuity.",
    },
  ];
}

export function runContinuityGuardian({
  storyId,
  prompt,
  storyWorld,
  storyCharacters,
  dnaProfiles,
}: {
  storyId: string;
  prompt: string;
  storyWorld: StoryWorldPayload;
  storyCharacters: StoryCharacter[];
  dnaProfiles: CharacterDnaProfile[];
}): ContinuityViolation[] {
  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) {
    return [];
  }

  const violations = [
    ...detectCanonRuleConflicts({
      storyId,
      prompt: trimmedPrompt,
      canonRules: storyWorld.canonRules,
    }),
    ...detectLockedCharacterConflicts({
      storyId,
      prompt: trimmedPrompt,
      storyCharacters,
    }),
    ...detectDnaDriftHints({
      storyId,
      prompt: trimmedPrompt,
      dnaProfiles,
    }),
    ...detectPromptClarityRisk({
      storyId,
      prompt: trimmedPrompt,
    }),
  ];

  const uniqueByRuleId = new Map<string, ContinuityViolation>();
  violations.forEach((violation) => {
    if (!uniqueByRuleId.has(violation.ruleId)) {
      uniqueByRuleId.set(violation.ruleId, violation);
    }
  });

  return Array.from(uniqueByRuleId.values());
}
