import { NextResponse } from "next/server";
import { getJob, saveJob, SceneJob } from "@/lib/job-store";
import { generateNextScene } from "@/lib/gemini";
import fs from "fs";

export async function POST(request: Request) {
  try {
    const { jobId, mode, prompt } = await request.json();

    if (!jobId || !mode || (mode === "ai" && !prompt)) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const job = getJob(jobId);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    let newScene: SceneJob;
    const nextSceneNumber = job.scenes.length + 1;

    if (mode === "blank") {
      newScene = {
        sceneNumber: nextSceneNumber,
        visualPrompt: "EXT. [SETTING] - DAY\nDescribe the visual actions here...",
        dialogueOrNarration: 'NARRATOR: "Enter narration or dialogue here..."',
        estimatedDuration: 5,
        audioPrompt: "SFX: Ambient hum. AMBIENT: Gentle background music.",
        status: "idle" as const,
        approved: false,
      };
    } else if (mode === "ai") {
      // For continuity, map the SceneJob scenes to simple Scene structures
      const currentScenesForGemini = job.scenes.map(s => ({
        sceneNumber: s.sceneNumber,
        visualPrompt: s.visualPrompt,
        dialogueOrNarration: s.dialogueOrNarration,
        estimatedDuration: s.estimatedDuration,
        audioPrompt: s.audioPrompt,
      }));

      const geminiScene = await generateNextScene(
        jobId,
        prompt,
        currentScenesForGemini,
        job.prompt,
        undefined,
        job.characters
      );

      newScene = {
        ...geminiScene,
        status: "idle" as const,
        approved: false,
      };
    } else {
      return NextResponse.json({ error: "Invalid mode. Must be 'blank' or 'ai'" }, { status: 400 });
    }

    // Invalidate final movie if job was completed/merging
    if (job.finalVideoPath && fs.existsSync(job.finalVideoPath)) {
      try {
        fs.unlinkSync(job.finalVideoPath);
      } catch (e) {
        console.warn(`API: Failed to delete final movie on adding scene for Job ${jobId}:`, e);
      }
    }

    job.finalVideoPath = undefined;
    job.gcsFinalUrl = undefined;
    job.scenes.push(newScene);
    job.sceneCount = job.scenes.length;
    job.status = "draft";

    saveJob(job);
    console.log(`API: Appended scene ${nextSceneNumber} in job ${jobId} under mode ${mode}`);

    return NextResponse.json({ success: true, scene: newScene });
  } catch (error: any) {
    console.error("API Error in add-scene:", error);
    return NextResponse.json(
      { error: error.message || "Failed to add scene." },
      { status: 500 }
    );
  }
}
