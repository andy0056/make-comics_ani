export type ShotCameraDirectionMode =
  | "balanced"
  | "kinetic"
  | "cinematic"
  | "graphic_novel";

export type ShotContinuityPanel = {
  panelNumber: number;
  camera: string;
  action: string;
  visualFocus: string;
  cameraLocked: boolean;
};

export type ShotContinuityCheckpoint = {
  id: string;
  pageNumber: number;
  beatTitle: string;
  panelPlan: ShotContinuityPanel[];
};

export type ShotContinuitySeverity = "error" | "warning";

export type ShotContinuityFixAction =
  | "fill_empty_locked_camera"
  | "normalize_contradictory_camera"
  | "rotate_later_duplicate_lock"
  | "unlock_later_duplicate_lock"
  | "align_locked_to_mode";

export type ShotContinuityIssue = {
  id: string;
  label: string;
  severity: ShotContinuitySeverity;
  message: string;
  suggestion: string;
  fixAction?: ShotContinuityFixAction;
  panelIndex?: number;
  conflictingPanelIndex?: number;
};

export type ShotContinuityReport = {
  score: number;
  status: "ready" | "needs_fixes";
  blockingIssueCount: number;
  warningCount: number;
  issues: ShotContinuityIssue[];
};

const MAX_PANEL_COUNT = 5;

const MODE_CAMERA_DEFAULTS: Record<ShotCameraDirectionMode, string[]> = {
  balanced: [
    "wide establishing shot",
    "medium tracking shot",
    "dramatic close-up",
    "over-the-shoulder shot",
    "heroic low-angle shot",
  ],
  kinetic: [
    "handheld push-in shot",
    "dynamic side-tracking shot",
    "whip-pan transition framing",
    "tilted over-the-shoulder shot",
    "impact low-angle action shot",
  ],
  cinematic: [
    "anamorphic wide establishing shot",
    "slow dolly-in medium shot",
    "shallow-depth dramatic close-up",
    "motivated over-the-shoulder reveal",
    "heroic silhouette low-angle shot",
  ],
  graphic_novel: [
    "high-contrast full-panel wide shot",
    "boxed medium composition shot",
    "ink-heavy close-up portrait shot",
    "split-frame over-the-shoulder shot",
    "bold noir low-angle splash shot",
  ],
};

const MODE_EXPECTED_TOKENS: Record<ShotCameraDirectionMode, string[]> = {
  balanced: ["wide", "medium", "close", "over-the-shoulder", "low-angle"],
  kinetic: ["handheld", "tracking", "whip", "dynamic", "impact"],
  cinematic: ["anamorphic", "dolly", "shallow", "composed", "reveal"],
  graphic_novel: ["high-contrast", "ink", "noir", "silhouette", "splash"],
};

function normalizeCamera(camera: string): string {
  return camera.trim().toLowerCase().replace(/\s+/g, " ");
}

function hasAnyToken(camera: string, tokens: string[]): boolean {
  const normalized = normalizeCamera(camera);
  return tokens.some((token) => normalized.includes(token));
}

function defaultCameraForPanel(
  mode: ShotCameraDirectionMode,
  panelIndex: number,
): string {
  const defaults = MODE_CAMERA_DEFAULTS[mode];
  return defaults[Math.max(0, Math.min(defaults.length - 1, panelIndex))];
}

function isContradictoryLockedCamera(camera: string): boolean {
  const normalized = normalizeCamera(camera);
  const isWide = /wide|establish/.test(normalized);
  const isClose = /close/.test(normalized);
  const isHigh = /high-angle|high angle|bird/.test(normalized);
  const isLow = /low-angle|low angle|worm/.test(normalized);

  return (isWide && isClose) || (isHigh && isLow);
}

function buildIssueId({
  checkpointId,
  label,
  panelIndex,
  conflictingPanelIndex,
}: {
  checkpointId: string;
  label: string;
  panelIndex?: number;
  conflictingPanelIndex?: number;
}): string {
  return [checkpointId, label, panelIndex ?? "na", conflictingPanelIndex ?? "na"]
    .join("-")
    .replace(/\s+/g, "_");
}

function createIssue({
  checkpointId,
  label,
  severity,
  message,
  suggestion,
  fixAction,
  panelIndex,
  conflictingPanelIndex,
}: Omit<ShotContinuityIssue, "id"> & { checkpointId: string }): ShotContinuityIssue {
  return {
    id: buildIssueId({
      checkpointId,
      label,
      panelIndex,
      conflictingPanelIndex,
    }),
    label,
    severity,
    message,
    suggestion,
    fixAction,
    panelIndex,
    conflictingPanelIndex,
  };
}

export function evaluateShotContinuity({
  checkpoint,
  mode,
}: {
  checkpoint: ShotContinuityCheckpoint;
  mode: ShotCameraDirectionMode;
}): ShotContinuityReport {
  const issues: ShotContinuityIssue[] = [];
  const lockedPanels = checkpoint.panelPlan
    .map((panel, panelIndex) => ({ panel, panelIndex }))
    .filter((entry) => entry.panel.cameraLocked);

  for (const { panel, panelIndex } of lockedPanels) {
    const normalizedCamera = normalizeCamera(panel.camera);

    if (normalizedCamera.length < 4) {
      issues.push(
        createIssue({
          checkpointId: checkpoint.id,
          label: "Locked camera missing detail",
          severity: "error",
          message: `Panel ${panel.panelNumber} is locked but camera text is missing or too short.`,
          suggestion:
            "Use an explicit camera phrase (for example: wide establishing shot).",
          fixAction: "fill_empty_locked_camera",
          panelIndex,
        }),
      );
      continue;
    }

    if (isContradictoryLockedCamera(panel.camera)) {
      issues.push(
        createIssue({
          checkpointId: checkpoint.id,
          label: "Contradictory locked camera directive",
          severity: "error",
          message: `Panel ${panel.panelNumber} camera directive mixes conflicting framing cues.`,
          suggestion: "Normalize to one clear camera framing directive.",
          fixAction: "normalize_contradictory_camera",
          panelIndex,
        }),
      );
    }

    if (mode !== "balanced") {
      const isModeAligned = hasAnyToken(
        panel.camera,
        MODE_EXPECTED_TOKENS[mode],
      );
      if (!isModeAligned) {
        issues.push(
          createIssue({
            checkpointId: checkpoint.id,
            label: "Locked camera not aligned with direction mode",
            severity: "warning",
            message: `Panel ${panel.panelNumber} locked camera does not reflect ${mode.replace("_", " ")} mode cues.`,
            suggestion: "Align locked camera to active camera-direction mode.",
            fixAction: "align_locked_to_mode",
            panelIndex,
          }),
        );
      }
    }
  }

  const normalizedLockedCameras = lockedPanels.map(({ panel }) =>
    normalizeCamera(panel.camera),
  );
  for (let index = 1; index < lockedPanels.length; index += 1) {
    if (normalizedLockedCameras[index] === normalizedLockedCameras[index - 1]) {
      const current = lockedPanels[index];
      const previous = lockedPanels[index - 1];
      issues.push(
        createIssue({
          checkpointId: checkpoint.id,
          label: "Duplicate adjacent locked camera",
          severity: "warning",
          message: `Panel ${previous.panel.panelNumber} and panel ${current.panel.panelNumber} are locked to the same camera.`,
          suggestion: "Rotate the later panel camera or unlock one lock.",
          fixAction: "rotate_later_duplicate_lock",
          panelIndex: current.panelIndex,
          conflictingPanelIndex: previous.panelIndex,
        }),
      );
    }
  }

  const uniqueLockedCameraCount = new Set(normalizedLockedCameras).size;
  if (lockedPanels.length >= 3 && uniqueLockedCameraCount <= 1) {
    const latestLocked = lockedPanels[lockedPanels.length - 1];
    issues.push(
      createIssue({
        checkpointId: checkpoint.id,
        label: "Over-constrained lock cluster",
        severity: "error",
        message:
          "Three or more locked panels use the same camera, which can freeze shot progression.",
        suggestion: "Unlock one of the repeated camera locks to restore progression.",
        fixAction: "unlock_later_duplicate_lock",
        panelIndex: latestLocked.panelIndex,
      }),
    );
  }

  const blockingIssueCount = issues.filter(
    (issue) => issue.severity === "error",
  ).length;
  const warningCount = issues.filter(
    (issue) => issue.severity === "warning",
  ).length;
  const score = Math.max(0, 100 - blockingIssueCount * 18 - warningCount * 7);

  return {
    score,
    status: blockingIssueCount > 0 ? "needs_fixes" : "ready",
    blockingIssueCount,
    warningCount,
    issues,
  };
}

function normalizeContradictoryCamera({
  mode,
  panelIndex,
  camera,
}: {
  mode: ShotCameraDirectionMode;
  panelIndex: number;
  camera: string;
}): string {
  const normalized = normalizeCamera(camera);
  if (normalized.includes("wide")) {
    return defaultCameraForPanel(mode, Math.min(panelIndex, 1));
  }
  if (normalized.includes("close")) {
    return defaultCameraForPanel(mode, Math.max(2, panelIndex));
  }
  return defaultCameraForPanel(mode, panelIndex);
}

export function applyShotContinuityAutoFix<T extends ShotContinuityCheckpoint>({
  checkpoint,
  mode,
  issueId,
}: {
  checkpoint: T;
  mode: ShotCameraDirectionMode;
  issueId: string;
}): T {
  const report = evaluateShotContinuity({ checkpoint, mode });
  const issue = report.issues.find((entry) => entry.id === issueId);
  if (!issue || !issue.fixAction || issue.panelIndex === undefined) {
    return checkpoint;
  }

  const nextPanelPlan = checkpoint.panelPlan.map((panel) => ({ ...panel }));
  const panelIndex = issue.panelIndex;
  const panel = nextPanelPlan[panelIndex];
  if (!panel) {
    return checkpoint;
  }

  if (issue.fixAction === "fill_empty_locked_camera") {
    panel.camera = defaultCameraForPanel(mode, panelIndex);
  } else if (issue.fixAction === "normalize_contradictory_camera") {
    panel.camera = normalizeContradictoryCamera({
      mode,
      panelIndex,
      camera: panel.camera,
    });
  } else if (issue.fixAction === "rotate_later_duplicate_lock") {
    panel.camera = defaultCameraForPanel(
      mode,
      Math.min(panelIndex + 1, MAX_PANEL_COUNT - 1),
    );
    panel.cameraLocked = true;
  } else if (issue.fixAction === "unlock_later_duplicate_lock") {
    panel.cameraLocked = false;
  } else if (issue.fixAction === "align_locked_to_mode") {
    panel.camera = defaultCameraForPanel(mode, panelIndex);
    panel.cameraLocked = true;
  }

  return {
    ...checkpoint,
    panelPlan: nextPanelPlan,
  } as T;
}
