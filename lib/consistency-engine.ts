import { type StoryCharacter } from "@/lib/schema";
import { type CharacterDnaProfile } from "@/lib/schema";
import { type StoryWorldPayload } from "@/lib/story-world";

export function buildConsistencyContext({
  storyTitle,
  storyDescription,
  style,
  previousPrompts,
  storyCharacters,
}: {
  storyTitle: string;
  storyDescription?: string | null;
  style?: string;
  previousPrompts: string[];
  storyCharacters: StoryCharacter[];
}): string {
  const trimmedPrompts = previousPrompts
    .map((prompt) => prompt.trim())
    .filter(Boolean);
  const recentPrompts = trimmedPrompts.slice(-4);

  const sections: string[] = [];

  sections.push(`Story title: ${storyTitle}`);
  if (storyDescription?.trim()) {
    sections.push(`Story description: ${storyDescription.trim()}`);
  }
  if (style) {
    sections.push(`Visual style: ${style}`);
  }

  if (recentPrompts.length > 0) {
    sections.push(
      `Recent page beats:\n${recentPrompts
        .map((prompt, index) => `${index + 1}. ${prompt}`)
        .join("\n")}`,
    );
  }

  const lockedCharacters = storyCharacters.filter((character) => character.isLocked);
  if (lockedCharacters.length > 0) {
    sections.push(
      `Locked character continuity:\n${lockedCharacters
        .map((character) => {
          const traits = [
            character.role ? `role=${character.role}` : null,
            character.appearance ? `appearance=${character.appearance}` : null,
            character.personality ? `personality=${character.personality}` : null,
            character.speechStyle ? `speech=${character.speechStyle}` : null,
          ]
            .filter(Boolean)
            .join("; ");
          return `- ${character.name}${traits ? ` (${traits})` : ""}`;
        })
        .join("\n")}`,
    );
  }

  sections.push(
    "Continuity rules: preserve recurring locations, character relationships, and unresolved plot threads unless prompt explicitly changes them.",
  );

  return sections.join("\n\n");
}

export function buildContinuationSuggestions({
  storyTitle,
  recentPrompts,
  characterNames,
}: {
  storyTitle: string;
  recentPrompts: string[];
  characterNames: string[];
}): string[] {
  const lead = characterNames[0] ?? "the protagonist";
  const partner = characterNames[1] ?? "a key ally";
  const latestBeat =
    recentPrompts.length > 0 ? recentPrompts[recentPrompts.length - 1] : "";

  const latestBeatSuffix = latestBeat
    ? ` Build on this last beat: "${latestBeat}".`
    : "";

  return [
    `In "${storyTitle}", ${lead} discovers a clue that changes the stakes.${latestBeatSuffix}`,
    `${lead} and ${partner} argue over the next move, then face an immediate threat.${latestBeatSuffix}`,
    `Show a quiet character moment for ${lead}, followed by a dramatic cliffhanger.${latestBeatSuffix}`,
  ];
}

export function buildStoryWorldContext(world: StoryWorldPayload): string {
  const sections: string[] = [];

  if (world.canonRules.length > 0) {
    sections.push(
      `Story canon rules:\n${world.canonRules
        .map((rule, index) => `${index + 1}. ${rule}`)
        .join("\n")}`,
    );
  }

  if (world.locations.length > 0) {
    sections.push(
      `Known locations:\n${world.locations
        .map((location) =>
          `- ${location.name}${location.description ? ` (${location.description})` : ""}`,
        )
        .join("\n")}`,
    );
  }

  if (world.timeline.length > 0) {
    const timeline = [...world.timeline].sort((left, right) => left.order - right.order);
    sections.push(
      `Timeline anchors:\n${timeline
        .map((item) => `- ${item.title}${item.note ? ` (${item.note})` : ""}`)
        .join("\n")}`,
    );
  }

  return sections.join("\n\n");
}

export function buildCharacterDnaContext(
  dnaProfiles: CharacterDnaProfile[],
): string {
  if (dnaProfiles.length === 0) {
    return "";
  }

  return `Character DNA profiles:\n${dnaProfiles
    .map((profile) => {
      const traits = [
        profile.visualTraits.length > 0
          ? `visual=${profile.visualTraits.join(", ")}`
          : null,
        profile.behaviorTraits.length > 0
          ? `behavior=${profile.behaviorTraits.join(", ")}`
          : null,
        profile.speechTraits.length > 0
          ? `speech=${profile.speechTraits.join(", ")}`
          : null,
        profile.lockedFields.length > 0
          ? `locked=${profile.lockedFields.join(", ")}`
          : null,
      ]
        .filter(Boolean)
        .join("; ");

      return `- ${profile.name}${traits ? ` (${traits})` : ""}`;
    })
    .join("\n")}`;
}
