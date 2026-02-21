"use client";

import { Navbar } from "@/components/landing/navbar";
import { Footer } from "@/components/landing/footer";
import { LandingHero } from "@/components/landing/hero-section";
import { ComicCreationForm } from "@/components/landing/comic-creation-form";
import { HowItWorks } from "@/components/landing/how-it-works";
import { GalleryShowcase } from "@/components/landing/gallery-showcase";
import { useState, useEffect } from "react";
import { CreateStepper, type CreateStep } from "@/components/landing/create-stepper";
import {
  CreateStatusRail,
  type CreateStatus,
} from "@/components/landing/create-status-rail";
import { useCreateOnboarding } from "@/hooks/use-create-onboarding";
import type { CreateStatusMeta } from "@/components/landing/comic-creation-form";

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("noir");
  const [characterFiles, setCharacterFiles] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const isAdvancedMode = false;
  const isGuidedSimpleMode = true;
  const [simpleStep, setSimpleStep] = useState<CreateStep>("story");
  const [createStatus, setCreateStatus] = useState<CreateStatus>("ready");
  const [statusMessage, setStatusMessage] = useState(
    "Ready when you are. We will guide every generation stage."
  );
  const [statusStageIndex, setStatusStageIndex] = useState(0);
  const [isSimpleRailExpanded, setIsSimpleRailExpanded] = useState(false);
  const {
    state: onboardingState,
    toggleSimpleRailPinned,
    dismissHints,
    markFirstRunCompleted,
  } = useCreateOnboarding();

  const handleStatusChange = (status: CreateStatus, meta?: CreateStatusMeta) => {
    setCreateStatus(status);
    if (typeof meta?.stageIndex === "number") {
      setStatusStageIndex(meta.stageIndex);
    }
    if (meta?.message) {
      setStatusMessage(meta.message);
    }
  };

  useEffect(() => {
    if (!isGuidedSimpleMode) return;

    if (createStatus === "generating" || createStatus === "saving" || createStatus === "error") {
      setIsSimpleRailExpanded(true);
    }

    if (createStatus === "done" && !onboardingState.simpleRailPinned) {
      const timeout = window.setTimeout(() => {
        setIsSimpleRailExpanded(false);
      }, 2200);
      return () => window.clearTimeout(timeout);
    }
  }, [createStatus, isGuidedSimpleMode, onboardingState.simpleRailPinned]);

  useEffect(() => {
    if (!isGuidedSimpleMode) return;
    if (onboardingState.simpleRailPinned) {
      setIsSimpleRailExpanded(true);
    }
  }, [isGuidedSimpleMode, onboardingState.simpleRailPinned]);

  const canAccessVisual = prompt.trim().length >= 20;
  const canAccessReview = canAccessVisual;
  const showFirstRunHints =
    isGuidedSimpleMode &&
    !onboardingState.firstRunCompleted &&
    !onboardingState.hintsDismissed;

  const nextAction =
    createStatus === "error"
      ? "Adjust your prompt or references and retry generation."
      : createStatus === "done"
        ? "Opening your editor now."
        : simpleStep === "story"
          ? "Write your opening scene in one clear sentence."
          : simpleStep === "visual"
            ? "Optional: add references and style, then continue."
            : "Press Generate to create your first comic page.";

  return (
    <div className="min-h-screen bg-background flex flex-col overflow-hidden relative">
      {/* Background gradient blurs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-900/10 rounded-full blur-[120px]" />
      </div>

      <Navbar />

      <main
        className={`flex-1 flex min-h-[calc(100vh-6rem)] ${isAdvancedMode ? "flex-col lg:flex-row" : "flex-col"
          }`}
      >
        {/* Left: Controls & Input */}
        <div
          className={`w-full flex flex-col justify-center px-4 sm:px-6 py-4 sm:py-6 relative ${isAdvancedMode ? "lg:w-1/2 lg:px-12 xl:px-20" : "max-w-5xl mx-auto"
            }`}
        >
          <div
            className={`w-full z-10 ${isAdvancedMode ? "max-w-xl mx-auto lg:mx-0" : "max-w-4xl mx-auto"
              }`}
          >
            <LandingHero isAdvancedMode={isAdvancedMode} />

            <div className="space-y-4 sm:space-y-5 mt-4 sm:mt-5">
              {isGuidedSimpleMode && (
                <CreateStepper
                  step={simpleStep}
                  canAccessVisual={canAccessVisual}
                  canAccessReview={canAccessReview}
                  onStepChange={setSimpleStep}
                />
              )}

              <div className="opacity-0 animate-fade-in-up animation-delay-100">
                <ComicCreationForm
                  prompt={prompt}
                  setPrompt={setPrompt}
                  style={style}
                  setStyle={setStyle}
                  characterFiles={characterFiles}
                  setCharacterFiles={setCharacterFiles}
                  isLoading={isLoading}
                  setIsLoading={setIsLoading}
                  isAdvancedMode={isAdvancedMode}
                  simpleStep={simpleStep}
                  onSimpleStepChange={setSimpleStep}
                  onStatusChange={handleStatusChange}
                  showFirstRunHints={showFirstRunHints}
                  onDismissHints={dismissHints}
                  onFirstRunCompleted={markFirstRunCompleted}
                  simpleModeV2Enabled={isGuidedSimpleMode}
                />
              </div>

              {isGuidedSimpleMode && (
                <div className="flex justify-end">
                  <CreateStatusRail
                    status={createStatus}
                    message={statusMessage}
                    nextAction={nextAction}
                    stageIndex={statusStageIndex}
                    isExpanded={isSimpleRailExpanded}
                    isPinned={onboardingState.simpleRailPinned}
                    onToggleExpanded={() =>
                      setIsSimpleRailExpanded((current) => !current)
                    }
                    onTogglePinned={toggleSimpleRailPinned}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

      </main>

      <GalleryShowcase />
      <HowItWorks />

      <Footer />
    </div>
  );
}
