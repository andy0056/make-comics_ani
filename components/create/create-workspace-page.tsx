"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Circle,
  Loader2,
  Sparkles,
  Target,
  TimerReset,
  Workflow,
} from "lucide-react";
import { Navbar } from "@/components/landing/navbar";
import {
  ComicCreationForm,
  GENERATION_STAGES,
  getGenerationStageState,
  type GenerationProgressSnapshot,
} from "@/components/landing/comic-creation-form";
import { Button } from "@/components/ui/button";
import { COMIC_STYLES } from "@/lib/constants";

const CREATE_DRAFT_KEY = "create-workspace-session-draft";

interface CharacterFileDraft {
  name: string;
  size: number;
  type: string;
  lastModified: number;
}

interface CreateWorkspaceDraft {
  prompt: string;
  style: string;
  characterFiles: CharacterFileDraft[];
  updatedAt: number;
}

const EMPTY_PROGRESS: GenerationProgressSnapshot = {
  generationStage: null,
  failedStage: null,
  isLoading: false,
  isAutoRetrying: false,
  elapsedSeconds: 0,
  lastGenerationError: null,
  lastRequestId: null,
  hasAutoRetried: false,
  currentStageLabel: "Ready when you are.",
};

function formatRecoveryAge(updatedAt: number): string {
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - updatedAt) / 1000));

  if (elapsedSeconds < 60) {
    return `${elapsedSeconds}s ago`;
  }

  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) {
    return `${elapsedMinutes}m ago`;
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  return `${elapsedHours}h ago`;
}

export function CreateWorkspacePage() {
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("noir");
  const [characterFiles, setCharacterFiles] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [generationProgress, setGenerationProgress] =
    useState<GenerationProgressSnapshot>(EMPTY_PROGRESS);
  const [recoveredAt, setRecoveredAt] = useState<number | null>(null);
  const [recoveredCharacterFiles, setRecoveredCharacterFiles] = useState<
    CharacterFileDraft[]
  >([]);
  const [showRecoveryNotice, setShowRecoveryNotice] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem(CREATE_DRAFT_KEY);
    if (!raw) {
      return;
    }

    try {
      const draft = JSON.parse(raw) as Partial<CreateWorkspaceDraft>;

      if (typeof draft.prompt === "string" && draft.prompt.trim()) {
        setPrompt(draft.prompt);
      }

      if (typeof draft.style === "string" && draft.style.trim()) {
        setStyle(draft.style);
      }

      const recoveredFiles = Array.isArray(draft.characterFiles)
        ? draft.characterFiles.filter(
            (file): file is CharacterFileDraft =>
              typeof file?.name === "string" &&
              typeof file?.size === "number" &&
              typeof file?.type === "string" &&
              typeof file?.lastModified === "number",
          )
        : [];

      if (recoveredFiles.length > 0) {
        setRecoveredCharacterFiles(recoveredFiles);
      }

      if (typeof draft.updatedAt === "number") {
        setRecoveredAt(draft.updatedAt);
      } else {
        setRecoveredAt(Date.now());
      }

      setShowRecoveryNotice(true);
    } catch {
      sessionStorage.removeItem(CREATE_DRAFT_KEY);
    }
  }, []);

  useEffect(() => {
    const currentCharacterMetadata: CharacterFileDraft[] = characterFiles.map((file) => ({
      name: file.name,
      size: file.size,
      type: file.type,
      lastModified: file.lastModified,
    }));

    const hasDraftContent =
      prompt.trim().length > 0 ||
      currentCharacterMetadata.length > 0 ||
      style !== "noir";

    if (!hasDraftContent) {
      sessionStorage.removeItem(CREATE_DRAFT_KEY);
      return;
    }

    const payload: CreateWorkspaceDraft = {
      prompt,
      style,
      characterFiles: currentCharacterMetadata,
      updatedAt: Date.now(),
    };

    sessionStorage.setItem(CREATE_DRAFT_KEY, JSON.stringify(payload));
    if (currentCharacterMetadata.length > 0) {
      setRecoveredCharacterFiles(currentCharacterMetadata);
    }
  }, [characterFiles, prompt, style]);

  const clearSessionDraft = () => {
    sessionStorage.removeItem(CREATE_DRAFT_KEY);
    setRecoveredAt(null);
    setRecoveredCharacterFiles([]);
    setShowRecoveryNotice(false);
  };

  const selectedStyleName =
    COMIC_STYLES.find((styleOption) => styleOption.id === style)?.name ?? style;
  const hasError = !!generationProgress.lastGenerationError;
  const activeStageIndex = generationProgress.generationStage
    ? GENERATION_STAGES.findIndex(
        (stage) => stage.id === generationProgress.generationStage,
      )
    : -1;
  const completedStageCount = hasError
    ? Math.max(0, activeStageIndex)
    : generationProgress.generationStage
      ? generationProgress.isLoading
        ? Math.max(0, activeStageIndex)
        : Math.max(0, activeStageIndex + 1)
      : 0;

  const statusLabel = hasError
    ? "Needs attention"
    : generationProgress.isAutoRetrying
      ? "Auto-retrying"
      : generationProgress.isLoading
        ? "In progress"
        : prompt.trim()
          ? "Ready to generate"
          : "Waiting for prompt";

  const nextActionCopy = hasError
    ? generationProgress.hasAutoRetried
      ? "Tap Retry in the form to continue from this state."
      : "A transient issue occurred. One automatic retry may run first."
    : generationProgress.isAutoRetrying
      ? "No action needed right now. Retry is running automatically."
      : generationProgress.isLoading
        ? "Keep this tab open while the current stage completes."
        : prompt.trim()
          ? "Press Generate to create your opening panel."
          : "Use a Quick Start Recipe or write your own prompt to begin.";

  return (
    <div className="comic-app-bg min-h-screen flex flex-col overflow-hidden relative">
      <Navbar />

      <main className="flex-1 px-4 sm:px-6 lg:px-8 py-5 sm:py-7 lg:py-10">
        <div className="mx-auto w-full max-w-7xl space-y-5">
          <section className="comic-surface-strong rounded-2xl px-5 py-5 sm:px-7 sm:py-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-2">
                <p className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.06em] text-[#ffd166]">
                  <Sparkles className="h-3.5 w-3.5" />
                  Comic Studio
                </p>
                <h1 className="font-heading text-4xl sm:text-5xl text-white leading-tight tracking-[0.01em] comic-title-gradient">
                  Build A New Comic
                </h1>
                <p className="text-base text-muted-foreground max-w-2xl leading-relaxed">
                  Write your scene, choose a style, attach character references,
                  and generate the opening page. You will land directly in the
                  editor to continue and refine the story.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 w-full lg:w-auto lg:min-w-[30rem]">
                <div className="comic-surface rounded-lg px-3 py-2">
                  <p className="text-xs uppercase tracking-[0.02em] text-muted-foreground">
                    Step 1
                  </p>
                  <p className="text-sm text-white mt-1">Shape your prompt</p>
                </div>
                <div className="comic-surface rounded-lg px-3 py-2">
                  <p className="text-xs uppercase tracking-[0.02em] text-muted-foreground">
                    Step 2
                  </p>
                  <p className="text-sm text-white mt-1">Generate first page</p>
                </div>
                <div className="comic-surface rounded-lg px-3 py-2">
                  <p className="text-xs uppercase tracking-[0.02em] text-muted-foreground">
                    Step 3
                  </p>
                  <p className="text-sm text-white mt-1">Continue in editor</p>
                </div>
              </div>
            </div>
          </section>

          {showRecoveryNotice && (prompt.trim().length > 0 || recoveredCharacterFiles.length > 0) ? (
            <section className="comic-surface rounded-xl px-4 py-3 sm:px-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-base text-white font-medium">
                    Draft restored from your last session
                    {recoveredAt ? ` (${formatRecoveryAge(recoveredAt)})` : ""}.
                  </p>
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                    Workspace restored with style set to {selectedStyleName}. {recoveredCharacterFiles.length > 0
                      ? `Re-upload ${recoveredCharacterFiles.length} reference image${recoveredCharacterFiles.length === 1 ? "" : "s"} to continue with the same characters.`
                      : ""}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clearSessionDraft}
                  className="h-7 text-[11px]"
                >
                  Dismiss
                </Button>
              </div>
            </section>
          ) : null}

          <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_18rem] gap-5">
            <div className="comic-surface-strong rounded-2xl p-5 sm:p-7">
              <ComicCreationForm
                prompt={prompt}
                setPrompt={setPrompt}
                style={style}
                setStyle={setStyle}
                characterFiles={characterFiles}
                setCharacterFiles={setCharacterFiles}
                isLoading={isLoading}
                setIsLoading={setIsLoading}
                onGenerationStateChange={setGenerationProgress}
                onCreateSuccess={clearSessionDraft}
                hideStatusPanel
              />
            </div>

            <aside className="comic-surface rounded-2xl p-5 h-fit space-y-4">
              <div>
                <h2 className="text-base font-medium text-white mb-1 comic-title-gradient">
                  Live Activity Feed
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Transparent status for every stage from credits to final save.
                </p>
              </div>

              <div className="comic-surface rounded-lg p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-white font-medium">Session Overview</p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      hasError
                        ? "bg-destructive/15 text-destructive"
                        : generationProgress.isLoading
                          ? "bg-[#43c0ff]/15 text-[#43c0ff]"
                          : "bg-emerald-500/15 text-emerald-300"
                    }`}
                  >
                    {statusLabel}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md border border-border/40 px-2 py-1.5">
                    <p className="text-muted-foreground">Stage Progress</p>
                    <p className="text-white mt-0.5">
                      {completedStageCount}/{GENERATION_STAGES.length}
                    </p>
                  </div>
                  <div className="rounded-md border border-border/40 px-2 py-1.5">
                    <p className="text-muted-foreground">Elapsed</p>
                    <p className="text-white mt-0.5">
                      {generationProgress.elapsedSeconds}s
                    </p>
                  </div>
                  <div className="rounded-md border border-border/40 px-2 py-1.5">
                    <p className="text-muted-foreground">Style</p>
                    <p className="text-white mt-0.5">{selectedStyleName}</p>
                  </div>
                  <div className="rounded-md border border-border/40 px-2 py-1.5">
                    <p className="text-muted-foreground">References</p>
                    <p className="text-white mt-0.5">{characterFiles.length}/2</p>
                  </div>
                </div>
              </div>

              <div className="comic-surface rounded-lg p-3">
                <div className="flex items-center justify-between gap-2 text-xs mb-2">
                  <p className="text-sm text-white font-medium">Pipeline Activity</p>
                  <span className="text-sm text-muted-foreground">
                    {generationProgress.isAutoRetrying
                      ? "Retrying automatically..."
                      : generationProgress.currentStageLabel}
                  </span>
                </div>

                <div className="space-y-1.5">
                  {GENERATION_STAGES.map((stage) => {
                    const stageState = getGenerationStageState({
                      stageId: stage.id,
                      generationStage: generationProgress.generationStage,
                      failedStage: generationProgress.failedStage,
                      isLoading: generationProgress.isLoading,
                    });

                    return (
                      <div
                        key={stage.id}
                        className="flex items-center gap-2 text-xs"
                      >
                        {stageState === "done" ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                        ) : null}
                        {stageState === "active" ? (
                          <Loader2 className="h-3.5 w-3.5 text-[#43c0ff] animate-spin" />
                        ) : null}
                        {stageState === "error" ? (
                          <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                        ) : null}
                        {stageState === "pending" ? (
                          <Circle className="h-3.5 w-3.5 text-muted-foreground/60" />
                        ) : null}
                        <span
                          className={
                            stageState === "active"
                              ? "text-white"
                              : stageState === "error"
                                ? "text-destructive"
                                : "text-muted-foreground"
                          }
                        >
                          {stage.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="comic-surface rounded-lg p-3 space-y-2 text-xs">
                <p className="text-sm text-white font-medium">Next Action</p>
                <p className="text-sm text-muted-foreground flex items-start gap-2 leading-relaxed">
                  <Target className="h-3.5 w-3.5 mt-0.5 text-[#ff9954] shrink-0" />
                  {nextActionCopy}
                </p>
                {generationProgress.lastGenerationError ? (
                  <>
                    <p className="text-sm text-destructive leading-relaxed">{generationProgress.lastGenerationError}</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {generationProgress.hasAutoRetried
                        ? "Auto-retry already ran once. Use Retry in the form to continue."
                        : "Transient failures trigger one automatic retry."}
                    </p>
                    {generationProgress.lastRequestId ? (
                      <p className="text-sm text-muted-foreground/90">
                        Request ref: {generationProgress.lastRequestId}
                      </p>
                    ) : null}
                  </>
                ) : generationProgress.isAutoRetrying ? (
                  <p className="text-sm text-muted-foreground flex items-start gap-2 leading-relaxed">
                    <TimerReset className="h-3.5 w-3.5 mt-0.5 text-[#43c0ff] shrink-0" />
                    Your request is being retried automatically in the background.
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground flex items-start gap-2 leading-relaxed">
                    <Workflow className="h-3.5 w-3.5 mt-0.5 text-[#43c0ff] shrink-0" />
                    If generation pauses, use the Retry action in the form to resume.
                  </p>
                )}
              </div>

              <div className="comic-surface rounded-lg p-3 space-y-2 text-sm text-muted-foreground">
                <p className="text-white font-medium">Reference Integrity</p>
                <div className="flex items-center justify-between">
                  <span>Current uploads</span>
                  <span>{characterFiles.length}/2</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Recovered file metadata</span>
                  <span>{recoveredCharacterFiles.length}</span>
                </div>
                <p className="text-sm leading-relaxed">
                  Image files cannot be restored after refresh for security reasons.
                  Re-upload them to use references in generation.
                </p>
              </div>
            </aside>
          </section>
        </div>
      </main>
    </div>
  );
}
