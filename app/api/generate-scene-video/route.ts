import { NextResponse } from "next/server";
import { getJob, updateSceneStatus, saveJob } from "@/lib/job-store";
import { runProduction } from "@/lib/production-pipeline";
import fs from "fs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { jobId, sceneNumber, visualPrompt, dialogueOrNarration, estimatedDuration } = body;

    if (!jobId || typeof sceneNumber !== "number") {
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

    // Clean up stale files for this scene since we are regenerating it
    try {
      if (currentScene.imagePath && fs.existsSync(currentScene.imagePath)) fs.unlinkSync(currentScene.imagePath);
      if (currentScene.audioPath && fs.existsSync(currentScene.audioPath)) fs.unlinkSync(currentScene.audioPath);
      if (currentScene.srtPath && fs.existsSync(currentScene.srtPath)) fs.unlinkSync(currentScene.srtPath);
      if (currentScene.clipPath && fs.existsSync(currentScene.clipPath)) fs.unlinkSync(currentScene.clipPath);
    } catch (e) {
      console.warn(`API: Failed to clean up stale files for scene ${sceneNumber}:`, e);
    }

    // Update scene properties and reset status to queued
    const updates: any = {
      status: "queued",
      error: null,
      imagePath: null,
      audioPath: null,
      srtPath: null,
      clipPath: null,
      gcsClipUrl: null,
    };
    
    if (visualPrompt !== undefined) updates.visualPrompt = visualPrompt.trim();
    if (dialogueOrNarration !== undefined) updates.dialogueOrNarration = dialogueOrNarration.trim();
    if (estimatedDuration !== undefined) updates.estimatedDuration = estimatedDuration;

    updateSceneStatus(jobId, sceneNumber, "queued", updates);

    // Set job status to producing
    job.status = "producing";
    delete job.error;
    saveJob(job);

    console.log(`API: Triggering background single-scene generation for Job ${jobId}, Scene ${sceneNumber}`);

    // Trigger the background production pipeline for this single scene
    runProduction(jobId, sceneNumber).catch((err) => {
      console.error(`Single scene production failed for job ${jobId}, scene ${sceneNumber}:`, err);
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("API Error in generate-scene-video:", error);
    return NextResponse.json({ error: error.message || "Failed to initiate scene video generation." }, { status: 500 });
  }
}
