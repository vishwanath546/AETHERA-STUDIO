import { NextResponse } from "next/server";
import fs from "fs";
import { getJob, saveJob, Job } from "@/lib/job-store";
import { runProduction } from "@/lib/production-pipeline";

export async function POST(request: Request) {
  try {
    const { jobId, scenes, forceRegenerate = [] } = await request.json();

    if (!jobId || typeof jobId !== "string") {
      return NextResponse.json({ error: "Job ID is required." }, { status: 400 });
    }

    if (!scenes || !Array.isArray(scenes)) {
      return NextResponse.json({ error: "Scenes array is required." }, { status: 400 });
    }

    const job = getJob(jobId);
    if (!job) {
      return NextResponse.json({ error: "Job not found." }, { status: 404 });
    }

    console.log(`API: Starting production for Job ${jobId}. Updating scenes with user edits.`);

    const updatedSceneJobs = scenes.map((scene: any) => {
      const sceneNum = parseInt(scene.sceneNumber, 10);
      const existingScene = job.scenes.find((s) => s.sceneNumber === sceneNum);

      const visualPrompt = scene.visualPrompt;
      const dialogueOrNarration = scene.dialogueOrNarration;
      const estimatedDuration = parseInt(scene.estimatedDuration, 10);
      const audioPrompt = scene.audioPrompt || "";

      // Check if the content changed, OR if the UI explicitly requested to force regenerate this scene
      const contentChanged = 
        !existingScene ||
        forceRegenerate.includes(sceneNum) ||
        existingScene.visualPrompt !== visualPrompt ||
        existingScene.dialogueOrNarration !== dialogueOrNarration ||
        existingScene.estimatedDuration !== estimatedDuration ||
        (existingScene.audioPrompt || "") !== audioPrompt;

      // Check if it's an existing scene that is currently active or complete (and unchanged)
      if (existingScene && !contentChanged) {
        if (existingScene.status === "error") {
          // If it was in error, and we are starting production again, we want to retry it
          console.log(`API: Retrying failed Scene ${sceneNum}.`);
        } else {
          // It's either complete or currently generating. Leave it alone.
          console.log(`API: Preserving Scene ${sceneNum} (status: ${existingScene.status}).`);
          return existingScene;
        }
      }

      // If the scene changed or was in error, clean up stale files and reset to queued
      if (existingScene) {
        try {
          if (existingScene.imagePath && fs.existsSync(existingScene.imagePath)) fs.unlinkSync(existingScene.imagePath);
          if (existingScene.audioPath && fs.existsSync(existingScene.audioPath)) fs.unlinkSync(existingScene.audioPath);
          if (existingScene.srtPath && fs.existsSync(existingScene.srtPath)) fs.unlinkSync(existingScene.srtPath);
          if (existingScene.clipPath && fs.existsSync(existingScene.clipPath)) fs.unlinkSync(existingScene.clipPath);
        } catch (e) {
          console.warn(`API: Failed to clean up stale files for scene ${sceneNum}:`, e);
        }
      }

      return {
        sceneNumber: sceneNum,
        visualPrompt,
        dialogueOrNarration,
        estimatedDuration,
        audioPrompt,
        status: "queued" as const,
      };
    });

    // Update job in store
    job.scenes = updatedSceneJobs;
    job.status = "queued";
    delete job.error;
    saveJob(job);

    // Fire-and-forget the production pipeline in the background
    // Since we're running locally, the promise will continue to execute in Node.js.
    runProduction(jobId).catch((err) => {
      console.error(`Background Production Pipeline failed for job ${jobId}:`, err);
    });

    return NextResponse.json({ jobId, status: "started" });
  } catch (error: any) {
    console.error("API Error in start-production:", error);
    return NextResponse.json(
      { error: error.message || "Failed to start movie production pipeline." },
      { status: 500 }
    );
  }
}
