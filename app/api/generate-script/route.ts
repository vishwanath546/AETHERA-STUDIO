import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { generateScript } from "@/lib/gemini";
import { saveJob, Job } from "@/lib/job-store";

const API_TIMEOUT_MS = 120000; // 2 minutes timeout for script generation

/**
 * Wrap a promise with a timeout
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${operation} timed out after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}

export async function POST(request: Request) {
  try {
    const { prompt, sceneCount, language, characters } = await request.json();

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "Prompt is required and must be a string." }, { status: 400 });
    }

    const parsedSceneCount = parseInt(sceneCount, 10);
    if (isNaN(parsedSceneCount) || parsedSceneCount < 1 || parsedSceneCount > 12) {
      return NextResponse.json({ error: "Scene count must be an integer between 1 and 12." }, { status: 400 });
    }

    console.log(`API: Generating script for prompt "${prompt.substring(0, 50)}..." with ${parsedSceneCount} scenes in ${language || "English"}.`);
    
    // Generate the multi-scene screenplay from Gemini with timeout protection
    const scenes = await withTimeout(
      generateScript(prompt, parsedSceneCount, language, characters),
      API_TIMEOUT_MS,
      "Script generation"
    );

    // Create unique Job ID
    const jobId = uuidv4();

    // Map script scenes to SceneJobs
    const sceneJobs = scenes.map((scene) => ({
      ...scene,
      status: "queued" as const,
    }));

    // Create and save Draft Job in store
    const newJob: Job = {
      id: jobId,
      status: "draft",
      prompt,
      sceneCount: parsedSceneCount,
      scenes: sceneJobs,
      createdAt: new Date().toISOString(),
      characters,
    };

    saveJob(newJob);
    console.log(`API: Successfully created Job ${jobId} in Draft state.`);

    return NextResponse.json({ jobId, scenes });
  } catch (error: any) {
    console.error("API Error in generate-script:", error);
    return NextResponse.json(
      { error: error.message || "An error occurred while generating the screenplay. Please check your Gemini API key." },
      { status: 500 }
    );
  }
}
