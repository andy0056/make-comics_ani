import { type StoryCharacter } from "@/lib/schema";

export function buildCharacterBiblePromptSection(
  characters: StoryCharacter[],
): string {
  if (characters.length === 0) {
    return "";
  }

  const lines = characters.map((character, index) => {
    const traits: string[] = [];
    if (character.role) traits.push(`Role: ${character.role}`);
    if (character.appearance) traits.push(`Appearance: ${character.appearance}`);
    if (character.personality) traits.push(`Personality: ${character.personality}`);
    if (character.speechStyle) traits.push(`Speech style: ${character.speechStyle}`);
    if (character.referenceImageUrl) {
      traits.push("Reference image is attached and should remain visually consistent");
    }
    if (character.isLocked) traits.push("Locked continuity traits must not change");

    const joinedTraits =
      traits.length > 0 ? traits.join("; ") : "No extra traits provided";
    return `${index + 1}. ${character.name}: ${joinedTraits}`;
  });

  return `\nCHARACTER BIBLE (STRICT CONTINUITY):\n${lines.join("\n")}\n`;
}

export function toCharacterSummary(
  characters: StoryCharacter[],
): Array<{ name: string; lockedTraits: string[] }> {
  return characters.map((character) => {
    const lockedTraits: string[] = [];
    if (character.role) lockedTraits.push(`role=${character.role}`);
    if (character.appearance) lockedTraits.push(`appearance=${character.appearance}`);
    if (character.personality) lockedTraits.push(`personality=${character.personality}`);
    if (character.speechStyle) lockedTraits.push(`speech=${character.speechStyle}`);
    if (character.isLocked) lockedTraits.push("locked=true");
    return {
      name: character.name,
      lockedTraits,
    };
  });
}
