import { NextResponse } from "next/server";
import { getJob, saveJob } from "@/lib/job-store";
import { regenerateSingleScene } from "@/lib/gemini";
import fs from "fs";

export async function POST(request: Request) {
  try {
    const { jobId, sceneNumber, prompt } = await request.json();

    if (!jobId || typeof sceneNumber !== "number" || !prompt || !prompt.trim()) {
      return NextResponse.json({ error: "Missing required fields: jobId, sceneNumber, and prompt are required." }, { status: 400 });
    }

    const job = getJob(jobId);
    if (!job) {
      return NextResponse.json({ error: "Job not found." }, { status: 404 });
    }

    const sceneIndex = job.scenes.findIndex((s) => s.sceneNumber === sceneNumber);
    if (sceneIndex === -1) {
      return NextResponse.json({ error: "Scene not found." }, { status: 404 });
    }

    const currentScene = job.scenes[sceneIndex];

    console.log(`API: Regenerating Scene ${sceneNumber} for Job ${jobId} with instruction: "${prompt}"`);

    // Call Gemini to regenerate the single scene
    const regeneratedScene = await regenerateSingleScene(
      jobId,
      sceneNumber,
      prompt.trim(),
      currentScene,
      job.prompt,
      undefined,
      job.characters
    );

    // Clean up all old physical media files for this scene
    try {
      if (currentScene.imagePath && fs.existsSync(currentScene.imagePath)) fs.unlinkSync(currentScene.imagePath);
      if (currentScene.audioPath && fs.existsSync(currentScene.audioPath)) fs.unlinkSync(currentScene.audioPath);
      if (currentScene.srtPath && fs.existsSync(currentScene.srtPath)) fs.unlinkSync(currentScene.srtPath);
      if (currentScene.clipPath && fs.existsSync(currentScene.clipPath)) fs.unlinkSync(currentScene.clipPath);
    } catch (e) {
      console.warn(`API: Failed to clean up stale files for Scene ${sceneNumber}:`, e);
    }

    // Update the scene fields, reset status to idle, clear paths, and set approved to false
    const updatedScene = {
      ...currentScene,
      visualPrompt: regeneratedScene.visualPrompt.trim(),
      dialogueOrNarration: regeneratedScene.dialogueOrNarration.trim(),
      estimatedDuration: regeneratedScene.estimatedDuration || currentScene.estimatedDuration,
      audioPrompt: regeneratedScene.audioPrompt || currentScene.audioPrompt,
      status: "idle" as const,
      approved: false,
      imagePath: undefined,
      audioPath: undefined,
      srtPath: undefined,
      clipPath: undefined,
      gcsClipUrl: undefined,
      error: undefined,
    };

    job.scenes[sceneIndex] = updatedScene;
    job.status = "draft"; // Reset overall job status to draft since the script was modified
    delete job.error;
    saveJob(job);

    return NextResponse.json({ success: true, scene: updatedScene });
  } catch (error: any) {
    console.error("API Error in regenerate-scene:", error);
    return NextResponse.json({ error: error.message || "Failed to regenerate scene." }, { status: 500 });
  }
}
