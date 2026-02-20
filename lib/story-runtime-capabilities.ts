export type StoryRuntimeCapabilities = {
  storyHealth: boolean;
  coEditPresence: boolean;
  continuationSuggestions: boolean;
  autopilot: boolean;
  creatorTwin: boolean;
  sharedUniverse: boolean;
  coCreationRooms: boolean;
};

export const DEFAULT_STORY_RUNTIME_CAPABILITIES: StoryRuntimeCapabilities = {
  storyHealth: true,
  coEditPresence: true,
  continuationSuggestions: true,
  autopilot: true,
  creatorTwin: true,
  sharedUniverse: true,
  coCreationRooms: true,
};

export function normalizeStoryRuntimeCapabilities(
  value: Partial<StoryRuntimeCapabilities> | null | undefined,
): StoryRuntimeCapabilities {
  return {
    storyHealth: value?.storyHealth ?? DEFAULT_STORY_RUNTIME_CAPABILITIES.storyHealth,
    coEditPresence: value?.coEditPresence ?? DEFAULT_STORY_RUNTIME_CAPABILITIES.coEditPresence,
    continuationSuggestions:
      value?.continuationSuggestions ??
      DEFAULT_STORY_RUNTIME_CAPABILITIES.continuationSuggestions,
    autopilot: value?.autopilot ?? DEFAULT_STORY_RUNTIME_CAPABILITIES.autopilot,
    creatorTwin: value?.creatorTwin ?? DEFAULT_STORY_RUNTIME_CAPABILITIES.creatorTwin,
    sharedUniverse: value?.sharedUniverse ?? DEFAULT_STORY_RUNTIME_CAPABILITIES.sharedUniverse,
    coCreationRooms:
      value?.coCreationRooms ?? DEFAULT_STORY_RUNTIME_CAPABILITIES.coCreationRooms,
  };
}
