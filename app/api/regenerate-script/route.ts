import { NextResponse } from "next/server";
import { getJob, saveJob } from "@/lib/job-store";
import { regenerateScript, generateScript } from "@/lib/gemini";
import fs from "fs";
import path from "path";

export async function POST(request: Request) {
  try {
    const { jobId, prompt } = await request.json();

    if (!jobId) {
      return NextResponse.json({ error: "Job ID is required." }, { status: 400 });
    }

    const job = getJob(jobId);
    if (!job) {
      return NextResponse.json({ error: "Job not found." }, { status: 404 });
    }

    let newScenes;
    if (prompt && prompt.trim().length > 0) {
      console.log(`API: Regenerating script with refinement instructions for Job ${jobId}. Instruction: "${prompt}"`);
      newScenes = await regenerateScript(
        jobId,
        prompt.trim(),
        job.scenes,
        job.prompt,
        job.sceneCount,
        undefined,
        job.characters
      );
    } else {
      console.log(`API: Directly regenerating script for Job ${jobId} from original prompt: "${job.prompt}"`);
      newScenes = await generateScript(job.prompt, job.sceneCount, undefined, job.characters);
    }

    // Clean up all old scene files
    job.scenes.forEach(s => {
      try {
        if (s.imagePath && fs.existsSync(s.imagePath)) fs.unlinkSync(s.imagePath);
        if (s.audioPath && fs.existsSync(s.audioPath)) fs.unlinkSync(s.audioPath);
        if (s.srtPath && fs.existsSync(s.srtPath)) fs.unlinkSync(s.srtPath);
        if (s.clipPath && fs.existsSync(s.clipPath)) fs.unlinkSync(s.clipPath);
      } catch (e) {}
    });

    const sceneJobs = newScenes.map((scene) => ({
      ...scene,
      status: "idle" as const,
      approved: false,
    }));

    job.scenes = sceneJobs;
    job.status = "draft"; // reset job to draft
    delete job.error;
    saveJob(job);

    return NextResponse.json({ success: true, scenes: sceneJobs });
  } catch (error: any) {
    console.error("API Error in regenerate-script:", error);
    return NextResponse.json({ error: error.message || "Failed to regenerate script." }, { status: 500 });
  }
}
