import { NextResponse } from "next/server";
import { getJob, updateSceneStatus, saveJob } from "@/lib/job-store";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { jobId, sceneNumber, visualPrompt, dialogueOrNarration } = body;

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

    // Update the prompt and reset status to queued so it regenerates
    updateSceneStatus(jobId, sceneNumber, "queued", {
      visualPrompt: visualPrompt.trim(),
      dialogueOrNarration: dialogueOrNarration ? dialogueOrNarration.trim() : job.scenes[sceneIndex].dialogueOrNarration,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("API Error in update-scene:", error);
    return NextResponse.json({ error: error.message || "Failed to update scene." }, { status: 500 });
  }
}
