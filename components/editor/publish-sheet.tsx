"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bot,
  Check,
  Copy,
  Download,
  FileText,
  Loader2,
  Megaphone,
  PackageCheck,
  RefreshCw,
  Shield,
  Store,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { ClientApiError, requestJson } from "@/lib/client-api";
import {
  type DistributionChannel,
  type DistributionTone,
  type EmotionLockProfile,
  type PublishingAutopipelineBundle,
  type StyleMorphMode,
  type StoryPublishingPack,
  DISTRIBUTION_CHANNELS,
} from "@/lib/publishing-distribution";
import {
  applyPublishingQuickFix,
  evaluateStoryPublishingPackQuality,
  type PublishingQualityCheck,
  type PublishingQualityReport,
} from "@/lib/publishing-quality-gates";
import { type IpIncubatorReport } from "@/lib/ip-incubator";
import {
  type MerchabilityCandidate,
  type MerchabilityDetectorReport,
  type MerchExperimentBudgetTier,
  type MerchExperimentObjective,
  type MerchExperimentPlan,
} from "@/lib/merchability-detector";
import {
  type CreatorRoleAgentsBoard,
  type RoleAgentId,
  type RoleAgentSprintObjective,
} from "@/lib/collaborative-role-agents";
import {
  type CreatorEconomyOperatingPlan,
  type CreatorEconomyRunDeltaReport,
} from "@/lib/creator-economy-orchestrator";
import {
  type CreatorEconomyAutomationPlan,
  type CreatorEconomyAutomationRecommendation,
} from "@/lib/creator-economy-automation";
import {
  type CreatorEconomyAutonomousBacklog,
  type CreatorEconomyAutonomyMode,
  type CreatorEconomyDecisionPolicy,
  CREATOR_ECONOMY_AUTONOMY_MODES,
} from "@/lib/creator-economy-policy";
import { type CreatorEconomyGovernanceReport } from "@/lib/creator-economy-governance";
import { type CreatorEconomyPolicyLearningReport } from "@/lib/creator-economy-policy-learning";
import {
  type CreatorEconomyOutcomeAgentCandidate,
  type CreatorEconomyOutcomeAgentPlan,
} from "@/lib/creator-economy-outcome-agent";
import {
  type CreatorEconomyOptimizationObjective,
  type CreatorEconomyOptimizerReport,
  CREATOR_ECONOMY_OPTIMIZATION_OBJECTIVES,
} from "@/lib/creator-economy-optimizer";
import {
  type CreatorEconomyStrategyLoopReport,
  CREATOR_ECONOMY_STRATEGY_CADENCE_OPTIONS,
} from "@/lib/creator-economy-strategy-loop";
import { type CreatorEconomyExecutionWindowReport } from "@/lib/creator-economy-window-loop";
import { type CreatorEconomySelfHealingReport } from "@/lib/creator-economy-self-healing";

const CHANNEL_LABELS: Record<DistributionChannel, string> = {
  x_thread: "X Thread",
  instagram_carousel: "Instagram",
  linkedin_post: "LinkedIn",
  newsletter_blurb: "Newsletter",
};

const TONE_OPTIONS: Array<{ value: DistributionTone; label: string }> = [
  { value: "cinematic", label: "Cinematic" },
  { value: "hype", label: "Hype" },
  { value: "educational", label: "Educational" },
];

const STYLE_MORPH_OPTIONS: Array<{ value: StyleMorphMode; label: string }> = [
  { value: "subtle", label: "Subtle Morph" },
  { value: "balanced", label: "Balanced Morph" },
  { value: "bold", label: "Bold Morph" },
];

const EMOTION_LOCK_OPTIONS: Array<{ value: EmotionLockProfile; label: string }> = [
  { value: "none", label: "No Lock" },
  { value: "suspense", label: "Suspense" },
  { value: "heroic", label: "Heroic" },
  { value: "heartfelt", label: "Heartfelt" },
  { value: "comedic", label: "Comedic" },
];

const MERCH_OBJECTIVE_OPTIONS: Array<{
  value: MerchExperimentObjective;
  label: string;
}> = [
  { value: "validate_demand", label: "Validate Demand" },
  { value: "collect_feedback", label: "Collect Feedback" },
  { value: "preorder_signal", label: "Preorder Signal" },
];

const MERCH_BUDGET_OPTIONS: Array<{
  value: MerchExperimentBudgetTier;
  label: string;
}> = [
  { value: "low", label: "Low Budget" },
  { value: "medium", label: "Medium Budget" },
  { value: "high", label: "High Budget" },
];

const ROLE_AGENT_OBJECTIVE_OPTIONS: Array<{
  value: RoleAgentSprintObjective;
  label: string;
}> = [
  { value: "ship_next_drop", label: "Ship Next Drop" },
  { value: "stabilize_world", label: "Stabilize World" },
  { value: "scale_distribution", label: "Scale Distribution" },
  { value: "launch_merch_pilot", label: "Launch Merch Pilot" },
];

const ROLE_AGENT_LABELS: Record<RoleAgentId, string> = {
  story_architect: "Story Architect",
  continuity_director: "Continuity Director",
  visual_art_director: "Visual Art Director",
  merch_operator: "Merch Operator",
  distribution_operator: "Distribution Operator",
};

const AUTONOMY_MODE_LABELS: Record<CreatorEconomyAutonomyMode, string> = {
  manual: "Manual",
  assist: "Assist",
  auto: "Auto",
};

const OPTIMIZATION_OBJECTIVE_LABELS: Record<
  CreatorEconomyOptimizationObjective,
  string
> = {
  stabilize: "Stabilize",
  balanced: "Balanced",
  growth: "Growth",
};

type PublishingResponse = {
  pack: StoryPublishingPack;
};

type IpIncubatorResponse = {
  report: IpIncubatorReport;
};

type MerchabilityResponse = {
  report: MerchabilityDetectorReport;
};

type MerchPlanResponse = {
  report: MerchabilityDetectorReport;
  plan: MerchExperimentPlan;
};

type RoleAgentsResponse = {
  board: CreatorRoleAgentsBoard;
};

type RoleAgentsPlanResponse = {
  board: CreatorRoleAgentsBoard;
  merchPlan?: MerchExperimentPlan | null;
};

type CreatorEconomyRunSummary = {
  id: string;
  status: string;
  sprintObjective: RoleAgentSprintObjective;
  horizonDays: number;
  createdAt: string;
  completedAt: string | null;
  baselineMetrics: Partial<Record<string, number>>;
  outcomeMetrics: Partial<Record<string, number>>;
  outcomeDecision: string | null;
  outcomeNotes: string | null;
};

type CreatorEconomyOrchestratorGetResponse = {
  operatingPlan: CreatorEconomyOperatingPlan;
  roleBoard: CreatorRoleAgentsBoard;
  merchPlan: MerchExperimentPlan | null;
  history: CreatorEconomyRunSummary[];
};

type CreatorEconomyOrchestratorPostResponse = {
  operatingPlan: CreatorEconomyOperatingPlan;
  roleBoard: CreatorRoleAgentsBoard;
  merchPlan: MerchExperimentPlan | null;
  run: CreatorEconomyRunSummary | null;
  history: CreatorEconomyRunSummary[];
};

type CreatorEconomyOrchestratorPatchResponse = {
  run: CreatorEconomyRunSummary;
  deltaReport: CreatorEconomyRunDeltaReport;
};

type CreatorEconomyAutomationGetResponse = {
  automationPlan: CreatorEconomyAutomationPlan;
  operatingPlan: CreatorEconomyOperatingPlan;
  roleBoard: CreatorRoleAgentsBoard;
  history: CreatorEconomyRunSummary[];
};

type CreatorEconomyAutomationPostResponse = {
  automationPlan: CreatorEconomyAutomationPlan;
  executedRecommendation: CreatorEconomyAutomationRecommendation;
  execution: {
    sprintObjective: RoleAgentSprintObjective;
    horizonDays: number;
    requireMerchPlan: boolean;
    merchCandidateId: string | null;
    merchChannels: DistributionChannel[];
    defaultOutcomeDecision: "scale" | "iterate" | "hold" | "archive";
  };
  run: CreatorEconomyRunSummary | null;
  operatingPlan: CreatorEconomyOperatingPlan;
  roleBoard: CreatorRoleAgentsBoard;
  merchPlan: MerchExperimentPlan | null;
  history: CreatorEconomyRunSummary[];
};

type CreatorEconomyBacklogGetResponse = {
  mode: CreatorEconomyAutonomyMode;
  decisionPolicy: CreatorEconomyDecisionPolicy;
  policyLearning?: CreatorEconomyPolicyLearningReport;
  governance?: CreatorEconomyGovernanceReport;
  outcomeAgentPlan?: CreatorEconomyOutcomeAgentPlan | null;
  backlog: CreatorEconomyAutonomousBacklog;
  automationPlan: CreatorEconomyAutomationPlan;
  operatingPlan: CreatorEconomyOperatingPlan;
  roleBoard: CreatorRoleAgentsBoard;
  history: CreatorEconomyRunSummary[];
};

type CreatorEconomyBacklogPostResponse = {
  mode: CreatorEconomyAutonomyMode;
  decisionPolicy: CreatorEconomyDecisionPolicy;
  policyLearning?: CreatorEconomyPolicyLearningReport;
  governance?: CreatorEconomyGovernanceReport;
  outcomeAgentPlan?: CreatorEconomyOutcomeAgentPlan | null;
  backlog: CreatorEconomyAutonomousBacklog;
  automationPlan: CreatorEconomyAutomationPlan;
  executedRecommendation: CreatorEconomyAutomationRecommendation;
  run: CreatorEconomyRunSummary | null;
  operatingPlan: CreatorEconomyOperatingPlan;
  roleBoard: CreatorRoleAgentsBoard;
  merchPlan: MerchExperimentPlan | null;
  history: CreatorEconomyRunSummary[];
};

type CreatorEconomyAutorunResponse = {
  mode: CreatorEconomyAutonomyMode;
  dryRun: boolean;
  blockedByGovernance?: boolean;
  decisionPolicy: CreatorEconomyDecisionPolicy;
  policyLearning?: CreatorEconomyPolicyLearningReport;
  governance?: CreatorEconomyGovernanceReport;
  outcomeAgentPlan?: CreatorEconomyOutcomeAgentPlan | null;
  backlog: CreatorEconomyAutonomousBacklog;
  executed: Array<{
    recommendationId: string;
    title: string;
    runId: string | null;
    sprintObjective: RoleAgentSprintObjective;
    horizonDays: number;
    status: "planned" | "dry_run";
  }>;
  skipped: Array<{
    recommendationId: string;
    title: string;
    reason: string;
  }>;
  history: CreatorEconomyRunSummary[];
};

type CreatorEconomyPolicyLearningResponse = {
  mode: CreatorEconomyAutonomyMode;
  learning: CreatorEconomyPolicyLearningReport;
  decisionPolicy: CreatorEconomyDecisionPolicy;
  governance?: CreatorEconomyGovernanceReport;
  backlog: CreatorEconomyAutonomousBacklog;
  history: CreatorEconomyRunSummary[];
};

type CreatorEconomyOptimizerResponse = {
  mode: CreatorEconomyAutonomyMode;
  objective: CreatorEconomyOptimizationObjective;
  learning: CreatorEconomyPolicyLearningReport;
  governance: CreatorEconomyGovernanceReport;
  optimizerReport: CreatorEconomyOptimizerReport;
  optimizedPolicy: CreatorEconomyDecisionPolicy;
  optimizedBacklog: CreatorEconomyAutonomousBacklog;
  previewExecution: Array<{
    recommendationId: string;
    title: string;
    priority: "high" | "medium" | "low";
    status: "ready" | "blocked" | "cooldown";
    reason: string;
    sprintObjective: RoleAgentSprintObjective;
    horizonDays: number;
  }>;
  summary?: string;
  history: CreatorEconomyRunSummary[];
};

type CreatorEconomyStrategyLoopResponse = {
  mode: CreatorEconomyAutonomyMode;
  objective: CreatorEconomyOptimizationObjective;
  cadenceHours: number;
  autoOptimizeEnabled: boolean;
  learning: CreatorEconomyPolicyLearningReport;
  governance: CreatorEconomyGovernanceReport;
  optimizerReport: CreatorEconomyOptimizerReport;
  strategyLoop: CreatorEconomyStrategyLoopReport;
  windowReport: CreatorEconomyExecutionWindowReport;
  selfHealingReport: CreatorEconomySelfHealingReport;
  selfHealingPatchApplied: boolean;
  strategyPolicy: CreatorEconomyDecisionPolicy;
  strategyBacklog: CreatorEconomyAutonomousBacklog;
  previewExecution: Array<{
    recommendationId: string;
    title: string;
    priority: "high" | "medium" | "low";
    status: "ready" | "blocked" | "cooldown";
    reason: string;
    sprintObjective: RoleAgentSprintObjective;
    horizonDays: number;
  }>;
  executed: Array<{
    recommendationId: string;
    title: string;
    runId: string | null;
    sprintObjective: RoleAgentSprintObjective;
    horizonDays: number;
    status: "planned" | "dry_run";
  }>;
  recoveryExecuted: Array<{
    recommendationId: string;
    title: string;
    runId: string | null;
    sprintObjective: RoleAgentSprintObjective;
    horizonDays: number;
    status: "planned" | "dry_run";
  }>;
  skipped: Array<{
    recommendationId: string;
    title: string;
    reason: string;
  }>;
  blockedByWindowGate: boolean;
  summary?: string;
  history: CreatorEconomyRunSummary[];
};

type CreatorEconomyOutcomeAgentResponse = {
  mode: CreatorEconomyAutonomyMode;
  dryRun?: boolean;
  staleAfterHours: number;
  maxRuns: number;
  learning: CreatorEconomyPolicyLearningReport;
  decisionPolicy: CreatorEconomyDecisionPolicy;
  plan: CreatorEconomyOutcomeAgentPlan;
  selectedCandidates: CreatorEconomyOutcomeAgentCandidate[];
  closedRuns?: Array<{
    runId: string;
    decision: "scale" | "iterate" | "hold" | "archive";
    status: "completed" | "dry_run";
    note: string;
  }>;
  history: CreatorEconomyRunSummary[];
};

type AutopipelineStatus =
  | "idle"
  | "queued"
  | "running"
  | "completed"
  | "failed";

type AutopipelineResponse = {
  status: "completed";
  pack: StoryPublishingPack;
  bundle: PublishingAutopipelineBundle;
  qualityReport: PublishingQualityReport;
};

interface PublishSheetProps {
  isOpen: boolean;
  onClose: () => void;
  storySlug: string;
  onDownloadPDF?: () => void;
  isGeneratingPDF?: boolean;
}

export function PublishSheet({
  isOpen,
  onClose,
  storySlug,
  onDownloadPDF,
  isGeneratingPDF = false,
}: PublishSheetProps) {
  const { toast } = useToast();
  const [tone, setTone] = useState<DistributionTone>("cinematic");
  const [styleMorphMode, setStyleMorphMode] =
    useState<StyleMorphMode>("balanced");
  const [emotionLock, setEmotionLock] = useState<EmotionLockProfile>("none");
  const [selectedChannels, setSelectedChannels] = useState<DistributionChannel[]>([
    ...DISTRIBUTION_CHANNELS,
  ]);
  const [activeChannel, setActiveChannel] = useState<DistributionChannel>(
    DISTRIBUTION_CHANNELS[0],
  );
  const [pack, setPack] = useState<StoryPublishingPack | null>(null);
  const [ipReport, setIpReport] = useState<IpIncubatorReport | null>(null);
  const [merchReport, setMerchReport] = useState<MerchabilityDetectorReport | null>(
    null,
  );
  const [merchPlan, setMerchPlan] = useState<MerchExperimentPlan | null>(null);
  const [roleBoard, setRoleBoard] = useState<CreatorRoleAgentsBoard | null>(null);
  const [economyPlan, setEconomyPlan] =
    useState<CreatorEconomyOperatingPlan | null>(null);
  const [economyHistory, setEconomyHistory] = useState<CreatorEconomyRunSummary[]>(
    [],
  );
  const [economyDeltaReport, setEconomyDeltaReport] =
    useState<CreatorEconomyRunDeltaReport | null>(null);
  const [automationPlan, setAutomationPlan] =
    useState<CreatorEconomyAutomationPlan | null>(null);
  const [autonomyMode, setAutonomyMode] =
    useState<CreatorEconomyAutonomyMode>("assist");
  const [autonomyMaxActions, setAutonomyMaxActions] = useState(2);
  const [autonomousDecisionPolicy, setAutonomousDecisionPolicy] =
    useState<CreatorEconomyDecisionPolicy | null>(null);
  const [autonomousBacklog, setAutonomousBacklog] =
    useState<CreatorEconomyAutonomousBacklog | null>(null);
  const [autonomousGovernance, setAutonomousGovernance] =
    useState<CreatorEconomyGovernanceReport | null>(null);
  const [policyLearningReport, setPolicyLearningReport] =
    useState<CreatorEconomyPolicyLearningReport | null>(null);
  const [optimizerReport, setOptimizerReport] =
    useState<CreatorEconomyOptimizerReport | null>(null);
  const [optimizerObjective, setOptimizerObjective] =
    useState<CreatorEconomyOptimizationObjective>("balanced");
  const [optimizerPolicyPreview, setOptimizerPolicyPreview] =
    useState<CreatorEconomyDecisionPolicy | null>(null);
  const [optimizerPreviewExecution, setOptimizerPreviewExecution] = useState<
    CreatorEconomyOptimizerResponse["previewExecution"]
  >([]);
  const [strategyLoopReport, setStrategyLoopReport] =
    useState<CreatorEconomyStrategyLoopReport | null>(null);
  const [strategyCadenceHours, setStrategyCadenceHours] = useState<number>(12);
  const [strategyAutoOptimize, setStrategyAutoOptimize] = useState(true);
  const [strategyPolicyPreview, setStrategyPolicyPreview] =
    useState<CreatorEconomyDecisionPolicy | null>(null);
  const [strategyPreviewExecution, setStrategyPreviewExecution] = useState<
    CreatorEconomyStrategyLoopResponse["previewExecution"]
  >([]);
  const [strategyWindowReport, setStrategyWindowReport] =
    useState<CreatorEconomyExecutionWindowReport | null>(null);
  const [selfHealingReport, setSelfHealingReport] =
    useState<CreatorEconomySelfHealingReport | null>(null);
  const [outcomeAgentPlan, setOutcomeAgentPlan] =
    useState<CreatorEconomyOutcomeAgentPlan | null>(null);
  const [outcomeAgentStaleAfterHours, setOutcomeAgentStaleAfterHours] = useState(18);
  const [outcomeAgentMaxRuns, setOutcomeAgentMaxRuns] = useState(3);
  const [roleSprintObjective, setRoleSprintObjective] =
    useState<RoleAgentSprintObjective>("ship_next_drop");
  const [roleHorizonDays, setRoleHorizonDays] = useState(7);
  const [economyOutcomeDecision, setEconomyOutcomeDecision] =
    useState<"scale" | "iterate" | "hold" | "archive">("iterate");
  const [economyOutcomeNotes, setEconomyOutcomeNotes] = useState("");
  const [roleOwnerOverrides, setRoleOwnerOverrides] = useState<
    Partial<Record<RoleAgentId, string>>
  >({});
  const [selectedMerchCandidateId, setSelectedMerchCandidateId] = useState<
    string | null
  >(null);
  const [merchObjective, setMerchObjective] =
    useState<MerchExperimentObjective>("validate_demand");
  const [merchBudgetTier, setMerchBudgetTier] =
    useState<MerchExperimentBudgetTier>("low");
  const [merchDurationDays, setMerchDurationDays] = useState(7);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingIpReport, setIsLoadingIpReport] = useState(false);
  const [isLoadingMerchReport, setIsLoadingMerchReport] = useState(false);
  const [isPlanningMerch, setIsPlanningMerch] = useState(false);
  const [isLoadingRoleBoard, setIsLoadingRoleBoard] = useState(false);
  const [isPlanningRoleBoard, setIsPlanningRoleBoard] = useState(false);
  const [isLoadingEconomyPlan, setIsLoadingEconomyPlan] = useState(false);
  const [isSavingEconomyPlan, setIsSavingEconomyPlan] = useState(false);
  const [isRecordingEconomyOutcome, setIsRecordingEconomyOutcome] = useState(false);
  const [isLoadingAutomationPlan, setIsLoadingAutomationPlan] = useState(false);
  const [executingAutomationRecommendationId, setExecutingAutomationRecommendationId] =
    useState<string | null>(null);
  const [isLoadingAutonomousBacklog, setIsLoadingAutonomousBacklog] =
    useState(false);
  const [executingBacklogRecommendationId, setExecutingBacklogRecommendationId] =
    useState<string | null>(null);
  const [isRunningAutorunCycle, setIsRunningAutorunCycle] = useState(false);
  const [isLoadingPolicyLearning, setIsLoadingPolicyLearning] = useState(false);
  const [isLoadingOptimizer, setIsLoadingOptimizer] = useState(false);
  const [isRunningOptimizerPreview, setIsRunningOptimizerPreview] = useState(false);
  const [isLoadingStrategyLoop, setIsLoadingStrategyLoop] = useState(false);
  const [isRunningStrategyLoopSimulation, setIsRunningStrategyLoopSimulation] =
    useState(false);
  const [isRunningStrategyWindowExecution, setIsRunningStrategyWindowExecution] =
    useState(false);
  const [isRunningSelfHealing, setIsRunningSelfHealing] = useState(false);
  const [isRunningOutcomeAgent, setIsRunningOutcomeAgent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ipReportError, setIpReportError] = useState<string | null>(null);
  const [merchReportError, setMerchReportError] = useState<string | null>(null);
  const [merchPlanError, setMerchPlanError] = useState<string | null>(null);
  const [roleBoardError, setRoleBoardError] = useState<string | null>(null);
  const [rolePlanError, setRolePlanError] = useState<string | null>(null);
  const [economyPlanError, setEconomyPlanError] = useState<string | null>(null);
  const [economyOutcomeError, setEconomyOutcomeError] = useState<string | null>(
    null,
  );
  const [automationPlanError, setAutomationPlanError] = useState<string | null>(
    null,
  );
  const [automationExecutionError, setAutomationExecutionError] =
    useState<string | null>(null);
  const [autonomousBacklogError, setAutonomousBacklogError] =
    useState<string | null>(null);
  const [autorunError, setAutorunError] = useState<string | null>(null);
  const [autorunSummary, setAutorunSummary] = useState<string | null>(null);
  const [policyLearningError, setPolicyLearningError] = useState<string | null>(null);
  const [optimizerError, setOptimizerError] = useState<string | null>(null);
  const [optimizerSummary, setOptimizerSummary] = useState<string | null>(null);
  const [strategyError, setStrategyError] = useState<string | null>(null);
  const [strategySummary, setStrategySummary] = useState<string | null>(null);
  const [outcomeAgentError, setOutcomeAgentError] = useState<string | null>(null);
  const [outcomeAgentSummary, setOutcomeAgentSummary] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [autopipelineStatus, setAutopipelineStatus] =
    useState<AutopipelineStatus>("idle");
  const [autopipelineError, setAutopipelineError] = useState<string | null>(
    null,
  );
  const [autopipelineBundle, setAutopipelineBundle] =
    useState<PublishingAutopipelineBundle | null>(null);
  const [lastAutopipelineRunAt, setLastAutopipelineRunAt] = useState<
    string | null
  >(null);

  const setCopiedState = (key: string) => {
    setCopiedKey(key);
    window.setTimeout(() => {
      setCopiedKey((current) => (current === key ? null : current));
    }, 1200);
  };

  const copyText = useCallback(
    async (key: string, text: string, successMessage: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopiedState(key);
        toast({
          title: "Copied",
          description: successMessage,
          duration: 1600,
        });
      } catch {
        toast({
          title: "Copy failed",
          description: "Could not copy to clipboard.",
          variant: "destructive",
        });
      }
    },
    [toast],
  );

  const downloadMarkdown = useCallback(() => {
    if (!pack) {
      return;
    }

    const blob = new Blob([pack.markdownKit], { type: "text/markdown;charset=utf-8" });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${pack.storyTitle.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase()}-publish-kit.md`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.URL.revokeObjectURL(url);
  }, [pack]);

  const downloadAutopipelineBundle = useCallback(
    (bundle: PublishingAutopipelineBundle) => {
      const payload = JSON.stringify(bundle, null, 2);
      const blob = new Blob([payload], {
        type: "application/json;charset=utf-8",
      });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const safeTitle = bundle.storyTitle
        .replace(/[^a-z0-9-_]+/gi, "-")
        .toLowerCase();
      anchor.href = url;
      anchor.download = `${safeTitle}-autopipeline-bundle.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.URL.revokeObjectURL(url);
    },
    [],
  );

  const runAutopipeline = useCallback(async () => {
    if (!storySlug || selectedChannels.length === 0) {
      return;
    }

    const liveQualityReport = pack
      ? evaluateStoryPublishingPackQuality(pack)
      : null;

    if (liveQualityReport && liveQualityReport.blockingIssueCount > 0) {
      const message =
        "Quality gates blocked autopipeline. Apply channel fixes first.";
      setAutopipelineStatus("failed");
      setAutopipelineError(message);
      toast({
        title: "Quality gates failed",
        description: message,
        variant: "destructive",
      });
      return;
    }

    setAutopipelineStatus("queued");
    setAutopipelineError(null);

    await new Promise((resolve) => {
      window.setTimeout(resolve, 120);
    });
    setAutopipelineStatus("running");

    try {
      const { data } = await requestJson<AutopipelineResponse>(
        `/api/stories/${storySlug}/autopipeline`,
        {
          method: "POST",
          body: {
            tone,
            styleMorphMode,
            emotionLock,
            channels: selectedChannels,
            storyUrl:
              typeof window !== "undefined" ? window.location.href : undefined,
          },
          timeoutMs: 90000,
        },
      );

      setPack(data.pack);
      setAutopipelineBundle(data.bundle);
      setAutopipelineStatus("completed");
      setLastAutopipelineRunAt(new Date().toISOString());
      downloadAutopipelineBundle(data.bundle);
      toast({
        title: "Autopipeline completed",
        description: "Export bundle generated and downloaded.",
        duration: 2200,
      });
    } catch (requestError) {
      const message =
        requestError instanceof ClientApiError
          ? requestError.requestId
            ? `${requestError.message} (ref: ${requestError.requestId})`
            : requestError.message
          : "Autopipeline failed. Please retry.";
      setAutopipelineStatus("failed");
      setAutopipelineError(message);
      toast({
        title: "Autopipeline failed",
        description: message,
        variant: "destructive",
      });
    }
  }, [
    downloadAutopipelineBundle,
    emotionLock,
    pack,
    selectedChannels,
    storySlug,
    styleMorphMode,
    toast,
    tone,
  ]);

  const loadPack = useCallback(async () => {
    if (!storySlug || selectedChannels.length === 0) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data } = await requestJson<PublishingResponse>(
        `/api/stories/${storySlug}/publish-pack`,
        {
          method: "POST",
          body: {
            tone,
            styleMorphMode,
            emotionLock,
            channels: selectedChannels,
            storyUrl: typeof window !== "undefined" ? window.location.href : undefined,
          },
        },
      );

      setPack(data.pack);
      if (!data.pack.channels.some((channel) => channel.channel === activeChannel)) {
        setActiveChannel(data.pack.channels[0]?.channel ?? DISTRIBUTION_CHANNELS[0]);
      }
    } catch (requestError) {
      const message =
        requestError instanceof ClientApiError
          ? requestError.requestId
            ? `${requestError.message} (ref: ${requestError.requestId})`
            : requestError.message
          : "Could not build publishing kit right now.";
      setError(message);
      setPack(null);
    } finally {
      setIsLoading(false);
    }
  }, [
    activeChannel,
    emotionLock,
    selectedChannels,
    storySlug,
    styleMorphMode,
    tone,
  ]);

  const loadIpReport = useCallback(async () => {
    if (!storySlug) {
      return;
    }

    setIsLoadingIpReport(true);
    setIpReportError(null);

    try {
      const { data } = await requestJson<IpIncubatorResponse>(
        `/api/stories/${storySlug}/ip-incubator`,
        {
          cache: "no-store",
          timeoutMs: 15000,
        },
      );
      setIpReport(data.report);
    } catch (requestError) {
      const message =
        requestError instanceof ClientApiError
          ? requestError.requestId
            ? `${requestError.message} (ref: ${requestError.requestId})`
            : requestError.message
          : "Could not load IP incubator report.";
      setIpReportError(message);
      setIpReport(null);
    } finally {
      setIsLoadingIpReport(false);
    }
  }, [storySlug]);

  const loadMerchReport = useCallback(async () => {
    if (!storySlug) {
      return;
    }

    setIsLoadingMerchReport(true);
    setMerchReportError(null);

    try {
      const { data } = await requestJson<MerchabilityResponse>(
        `/api/stories/${storySlug}/merch-experiments`,
        {
          cache: "no-store",
          timeoutMs: 15000,
        },
      );
      setMerchReport(data.report);
      setMerchPlan(null);
      setMerchPlanError(null);
      setSelectedMerchCandidateId((previous) => {
        if (previous && data.report.candidates.some((candidate) => candidate.id === previous)) {
          return previous;
        }
        return data.report.candidates[0]?.id ?? null;
      });
    } catch (requestError) {
      const message =
        requestError instanceof ClientApiError
          ? requestError.requestId
            ? `${requestError.message} (ref: ${requestError.requestId})`
            : requestError.message
          : "Could not load merchability report.";
      setMerchReportError(message);
      setMerchReport(null);
      setMerchPlan(null);
    } finally {
      setIsLoadingMerchReport(false);
    }
  }, [storySlug]);

  const runMerchPlanner = useCallback(async () => {
    if (!storySlug) {
      return;
    }

    setIsPlanningMerch(true);
    setMerchPlanError(null);

    try {
      const { data } = await requestJson<MerchPlanResponse>(
        `/api/stories/${storySlug}/merch-experiments`,
        {
          method: "POST",
          body: {
            candidateId: selectedMerchCandidateId ?? undefined,
            objective: merchObjective,
            budgetTier: merchBudgetTier,
            durationDays: merchDurationDays,
            channels: selectedChannels,
          },
          timeoutMs: 30000,
        },
      );
      setMerchReport(data.report);
      setMerchPlan(data.plan);
      setSelectedMerchCandidateId(data.plan.candidateId);
      toast({
        title: "Experiment plan ready",
        description: "Merch experiment plan generated.",
        duration: 1800,
      });
    } catch (requestError) {
      const message =
        requestError instanceof ClientApiError
          ? requestError.requestId
            ? `${requestError.message} (ref: ${requestError.requestId})`
            : requestError.message
          : "Could not build merch experiment plan.";
      setMerchPlanError(message);
      setMerchPlan(null);
      toast({
        title: "Planner failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsPlanningMerch(false);
    }
  }, [
    merchBudgetTier,
    merchDurationDays,
    merchObjective,
    selectedChannels,
    selectedMerchCandidateId,
    storySlug,
    toast,
  ]);

  const loadRoleBoard = useCallback(
    async (options?: {
      sprintObjective?: RoleAgentSprintObjective;
      horizonDays?: number;
    }) => {
    if (!storySlug) {
      return;
    }

    setIsLoadingRoleBoard(true);
    setRoleBoardError(null);

    const sprintObjective = options?.sprintObjective ?? "ship_next_drop";
    const horizonDays = options?.horizonDays ?? 7;
    const query = new URLSearchParams({
      sprintObjective,
      horizonDays: String(horizonDays),
    });

    try {
      const { data } = await requestJson<RoleAgentsResponse>(
        `/api/stories/${storySlug}/role-agents?${query.toString()}`,
        {
          cache: "no-store",
          timeoutMs: 15000,
        },
      );
      setRoleBoard(data.board);
      setRoleOwnerOverrides(() => {
        const next: Partial<Record<RoleAgentId, string>> = {};
        for (const role of data.board.roster) {
          if (role.ownerUserId) {
            next[role.id] = role.ownerUserId;
          }
        }
        return next;
      });
    } catch (requestError) {
      const message =
        requestError instanceof ClientApiError
          ? requestError.requestId
            ? `${requestError.message} (ref: ${requestError.requestId})`
            : requestError.message
          : "Could not load role agents board.";
      setRoleBoardError(message);
      setRoleBoard(null);
    } finally {
      setIsLoadingRoleBoard(false);
    }
    },
    [storySlug],
  );

  const runRolePlanner = useCallback(async () => {
    if (!storySlug) {
      return;
    }

    setIsPlanningRoleBoard(true);
    setRolePlanError(null);

    const ownerOverridesPayload = Object.entries(roleOwnerOverrides)
      .filter((entry) => Boolean(entry[1]))
      .map(([roleId, ownerUserId]) => ({
        roleId: roleId as RoleAgentId,
        ownerUserId: ownerUserId as string,
      }));

    try {
      const { data } = await requestJson<RoleAgentsPlanResponse>(
        `/api/stories/${storySlug}/role-agents`,
        {
          method: "POST",
          body: {
            sprintObjective: roleSprintObjective,
            horizonDays: roleHorizonDays,
            ownerOverrides:
              ownerOverridesPayload.length > 0
                ? ownerOverridesPayload
                : undefined,
            merchCandidateId: selectedMerchCandidateId ?? undefined,
            merchChannels: selectedChannels,
          },
          timeoutMs: 30000,
        },
      );
      setRoleBoard(data.board);
      if (data.merchPlan) {
        setMerchPlan(data.merchPlan);
      }
      setRoleOwnerOverrides(() => {
        const next: Partial<Record<RoleAgentId, string>> = {};
        for (const role of data.board.roster) {
          if (role.ownerUserId) {
            next[role.id] = role.ownerUserId;
          }
        }
        return next;
      });
      toast({
        title: "Role plan updated",
        description: "Collaborative role assignments and checklist refreshed.",
        duration: 1800,
      });
    } catch (requestError) {
      const message =
        requestError instanceof ClientApiError
          ? requestError.requestId
            ? `${requestError.message} (ref: ${requestError.requestId})`
            : requestError.message
          : "Could not build collaborative role plan.";
      setRolePlanError(message);
      toast({
        title: "Role planner failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsPlanningRoleBoard(false);
    }
  }, [
    roleOwnerOverrides,
    roleHorizonDays,
    roleSprintObjective,
    selectedChannels,
    selectedMerchCandidateId,
    storySlug,
    toast,
  ]);

  const loadEconomyPlan = useCallback(async () => {
    if (!storySlug) {
      return;
    }

    setIsLoadingEconomyPlan(true);
    setEconomyPlanError(null);

    const query = new URLSearchParams({
      sprintObjective: roleSprintObjective,
      horizonDays: String(roleHorizonDays),
      limit: "8",
    });

    try {
      const { data } = await requestJson<CreatorEconomyOrchestratorGetResponse>(
        `/api/stories/${storySlug}/economy-orchestrator?${query.toString()}`,
        {
          cache: "no-store",
          timeoutMs: 20000,
        },
      );
      setEconomyPlan(data.operatingPlan);
      setEconomyHistory(data.history);
      setRoleBoard(data.roleBoard);
      if (data.merchPlan) {
        setMerchPlan(data.merchPlan);
      }
      setEconomyDeltaReport(null);
    } catch (requestError) {
      const message =
        requestError instanceof ClientApiError
          ? requestError.requestId
            ? `${requestError.message} (ref: ${requestError.requestId})`
            : requestError.message
          : "Could not load economy operating plan.";
      setEconomyPlanError(message);
      setEconomyPlan(null);
    } finally {
      setIsLoadingEconomyPlan(false);
    }
  }, [roleHorizonDays, roleSprintObjective, storySlug]);

  const loadAutomationPlan = useCallback(async () => {
    if (!storySlug) {
      return;
    }

    setIsLoadingAutomationPlan(true);
    setAutomationPlanError(null);

    const query = new URLSearchParams({
      sprintObjective: roleSprintObjective,
      horizonDays: String(roleHorizonDays),
      limit: "8",
    });

    try {
      const { data } = await requestJson<CreatorEconomyAutomationGetResponse>(
        `/api/stories/${storySlug}/economy-automation?${query.toString()}`,
        {
          cache: "no-store",
          timeoutMs: 20000,
        },
      );
      setAutomationPlan(data.automationPlan);
      setEconomyPlan(data.operatingPlan);
      setEconomyHistory(data.history);
      setRoleBoard(data.roleBoard);
      setAutomationExecutionError(null);
    } catch (requestError) {
      const message =
        requestError instanceof ClientApiError
          ? requestError.requestId
            ? `${requestError.message} (ref: ${requestError.requestId})`
            : requestError.message
          : "Could not load automation triggers.";
      setAutomationPlanError(message);
      setAutomationPlan(null);
    } finally {
      setIsLoadingAutomationPlan(false);
    }
  }, [roleHorizonDays, roleSprintObjective, storySlug]);

  const runAutomationRecommendation = useCallback(
    async (recommendationId: string) => {
      if (!storySlug) {
        return;
      }

      setExecutingAutomationRecommendationId(recommendationId);
      setAutomationExecutionError(null);

      const ownerOverridesPayload = Object.entries(roleOwnerOverrides)
        .filter((entry) => Boolean(entry[1]))
        .map(([roleId, ownerUserId]) => ({
          roleId: roleId as RoleAgentId,
          ownerUserId: ownerUserId as string,
        }));

      try {
        const { data } = await requestJson<CreatorEconomyAutomationPostResponse>(
          `/api/stories/${storySlug}/economy-automation`,
          {
            method: "POST",
            body: {
              recommendationId,
              ownerOverrides:
                ownerOverridesPayload.length > 0
                  ? ownerOverridesPayload
                  : undefined,
              sprintObjective: roleSprintObjective,
              horizonDays: roleHorizonDays,
              merchCandidateId: selectedMerchCandidateId ?? undefined,
              merchChannels: selectedChannels,
              persist: true,
            },
            timeoutMs: 30000,
          },
        );

        setAutomationPlan(data.automationPlan);
        setEconomyPlan(data.operatingPlan);
        setEconomyHistory(data.history);
        setRoleBoard(data.roleBoard);
        if (data.merchPlan) {
          setMerchPlan(data.merchPlan);
        }
        setRoleSprintObjective(data.execution.sprintObjective);
        setRoleHorizonDays(data.execution.horizonDays);
        if (data.execution.merchCandidateId) {
          setSelectedMerchCandidateId(data.execution.merchCandidateId);
        }
        if (data.execution.merchChannels.length > 0) {
          setSelectedChannels(data.execution.merchChannels);
        }
        setEconomyDeltaReport(null);

        toast({
          title: "Automation executed",
          description: `${data.executedRecommendation.title} is now queued as a tracked run.`,
          duration: 2200,
        });
      } catch (requestError) {
        const message =
          requestError instanceof ClientApiError
            ? requestError.requestId
              ? `${requestError.message} (ref: ${requestError.requestId})`
              : requestError.message
            : "Could not execute automation recommendation.";
        setAutomationExecutionError(message);
        toast({
          title: "Automation failed",
          description: message,
          variant: "destructive",
        });
      } finally {
        setExecutingAutomationRecommendationId(null);
      }
    },
    [
      roleOwnerOverrides,
      roleHorizonDays,
      roleSprintObjective,
      selectedChannels,
      selectedMerchCandidateId,
      storySlug,
      toast,
    ],
  );

  const loadAutonomousBacklog = useCallback(async () => {
    if (!storySlug) {
      return;
    }

    setIsLoadingAutonomousBacklog(true);
    setAutonomousBacklogError(null);

    const query = new URLSearchParams({
      mode: autonomyMode,
      sprintObjective: roleSprintObjective,
      horizonDays: String(roleHorizonDays),
      limit: "10",
    });

    try {
      const { data } = await requestJson<CreatorEconomyBacklogGetResponse>(
        `/api/stories/${storySlug}/economy-backlog?${query.toString()}`,
        {
          cache: "no-store",
          timeoutMs: 20000,
        },
      );
      setAutonomousDecisionPolicy(data.decisionPolicy);
      setAutonomousGovernance(data.governance ?? null);
      setPolicyLearningReport(data.policyLearning ?? null);
      setOutcomeAgentPlan(data.outcomeAgentPlan ?? null);
      setAutonomousBacklog(data.backlog);
      setAutomationPlan(data.automationPlan);
      setEconomyPlan(data.operatingPlan);
      setEconomyHistory(data.history);
      setRoleBoard(data.roleBoard);
      setPolicyLearningError(null);
      setOutcomeAgentError(null);
      setAutorunSummary(null);
      setAutorunError(null);
    } catch (requestError) {
      const message =
        requestError instanceof ClientApiError
          ? requestError.requestId
            ? `${requestError.message} (ref: ${requestError.requestId})`
            : requestError.message
          : "Could not load autonomous backlog.";
      setAutonomousBacklogError(message);
      setAutonomousBacklog(null);
      setAutonomousGovernance(null);
    } finally {
      setIsLoadingAutonomousBacklog(false);
    }
  }, [autonomyMode, roleHorizonDays, roleSprintObjective, storySlug]);

  const loadPolicyLearningLoop = useCallback(async () => {
    if (!storySlug) {
      return;
    }

    setIsLoadingPolicyLearning(true);
    setPolicyLearningError(null);

    const query = new URLSearchParams({
      mode: autonomyMode,
      sprintObjective: roleSprintObjective,
      horizonDays: String(roleHorizonDays),
      limit: "12",
    });

    try {
      const { data } = await requestJson<CreatorEconomyPolicyLearningResponse>(
        `/api/stories/${storySlug}/economy-policy-learning?${query.toString()}`,
        {
          cache: "no-store",
          timeoutMs: 20000,
        },
      );
      setAutonomousDecisionPolicy(data.decisionPolicy);
      setAutonomousGovernance(data.governance ?? null);
      setPolicyLearningReport(data.learning);
      setAutonomousBacklog(data.backlog);
      setEconomyHistory(data.history);
      setPolicyLearningError(null);
    } catch (requestError) {
      const message =
        requestError instanceof ClientApiError
          ? requestError.requestId
            ? `${requestError.message} (ref: ${requestError.requestId})`
            : requestError.message
          : "Could not load policy learning loop.";
      setPolicyLearningError(message);
      setAutonomousGovernance(null);
    } finally {
      setIsLoadingPolicyLearning(false);
    }
  }, [autonomyMode, roleHorizonDays, roleSprintObjective, storySlug]);

  const loadOptimizer = useCallback(async () => {
    if (!storySlug) {
      return;
    }

    setIsLoadingOptimizer(true);
    setOptimizerError(null);

    const query = new URLSearchParams({
      mode: autonomyMode,
      objective: optimizerObjective,
      sprintObjective: roleSprintObjective,
      horizonDays: String(roleHorizonDays),
      cadenceHours: String(strategyCadenceHours),
      autoOptimize: strategyAutoOptimize ? "true" : "false",
      limit: "12",
    });

    try {
      const { data } = await requestJson<CreatorEconomyOptimizerResponse>(
        `/api/stories/${storySlug}/economy-optimizer?${query.toString()}`,
        {
          cache: "no-store",
          timeoutMs: 22000,
        },
      );
      setAutonomousDecisionPolicy(data.optimizedPolicy);
      setAutonomousGovernance(data.governance);
      setPolicyLearningReport(data.learning);
      setOptimizerReport(data.optimizerReport);
      setOptimizerObjective(data.objective);
      setOptimizerPolicyPreview(data.optimizedPolicy);
      setOptimizerPreviewExecution(data.previewExecution);
      setAutonomousBacklog(data.optimizedBacklog);
      setEconomyHistory(data.history);
      setOptimizerSummary(`Loaded ${data.objective} optimizer profile.`);
      setOptimizerError(null);
    } catch (requestError) {
      const message =
        requestError instanceof ClientApiError
          ? requestError.requestId
            ? `${requestError.message} (ref: ${requestError.requestId})`
            : requestError.message
          : "Could not load optimizer profile.";
      setOptimizerError(message);
      setOptimizerReport(null);
      setOptimizerPolicyPreview(null);
      setOptimizerPreviewExecution([]);
    } finally {
      setIsLoadingOptimizer(false);
    }
  }, [
    autonomyMode,
    optimizerObjective,
    roleHorizonDays,
    roleSprintObjective,
    storySlug,
  ]);

  const runOptimizerPreview = useCallback(async () => {
    if (!storySlug) {
      return;
    }

    setIsRunningOptimizerPreview(true);
    setOptimizerError(null);
    setOptimizerSummary(null);

    try {
      const { data } = await requestJson<CreatorEconomyOptimizerResponse>(
        `/api/stories/${storySlug}/economy-optimizer`,
        {
          method: "POST",
          body: {
            mode: autonomyMode,
            objective: optimizerObjective,
            sprintObjective: roleSprintObjective,
            horizonDays: roleHorizonDays,
            maxActions: autonomyMaxActions,
            limit: 12,
          },
          timeoutMs: 28000,
        },
      );

      setAutonomousDecisionPolicy(data.optimizedPolicy);
      setAutonomousGovernance(data.governance);
      setPolicyLearningReport(data.learning);
      setOptimizerReport(data.optimizerReport);
      setOptimizerObjective(data.objective);
      setOptimizerPolicyPreview(data.optimizedPolicy);
      setOptimizerPreviewExecution(data.previewExecution);
      setAutonomousBacklog(data.optimizedBacklog);
      setEconomyHistory(data.history);
      setOptimizerSummary(
        data.summary ??
          `${data.previewExecution.length} recommendation(s) are execution-ready for ${data.objective}.`,
      );
      toast({
        title: "Optimizer simulation ready",
        description:
          data.summary ??
          `${data.previewExecution.length} recommendation(s) prepared for review.`,
        duration: 2200,
      });
    } catch (requestError) {
      const message =
        requestError instanceof ClientApiError
          ? requestError.requestId
            ? `${requestError.message} (ref: ${requestError.requestId})`
            : requestError.message
          : "Could not simulate optimizer profile.";
      setOptimizerError(message);
      toast({
        title: "Optimizer simulation failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsRunningOptimizerPreview(false);
    }
  }, [
    autonomyMaxActions,
    autonomyMode,
    optimizerObjective,
    roleHorizonDays,
    roleSprintObjective,
    storySlug,
    toast,
  ]);

  const loadStrategyLoop = useCallback(async () => {
    if (!storySlug) {
      return;
    }

    setIsLoadingStrategyLoop(true);
    setStrategyError(null);

    const query = new URLSearchParams({
      mode: autonomyMode,
      objective: optimizerObjective,
      sprintObjective: roleSprintObjective,
      horizonDays: String(roleHorizonDays),
      limit: "12",
    });

    try {
      const { data } = await requestJson<CreatorEconomyStrategyLoopResponse>(
        `/api/stories/${storySlug}/economy-strategy-loop?${query.toString()}`,
        {
          cache: "no-store",
          timeoutMs: 22000,
        },
      );
      setAutonomousDecisionPolicy(data.strategyPolicy);
      setAutonomousGovernance(data.governance);
      setPolicyLearningReport(data.learning);
      setOptimizerReport(data.optimizerReport);
      setOptimizerObjective(data.objective);
      setStrategyLoopReport(data.strategyLoop);
      setStrategyWindowReport(data.windowReport);
      setSelfHealingReport(data.selfHealingReport);
      setStrategyCadenceHours(data.cadenceHours);
      setStrategyAutoOptimize(data.autoOptimizeEnabled);
      setStrategyPolicyPreview(data.strategyPolicy);
      setStrategyPreviewExecution(data.previewExecution);
      setAutonomousBacklog(data.strategyBacklog);
      setEconomyHistory(data.history);
      setStrategySummary(
        `Loaded strategy loop at ${data.cadenceHours}h cadence (${data.autoOptimizeEnabled ? "auto-optimized" : "operator-controlled"}).`,
      );
      setStrategyError(null);
    } catch (requestError) {
      const message =
        requestError instanceof ClientApiError
          ? requestError.requestId
            ? `${requestError.message} (ref: ${requestError.requestId})`
            : requestError.message
          : "Could not load strategy loop.";
      setStrategyError(message);
      setStrategyLoopReport(null);
      setStrategyWindowReport(null);
      setSelfHealingReport(null);
      setStrategyPolicyPreview(null);
      setStrategyPreviewExecution([]);
    } finally {
      setIsLoadingStrategyLoop(false);
    }
  }, [
    autonomyMode,
    optimizerObjective,
    roleHorizonDays,
    roleSprintObjective,
    strategyAutoOptimize,
    strategyCadenceHours,
    storySlug,
  ]);

  const runStrategyLoopSimulation = useCallback(async () => {
    if (!storySlug) {
      return;
    }

    setIsRunningStrategyLoopSimulation(true);
    setStrategyError(null);
    setStrategySummary(null);

    try {
      const { data } = await requestJson<CreatorEconomyStrategyLoopResponse>(
        `/api/stories/${storySlug}/economy-strategy-loop`,
        {
          method: "POST",
          body: {
            mode: autonomyMode,
            objective: optimizerObjective,
            sprintObjective: roleSprintObjective,
            horizonDays: roleHorizonDays,
            cadenceHours: strategyCadenceHours,
            autoOptimize: strategyAutoOptimize,
            maxActions: autonomyMaxActions,
            limit: 12,
          },
          timeoutMs: 28000,
        },
      );

      setAutonomousDecisionPolicy(data.strategyPolicy);
      setAutonomousGovernance(data.governance);
      setPolicyLearningReport(data.learning);
      setOptimizerReport(data.optimizerReport);
      setOptimizerObjective(data.objective);
      setStrategyLoopReport(data.strategyLoop);
      setStrategyWindowReport(data.windowReport);
      setSelfHealingReport(data.selfHealingReport);
      setStrategyCadenceHours(data.cadenceHours);
      setStrategyAutoOptimize(data.autoOptimizeEnabled);
      setStrategyPolicyPreview(data.strategyPolicy);
      setStrategyPreviewExecution(data.previewExecution);
      setAutonomousBacklog(data.strategyBacklog);
      setEconomyHistory(data.history);
      setStrategySummary(
        data.summary ??
          `Strategy loop generated ${data.strategyLoop.cycles.length} planned cycle(s).`,
      );
      toast({
        title: "Strategy loop simulated",
        description:
          data.summary ??
          `${data.strategyLoop.cycles.length} cycle(s) planned for autonomous execution.`,
        duration: 2200,
      });
    } catch (requestError) {
      const message =
        requestError instanceof ClientApiError
          ? requestError.requestId
            ? `${requestError.message} (ref: ${requestError.requestId})`
            : requestError.message
          : "Could not simulate strategy loop.";
      setStrategyError(message);
      toast({
        title: "Strategy simulation failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsRunningStrategyLoopSimulation(false);
    }
  }, [
    autonomyMaxActions,
    autonomyMode,
    optimizerObjective,
    roleHorizonDays,
    roleSprintObjective,
    strategyAutoOptimize,
    strategyCadenceHours,
    storySlug,
    toast,
  ]);

  const runStrategyWindowExecution = useCallback(
    async (dryRun = false) => {
      if (!storySlug) {
        return;
      }

      setIsRunningStrategyWindowExecution(true);
      setStrategyError(null);

      try {
        const { data } = await requestJson<CreatorEconomyStrategyLoopResponse>(
          `/api/stories/${storySlug}/economy-strategy-loop`,
          {
            method: "POST",
            body: {
              mode: autonomyMode,
              objective: optimizerObjective,
              sprintObjective: roleSprintObjective,
              horizonDays: roleHorizonDays,
              cadenceHours: strategyCadenceHours,
              autoOptimize: strategyAutoOptimize,
              maxActions: autonomyMaxActions,
              executeWindow: true,
              dryRun,
              persist: !dryRun,
              force: false,
              limit: 12,
            },
            timeoutMs: 30000,
          },
        );

        setAutonomousDecisionPolicy(data.strategyPolicy);
        setAutonomousGovernance(data.governance);
        setPolicyLearningReport(data.learning);
        setOptimizerReport(data.optimizerReport);
        setOptimizerObjective(data.objective);
        setStrategyLoopReport(data.strategyLoop);
        setStrategyWindowReport(data.windowReport);
        setSelfHealingReport(data.selfHealingReport);
        setStrategyCadenceHours(data.cadenceHours);
        setStrategyAutoOptimize(data.autoOptimizeEnabled);
        setStrategyPolicyPreview(data.strategyPolicy);
        setStrategyPreviewExecution(data.previewExecution);
        setAutonomousBacklog(data.strategyBacklog);
        setEconomyHistory(data.history);
        setStrategySummary(
          data.summary ??
            `${dryRun ? "Previewed" : "Executed"} ${data.executed.length} window item(s).`,
        );

        toast({
          title: data.blockedByWindowGate
            ? "Window execution blocked"
            : dryRun
              ? "Window dry run complete"
              : "Window execution complete",
          description:
            data.summary ??
            `${dryRun ? "Previewed" : "Executed"} ${data.executed.length} recommendation(s).`,
          variant: data.blockedByWindowGate ? "destructive" : "default",
          duration: 2200,
        });
      } catch (requestError) {
        const message =
          requestError instanceof ClientApiError
            ? requestError.requestId
              ? `${requestError.message} (ref: ${requestError.requestId})`
              : requestError.message
            : "Could not execute strategy window.";
        setStrategyError(message);
        toast({
          title: "Window execution failed",
          description: message,
          variant: "destructive",
        });
      } finally {
        setIsRunningStrategyWindowExecution(false);
      }
    },
    [
      autonomyMaxActions,
      autonomyMode,
      optimizerObjective,
      roleHorizonDays,
      roleSprintObjective,
      strategyAutoOptimize,
      strategyCadenceHours,
      storySlug,
      toast,
    ],
  );

  const runSelfHealingExecution = useCallback(
    async (dryRun = false) => {
      if (!storySlug) {
        return;
      }

      setIsRunningSelfHealing(true);
      setStrategyError(null);

      try {
        const { data } = await requestJson<CreatorEconomyStrategyLoopResponse>(
          `/api/stories/${storySlug}/economy-strategy-loop`,
          {
            method: "POST",
            body: {
              mode: autonomyMode,
              objective: optimizerObjective,
              sprintObjective: roleSprintObjective,
              horizonDays: roleHorizonDays,
              cadenceHours: strategyCadenceHours,
              autoOptimize: strategyAutoOptimize,
              maxActions: autonomyMaxActions,
              selfHeal: true,
              executeRecovery: true,
              dryRun,
              persist: !dryRun,
              force: false,
              limit: 12,
            },
            timeoutMs: 30000,
          },
        );

        setAutonomousDecisionPolicy(data.strategyPolicy);
        setAutonomousGovernance(data.governance);
        setPolicyLearningReport(data.learning);
        setOptimizerReport(data.optimizerReport);
        setOptimizerObjective(data.objective);
        setStrategyLoopReport(data.strategyLoop);
        setStrategyWindowReport(data.windowReport);
        setSelfHealingReport(data.selfHealingReport);
        setStrategyCadenceHours(data.cadenceHours);
        setStrategyAutoOptimize(data.autoOptimizeEnabled);
        setStrategyPolicyPreview(data.strategyPolicy);
        setStrategyPreviewExecution(data.previewExecution);
        setAutonomousBacklog(data.strategyBacklog);
        setEconomyHistory(data.history);
        setStrategySummary(
          data.summary ??
            `${dryRun ? "Previewed" : "Executed"} ${data.recoveryExecuted.length} self-healing recovery action(s).`,
        );

        toast({
          title: dryRun
            ? "Self-healing preview complete"
            : "Self-healing executed",
          description:
            data.summary ??
            `${dryRun ? "Previewed" : "Executed"} ${data.recoveryExecuted.length} recovery recommendation(s).`,
          duration: 2400,
        });
      } catch (requestError) {
        const message =
          requestError instanceof ClientApiError
            ? requestError.requestId
              ? `${requestError.message} (ref: ${requestError.requestId})`
              : requestError.message
            : "Could not execute self-healing recovery loop.";
        setStrategyError(message);
        toast({
          title: "Self-healing failed",
          description: message,
          variant: "destructive",
        });
      } finally {
        setIsRunningSelfHealing(false);
      }
    },
    [
      autonomyMaxActions,
      autonomyMode,
      optimizerObjective,
      roleHorizonDays,
      roleSprintObjective,
      strategyAutoOptimize,
      strategyCadenceHours,
      storySlug,
      toast,
    ],
  );

  const applyOptimizerControls = useCallback(() => {
    if (!optimizerPolicyPreview) {
      return;
    }

    setAutonomyMode(optimizerPolicyPreview.mode);
    setAutonomyMaxActions(optimizerPolicyPreview.maxActionsPerCycle);
    setAutorunSummary(
      `Applied optimizer controls: mode ${optimizerPolicyPreview.mode}, max actions ${optimizerPolicyPreview.maxActionsPerCycle}.`,
    );
    toast({
      title: "Optimizer controls applied",
      description: "Autonomy mode and action cap were updated from optimizer profile.",
      duration: 1800,
    });
  }, [optimizerPolicyPreview, toast]);

  const applyStrategyControls = useCallback(() => {
    if (!strategyPolicyPreview) {
      return;
    }

    setAutonomyMode(strategyPolicyPreview.mode);
    setAutonomyMaxActions(strategyPolicyPreview.maxActionsPerCycle);
    if (strategyLoopReport?.cycles[0]) {
      setOptimizerObjective(strategyLoopReport.cycles[0].objective);
    }
    setAutorunSummary(
      `Applied strategy cycle controls: ${strategyPolicyPreview.mode}, ${strategyPolicyPreview.maxActionsPerCycle} action(s), ${strategyPolicyPreview.cooldownHours}h cooldown.`,
    );
    toast({
      title: "Strategy controls applied",
      description: "Autonomy controls were updated from cycle 1 strategy plan.",
      duration: 1800,
    });
  }, [strategyLoopReport, strategyPolicyPreview, toast]);

  const runOutcomeAgent = useCallback(
    async (dryRun = false) => {
      if (!storySlug) {
        return;
      }

      setIsRunningOutcomeAgent(true);
      setOutcomeAgentError(null);
      setOutcomeAgentSummary(null);

      const endpoint = `/api/stories/${storySlug}/economy-outcome-agent`;
      const method = dryRun ? "GET" : "POST";

      try {
        const { data } = await requestJson<CreatorEconomyOutcomeAgentResponse>(
          dryRun
            ? `${endpoint}?${new URLSearchParams({
                mode: autonomyMode,
                sprintObjective: roleSprintObjective,
                horizonDays: String(roleHorizonDays),
                staleAfterHours: String(outcomeAgentStaleAfterHours),
                maxRuns: String(outcomeAgentMaxRuns),
                limit: "12",
              }).toString()}`
            : endpoint,
          dryRun
            ? {
                cache: "no-store",
                timeoutMs: 22000,
              }
            : {
                method,
                body: {
                  mode: autonomyMode,
                  sprintObjective: roleSprintObjective,
                  horizonDays: roleHorizonDays,
                  staleAfterHours: outcomeAgentStaleAfterHours,
                  maxRuns: outcomeAgentMaxRuns,
                  dryRun: false,
                  persist: true,
                },
                timeoutMs: 30000,
              },
        );

        setAutonomousDecisionPolicy(data.decisionPolicy);
        setPolicyLearningReport(data.learning);
        setOutcomeAgentPlan(data.plan);
        setEconomyHistory(data.history);

        if (!dryRun) {
          void loadAutonomousBacklog();
        }

        const summary = dryRun
          ? `${data.selectedCandidates.length} stale run(s) ready for closure.`
          : `${data.closedRuns?.length ?? 0} stale run(s) auto-closed.`;
        setOutcomeAgentSummary(summary);
        toast({
          title: dryRun ? "Outcome agent preview ready" : "Outcome agent completed",
          description: summary,
          duration: 2200,
        });
      } catch (requestError) {
        const message =
          requestError instanceof ClientApiError
            ? requestError.requestId
              ? `${requestError.message} (ref: ${requestError.requestId})`
              : requestError.message
            : "Could not run outcome-closing agent.";
        setOutcomeAgentError(message);
        toast({
          title: "Outcome agent failed",
          description: message,
          variant: "destructive",
        });
      } finally {
        setIsRunningOutcomeAgent(false);
      }
    },
    [
      autonomyMode,
      loadAutonomousBacklog,
      outcomeAgentMaxRuns,
      outcomeAgentStaleAfterHours,
      roleHorizonDays,
      roleSprintObjective,
      storySlug,
      toast,
    ],
  );

  const runBacklogRecommendation = useCallback(
    async (recommendationId: string) => {
      if (!storySlug) {
        return;
      }

      setExecutingBacklogRecommendationId(recommendationId);
      setAutonomousBacklogError(null);

      const ownerOverridesPayload = Object.entries(roleOwnerOverrides)
        .filter((entry) => Boolean(entry[1]))
        .map(([roleId, ownerUserId]) => ({
          roleId: roleId as RoleAgentId,
          ownerUserId: ownerUserId as string,
        }));

      try {
        const { data } = await requestJson<CreatorEconomyBacklogPostResponse>(
          `/api/stories/${storySlug}/economy-backlog`,
          {
            method: "POST",
            body: {
              recommendationId,
              mode: autonomyMode,
              ownerOverrides:
                ownerOverridesPayload.length > 0
                  ? ownerOverridesPayload
                  : undefined,
              sprintObjective: roleSprintObjective,
              horizonDays: roleHorizonDays,
              merchCandidateId: selectedMerchCandidateId ?? undefined,
              merchChannels: selectedChannels,
              persist: true,
            },
            timeoutMs: 30000,
          },
        );

        setAutonomousDecisionPolicy(data.decisionPolicy);
        setAutonomousGovernance(data.governance ?? null);
        setPolicyLearningReport(data.policyLearning ?? null);
        setOutcomeAgentPlan(data.outcomeAgentPlan ?? null);
        setAutonomousBacklog(data.backlog);
        setAutomationPlan(data.automationPlan);
        setEconomyPlan(data.operatingPlan);
        setEconomyHistory(data.history);
        setRoleBoard(data.roleBoard);
        if (data.merchPlan) {
          setMerchPlan(data.merchPlan);
        }
        setPolicyLearningError(null);
        setOutcomeAgentError(null);
        setAutorunSummary(`${data.executedRecommendation.title} queued successfully.`);
        setAutorunError(null);
        toast({
          title: "Backlog item executed",
          description: `${data.executedRecommendation.title} was added as a tracked run.`,
          duration: 2200,
        });
      } catch (requestError) {
        const message =
          requestError instanceof ClientApiError
            ? requestError.requestId
              ? `${requestError.message} (ref: ${requestError.requestId})`
              : requestError.message
            : "Could not execute backlog recommendation.";
        setAutonomousBacklogError(message);
        toast({
          title: "Backlog execution failed",
          description: message,
          variant: "destructive",
        });
      } finally {
        setExecutingBacklogRecommendationId(null);
      }
    },
    [
      autonomyMode,
      roleOwnerOverrides,
      roleHorizonDays,
      roleSprintObjective,
      selectedChannels,
      selectedMerchCandidateId,
      storySlug,
      toast,
    ],
  );

  const runAutorunCycle = useCallback(
    async (dryRun = false, force = false) => {
      if (!storySlug) {
        return;
      }

      setIsRunningAutorunCycle(true);
      setAutorunError(null);

      const ownerOverridesPayload = Object.entries(roleOwnerOverrides)
        .filter((entry) => Boolean(entry[1]))
        .map(([roleId, ownerUserId]) => ({
          roleId: roleId as RoleAgentId,
          ownerUserId: ownerUserId as string,
        }));

      try {
        const { data } = await requestJson<CreatorEconomyAutorunResponse>(
          `/api/stories/${storySlug}/economy-autorun`,
          {
            method: "POST",
            body: {
              mode: autonomyMode,
              maxActions: autonomyMaxActions,
              ownerOverrides:
                ownerOverridesPayload.length > 0
                  ? ownerOverridesPayload
                  : undefined,
              persist: true,
              dryRun,
              force,
            },
            timeoutMs: 45000,
          },
        );

        setAutonomousDecisionPolicy(data.decisionPolicy);
        setAutonomousGovernance(data.governance ?? null);
        setPolicyLearningReport(data.policyLearning ?? null);
        setOutcomeAgentPlan(data.outcomeAgentPlan ?? null);
        setAutonomousBacklog(data.backlog);
        setEconomyHistory(data.history);
        setPolicyLearningError(null);
        setOutcomeAgentError(null);
        const summary = data.blockedByGovernance
          ? `Governance paused autorun. ${data.skipped[0]?.reason ?? "Review governance notes and force-run only if needed."}`
          : `${data.executed.length} executed, ${data.skipped.length} skipped${
              data.dryRun ? " (dry run)" : ""
            }.`;
        setAutorunSummary(summary);
        setAutorunError(null);
        toast({
          title: data.blockedByGovernance
            ? "Autorun paused by governance"
            : data.dryRun
              ? "Autorun dry run complete"
              : "Autorun cycle complete",
          description: summary,
          duration: 2200,
        });
      } catch (requestError) {
        const message =
          requestError instanceof ClientApiError
            ? requestError.requestId
              ? `${requestError.message} (ref: ${requestError.requestId})`
              : requestError.message
            : "Could not run autonomous cycle.";
        setAutorunError(message);
        toast({
          title: "Autorun failed",
          description: message,
          variant: "destructive",
        });
      } finally {
        setIsRunningAutorunCycle(false);
      }
    },
    [
      autonomyMaxActions,
      autonomyMode,
      roleOwnerOverrides,
      storySlug,
      toast,
    ],
  );

  const saveEconomyPlan = useCallback(async () => {
    if (!storySlug) {
      return;
    }

    setIsSavingEconomyPlan(true);
    setEconomyPlanError(null);

    const ownerOverridesPayload = Object.entries(roleOwnerOverrides)
      .filter((entry) => Boolean(entry[1]))
      .map(([roleId, ownerUserId]) => ({
        roleId: roleId as RoleAgentId,
        ownerUserId: ownerUserId as string,
      }));

    try {
      const { data } = await requestJson<CreatorEconomyOrchestratorPostResponse>(
        `/api/stories/${storySlug}/economy-orchestrator`,
        {
          method: "POST",
          body: {
            sprintObjective: roleSprintObjective,
            horizonDays: roleHorizonDays,
            ownerOverrides:
              ownerOverridesPayload.length > 0
                ? ownerOverridesPayload
                : undefined,
            merchCandidateId: selectedMerchCandidateId ?? undefined,
            merchChannels: selectedChannels,
            persist: true,
          },
          timeoutMs: 30000,
        },
      );
      setEconomyPlan(data.operatingPlan);
      setEconomyHistory(data.history);
      setRoleBoard(data.roleBoard);
      if (data.merchPlan) {
        setMerchPlan(data.merchPlan);
      }
      setEconomyDeltaReport(null);
      toast({
        title: "Operating plan saved",
        description: "Creator economy run saved to history.",
        duration: 1800,
      });
    } catch (requestError) {
      const message =
        requestError instanceof ClientApiError
          ? requestError.requestId
            ? `${requestError.message} (ref: ${requestError.requestId})`
            : requestError.message
          : "Could not save economy operating plan.";
      setEconomyPlanError(message);
      toast({
        title: "Save failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsSavingEconomyPlan(false);
    }
  }, [
    roleOwnerOverrides,
    roleHorizonDays,
    roleSprintObjective,
    selectedChannels,
    selectedMerchCandidateId,
    storySlug,
    toast,
  ]);

  const recordEconomyOutcome = useCallback(async () => {
    if (!storySlug || economyHistory.length === 0) {
      return;
    }

    const latestRun = economyHistory[0];
    if (!latestRun) {
      return;
    }

    setIsRecordingEconomyOutcome(true);
    setEconomyOutcomeError(null);

    try {
      const { data } = await requestJson<CreatorEconomyOrchestratorPatchResponse>(
        `/api/stories/${storySlug}/economy-orchestrator`,
        {
          method: "PATCH",
          body: {
            runId: latestRun.id,
            status: "completed",
            outcomeDecision: economyOutcomeDecision,
            outcomeNotes: economyOutcomeNotes.trim() || undefined,
          },
          timeoutMs: 30000,
        },
      );
      setEconomyHistory((previous) =>
        previous.map((run) => (run.id === data.run.id ? data.run : run)),
      );
      setEconomyDeltaReport(data.deltaReport);
      toast({
        title: "Outcome recorded",
        description: "Run outcome saved and delta summary updated.",
        duration: 1800,
      });
    } catch (requestError) {
      const message =
        requestError instanceof ClientApiError
          ? requestError.requestId
            ? `${requestError.message} (ref: ${requestError.requestId})`
            : requestError.message
          : "Could not record run outcome.";
      setEconomyOutcomeError(message);
      toast({
        title: "Outcome save failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsRecordingEconomyOutcome(false);
    }
  }, [
    economyHistory,
    economyOutcomeDecision,
    economyOutcomeNotes,
    storySlug,
    toast,
  ]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    void loadPack();
    void loadIpReport();
    void loadMerchReport();
    void loadRoleBoard({
      sprintObjective: roleSprintObjective,
      horizonDays: roleHorizonDays,
    });
    void loadEconomyPlan();
    void loadAutomationPlan();
    void loadAutonomousBacklog();
    void loadOptimizer();
    void loadStrategyLoop();
  }, [
    isOpen,
    loadAutomationPlan,
    loadAutonomousBacklog,
    loadEconomyPlan,
    loadIpReport,
    loadMerchReport,
    loadPack,
    loadOptimizer,
    loadStrategyLoop,
    loadRoleBoard,
    roleHorizonDays,
    roleSprintObjective,
  ]);

  useEffect(() => {
    if (selectedChannels.includes(activeChannel)) {
      return;
    }

    setActiveChannel(selectedChannels[0] ?? DISTRIBUTION_CHANNELS[0]);
  }, [activeChannel, selectedChannels]);

  const toggleChannel = (channel: DistributionChannel) => {
    setSelectedChannels((previous) => {
      if (previous.includes(channel)) {
        if (previous.length === 1) {
          return previous;
        }

        return previous.filter((entry) => entry !== channel);
      }

      return [...previous, channel];
    });
  };

  const qualityReport = useMemo(
    () => (pack ? evaluateStoryPublishingPackQuality(pack) : null),
    [pack],
  );

  const qualityByChannel = useMemo(() => {
    if (!qualityReport) {
      return new Map<DistributionChannel, PublishingQualityReport["channelResults"][number]>();
    }

    return new Map(
      qualityReport.channelResults.map((result) => [result.channel, result]),
    );
  }, [qualityReport]);

  const applyQuickFix = useCallback(
    (channel: DistributionChannel, check: PublishingQualityCheck) => {
      if (!check.fixAction) {
        return;
      }
      const fixAction = check.fixAction;

      setPack((previous) => {
        if (!previous) {
          return previous;
        }

        return applyPublishingQuickFix({
          pack: previous,
          channel,
          action: fixAction,
        });
      });
      setAutopipelineStatus("idle");
      setAutopipelineError(null);
    },
    [],
  );

  const autopipelineStatusLabel: Record<AutopipelineStatus, string> = {
    idle: "Idle",
    queued: "Queued",
    running: "Running",
    completed: "Completed",
    failed: "Failed",
  };

  const incubatorBandLabel: Record<IpIncubatorReport["band"], string> = {
    launch_ready: "Launch Ready",
    promising: "Promising",
    early_signal: "Early Signal",
    concept_only: "Concept Only",
  };

  const merchReadinessBandLabel: Record<
    MerchabilityDetectorReport["readinessBand"],
    string
  > = {
    market_ready: "Market Ready",
    pilot_ready: "Pilot Ready",
    emerging: "Emerging",
    early_concept: "Early Concept",
  };

  const selectedMerchCandidate: MerchabilityCandidate | null =
    merchReport?.candidates.find(
      (candidate) => candidate.id === selectedMerchCandidateId,
    ) ?? null;
  const governancePaused = autonomousGovernance?.status === "paused";
  const governanceWatch = autonomousGovernance?.status === "watch";

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="comic-surface-strong border-white/15 sm:max-w-5xl max-h-[90vh] p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-white/10">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle className="text-2xl font-heading comic-title-gradient flex items-center gap-2">
                <Megaphone className="w-5 h-5 text-[#ffd166]" />
                Publishing Flywheel
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground mt-1">
                Build channel-ready launch copy from your story in one place.
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                className="comic-nav-btn"
                onClick={() => void loadPack()}
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                Refresh
              </Button>
              {onDownloadPDF ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="comic-nav-btn"
                  onClick={onDownloadPDF}
                  disabled={isGeneratingPDF}
                >
                  {isGeneratingPDF ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  PDF
                </Button>
              ) : null}
            </div>
          </div>
        </DialogHeader>

        <div className="p-6 space-y-4 overflow-y-auto">
          <div className="comic-surface rounded-xl p-4 border border-white/10">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {TONE_OPTIONS.map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    variant="ghost"
                    className={`h-8 px-3 text-xs ${
                      tone === option.value
                        ? "comic-nav-btn-primary"
                        : "comic-nav-btn"
                    }`}
                    onClick={() => setTone(option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
              <div className="text-xs text-muted-foreground">
                Tone affects messaging style only. Story assets stay unchanged.
              </div>
            </div>

            <div className="mt-3 border-t border-white/10 pt-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-[#43c0ff] mb-2">
                Style Morph Timeline
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {STYLE_MORPH_OPTIONS.map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    variant="ghost"
                    className={`h-8 px-3 text-xs ${
                      styleMorphMode === option.value
                        ? "comic-nav-btn-primary"
                        : "comic-nav-btn"
                    }`}
                    onClick={() => setStyleMorphMode(option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="mt-3 border-t border-white/10 pt-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-[#ffd166] mb-2">
                Emotion Lock
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {EMOTION_LOCK_OPTIONS.map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    variant="ghost"
                    className={`h-8 px-3 text-xs ${
                      emotionLock === option.value
                        ? "comic-nav-btn-primary"
                        : "comic-nav-btn"
                    }`}
                    onClick={() => setEmotionLock(option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mt-4">
              {DISTRIBUTION_CHANNELS.map((channel) => {
                const selected = selectedChannels.includes(channel);
                return (
                  <Button
                    key={channel}
                    type="button"
                    variant="ghost"
                    className={`h-8 px-3 text-xs ${
                      selected ? "comic-nav-btn-primary" : "comic-nav-btn"
                    }`}
                    onClick={() => toggleChannel(channel)}
                  >
                    {CHANNEL_LABELS[channel]}
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="comic-surface rounded-xl p-4 border border-white/10">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-[#ffd166]">
                  Autopipeline v1
                </div>
                <div className="text-sm text-white mt-1">
                  Build a full distribution bundle (assets, captions, metadata,
                  markdown) in one run.
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-1 text-[11px] uppercase tracking-wider ${
                    autopipelineStatus === "completed"
                      ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-100"
                      : autopipelineStatus === "failed"
                        ? "border-red-400/40 bg-red-400/10 text-red-100"
                        : autopipelineStatus === "running"
                          ? "border-[#43c0ff]/40 bg-[#43c0ff]/10 text-[#bde7ff]"
                          : "border-white/20 bg-white/5 text-white/70"
                  }`}
                >
                  {autopipelineStatusLabel[autopipelineStatus]}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  className="comic-nav-btn-primary"
                  onClick={() => void runAutopipeline()}
                  disabled={
                    isLoading ||
                    autopipelineStatus === "queued" ||
                    autopipelineStatus === "running"
                  }
                >
                  {autopipelineStatus === "queued" ||
                  autopipelineStatus === "running" ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <PackageCheck className="w-4 h-4 mr-2" />
                  )}
                  Run Autopipeline
                </Button>
              </div>
            </div>

            {autopipelineStatus === "failed" && autopipelineError ? (
              <div className="mt-3 rounded-md border border-red-400/30 bg-red-400/10 p-3">
                <div className="text-xs text-red-100">{autopipelineError}</div>
                <Button
                  type="button"
                  variant="ghost"
                  className="comic-nav-btn mt-2 h-8 px-3"
                  onClick={() => void runAutopipeline()}
                >
                  Retry
                </Button>
              </div>
            ) : null}

            {autopipelineStatus === "completed" && autopipelineBundle ? (
              <div className="mt-3 rounded-md border border-emerald-400/30 bg-emerald-400/10 p-3">
                <div className="text-xs text-emerald-100">
                  Bundle ready.{" "}
                  {lastAutopipelineRunAt
                    ? `Last run: ${new Date(lastAutopipelineRunAt).toLocaleTimeString()}`
                    : ""}
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    className="comic-nav-btn h-8 px-3"
                    onClick={() => downloadAutopipelineBundle(autopipelineBundle)}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download Bundle
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="comic-nav-btn h-8 px-3"
                    onClick={() =>
                      void copyText(
                        "autopipeline-manifest",
                        autopipelineBundle.files
                          .find((file) => file.path === "manifest.json")
                          ?.content ?? "",
                        "Manifest copied.",
                      )
                    }
                  >
                    {copiedKey === "autopipeline-manifest" ? (
                      <Check className="w-4 h-4 mr-2" />
                    ) : (
                      <Copy className="w-4 h-4 mr-2" />
                    )}
                    Copy Manifest
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="comic-surface rounded-xl p-4 border border-white/10">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-[#ffd166]">
                  M3 - IP Incubator
                </div>
                <div className="text-sm text-white mt-1">
                  Evaluate franchise readiness, retention hooks, and merch surface area.
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                className="comic-nav-btn"
                onClick={() => void loadIpReport()}
                disabled={isLoadingIpReport}
              >
                {isLoadingIpReport ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                Refresh Report
              </Button>
            </div>

            {ipReportError ? (
              <div className="mt-3 rounded-md border border-red-400/30 bg-red-400/10 p-3 text-xs text-red-100">
                {ipReportError}
              </div>
            ) : null}

            {isLoadingIpReport && !ipReport ? (
              <div className="mt-3 text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Building incubator report...
              </div>
            ) : null}

            {ipReport ? (
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  <div className="rounded-md border border-white/10 bg-black/20 p-2">
                    <div className="text-[11px] text-muted-foreground">Overall</div>
                    <div className="text-sm text-white font-medium mt-1">
                      {ipReport.overallScore}/100
                    </div>
                  </div>
                  <div className="rounded-md border border-white/10 bg-black/20 p-2">
                    <div className="text-[11px] text-muted-foreground">Moat</div>
                    <div className="text-sm text-white font-medium mt-1">
                      {ipReport.moatStrengthScore}
                    </div>
                  </div>
                  <div className="rounded-md border border-white/10 bg-black/20 p-2">
                    <div className="text-[11px] text-muted-foreground">Retention</div>
                    <div className="text-sm text-white font-medium mt-1">
                      {ipReport.retentionPotentialScore}
                    </div>
                  </div>
                  <div className="rounded-md border border-white/10 bg-black/20 p-2">
                    <div className="text-[11px] text-muted-foreground">Merchability</div>
                    <div className="text-sm text-white font-medium mt-1">
                      {ipReport.merchabilityScore}
                    </div>
                  </div>
                  <div className="rounded-md border border-white/10 bg-black/20 p-2">
                    <div className="text-[11px] text-muted-foreground">Band</div>
                    <div className="text-sm text-white font-medium mt-1">
                      {incubatorBandLabel[ipReport.band]}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <div className="rounded-md border border-white/10 bg-black/20 p-3">
                    <div className="text-xs uppercase tracking-[0.15em] text-[#43c0ff] flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5" />
                      Pillar Scores
                    </div>
                    <div className="mt-2 space-y-2">
                      {ipReport.pillars.map((pillar) => (
                        <div
                          key={pillar.id}
                          className="rounded-md border border-white/10 bg-black/25 p-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-xs text-white">{pillar.label}</div>
                            <div className="text-xs text-white/80">
                              {pillar.score} ({pillar.status})
                            </div>
                          </div>
                          <div className="text-[11px] text-white/70 mt-1">
                            {pillar.insight}
                          </div>
                          <div className="text-[11px] text-[#9ab4c6] mt-1">
                            Next: {pillar.nextAction}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-md border border-white/10 bg-black/20 p-3 space-y-2">
                    <div className="text-xs uppercase tracking-[0.15em] text-[#ffd166] flex items-center gap-1.5">
                      <Store className="w-3.5 h-3.5" />
                      Merch Concepts
                    </div>
                    {ipReport.merchConcepts.slice(0, 3).map((concept) => (
                      <div
                        key={concept.id}
                        className="rounded-md border border-white/10 bg-black/25 p-2"
                      >
                        <div className="text-xs text-white">
                          {concept.title}
                        </div>
                        <div className="text-[11px] text-white/70 mt-1">
                          {concept.rationale}
                        </div>
                        <div className="text-[11px] text-[#9ab4c6] mt-1">
                          Priority: {concept.priority}
                        </div>
                      </div>
                    ))}

                    <div className="pt-1">
                      <div className="text-xs uppercase tracking-[0.15em] text-[#43c0ff]">
                        Next Experiments
                      </div>
                      <div className="mt-1 space-y-1">
                        {ipReport.nextExperiments.map((experiment, index) => (
                          <div key={`experiment-${index}`} className="text-[11px] text-white/80">
                            {index + 1}. {experiment}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="comic-surface rounded-xl p-4 border border-white/10">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-[#ffd166]">
                  M3 - Advanced Merchability Detector
                </div>
                <div className="text-sm text-white mt-1">
                  Detect high-signal merch hooks and plan a first experiment with clear success criteria.
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                className="comic-nav-btn"
                onClick={() => void loadMerchReport()}
                disabled={isLoadingMerchReport}
              >
                {isLoadingMerchReport ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                Refresh Detector
              </Button>
            </div>

            {merchReportError ? (
              <div className="mt-3 rounded-md border border-red-400/30 bg-red-400/10 p-3 text-xs text-red-100">
                {merchReportError}
              </div>
            ) : null}

            {isLoadingMerchReport && !merchReport ? (
              <div className="mt-3 text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Scanning merchability signals...
              </div>
            ) : null}

            {merchReport ? (
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  <div className="rounded-md border border-white/10 bg-black/20 p-2">
                    <div className="text-[11px] text-muted-foreground">Overall</div>
                    <div className="text-sm text-white font-medium mt-1">
                      {merchReport.overallScore}/100
                    </div>
                  </div>
                  <div className="rounded-md border border-white/10 bg-black/20 p-2">
                    <div className="text-[11px] text-muted-foreground">Iconicity</div>
                    <div className="text-sm text-white font-medium mt-1">
                      {merchReport.dimensions.iconicity}
                    </div>
                  </div>
                  <div className="rounded-md border border-white/10 bg-black/20 p-2">
                    <div className="text-[11px] text-muted-foreground">Collectibility</div>
                    <div className="text-sm text-white font-medium mt-1">
                      {merchReport.dimensions.collectibility}
                    </div>
                  </div>
                  <div className="rounded-md border border-white/10 bg-black/20 p-2">
                    <div className="text-[11px] text-muted-foreground">Channel Fit</div>
                    <div className="text-sm text-white font-medium mt-1">
                      {merchReport.dimensions.channelFit}
                    </div>
                  </div>
                  <div className="rounded-md border border-white/10 bg-black/20 p-2">
                    <div className="text-[11px] text-muted-foreground">Band</div>
                    <div className="text-sm text-white font-medium mt-1">
                      {merchReadinessBandLabel[merchReport.readinessBand]}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <div className="rounded-md border border-white/10 bg-black/20 p-3 space-y-2">
                    <div className="text-xs uppercase tracking-[0.15em] text-[#43c0ff]">
                      Top Motif Signals
                    </div>
                    {merchReport.signals.motifSignals.slice(0, 3).map((signal) => (
                      <div
                        key={signal.id}
                        className="rounded-md border border-white/10 bg-black/25 p-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs text-white">{signal.label}</div>
                          <div className="text-[11px] text-[#9ab4c6]">
                            hits: {signal.hits} ({signal.strength})
                          </div>
                        </div>
                        {signal.evidence[0] ? (
                          <div className="text-[11px] text-white/70 mt-1">
                            {signal.evidence[0]}
                          </div>
                        ) : null}
                      </div>
                    ))}

                    <div className="pt-1">
                      <div className="text-xs uppercase tracking-[0.15em] text-[#ffd166]">
                        Quote Signals
                      </div>
                      <div className="mt-1 space-y-1">
                        {merchReport.signals.quoteSignals.length > 0 ? (
                          merchReport.signals.quoteSignals.slice(0, 2).map((quote) => (
                            <div key={quote.quote} className="text-[11px] text-white/80">
                              "{quote.quote}" ({quote.score})
                            </div>
                          ))
                        ) : (
                          <div className="text-[11px] text-white/60">
                            Add quoted dialogue lines to strengthen quote-card potential.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-md border border-white/10 bg-black/20 p-3 space-y-2">
                    <div className="text-xs uppercase tracking-[0.15em] text-[#ffd166]">
                      Experiment Candidate
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {merchReport.candidates.map((candidate) => (
                        <Button
                          key={candidate.id}
                          type="button"
                          variant="ghost"
                          className={`h-8 px-3 text-xs ${
                            selectedMerchCandidateId === candidate.id
                              ? "comic-nav-btn-primary"
                              : "comic-nav-btn"
                          }`}
                          onClick={() => setSelectedMerchCandidateId(candidate.id)}
                        >
                          {candidate.title}
                        </Button>
                      ))}
                    </div>

                    {selectedMerchCandidate ? (
                      <div className="rounded-md border border-white/10 bg-black/25 p-2">
                        <div className="text-xs text-white">
                          {selectedMerchCandidate.format.replace("_", " ")}
                        </div>
                        <div className="text-[11px] text-white/70 mt-1">
                          {selectedMerchCandidate.rationale}
                        </div>
                        <div className="text-[11px] text-[#9ab4c6] mt-1">
                          Confidence: {selectedMerchCandidate.confidence} | Effort:{" "}
                          {selectedMerchCandidate.effort}
                        </div>
                      </div>
                    ) : null}

                    <div className="space-y-2 pt-1">
                      <div className="text-xs uppercase tracking-[0.15em] text-[#43c0ff]">
                        Planner Controls
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {MERCH_OBJECTIVE_OPTIONS.map((option) => (
                          <Button
                            key={option.value}
                            type="button"
                            variant="ghost"
                            className={`h-8 px-3 text-xs ${
                              merchObjective === option.value
                                ? "comic-nav-btn-primary"
                                : "comic-nav-btn"
                            }`}
                            onClick={() => setMerchObjective(option.value)}
                          >
                            {option.label}
                          </Button>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {MERCH_BUDGET_OPTIONS.map((option) => (
                          <Button
                            key={option.value}
                            type="button"
                            variant="ghost"
                            className={`h-8 px-3 text-xs ${
                              merchBudgetTier === option.value
                                ? "comic-nav-btn-primary"
                                : "comic-nav-btn"
                            }`}
                            onClick={() => setMerchBudgetTier(option.value)}
                          >
                            {option.label}
                          </Button>
                        ))}
                      </div>
                      <div>
                        <div className="text-[11px] text-white/70 mb-1">
                          Duration: {merchDurationDays} days
                        </div>
                        <input
                          type="range"
                          min={3}
                          max={30}
                          value={merchDurationDays}
                          onChange={(event) => {
                            setMerchDurationDays(Number(event.target.value));
                          }}
                          className="w-full accent-[#43c0ff]"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        className="comic-nav-btn-primary"
                        onClick={() => void runMerchPlanner()}
                        disabled={isPlanningMerch || merchReport.candidates.length === 0}
                      >
                        {isPlanningMerch ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        ) : (
                          <Store className="w-4 h-4 mr-2" />
                        )}
                        Build Experiment Plan
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="rounded-md border border-white/10 bg-black/20 p-3">
                  <div className="text-xs uppercase tracking-[0.15em] text-[#9ab4c6]">
                    Detector Notes
                  </div>
                  <div className="mt-1 space-y-1">
                    {merchReport.detectorNotes.map((note, index) => (
                      <div key={`detector-note-${index}`} className="text-[11px] text-white/80">
                        {index + 1}. {note}
                      </div>
                    ))}
                  </div>
                </div>

                {merchPlanError ? (
                  <div className="rounded-md border border-red-400/30 bg-red-400/10 p-3 text-xs text-red-100">
                    {merchPlanError}
                  </div>
                ) : null}

                {merchPlan ? (
                  <div className="rounded-md border border-emerald-400/30 bg-emerald-400/10 p-3 space-y-2">
                    <div className="text-xs uppercase tracking-[0.15em] text-emerald-100">
                      Experiment Plan Ready
                    </div>
                    <div className="text-sm text-white">{merchPlan.title}</div>
                    <div className="text-[11px] text-white/80">{merchPlan.hypothesis}</div>
                    <div className="text-[11px] text-white/80">
                      Primary metric: {merchPlan.primaryMetric.name} ({merchPlan.primaryMetric.target})
                    </div>
                    <div className="space-y-1">
                      {merchPlan.phases.map((phase) => (
                        <div
                          key={phase.phase}
                          className="rounded-md border border-white/15 bg-black/25 p-2"
                        >
                          <div className="text-[11px] text-[#bde7ff] uppercase tracking-wider">
                            {phase.phase} · {phase.window}
                          </div>
                          <div className="mt-1 space-y-1">
                            {phase.actions.map((action) => (
                              <div key={action} className="text-[11px] text-white/80">
                                - {action}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="text-[11px] text-white/80">
                      Decision rule: {merchPlan.successDecisionRule}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="comic-surface rounded-xl p-4 border border-white/10">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-[#ffd166] flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  M3 - Collaborative Role Agents
                </div>
                <div className="text-sm text-white mt-1">
                  Assign role owners and run a conflict-safe execution board for the next creator-economy sprint.
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="comic-nav-btn"
                  onClick={() =>
                    void loadRoleBoard({
                      sprintObjective: roleSprintObjective,
                      horizonDays: roleHorizonDays,
                    })
                  }
                  disabled={isLoadingRoleBoard}
                >
                  {isLoadingRoleBoard ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <RefreshCw className="w-4 h-4 mr-2" />
                  )}
                  Refresh Board
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="comic-nav-btn-primary"
                  onClick={() => void runRolePlanner()}
                  disabled={isPlanningRoleBoard || !roleBoard}
                >
                  {isPlanningRoleBoard ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Shield className="w-4 h-4 mr-2" />
                  )}
                  Build Role Plan
                </Button>
              </div>
            </div>

            {roleBoardError ? (
              <div className="mt-3 rounded-md border border-red-400/30 bg-red-400/10 p-3 text-xs text-red-100">
                {roleBoardError}
              </div>
            ) : null}

            {isLoadingRoleBoard && !roleBoard ? (
              <div className="mt-3 text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Building collaborative role board...
              </div>
            ) : null}

            {roleBoard ? (
              <div className="mt-3 space-y-3">
                <div className="rounded-md border border-white/10 bg-black/20 p-3 space-y-2">
                  <div className="text-xs uppercase tracking-[0.15em] text-[#43c0ff]">
                    Sprint Controls
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {ROLE_AGENT_OBJECTIVE_OPTIONS.map((option) => (
                      <Button
                        key={option.value}
                        type="button"
                        variant="ghost"
                        className={`h-8 px-3 text-xs ${
                          roleSprintObjective === option.value
                            ? "comic-nav-btn-primary"
                            : "comic-nav-btn"
                        }`}
                        onClick={() => setRoleSprintObjective(option.value)}
                      >
                        {option.label}
                      </Button>
                    ))}
                  </div>
                  <div>
                    <div className="text-[11px] text-white/70 mb-1">
                      Horizon: {roleHorizonDays} days
                    </div>
                    <input
                      type="range"
                      min={3}
                      max={30}
                      value={roleHorizonDays}
                      onChange={(event) => {
                        setRoleHorizonDays(Number(event.target.value));
                      }}
                      className="w-full accent-[#43c0ff]"
                    />
                  </div>
                </div>

                <div className="rounded-md border border-white/10 bg-black/20 p-3">
                  <div className="text-xs uppercase tracking-[0.15em] text-[#ffd166]">
                    Participants
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {roleBoard.participants.map((participant) => (
                      <div
                        key={participant.userId}
                        className="rounded-full border border-white/15 bg-black/25 px-2 py-1 text-[11px] text-white/80"
                      >
                        {participant.userId} ({participant.role})
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {roleBoard.roster.map((roleCard) => {
                    const selectedOwnerUserId =
                      roleOwnerOverrides[roleCard.id] ?? roleCard.ownerUserId;

                    return (
                      <div
                        key={roleCard.id}
                        className="rounded-md border border-white/10 bg-black/20 p-3 space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <div className="text-sm text-white">{roleCard.label}</div>
                            <div className="text-[11px] text-[#9ab4c6]">
                              Focus: {roleCard.focusArea}
                            </div>
                          </div>
                          <div
                            className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                              roleCard.priority === "high"
                                ? "border-red-400/40 bg-red-400/10 text-red-100"
                                : roleCard.priority === "medium"
                                  ? "border-yellow-400/40 bg-yellow-400/10 text-yellow-100"
                                  : "border-emerald-400/40 bg-emerald-400/10 text-emerald-100"
                            }`}
                          >
                            {roleCard.priority}
                          </div>
                        </div>
                        <div className="text-[11px] text-white/80">{roleCard.objective}</div>
                        <div className="flex flex-wrap gap-2">
                          {roleBoard.participants.map((participant) => (
                            <Button
                              key={`${roleCard.id}-${participant.userId}`}
                              type="button"
                              variant="ghost"
                              className={`h-7 px-2 text-[11px] ${
                                selectedOwnerUserId === participant.userId
                                  ? "comic-nav-btn-primary"
                                  : "comic-nav-btn"
                              }`}
                              onClick={() => {
                                setRoleOwnerOverrides((previous) => ({
                                  ...previous,
                                  [roleCard.id]: participant.userId,
                                }));
                              }}
                            >
                              {participant.userId}
                            </Button>
                          ))}
                        </div>
                        <div className="space-y-1">
                          {roleCard.checklist.map((item) => (
                            <div key={item} className="text-[11px] text-white/75">
                              - {item}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <div className="rounded-md border border-white/10 bg-black/20 p-3">
                    <div className="text-xs uppercase tracking-[0.15em] text-[#43c0ff]">
                      Coordination Risks
                    </div>
                    <div className="mt-1 space-y-1">
                      {roleBoard.coordinationRisks.map((risk, index) => (
                        <div key={`coord-risk-${index}`} className="text-[11px] text-white/80">
                          {index + 1}. {risk}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-md border border-white/10 bg-black/20 p-3">
                    <div className="text-xs uppercase tracking-[0.15em] text-[#ffd166]">
                      Sync Cadence
                    </div>
                    <div className="mt-1 space-y-1">
                      {roleBoard.syncCadence.map((item, index) => (
                        <div key={`sync-cadence-${index}`} className="text-[11px] text-white/80">
                          {index + 1}. {item}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {rolePlanError ? (
                  <div className="rounded-md border border-red-400/30 bg-red-400/10 p-3 text-xs text-red-100">
                    {rolePlanError}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="comic-surface rounded-xl p-4 border border-white/10">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-[#ffd166] flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5" />
                  M3 - Creator Economy Orchestrator
                </div>
                <div className="text-sm text-white mt-1">
                  Unified operating plan with persisted run history and outcome delta tracking.
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="comic-nav-btn"
                  onClick={() => void loadEconomyPlan()}
                  disabled={isLoadingEconomyPlan}
                >
                  {isLoadingEconomyPlan ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <RefreshCw className="w-4 h-4 mr-2" />
                  )}
                  Refresh
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="comic-nav-btn-primary"
                  onClick={() => void saveEconomyPlan()}
                  disabled={isSavingEconomyPlan}
                >
                  {isSavingEconomyPlan ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Store className="w-4 h-4 mr-2" />
                  )}
                  Save Run
                </Button>
              </div>
            </div>

            {economyPlanError ? (
              <div className="mt-3 rounded-md border border-red-400/30 bg-red-400/10 p-3 text-xs text-red-100">
                {economyPlanError}
              </div>
            ) : null}

            {isLoadingEconomyPlan && !economyPlan ? (
              <div className="mt-3 text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Building operating plan...
              </div>
            ) : null}

            {economyPlan ? (
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  <div className="rounded-md border border-white/10 bg-black/20 p-2">
                    <div className="text-[11px] text-muted-foreground">Score Band</div>
                    <div className="text-sm text-white font-medium mt-1">
                      {economyPlan.scoreBand}
                    </div>
                  </div>
                  <div className="rounded-md border border-white/10 bg-black/20 p-2">
                    <div className="text-[11px] text-muted-foreground">Combined</div>
                    <div className="text-sm text-white font-medium mt-1">
                      {economyPlan.baselineMetrics.combinedScore}
                    </div>
                  </div>
                  <div className="rounded-md border border-white/10 bg-black/20 p-2">
                    <div className="text-[11px] text-muted-foreground">IP</div>
                    <div className="text-sm text-white font-medium mt-1">
                      {economyPlan.baselineMetrics.ipOverall}
                    </div>
                  </div>
                  <div className="rounded-md border border-white/10 bg-black/20 p-2">
                    <div className="text-[11px] text-muted-foreground">Merch</div>
                    <div className="text-sm text-white font-medium mt-1">
                      {economyPlan.baselineMetrics.merchSignal}
                    </div>
                  </div>
                  <div className="rounded-md border border-white/10 bg-black/20 p-2">
                    <div className="text-[11px] text-muted-foreground">Role Coverage</div>
                    <div className="text-sm text-white font-medium mt-1">
                      {economyPlan.baselineMetrics.roleCoverage}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <div className="rounded-md border border-white/10 bg-black/20 p-3">
                    <div className="text-xs uppercase tracking-[0.15em] text-[#43c0ff]">
                      Priority Tracks
                    </div>
                    <div className="mt-2 space-y-2">
                      {economyPlan.priorityTracks.map((track) => (
                        <div
                          key={track.id}
                          className="rounded-md border border-white/10 bg-black/25 p-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-xs text-white">{track.label}</div>
                            <div className="text-[11px] text-[#9ab4c6]">
                              owner: {track.ownerRoleAgentId}
                            </div>
                          </div>
                          <div className="text-[11px] text-white/70 mt-1">{track.rationale}</div>
                          <div className="mt-1 space-y-1">
                            {track.nextActions.map((action) => (
                              <div key={action} className="text-[11px] text-white/75">
                                - {action}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-md border border-white/10 bg-black/20 p-3">
                    <div className="text-xs uppercase tracking-[0.15em] text-[#ffd166]">
                      Metric Deltas
                    </div>
                    <div className="mt-2 space-y-1">
                      {economyPlan.metricDeltas.slice(0, 6).map((metric) => (
                        <div key={metric.key} className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="text-white/80">{metric.label}</span>
                          <span className="text-[#9ab4c6]">
                            {metric.current}
                            {metric.delta !== null
                              ? ` (${metric.delta >= 0 ? "+" : ""}${metric.delta})`
                              : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 text-[11px] text-white/75">
                      {economyPlan.rolloutNote}
                    </div>
                  </div>
                </div>

                <div className="rounded-md border border-white/10 bg-black/20 p-3 space-y-2">
                  <div className="text-xs uppercase tracking-[0.15em] text-[#43c0ff]">
                    Run History ({economyHistory.length})
                  </div>
                  <div className="space-y-1">
                    {economyHistory.slice(0, 5).map((run) => (
                      <div
                        key={run.id}
                        className="rounded-md border border-white/10 bg-black/25 px-2 py-1 text-[11px] text-white/80 flex items-center justify-between gap-2"
                      >
                        <span>{run.sprintObjective} · {run.status}</span>
                        <span className="text-[#9ab4c6]">
                          {run.completedAt
                            ? `completed ${new Date(run.completedAt).toLocaleDateString()}`
                            : `created ${new Date(run.createdAt).toLocaleDateString()}`}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="pt-1 space-y-2">
                    <div className="text-xs uppercase tracking-[0.15em] text-[#ffd166]">
                      Record Outcome (latest run)
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { value: "iterate", label: "Iterate" },
                        { value: "scale", label: "Scale" },
                        { value: "hold", label: "Hold" },
                        { value: "archive", label: "Archive" },
                      ].map((option) => (
                        <Button
                          key={option.value}
                          type="button"
                          variant="ghost"
                          className={`h-8 px-3 text-xs ${
                            economyOutcomeDecision === option.value
                              ? "comic-nav-btn-primary"
                              : "comic-nav-btn"
                          }`}
                          onClick={() =>
                            setEconomyOutcomeDecision(
                              option.value as "scale" | "iterate" | "hold" | "archive",
                            )
                          }
                        >
                          {option.label}
                        </Button>
                      ))}
                    </div>
                    <textarea
                      value={economyOutcomeNotes}
                      onChange={(event) => setEconomyOutcomeNotes(event.target.value)}
                      placeholder="Outcome notes (what improved, what failed, what to change next sprint)..."
                      className="w-full min-h-20 rounded-md border border-white/15 bg-black/30 px-2 py-2 text-sm text-white outline-none focus:border-[#43c0ff]"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      className="comic-nav-btn-primary"
                      onClick={() => void recordEconomyOutcome()}
                      disabled={isRecordingEconomyOutcome || economyHistory.length === 0}
                    >
                      {isRecordingEconomyOutcome ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <Check className="w-4 h-4 mr-2" />
                      )}
                      Record Outcome
                    </Button>
                    {economyOutcomeError ? (
                      <div className="text-[11px] text-red-200">{economyOutcomeError}</div>
                    ) : null}
                  </div>

                  {economyDeltaReport ? (
                    <div className="rounded-md border border-emerald-400/30 bg-emerald-400/10 p-2">
                      <div className="text-[11px] text-emerald-100 uppercase tracking-wider">
                        Latest Delta Summary
                      </div>
                      <div className="text-[11px] text-white/80 mt-1">
                        {economyDeltaReport.summary}
                      </div>
                      <div className="mt-1 space-y-1">
                        {economyDeltaReport.deltas.slice(0, 4).map((delta) => (
                          <div key={delta.key} className="text-[11px] text-white/75">
                            {delta.label}: {delta.current}
                            {delta.delta !== null
                              ? ` (${delta.delta >= 0 ? "+" : ""}${delta.delta})`
                              : ""}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>

          <div className="comic-surface rounded-xl p-4 border border-white/10">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-[#ffd166] flex items-center gap-1.5">
                  <Bot className="w-3.5 h-3.5" />
                  M3 - Agent Automation
                </div>
                <div className="text-sm text-white mt-1">
                  Trigger-driven recommendations with one-click run execution.
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                className="comic-nav-btn"
                onClick={() => void loadAutomationPlan()}
                disabled={isLoadingAutomationPlan}
              >
                {isLoadingAutomationPlan ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                Refresh Automation
              </Button>
            </div>

            {automationPlanError ? (
              <div className="mt-3 rounded-md border border-red-400/30 bg-red-400/10 p-3 text-xs text-red-100">
                {automationPlanError}
              </div>
            ) : null}

            {isLoadingAutomationPlan && !automationPlan ? (
              <div className="mt-3 text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Scanning automation triggers...
              </div>
            ) : null}

            {automationPlan ? (
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="rounded-md border border-white/10 bg-black/20 p-2">
                    <div className="text-[11px] text-muted-foreground">Active Triggers</div>
                    <div className="text-sm text-white font-medium mt-1">
                      {automationPlan.triggerSummary.active}/{automationPlan.triggerSummary.total}
                    </div>
                  </div>
                  <div className="rounded-md border border-white/10 bg-black/20 p-2">
                    <div className="text-[11px] text-muted-foreground">Risk</div>
                    <div className="text-sm text-white font-medium mt-1">
                      {automationPlan.triggerSummary.riskActive}
                    </div>
                  </div>
                  <div className="rounded-md border border-white/10 bg-black/20 p-2">
                    <div className="text-[11px] text-muted-foreground">Opportunity</div>
                    <div className="text-sm text-white font-medium mt-1">
                      {automationPlan.triggerSummary.opportunityActive}
                    </div>
                  </div>
                  <div className="rounded-md border border-white/10 bg-black/20 p-2">
                    <div className="text-[11px] text-muted-foreground">Queue Ready</div>
                    <div className="text-sm text-white font-medium mt-1">
                      {
                        automationPlan.queue.filter(
                          (queueItem) => queueItem.status === "ready",
                        ).length
                      }
                    </div>
                  </div>
                </div>

                <div className="rounded-md border border-white/10 bg-black/20 p-3">
                  <div className="text-xs uppercase tracking-[0.15em] text-[#43c0ff]">
                    Trigger Monitor
                  </div>
                  <div className="mt-2 space-y-2">
                    {automationPlan.triggers.map((trigger) => (
                      <div
                        key={trigger.id}
                        className="rounded-md border border-white/10 bg-black/25 px-2 py-1.5 text-[11px]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-white">{trigger.label}</span>
                          <span
                            className={`rounded-full border px-2 py-0.5 uppercase tracking-wider ${
                              trigger.status === "fired"
                                ? trigger.kind === "risk"
                                  ? "border-red-400/40 bg-red-400/10 text-red-100"
                                  : "border-emerald-400/40 bg-emerald-400/10 text-emerald-100"
                                : "border-white/20 bg-white/5 text-white/70"
                            }`}
                          >
                            {trigger.status}
                          </span>
                        </div>
                        <div className="text-white/70 mt-1">{trigger.reason}</div>
                        <div className="text-[#9ab4c6] mt-1">
                          {trigger.metricKey}: {trigger.current} (threshold{" "}
                          {trigger.direction === "below" ? "<" : ">"}
                          {trigger.threshold})
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  {automationPlan.recommendations.map((recommendation) => {
                    const queueItem = automationPlan.queue.find(
                      (item) => item.recommendationId === recommendation.id,
                    );
                    const isExecuting =
                      executingAutomationRecommendationId === recommendation.id;

                    return (
                      <div
                        key={recommendation.id}
                        className="rounded-md border border-white/10 bg-black/20 p-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="text-sm text-white">{recommendation.title}</div>
                            <div className="text-[11px] text-[#9ab4c6] mt-1">
                              Owner: {ROLE_AGENT_LABELS[recommendation.ownerRoleAgentId]}{" "}
                              {queueItem?.ownerUserId ? `(${queueItem.ownerUserId})` : ""}
                            </div>
                            <div className="text-[11px] text-white/75 mt-1">
                              {recommendation.summary}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                                recommendation.priority === "high"
                                  ? "border-red-400/40 bg-red-400/10 text-red-100"
                                  : recommendation.priority === "medium"
                                    ? "border-yellow-400/40 bg-yellow-400/10 text-yellow-100"
                                    : "border-emerald-400/40 bg-emerald-400/10 text-emerald-100"
                              }`}
                            >
                              {recommendation.priority}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              className="comic-nav-btn-primary h-8 px-3"
                              onClick={() =>
                                void runAutomationRecommendation(recommendation.id)
                              }
                              disabled={Boolean(executingAutomationRecommendationId)}
                            >
                              {isExecuting ? (
                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                              ) : (
                                <Bot className="w-4 h-4 mr-2" />
                              )}
                              {isExecuting ? "Running..." : "Run Recommendation"}
                            </Button>
                          </div>
                        </div>
                        <div className="mt-2 space-y-1">
                          {recommendation.checklist.map((item) => (
                            <div key={item} className="text-[11px] text-white/75">
                              - {item}
                            </div>
                          ))}
                        </div>
                        {queueItem ? (
                          <div
                            className={`mt-2 text-[11px] ${
                              queueItem.status === "ready"
                                ? "text-emerald-100"
                                : "text-yellow-100"
                            }`}
                          >
                            Queue: {queueItem.status} · {queueItem.reason}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                <div className="rounded-md border border-white/10 bg-black/20 p-3">
                  <div className="text-xs uppercase tracking-[0.15em] text-[#ffd166]">
                    Automation Notes
                  </div>
                  <div className="mt-1 space-y-1">
                    {automationPlan.notes.map((note, index) => (
                      <div key={`automation-note-${index}`} className="text-[11px] text-white/80">
                        {index + 1}. {note}
                      </div>
                    ))}
                  </div>
                </div>

                {automationExecutionError ? (
                  <div className="rounded-md border border-red-400/30 bg-red-400/10 p-3 text-xs text-red-100">
                    {automationExecutionError}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="comic-surface rounded-xl p-4 border border-white/10">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-[#ffd166] flex items-center gap-1.5">
                  <Bot className="w-3.5 h-3.5" />
                  M3 - Autonomous Loop
                </div>
                <div className="text-sm text-white mt-1">
                  Decision-policy mode, autonomous backlog, and guarded autorun cycles.
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="comic-nav-btn"
                  onClick={() => void loadAutonomousBacklog()}
                  disabled={isLoadingAutonomousBacklog}
                >
                  {isLoadingAutonomousBacklog ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <RefreshCw className="w-4 h-4 mr-2" />
                  )}
                  Refresh Backlog
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="comic-nav-btn"
                  onClick={() => void loadPolicyLearningLoop()}
                  disabled={isLoadingPolicyLearning}
                >
                  {isLoadingPolicyLearning ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Bot className="w-4 h-4 mr-2" />
                  )}
                  Refresh Learning
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="comic-nav-btn"
                  onClick={() => void loadOptimizer()}
                  disabled={isLoadingOptimizer}
                >
                  {isLoadingOptimizer ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Shield className="w-4 h-4 mr-2" />
                  )}
                  Refresh Optimizer
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="comic-nav-btn"
                  onClick={() => void loadStrategyLoop()}
                  disabled={isLoadingStrategyLoop}
                >
                  {isLoadingStrategyLoop ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <RefreshCw className="w-4 h-4 mr-2" />
                  )}
                  Refresh Strategy
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="comic-nav-btn-primary"
                  onClick={() => void runAutorunCycle(false)}
                  disabled={
                    isRunningAutorunCycle || autonomyMode === "manual" || governancePaused
                  }
                >
                  {isRunningAutorunCycle ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Bot className="w-4 h-4 mr-2" />
                  )}
                  Run Cycle
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="comic-nav-btn"
                  onClick={() => void runAutorunCycle(true)}
                  disabled={isRunningAutorunCycle || governancePaused}
                >
                  Dry Run
                </Button>
                {governancePaused ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="comic-nav-btn"
                    onClick={() => void runAutorunCycle(false, true)}
                    disabled={isRunningAutorunCycle}
                  >
                    Force Run Once
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="mt-3 rounded-md border border-white/10 bg-black/20 p-3 space-y-2">
              <div className="text-xs uppercase tracking-[0.15em] text-[#43c0ff]">
                Policy Mode
              </div>
              <div className="flex flex-wrap gap-2">
                {CREATOR_ECONOMY_AUTONOMY_MODES.map((mode) => (
                  <Button
                    key={mode}
                    type="button"
                    variant="ghost"
                    className={`h-8 px-3 text-xs ${
                      autonomyMode === mode ? "comic-nav-btn-primary" : "comic-nav-btn"
                    }`}
                    onClick={() => setAutonomyMode(mode)}
                  >
                    {AUTONOMY_MODE_LABELS[mode]}
                  </Button>
                ))}
              </div>
              <div>
                <div className="text-[11px] text-white/70 mb-1">
                  Max actions per cycle: {autonomyMaxActions}
                </div>
                <input
                  type="range"
                  min={1}
                  max={5}
                  value={autonomyMaxActions}
                  onChange={(event) => {
                    setAutonomyMaxActions(Number(event.target.value));
                  }}
                  className="w-full accent-[#43c0ff]"
                />
              </div>
            </div>

            {autonomousDecisionPolicy ? (
              <div className="mt-3 rounded-md border border-white/10 bg-black/20 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs uppercase tracking-[0.15em] text-[#ffd166]">
                    Decision Policy
                  </div>
                  <div className="text-[11px] text-[#9ab4c6]">
                    Outcome: {autonomousDecisionPolicy.recommendedOutcome} · Confidence:{" "}
                    {autonomousDecisionPolicy.confidence}%
                  </div>
                </div>
                <div className="space-y-1">
                  {autonomousDecisionPolicy.rationale.map((note, index) => (
                    <div key={`policy-rationale-${index}`} className="text-[11px] text-white/80">
                      {index + 1}. {note}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {autonomousGovernance ? (
              <div className="mt-3 rounded-md border border-white/10 bg-black/20 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs uppercase tracking-[0.15em] text-[#ffd166]">
                    Autonomy Governance
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                        autonomousGovernance.status === "healthy"
                          ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-100"
                          : autonomousGovernance.status === "watch"
                            ? "border-yellow-400/40 bg-yellow-400/10 text-yellow-100"
                            : "border-red-400/40 bg-red-400/10 text-red-100"
                      }`}
                    >
                      {autonomousGovernance.status}
                    </span>
                    <span className="text-[11px] text-[#9ab4c6]">
                      Score {autonomousGovernance.governanceScore}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="rounded-md border border-white/10 bg-black/30 p-2">
                    <div className="text-[11px] text-muted-foreground">Positive Rate</div>
                    <div className="text-sm text-white font-medium mt-1">
                      {Math.round(autonomousGovernance.signals.positiveRate * 100)}%
                    </div>
                  </div>
                  <div className="rounded-md border border-white/10 bg-black/30 p-2">
                    <div className="text-[11px] text-muted-foreground">Stale Open</div>
                    <div className="text-sm text-white font-medium mt-1">
                      {autonomousGovernance.signals.staleOpenRuns}
                    </div>
                  </div>
                  <div className="rounded-md border border-white/10 bg-black/30 p-2">
                    <div className="text-[11px] text-muted-foreground">Action Cap</div>
                    <div className="text-sm text-white font-medium mt-1">
                      {autonomousGovernance.constraints.maxActionsCap}
                    </div>
                  </div>
                  <div className="rounded-md border border-white/10 bg-black/30 p-2">
                    <div className="text-[11px] text-muted-foreground">Cooldown Floor</div>
                    <div className="text-sm text-white font-medium mt-1">
                      {autonomousGovernance.constraints.cooldownFloorHours}h
                    </div>
                  </div>
                </div>
                <div className="space-y-1">
                  {autonomousGovernance.reasons.map((reason, index) => (
                    <div key={`governance-reason-${index}`} className="text-[11px] text-white/80">
                      {index + 1}. {reason}
                    </div>
                  ))}
                </div>
                {governanceWatch || governancePaused ? (
                  <div className="rounded-md border border-white/10 bg-black/30 p-2 space-y-1">
                    <div className="text-[11px] uppercase tracking-[0.12em] text-[#43c0ff]">
                      Governance Recommendations
                    </div>
                    {autonomousGovernance.recommendations.map((note, index) => (
                      <div key={`governance-rec-${index}`} className="text-[11px] text-white/80">
                        {index + 1}. {note}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="mt-3 rounded-md border border-white/10 bg-black/20 p-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs uppercase tracking-[0.15em] text-[#43c0ff]">
                  Autonomy Optimizer
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    className="comic-nav-btn h-8 px-3"
                    onClick={() => void runOptimizerPreview()}
                    disabled={isRunningOptimizerPreview}
                  >
                    {isRunningOptimizerPreview ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <Bot className="w-4 h-4 mr-2" />
                    )}
                    Simulate
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="comic-nav-btn-primary h-8 px-3"
                    onClick={applyOptimizerControls}
                    disabled={!optimizerPolicyPreview}
                  >
                    Apply Controls
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {CREATOR_ECONOMY_OPTIMIZATION_OBJECTIVES.map((objective) => (
                  <Button
                    key={objective}
                    type="button"
                    variant="ghost"
                    className={`h-8 px-3 text-xs ${
                      optimizerObjective === objective ? "comic-nav-btn-primary" : "comic-nav-btn"
                    }`}
                    onClick={() => {
                      setOptimizerObjective(objective);
                    }}
                  >
                    {OPTIMIZATION_OBJECTIVE_LABELS[objective]}
                  </Button>
                ))}
              </div>

              {optimizerReport ? (
                <div className="rounded-md border border-white/10 bg-black/30 p-2">
                  <div className="text-[11px] text-[#9ab4c6]">
                    Recommended objective:{" "}
                    <span className="text-white">
                      {OPTIMIZATION_OBJECTIVE_LABELS[optimizerReport.recommendedObjective]}
                    </span>
                  </div>
                  <div className="mt-1 space-y-1">
                    {optimizerReport.notes.slice(0, 3).map((note, index) => (
                      <div key={`optimizer-note-${index}`} className="text-[11px] text-white/80">
                        {index + 1}. {note}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {optimizerPolicyPreview ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="rounded-md border border-white/10 bg-black/30 p-2">
                    <div className="text-[11px] text-muted-foreground">Mode</div>
                    <div className="text-sm text-white font-medium mt-1">
                      {AUTONOMY_MODE_LABELS[optimizerPolicyPreview.mode]}
                    </div>
                  </div>
                  <div className="rounded-md border border-white/10 bg-black/30 p-2">
                    <div className="text-[11px] text-muted-foreground">Max Actions</div>
                    <div className="text-sm text-white font-medium mt-1">
                      {optimizerPolicyPreview.maxActionsPerCycle}
                    </div>
                  </div>
                  <div className="rounded-md border border-white/10 bg-black/30 p-2">
                    <div className="text-[11px] text-muted-foreground">Cooldown</div>
                    <div className="text-sm text-white font-medium mt-1">
                      {optimizerPolicyPreview.cooldownHours}h
                    </div>
                  </div>
                  <div className="rounded-md border border-white/10 bg-black/30 p-2">
                    <div className="text-[11px] text-muted-foreground">Confidence</div>
                    <div className="text-sm text-white font-medium mt-1">
                      {optimizerPolicyPreview.confidence}%
                    </div>
                  </div>
                </div>
              ) : null}

              {optimizerPreviewExecution.length > 0 ? (
                <div className="space-y-2">
                  {optimizerPreviewExecution.slice(0, 3).map((item) => (
                    <div
                      key={`optimizer-preview-${item.recommendationId}`}
                      className="rounded-md border border-white/10 bg-black/30 p-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm text-white">{item.title}</div>
                        <div className="text-[11px] text-[#9ab4c6]">
                          {item.priority} · {item.status}
                        </div>
                      </div>
                      <div className="text-[11px] text-white/75 mt-1">{item.reason}</div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="mt-3 rounded-md border border-white/10 bg-black/20 p-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs uppercase tracking-[0.15em] text-[#43c0ff]">
                  Strategy Loop Cadence
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    className="comic-nav-btn h-8 px-3"
                    onClick={() => void runStrategyLoopSimulation()}
                    disabled={isRunningStrategyLoopSimulation}
                  >
                    {isRunningStrategyLoopSimulation ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <Bot className="w-4 h-4 mr-2" />
                    )}
                    Simulate Strategy
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="comic-nav-btn-primary h-8 px-3"
                    onClick={applyStrategyControls}
                    disabled={!strategyPolicyPreview}
                  >
                    Apply Cycle 1
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="comic-nav-btn h-8 px-3"
                    onClick={() => void runStrategyWindowExecution(true)}
                    disabled={isRunningStrategyWindowExecution}
                  >
                    {isRunningStrategyWindowExecution ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <RefreshCw className="w-4 h-4 mr-2" />
                    )}
                    Window Dry Run
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="comic-nav-btn-primary h-8 px-3"
                    onClick={() => void runStrategyWindowExecution(false)}
                    disabled={isRunningStrategyWindowExecution}
                  >
                    {isRunningStrategyWindowExecution ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <Check className="w-4 h-4 mr-2" />
                    )}
                    Execute Window
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="comic-nav-btn h-8 px-3"
                    onClick={() => void runSelfHealingExecution(true)}
                    disabled={isRunningSelfHealing}
                  >
                    {isRunningSelfHealing ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <Shield className="w-4 h-4 mr-2" />
                    )}
                    Self-Heal Preview
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="comic-nav-btn-primary h-8 px-3"
                    onClick={() => void runSelfHealingExecution(false)}
                    disabled={isRunningSelfHealing}
                  >
                    {isRunningSelfHealing ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <Check className="w-4 h-4 mr-2" />
                    )}
                    Run Self-Heal
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="text-[11px] text-white/70 mb-1">
                    Cadence (hours)
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {CREATOR_ECONOMY_STRATEGY_CADENCE_OPTIONS.map((cadence) => (
                      <Button
                        key={cadence}
                        type="button"
                        variant="ghost"
                        className={`h-8 px-3 text-xs ${
                          strategyCadenceHours === cadence
                            ? "comic-nav-btn-primary"
                            : "comic-nav-btn"
                        }`}
                        onClick={() => {
                          setStrategyCadenceHours(cadence);
                        }}
                      >
                        {cadence}h
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="rounded-md border border-white/10 bg-black/30 p-2">
                  <div className="text-[11px] text-muted-foreground mb-1">
                    Auto-optimization
                  </div>
                  <button
                    type="button"
                    className={`inline-flex items-center rounded-full border px-2 py-1 text-[11px] uppercase tracking-wider ${
                      strategyAutoOptimize
                        ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-100"
                        : "border-yellow-400/40 bg-yellow-400/10 text-yellow-100"
                    }`}
                    onClick={() => {
                      setStrategyAutoOptimize((previous) => !previous);
                    }}
                  >
                    {strategyAutoOptimize ? "Enabled" : "Disabled"}
                  </button>
                  <div className="mt-1 text-[11px] text-white/70">
                    When enabled, future cycles can rebalance objective automatically.
                  </div>
                </div>
              </div>

              {strategyWindowReport ? (
                <div className="rounded-md border border-white/10 bg-black/30 p-2 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-[11px] uppercase tracking-[0.12em] text-[#ffd166]">
                      Outcome Gate
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                        strategyWindowReport.gate.status === "ready"
                          ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-100"
                          : strategyWindowReport.gate.status === "hold"
                            ? "border-yellow-400/40 bg-yellow-400/10 text-yellow-100"
                            : "border-red-400/40 bg-red-400/10 text-red-100"
                      }`}
                    >
                      {strategyWindowReport.gate.status}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="rounded-md border border-white/10 bg-black/20 p-2">
                      <div className="text-[11px] text-muted-foreground">Window Runs</div>
                      <div className="text-sm text-white font-medium mt-1">
                        {strategyWindowReport.gate.windowCompletedRuns}
                      </div>
                    </div>
                    <div className="rounded-md border border-white/10 bg-black/20 p-2">
                      <div className="text-[11px] text-muted-foreground">Window Positive</div>
                      <div className="text-sm text-white font-medium mt-1">
                        {Math.round(strategyWindowReport.gate.windowPositiveRate * 100)}%
                      </div>
                    </div>
                    <div className="rounded-md border border-white/10 bg-black/20 p-2">
                      <div className="text-[11px] text-muted-foreground">Next Cadence</div>
                      <div className="text-sm text-white font-medium mt-1">
                        {strategyWindowReport.adaptation.nextCadenceHours}h
                      </div>
                    </div>
                    <div className="rounded-md border border-white/10 bg-black/20 p-2">
                      <div className="text-[11px] text-muted-foreground">Next Objective</div>
                      <div className="text-sm text-white font-medium mt-1">
                        {
                          OPTIMIZATION_OBJECTIVE_LABELS[
                            strategyWindowReport.adaptation.recommendedObjective
                          ]
                        }
                      </div>
                    </div>
                  </div>
                  {strategyWindowReport.activeCycle ? (
                    <div className="text-[11px] text-[#9ab4c6]">
                      Active cycle {strategyWindowReport.activeCycle.cycle} window:{" "}
                      {new Date(
                        strategyWindowReport.activeCycle.scheduledWindowStart,
                      ).toLocaleString()}{" "}
                      to{" "}
                      {new Date(
                        strategyWindowReport.activeCycle.scheduledWindowEnd,
                      ).toLocaleString()}
                    </div>
                  ) : null}
                  <div className="space-y-1">
                    {strategyWindowReport.gate.reasons.map((reason, index) => (
                      <div key={`strategy-gate-${index}`} className="text-[11px] text-white/80">
                        {index + 1}. {reason}
                      </div>
                    ))}
                  </div>
                  <div className="text-[11px] text-white/75">
                    {strategyWindowReport.adaptation.reason}
                  </div>
                </div>
              ) : null}

              {selfHealingReport ? (
                <div className="rounded-md border border-white/10 bg-black/30 p-2 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-[11px] uppercase tracking-[0.12em] text-[#ff9f5a]">
                      Self-Healing Loop
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                        selfHealingReport.severity === "none"
                          ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-100"
                          : selfHealingReport.severity === "watch"
                            ? "border-yellow-400/40 bg-yellow-400/10 text-yellow-100"
                            : "border-red-400/40 bg-red-400/10 text-red-100"
                      }`}
                    >
                      {selfHealingReport.severity}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    <div className="rounded-md border border-white/10 bg-black/20 p-2">
                      <div className="text-[11px] text-muted-foreground">ROI Gap</div>
                      <div className="text-sm text-white font-medium mt-1">
                        {selfHealingReport.roiGapScore}
                      </div>
                    </div>
                    <div className="rounded-md border border-white/10 bg-black/20 p-2">
                      <div className="text-[11px] text-muted-foreground">Patch Objective</div>
                      <div className="text-sm text-white font-medium mt-1">
                        {
                          OPTIMIZATION_OBJECTIVE_LABELS[
                            selfHealingReport.policyPatch.objective
                          ]
                        }
                      </div>
                    </div>
                    <div className="rounded-md border border-white/10 bg-black/20 p-2">
                      <div className="text-[11px] text-muted-foreground">Patch Cadence</div>
                      <div className="text-sm text-white font-medium mt-1">
                        {selfHealingReport.policyPatch.cadenceHours}h
                      </div>
                    </div>
                    <div className="rounded-md border border-white/10 bg-black/20 p-2">
                      <div className="text-[11px] text-muted-foreground">Patch Mode</div>
                      <div className="text-sm text-white font-medium mt-1">
                        {AUTONOMY_MODE_LABELS[selfHealingReport.policyPatch.mode]}
                      </div>
                    </div>
                    <div className="rounded-md border border-white/10 bg-black/20 p-2">
                      <div className="text-[11px] text-muted-foreground">Patch Actions</div>
                      <div className="text-sm text-white font-medium mt-1">
                        {selfHealingReport.policyPatch.maxActionsPerCycle}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    {selfHealingReport.triggers.map((trigger, index) => (
                      <div key={`self-heal-trigger-${index}`} className="text-[11px] text-white/80">
                        {index + 1}. {trigger}
                      </div>
                    ))}
                  </div>
                  {selfHealingReport.recoveryPlan.length > 0 ? (
                    <div className="space-y-1">
                      {selfHealingReport.recoveryPlan.slice(0, 3).map((item) => (
                        <div
                          key={`self-heal-recovery-${item.recommendationId}`}
                          className="rounded-md border border-white/10 bg-black/20 p-2"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-sm text-white">{item.title}</div>
                            <div className="text-[11px] text-[#9ab4c6]">
                              {item.priority} · {item.status} · +{item.expectedRoiLift} ROI
                            </div>
                          </div>
                          <div className="text-[11px] text-white/75 mt-1">{item.reason}</div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div className="space-y-1">
                    {selfHealingReport.notes.map((note, index) => (
                      <div key={`self-heal-note-${index}`} className="text-[11px] text-white/75">
                        {index + 1}. {note}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {strategyLoopReport ? (
                <div className="space-y-2">
                  <div className="rounded-md border border-white/10 bg-black/30 p-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#9ab4c6]">
                      <span>
                        Safe window:{" "}
                        <span className="text-white">
                          {strategyLoopReport.safeWindow ? "Yes" : "No"}
                        </span>
                      </span>
                      <span>
                        Next refresh:{" "}
                        <span className="text-white">
                          {new Date(strategyLoopReport.nextRefreshAt).toLocaleString()}
                        </span>
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {strategyLoopReport.cycles.map((cycle) => (
                      <div
                        key={`strategy-cycle-${cycle.cycle}`}
                        className="rounded-md border border-white/10 bg-black/30 p-2"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-sm text-white">
                            Cycle {cycle.cycle}:{" "}
                            {OPTIMIZATION_OBJECTIVE_LABELS[cycle.objective]}
                          </div>
                          <div className="text-[11px] text-[#9ab4c6]">
                            {AUTONOMY_MODE_LABELS[cycle.mode]} · {cycle.maxActionsPerCycle} action(s) ·{" "}
                            {cycle.cooldownHours}h cooldown
                          </div>
                        </div>
                        <div className="text-[11px] text-white/75 mt-1">
                          Window: {new Date(cycle.scheduledWindowStart).toLocaleString()} to{" "}
                          {new Date(cycle.scheduledWindowEnd).toLocaleString()}
                        </div>
                        <div className="text-[11px] text-white/75 mt-1">{cycle.rationale}</div>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-md border border-white/10 bg-black/30 p-2">
                    <div className="text-[11px] uppercase tracking-[0.12em] text-[#ffd166]">
                      Strategy Guardrails
                    </div>
                    <div className="mt-1 space-y-1">
                      {strategyLoopReport.guardrails.map((item, index) => (
                        <div
                          key={`strategy-guardrail-${index}`}
                          className="text-[11px] text-white/80"
                        >
                          {index + 1}. {item}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              {strategyPreviewExecution.length > 0 ? (
                <div className="space-y-2">
                  {strategyPreviewExecution.slice(0, 3).map((item) => (
                    <div
                      key={`strategy-preview-${item.recommendationId}`}
                      className="rounded-md border border-white/10 bg-black/30 p-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm text-white">{item.title}</div>
                        <div className="text-[11px] text-[#9ab4c6]">
                          {item.priority} · {item.status}
                        </div>
                      </div>
                      <div className="text-[11px] text-white/75 mt-1">{item.reason}</div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            {policyLearningReport ? (
              <div className="mt-3 rounded-md border border-white/10 bg-black/20 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs uppercase tracking-[0.15em] text-[#43c0ff]">
                    Policy Learning Loop
                  </div>
                  <div className="text-[11px] text-[#9ab4c6]">
                    Positive rate{" "}
                    {Math.round(
                      policyLearningReport.totals.overallPositiveRate * 100,
                    )}
                    %
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="rounded-md border border-white/10 bg-black/30 p-2">
                    <div className="text-[11px] text-muted-foreground">Completed</div>
                    <div className="text-sm text-white font-medium mt-1">
                      {policyLearningReport.totals.completedRuns}
                    </div>
                  </div>
                  <div className="rounded-md border border-white/10 bg-black/30 p-2">
                    <div className="text-[11px] text-muted-foreground">Stale Open</div>
                    <div className="text-sm text-white font-medium mt-1">
                      {policyLearningReport.totals.staleOpenRuns}
                    </div>
                  </div>
                  <div className="rounded-md border border-white/10 bg-black/30 p-2">
                    <div className="text-[11px] text-muted-foreground">Suggested Cooldown</div>
                    <div className="text-sm text-white font-medium mt-1">
                      {policyLearningReport.recommendations.suggestedCooldownHours}h
                    </div>
                  </div>
                  <div className="rounded-md border border-white/10 bg-black/30 p-2">
                    <div className="text-[11px] text-muted-foreground">Suggested Actions</div>
                    <div className="text-sm text-white font-medium mt-1">
                      {policyLearningReport.recommendations.suggestedMaxActionsPerCycle}
                    </div>
                  </div>
                </div>
                <div className="rounded-md border border-white/10 bg-black/30 p-2">
                  <div className="text-[11px] text-[#ffd166] uppercase tracking-[0.12em]">
                    Learning Notes
                  </div>
                  <div className="mt-1 space-y-1">
                    {policyLearningReport.notes.map((note, index) => (
                      <div
                        key={`policy-learning-note-${index}`}
                        className="text-[11px] text-white/80"
                      >
                        {index + 1}. {note}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="mt-3 rounded-md border border-white/10 bg-black/20 p-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs uppercase tracking-[0.15em] text-[#ffd166]">
                  Autonomous Outcome Agent
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    className="comic-nav-btn h-8 px-3"
                    onClick={() => void runOutcomeAgent(true)}
                    disabled={isRunningOutcomeAgent}
                  >
                    {isRunningOutcomeAgent ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <RefreshCw className="w-4 h-4 mr-2" />
                    )}
                    Preview
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="comic-nav-btn-primary h-8 px-3"
                    onClick={() => void runOutcomeAgent(false)}
                    disabled={isRunningOutcomeAgent}
                  >
                    {isRunningOutcomeAgent ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <Check className="w-4 h-4 mr-2" />
                    )}
                    Auto-close Stale Runs
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="text-[11px] text-white/70 mb-1">
                    Stale threshold (hours): {outcomeAgentStaleAfterHours}
                  </div>
                  <input
                    type="range"
                    min={6}
                    max={96}
                    value={outcomeAgentStaleAfterHours}
                    onChange={(event) => {
                      setOutcomeAgentStaleAfterHours(Number(event.target.value));
                    }}
                    className="w-full accent-[#43c0ff]"
                  />
                </div>
                <div>
                  <div className="text-[11px] text-white/70 mb-1">
                    Max closures per run: {outcomeAgentMaxRuns}
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={outcomeAgentMaxRuns}
                    onChange={(event) => {
                      setOutcomeAgentMaxRuns(Number(event.target.value));
                    }}
                    className="w-full accent-[#43c0ff]"
                  />
                </div>
              </div>

              {outcomeAgentPlan ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <div className="rounded-md border border-white/10 bg-black/30 p-2">
                      <div className="text-[11px] text-muted-foreground">Open Runs</div>
                      <div className="text-sm text-white font-medium mt-1">
                        {outcomeAgentPlan.summary.totalOpenRuns}
                      </div>
                    </div>
                    <div className="rounded-md border border-white/10 bg-black/30 p-2">
                      <div className="text-[11px] text-muted-foreground">Stale Runs</div>
                      <div className="text-sm text-white font-medium mt-1">
                        {outcomeAgentPlan.summary.staleOpenRuns}
                      </div>
                    </div>
                    <div className="rounded-md border border-white/10 bg-black/30 p-2">
                      <div className="text-[11px] text-muted-foreground">Close Candidates</div>
                      <div className="text-sm text-white font-medium mt-1">
                        {outcomeAgentPlan.summary.closeCandidates}
                      </div>
                    </div>
                  </div>

                  {outcomeAgentPlan.candidates.slice(0, 5).map((candidate) => (
                    <div
                      key={`outcome-agent-candidate-${candidate.runId}`}
                      className="rounded-md border border-white/10 bg-black/30 p-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm text-white">
                          {candidate.sprintObjective}
                        </div>
                        <div className="text-[11px] text-[#9ab4c6]">
                          {candidate.ageHours}h · decision {candidate.suggestedOutcomeDecision}
                        </div>
                      </div>
                      <div className="text-[11px] text-white/75 mt-1">
                        {candidate.suggestedOutcomeNotes}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            {autonomousBacklog ? (
              <div className="mt-3 space-y-2">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="rounded-md border border-white/10 bg-black/20 p-2">
                    <div className="text-[11px] text-muted-foreground">Total</div>
                    <div className="text-sm text-white font-medium mt-1">
                      {autonomousBacklog.summary.total}
                    </div>
                  </div>
                  <div className="rounded-md border border-white/10 bg-black/20 p-2">
                    <div className="text-[11px] text-muted-foreground">Ready</div>
                    <div className="text-sm text-white font-medium mt-1">
                      {autonomousBacklog.summary.ready}
                    </div>
                  </div>
                  <div className="rounded-md border border-white/10 bg-black/20 p-2">
                    <div className="text-[11px] text-muted-foreground">Blocked</div>
                    <div className="text-sm text-white font-medium mt-1">
                      {autonomousBacklog.summary.blocked}
                    </div>
                  </div>
                  <div className="rounded-md border border-white/10 bg-black/20 p-2">
                    <div className="text-[11px] text-muted-foreground">Cooldown</div>
                    <div className="text-sm text-white font-medium mt-1">
                      {autonomousBacklog.summary.cooldown}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  {autonomousBacklog.items.slice(0, 6).map((item) => (
                    <div key={item.id} className="rounded-md border border-white/10 bg-black/20 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-sm text-white">{item.title}</div>
                          <div className="text-[11px] text-[#9ab4c6] mt-1">
                            Owner: {ROLE_AGENT_LABELS[item.ownerRoleAgentId]}{" "}
                            {item.ownerUserId ? `(${item.ownerUserId})` : ""}
                          </div>
                          <div className="text-[11px] text-white/75 mt-1">
                            Score {Math.round(item.score)} · {item.reason}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                              item.status === "ready"
                                ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-100"
                                : item.status === "blocked"
                                  ? "border-red-400/40 bg-red-400/10 text-red-100"
                                  : "border-yellow-400/40 bg-yellow-400/10 text-yellow-100"
                            }`}
                          >
                            {item.status}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            className="comic-nav-btn h-8 px-3"
                            onClick={() => void runBacklogRecommendation(item.recommendationId)}
                            disabled={
                              item.status !== "ready" ||
                              Boolean(executingBacklogRecommendationId)
                            }
                          >
                            {executingBacklogRecommendationId === item.recommendationId ? (
                              <Loader2 className="w-4 h-4 animate-spin mr-2" />
                            ) : (
                              <Check className="w-4 h-4 mr-2" />
                            )}
                            Execute
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {autonomousBacklogError ? (
              <div className="mt-3 rounded-md border border-red-400/30 bg-red-400/10 p-3 text-xs text-red-100">
                {autonomousBacklogError}
              </div>
            ) : null}
            {autorunError ? (
              <div className="mt-3 rounded-md border border-red-400/30 bg-red-400/10 p-3 text-xs text-red-100">
                {autorunError}
              </div>
            ) : null}
            {autorunSummary ? (
              <div className="mt-3 rounded-md border border-emerald-400/30 bg-emerald-400/10 p-3 text-xs text-emerald-100">
                {autorunSummary}
              </div>
            ) : null}
            {policyLearningError ? (
              <div className="mt-3 rounded-md border border-red-400/30 bg-red-400/10 p-3 text-xs text-red-100">
                {policyLearningError}
              </div>
            ) : null}
            {optimizerError ? (
              <div className="mt-3 rounded-md border border-red-400/30 bg-red-400/10 p-3 text-xs text-red-100">
                {optimizerError}
              </div>
            ) : null}
            {optimizerSummary ? (
              <div className="mt-3 rounded-md border border-emerald-400/30 bg-emerald-400/10 p-3 text-xs text-emerald-100">
                {optimizerSummary}
              </div>
            ) : null}
            {strategyError ? (
              <div className="mt-3 rounded-md border border-red-400/30 bg-red-400/10 p-3 text-xs text-red-100">
                {strategyError}
              </div>
            ) : null}
            {strategySummary ? (
              <div className="mt-3 rounded-md border border-emerald-400/30 bg-emerald-400/10 p-3 text-xs text-emerald-100">
                {strategySummary}
              </div>
            ) : null}
            {outcomeAgentError ? (
              <div className="mt-3 rounded-md border border-red-400/30 bg-red-400/10 p-3 text-xs text-red-100">
                {outcomeAgentError}
              </div>
            ) : null}
            {outcomeAgentSummary ? (
              <div className="mt-3 rounded-md border border-emerald-400/30 bg-emerald-400/10 p-3 text-xs text-emerald-100">
                {outcomeAgentSummary}
              </div>
            ) : null}
          </div>

          {qualityReport ? (
            <div className="comic-surface rounded-xl p-4 border border-white/10">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.18em] text-[#43c0ff]">
                    Distribution Quality Gates
                  </div>
                  <div className="text-sm text-white mt-1">
                    {qualityReport.status === "ready"
                      ? "All selected channels are launch-ready."
                      : "Fix required checks before running autopipeline."}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-1 text-[11px] uppercase tracking-wider ${
                      qualityReport.status === "ready"
                        ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-100"
                        : "border-red-400/40 bg-red-400/10 text-red-100"
                    }`}
                  >
                    {qualityReport.status === "ready" ? "Ready" : "Needs fixes"}
                  </span>
                  <span className="text-xs text-white/80">
                    Blocking: {qualityReport.blockingIssueCount}
                  </span>
                  <span className="text-xs text-white/60">
                    Warnings: {qualityReport.warningCount}
                  </span>
                </div>
              </div>
            </div>
          ) : null}

          {isLoading ? (
            <div className="comic-surface rounded-xl p-8 border border-white/10 flex items-center justify-center gap-3 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Building publish kit...
            </div>
          ) : null}

          {error ? (
            <div className="comic-surface rounded-xl p-4 border border-red-400/30 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          {pack ? (
            <>
              <div className="comic-surface rounded-xl p-4 border border-white/10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">Story</div>
                  <div className="text-white font-medium">{pack.storyTitle}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Pages ready</div>
                  <div className="text-white font-medium">{pack.pageCount}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Style</div>
                  <div className="text-white font-medium capitalize">{pack.style}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Assets</div>
                  <div className="text-white font-medium">{pack.assetUrls.length}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Morph Mode</div>
                  <div className="text-white font-medium capitalize">
                    {pack.styleMorphMode}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Emotion Lock</div>
                  <div className="text-white font-medium capitalize">
                    {pack.emotionLock}
                  </div>
                </div>
              </div>

              <div className="comic-surface rounded-xl p-4 border border-white/10 space-y-3">
                <div className="text-sm text-white font-medium">
                  Style Morph Timeline
                </div>
                <div className="text-xs text-[#9ab4c6]">{pack.styleMorphSummary}</div>
                <div className="space-y-2">
                  {pack.styleMorphTimeline.map((point) => (
                    <div
                      key={`timeline-${point.pageNumber}`}
                      className="rounded-md border border-white/10 bg-black/25 p-2"
                    >
                      <div className="text-xs text-[#ffd166]">
                        Page {point.pageNumber}: {point.sourceStyle} to{" "}
                        {point.evolvedStyle} ({point.direction})
                      </div>
                      <div className="text-xs text-white/80 mt-1">{point.emphasis}</div>
                      <div className="text-[11px] text-[#9ab4c6] mt-1">
                        {point.promptSnippet}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <Tabs value={activeChannel} onValueChange={(value) => setActiveChannel(value as DistributionChannel)}>
                <TabsList className="w-full overflow-x-auto justify-start bg-black/35 border border-white/10">
                  {pack.channels.map((channel) => (
                    <TabsTrigger key={channel.channel} value={channel.channel}>
                      <span className="inline-flex items-center gap-1.5">
                        {channel.label}
                        {qualityByChannel.get(channel.channel)?.status ===
                        "needs_fixes" ? (
                          <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                        ) : (
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        )}
                      </span>
                    </TabsTrigger>
                  ))}
                </TabsList>

                {pack.channels.map((channel) => {
                  const channelQuality = qualityByChannel.get(channel.channel);

                  return (
                  <TabsContent key={channel.channel} value={channel.channel} className="mt-4 space-y-4">
                    <div className="comic-surface rounded-xl p-4 border border-white/10 space-y-3">
                      <div className="text-xs uppercase tracking-[0.2em] text-[#ffd166]">
                        Goal
                      </div>
                      <div className="text-sm text-white">{channel.goal}</div>
                      <div className="text-xs uppercase tracking-[0.2em] text-[#ffd166]">
                        Emotion Directive
                      </div>
                      <div className="text-sm text-white">{channel.emotionDirective}</div>
                      <div className="text-xs uppercase tracking-[0.2em] text-[#43c0ff]">
                        CTA
                      </div>
                      <div className="text-sm text-white/90">{channel.callToAction}</div>
                    </div>

                    {channelQuality && channelQuality.checks.some((check) => !check.passed) ? (
                      <div className="comic-surface rounded-xl p-4 border border-white/10 space-y-2">
                        <div className="text-sm text-white font-medium">
                          Channel Quality Checks
                        </div>
                        <div className="space-y-2">
                          {channelQuality.checks
                            .filter((check) => !check.passed)
                            .map((check) => (
                              <div
                                key={check.id}
                                className={`rounded-md border p-2 ${
                                  check.severity === "error"
                                    ? "border-red-400/30 bg-red-400/10"
                                    : "border-yellow-400/30 bg-yellow-400/10"
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="text-xs text-white">
                                    <span className="font-medium">{check.label}:</span>{" "}
                                    {check.message}
                                  </div>
                                  {check.fixAction ? (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      className="comic-nav-btn h-7 px-2"
                                      onClick={() => applyQuickFix(channel.channel, check)}
                                    >
                                      Apply fix
                                    </Button>
                                  ) : null}
                                </div>
                                {check.suggestion ? (
                                  <div className="text-[11px] text-white/70 mt-1">
                                    {check.suggestion}
                                  </div>
                                ) : null}
                              </div>
                            ))}
                        </div>
                      </div>
                    ) : null}

                    <div className="comic-surface rounded-xl p-4 border border-white/10 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm text-white font-medium">Primary caption (base)</div>
                        <Button
                          type="button"
                          variant="ghost"
                          className="comic-nav-btn h-8 px-2"
                          onClick={() =>
                            void copyText(
                              `primary-${channel.channel}`,
                              channel.primaryCaption,
                              "Primary caption copied.",
                            )
                          }
                        >
                          {copiedKey === `primary-${channel.channel}` ? (
                            <Check className="w-4 h-4" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                      <textarea
                        readOnly
                        value={channel.primaryCaption}
                        className="w-full min-h-28 rounded-md border border-white/10 bg-black/30 p-3 text-sm text-white"
                      />
                    </div>

                    {pack.emotionLock !== "none" ? (
                      <div className="comic-surface rounded-xl p-4 border border-white/10 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm text-white font-medium">
                            Primary caption (emotion-locked)
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            className="comic-nav-btn h-8 px-2"
                            onClick={() =>
                              void copyText(
                                `emotion-primary-${channel.channel}`,
                                channel.emotionLockedPrimaryCaption,
                                "Emotion-locked caption copied.",
                              )
                            }
                          >
                            {copiedKey === `emotion-primary-${channel.channel}` ? (
                              <Check className="w-4 h-4" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </Button>
                        </div>
                        <textarea
                          readOnly
                          value={channel.emotionLockedPrimaryCaption}
                          className="w-full min-h-28 rounded-md border border-white/10 bg-black/30 p-3 text-sm text-white"
                        />
                      </div>
                    ) : null}

                    <div className="comic-surface rounded-xl p-4 border border-white/10 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm text-white font-medium">Short caption (base)</div>
                        <Button
                          type="button"
                          variant="ghost"
                          className="comic-nav-btn h-8 px-2"
                          onClick={() =>
                            void copyText(
                              `short-${channel.channel}`,
                              channel.shortCaption,
                              "Short caption copied.",
                            )
                          }
                        >
                          {copiedKey === `short-${channel.channel}` ? (
                            <Check className="w-4 h-4" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                      <textarea
                        readOnly
                        value={channel.shortCaption}
                        className="w-full min-h-16 rounded-md border border-white/10 bg-black/30 p-3 text-sm text-white"
                      />
                      <div className="text-xs text-[#9ab4c6]">{channel.hashtags.join(" ")}</div>
                    </div>

                    {pack.emotionLock !== "none" ? (
                      <div className="comic-surface rounded-xl p-4 border border-white/10 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm text-white font-medium">
                            Short caption (emotion-locked)
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            className="comic-nav-btn h-8 px-2"
                            onClick={() =>
                              void copyText(
                                `emotion-short-${channel.channel}`,
                                channel.emotionLockedShortCaption,
                                "Emotion-locked short caption copied.",
                              )
                            }
                          >
                            {copiedKey === `emotion-short-${channel.channel}` ? (
                              <Check className="w-4 h-4" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </Button>
                        </div>
                        <textarea
                          readOnly
                          value={channel.emotionLockedShortCaption}
                          className="w-full min-h-16 rounded-md border border-white/10 bg-black/30 p-3 text-sm text-white"
                        />
                      </div>
                    ) : null}

                    <div className="comic-surface rounded-xl p-4 border border-white/10 space-y-2">
                      <div className="text-sm text-white font-medium">Post sequence</div>
                      <div className="space-y-2">
                        {channel.postSequence.map((entry, index) => (
                          <div
                            key={`${channel.channel}-${index}`}
                            className="flex items-start gap-2 rounded-md border border-white/10 bg-black/25 p-2"
                          >
                            <div className="text-xs text-[#ffd166] pt-0.5">{index + 1}</div>
                            <div className="text-sm text-white/90 flex-1">{entry}</div>
                            <Button
                              type="button"
                              variant="ghost"
                              className="comic-nav-btn h-7 px-2"
                              onClick={() =>
                                void copyText(
                                  `sequence-${channel.channel}-${index}`,
                                  entry,
                                  "Sequence line copied.",
                                )
                              }
                            >
                              {copiedKey === `sequence-${channel.channel}-${index}` ? (
                                <Check className="w-3.5 h-3.5" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </TabsContent>
                  );
                })}
              </Tabs>

              <div className="comic-surface rounded-xl p-4 border border-white/10">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm text-white font-medium flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[#43c0ff]" />
                    Full publish kit (Markdown)
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      className="comic-nav-btn h-8 px-2"
                      onClick={() =>
                        void copyText(
                          "markdown-kit",
                          pack.markdownKit,
                          "Publish kit copied.",
                        )
                      }
                    >
                      {copiedKey === "markdown-kit" ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="comic-nav-btn h-8 px-2"
                      onClick={downloadMarkdown}
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <textarea
                  readOnly
                  value={pack.markdownKit}
                  className="w-full mt-3 min-h-44 rounded-md border border-white/10 bg-black/35 p-3 text-xs text-white/85"
                />
              </div>
            </>
          ) : null}

          {pack && pack.channels.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No channel pack available.
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
