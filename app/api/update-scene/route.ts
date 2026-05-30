import { NextResponse } from "next/server";
import { getJob, updateSceneStatus } from "@/lib/job-store";
import fs from "fs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { jobId, sceneNumber, visualPrompt, dialogueOrNarration, estimatedDuration, approved } = body;

    if (!jobId || typeof sceneNumber !== "number" || !visualPrompt) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const job = getJob(jobId);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const sceneIndex = job.scenes.findIndex(s => s.sceneNumber === sceneNumber);
    if (sceneIndex === -1) {
      return NextResponse.json({ error: "Scene not found" }, { status: 404 });
    }

    const currentScene = job.scenes[sceneIndex];

    const cleanVisualPrompt = visualPrompt.trim();
    const cleanDialogue = dialogueOrNarration ? dialogueOrNarration.trim() : currentScene.dialogueOrNarration;
    const cleanDuration = typeof estimatedDuration === "number" ? estimatedDuration : currentScene.estimatedDuration;

    // Check if the actual content of visual directions/dialogue/duration changed
    const contentChanged =
      currentScene.visualPrompt !== cleanVisualPrompt ||
      currentScene.dialogueOrNarration !== cleanDialogue ||
      currentScene.estimatedDuration !== cleanDuration;

    // Determine if we should invalidate existing video (if content changed, OR if we're explicitly unlocking it)
    const isUnlocking = approved === false;
    const shouldReset = contentChanged || isUnlocking;

    if (shouldReset) {
      // Clean up stale files for this scene since we are editing/unlocking it
      try {
        if (currentScene.imagePath && fs.existsSync(currentScene.imagePath)) fs.unlinkSync(currentScene.imagePath);
        if (currentScene.audioPath && fs.existsSync(currentScene.audioPath)) fs.unlinkSync(currentScene.audioPath);
        if (currentScene.srtPath && fs.existsSync(currentScene.srtPath)) fs.unlinkSync(currentScene.srtPath);
        if (currentScene.clipPath && fs.existsSync(currentScene.clipPath)) fs.unlinkSync(currentScene.clipPath);
      } catch (e) {
        console.warn(`API: Failed to clean up stale files for scene ${sceneNumber}:`, e);
      }

      updateSceneStatus(jobId, sceneNumber, "idle", {
        visualPrompt: cleanVisualPrompt,
        dialogueOrNarration: cleanDialogue,
        estimatedDuration: cleanDuration,
        approved: typeof approved === "boolean" ? approved : false,
        imagePath: undefined,
        audioPath: undefined,
        srtPath: undefined,
        clipPath: undefined,
        gcsClipUrl: undefined,
        error: undefined,
      });
    } else {
      // Content did not change and we are not unlocking (either approving a draft or retaining approval).
      // Keep status as-is, just update text prompts and approved field.
      updateSceneStatus(jobId, sceneNumber, currentScene.status, {
        visualPrompt: cleanVisualPrompt,
        dialogueOrNarration: cleanDialogue,
        estimatedDuration: cleanDuration,
        approved: typeof approved === "boolean" ? approved : currentScene.approved,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("API Error in update-scene:", error);
    return NextResponse.json({ error: error.message || "Failed to update scene." }, { status: 500 });
  }
}
