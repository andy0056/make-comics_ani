export const STORY_EDIT_RESOURCE = {
  title: "story-title",
  pages: "story-pages",
  characterBible: "character-bible",
} as const;

export type StoryEditResource =
  (typeof STORY_EDIT_RESOURCE)[keyof typeof STORY_EDIT_RESOURCE];

export function formatPresenceUserLabel(userId: string): string {
  const trimmed = userId.trim();
  if (trimmed.length <= 14) {
    return trimmed;
  }
  return `${trimmed.slice(0, 8)}…${trimmed.slice(-4)}`;
}

