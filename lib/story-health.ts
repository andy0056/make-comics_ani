import { type CharacterDnaProfile, type Page, type StoryCharacter } from "@/lib/schema";
import { runContinuityGuardian } from "@/lib/continuity-guardian";
import { type StoryWorldPayload } from "@/lib/story-world";

export type StoryHealthReport = {
  storyId: string;
  clarityScore: number;
  continuityScore: number;
  pacingScore: number;
  nextActions: string[];
};

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function calculateClarityScore(pages: Page[]): number {
  if (pages.length === 0) {
    return 50;
  }

  const promptLengths = pages.map((page) => page.prompt.trim().length);
  const avgPromptLength =
    promptLengths.reduce((sum, length) => sum + length, 0) / promptLengths.length;
  const punctuationCoverage =
    pages.filter((page) => /[.!?]/.test(page.prompt)).length / pages.length;

  const lengthComponent = Math.min(1, avgPromptLength / 120) * 70;
  const punctuationComponent = punctuationCoverage * 30;

  return clampScore(lengthComponent + punctuationComponent);
}

function calculateContinuityScore({
  storyId,
  pages,
  world,
  storyCharacters,
  dnaProfiles,
}: {
  storyId: string;
  pages: Page[];
  world: StoryWorldPayload;
  storyCharacters: StoryCharacter[];
  dnaProfiles: CharacterDnaProfile[];
}): number {
  if (pages.length === 0) {
    return 60;
  }

  const recentPrompts = pages.slice(-4).map((page) => page.prompt);
  const violations = recentPrompts.flatMap((prompt) =>
    runContinuityGuardian({
      storyId,
      prompt,
      storyWorld: world,
      storyCharacters,
      dnaProfiles,
    }),
  );

  const severityPenalty = violations.reduce((total, violation) => {
    if (violation.severity === "high") {
      return total + 12;
    }
    if (violation.severity === "medium") {
      return total + 7;
    }
    return total + 3;
  }, 0);

  const lockedCoverageDenominator = Math.max(
    1,
    storyCharacters.filter((character) => character.isLocked).length,
  );
  const dnaCoverage =
    dnaProfiles.length / lockedCoverageDenominator;
  const dnaCoverageBonus = Math.min(1, dnaCoverage) * 10;

  return clampScore(88 - severityPenalty + dnaCoverageBonus);
}

function calculatePacingScore(pages: Page[]): number {
  if (pages.length <= 1) {
    return 55;
  }

  const promptLengths = pages.map((page) => page.prompt.trim().length);
  const minLength = Math.min(...promptLengths);
  const maxLength = Math.max(...promptLengths);
  const variabilityRatio = maxLength === 0 ? 0 : (maxLength - minLength) / maxLength;

  const varietyComponent = Math.min(1, variabilityRatio + 0.25) * 55;
  const volumeComponent = Math.min(1, pages.length / 8) * 45;

  return clampScore(varietyComponent + volumeComponent);
}

function buildNextActions({
  clarityScore,
  continuityScore,
  pacingScore,
  world,
  dnaProfiles,
}: {
  clarityScore: number;
  continuityScore: number;
  pacingScore: number;
  world: StoryWorldPayload;
  dnaProfiles: CharacterDnaProfile[];
}): string[] {
  const actions: string[] = [];

  if (clarityScore < 70) {
    actions.push(
      "Use clearer prompts with explicit character + location + action beats.",
    );
  }

  if (continuityScore < 70) {
    actions.push(
      "Address continuity warnings before generation to avoid canon drift.",
    );
  }

  if (pacingScore < 70) {
    actions.push(
      "Vary scene intensity between pages to improve narrative rhythm.",
    );
  }

  if (world.canonRules.length === 0) {
    actions.push(
      "Add 2-3 canon rules in Story World to lock story boundaries.",
    );
  }

  if (dnaProfiles.length === 0) {
    actions.push(
      "Create Character DNA profiles for locked characters to preserve identity.",
    );
  }

  return actions.slice(0, 4);
}

export function buildStoryHealthReport({
  storyId,
  pages,
  world,
  storyCharacters,
  dnaProfiles,
}: {
  storyId: string;
  pages: Page[];
  world: StoryWorldPayload;
  storyCharacters: StoryCharacter[];
  dnaProfiles: CharacterDnaProfile[];
}): StoryHealthReport {
  const clarityScore = calculateClarityScore(pages);
  const continuityScore = calculateContinuityScore({
    storyId,
    pages,
    world,
    storyCharacters,
    dnaProfiles,
  });
  const pacingScore = calculatePacingScore(pages);
  const nextActions = buildNextActions({
    clarityScore,
    continuityScore,
    pacingScore,
    world,
    dnaProfiles,
  });

  return {
    storyId,
    clarityScore,
    continuityScore,
    pacingScore,
    nextActions,
  };
}
