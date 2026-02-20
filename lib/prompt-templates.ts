export type PromptTemplate = {
  id: string;
  label: string;
  prompt: string;
};

export const STORY_PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: "hero-origin",
    label: "Hero Origin",
    prompt:
      "A shy student discovers a mysterious power in a crowded city and must decide whether to become a hero.",
  },
  {
    id: "heist",
    label: "Sci-Fi Heist",
    prompt:
      "A small crew plans a high-risk heist aboard a corporate space station while betrayal brews inside the team.",
  },
  {
    id: "monster-mystery",
    label: "Monster Mystery",
    prompt:
      "A detective investigates strange disappearances in a rain-soaked town where legends of a hidden creature may be true.",
  },
  {
    id: "samurai-road",
    label: "Samurai Journey",
    prompt:
      "A wandering samurai protects a young inventor carrying a map that powerful clans will kill to obtain.",
  },
  {
    id: "comedy-duo",
    label: "Comedy Duo",
    prompt:
      "Two unlikely roommates accidentally start a neighborhood hero business and create chaos while trying to do good.",
  },
];

export const PAGE_PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: "rising-tension",
    label: "Raise Stakes",
    prompt:
      "The situation escalates as an unexpected obstacle appears, forcing the characters into a risky decision.",
  },
  {
    id: "quiet-character-beat",
    label: "Character Beat",
    prompt:
      "A quieter moment where the main character reveals fear, doubt, or motivation before the next conflict.",
  },
  {
    id: "twist-reveal",
    label: "Twist Reveal",
    prompt:
      "A surprising reveal changes what everyone believed about the mission and shifts the direction of the story.",
  },
  {
    id: "action-sequence",
    label: "Action Sequence",
    prompt:
      "A dynamic confrontation with movement and impact, showing how each character fights or adapts under pressure.",
  },
  {
    id: "cliffhanger",
    label: "Cliffhanger",
    prompt:
      "End on a suspenseful cliffhanger that raises a major unanswered question for the next page.",
  },
];
