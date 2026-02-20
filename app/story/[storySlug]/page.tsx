import type { Metadata } from "next";
import { StoryEditorClient } from "./story-editor-client";

export const metadata: Metadata = {
  title: "Story | MakeComics",
  description: "View and edit your comic story.",
};

export default function StoryEditorPage() {
  return <StoryEditorClient />;
}
