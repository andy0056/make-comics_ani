import { describe, expect, it } from "vitest";
import {
  applyShotContinuityAutoFix,
  evaluateShotContinuity,
  type ShotContinuityCheckpoint,
} from "@/lib/shot-continuity";

function buildCheckpoint(
  overrides?: Partial<ShotContinuityCheckpoint>,
): ShotContinuityCheckpoint {
  return {
    id: "checkpoint-1",
    pageNumber: 3,
    beatTitle: "Vault Pressure",
    panelPlan: [
      {
        panelNumber: 1,
        camera: "wide establishing shot",
        action: "Hero enters vault corridor.",
        visualFocus: "Corridor depth",
        cameraLocked: true,
      },
      {
        panelNumber: 2,
        camera: "wide establishing shot",
        action: "Alarm flashes across the walls.",
        visualFocus: "Warning lights",
        cameraLocked: true,
      },
      {
        panelNumber: 3,
        camera: "close-up and wide shot",
        action: "Hero hesitates at the lock panel.",
        visualFocus: "Hands and face",
        cameraLocked: true,
      },
      {
        panelNumber: 4,
        camera: "over-the-shoulder shot",
        action: "Rival appears behind hero.",
        visualFocus: "Approach angle",
        cameraLocked: false,
      },
      {
        panelNumber: 5,
        camera: "",
        action: "Hook beat before impact.",
        visualFocus: "Collision setup",
        cameraLocked: false,
      },
    ],
    ...overrides,
  };
}

describe("shot-continuity", () => {
  it("scores locked camera conflicts and exposes fixable issues", () => {
    const report = evaluateShotContinuity({
      checkpoint: buildCheckpoint(),
      mode: "cinematic",
    });

    expect(report.status).toBe("needs_fixes");
    expect(report.score).toBeLessThan(100);
    expect(
      report.issues.some((issue) => issue.fixAction === "rotate_later_duplicate_lock"),
    ).toBe(true);
    expect(
      report.issues.some((issue) => issue.fixAction === "normalize_contradictory_camera"),
    ).toBe(true);
  });

  it("applies duplicate-lock rotation fix on targeted panel", () => {
    const checkpoint = buildCheckpoint();
    const report = evaluateShotContinuity({
      checkpoint,
      mode: "cinematic",
    });
    const duplicateIssue = report.issues.find(
      (issue) => issue.fixAction === "rotate_later_duplicate_lock",
    );
    expect(duplicateIssue).toBeDefined();

    const nextCheckpoint = applyShotContinuityAutoFix({
      checkpoint,
      mode: "cinematic",
      issueId: duplicateIssue!.id,
    });

    expect(nextCheckpoint.panelPlan[1]?.camera).not.toBe(
      checkpoint.panelPlan[1]?.camera,
    );
    expect(nextCheckpoint.panelPlan[1]?.cameraLocked).toBe(true);
  });

  it("normalizes contradictory locked camera phrasing", () => {
    const checkpoint = buildCheckpoint();
    const report = evaluateShotContinuity({
      checkpoint,
      mode: "graphic_novel",
    });
    const contradictionIssue = report.issues.find(
      (issue) => issue.fixAction === "normalize_contradictory_camera",
    );
    expect(contradictionIssue).toBeDefined();

    const nextCheckpoint = applyShotContinuityAutoFix({
      checkpoint,
      mode: "graphic_novel",
      issueId: contradictionIssue!.id,
    });

    expect(nextCheckpoint.panelPlan[2]?.camera).not.toContain("and");
    expect(nextCheckpoint.panelPlan[2]?.cameraLocked).toBe(true);
  });
});
