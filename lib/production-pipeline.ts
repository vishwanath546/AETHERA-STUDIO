import fs from "fs";
import path from "path";
import { 
  getJob, 
  saveJob, 
  updateJobStatus, 
  updateSceneStatus, 
  Job, 
  SceneJob 
} from "./job-store";
import { generateVisual } from "./gemini";
import { generateAudio } from "./audio-generator";
import { generateSRT } from "./subtitle-generator";
import { assembleClip, concatenateClips, extractLastFrame } from "./ffmpeg";
import { uploadToGCS } from "./gcs";

// Global lock to prevent concurrent pipeline loops for the same job
const activePipelines = new Set<string>();

export async function runProduction(jobId: string, singleSceneNumber?: number): Promise<void> {
  const isFull = singleSceneNumber === undefined;
  const lockKey = isFull ? `${jobId}_full` : `${jobId}_scene_${singleSceneNumber}`;

  if (activePipelines.has(`${jobId}_full`) || activePipelines.has(lockKey)) {
    console.log(`Production Pipeline: Task ${lockKey} already active. Skipping.`);
    return;
  }
  
  activePipelines.add(lockKey);

  try {
    const initialJob = getJob(jobId);
    if (!initialJob) {
      console.error(`Production Pipeline: Job ${jobId} not found.`);
      return;
    }

    console.log(`Production Pipeline: Starting job ${jobId}...`);
    updateJobStatus(jobId, "producing");

    // Create temporary directory for job assets
    const workspaceRoot = path.join(process.cwd(), "public");
    const tempDir = path.join(workspaceRoot, "temp", jobId);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Dynamic loop to always fetch fresh job state
    while (true) {
      const currentJob = getJob(jobId);
      if (!currentJob) break;

      // Find the first scene that needs processing
      const scene = currentJob.scenes.find(s => 
        (s.status === "queued" || s.status === "error") &&
        (singleSceneNumber === undefined || s.sceneNumber === singleSceneNumber)
      );
      
      if (!scene) {
        // No scenes need processing. 
        const anyGenerating = currentJob.scenes.some(s => 
          ["generating_image", "generating_audio", "assembling_clip"].includes(s.status)
        );
        
        if (!anyGenerating) {
          const allCompleted = currentJob.scenes.every(s => s.status === "complete");
          if (allCompleted) {
            console.log(`Production Pipeline: All ${currentJob.scenes.length} scenes completed for job ${jobId}. Awaiting user merge command.`);
            updateJobStatus(jobId, "ready_to_merge");
          } else {
            console.log(`Production Pipeline: Scene task completed. Some scenes are still pending.`);
            updateJobStatus(jobId, "draft");
          }
        }
        break;
      }

      const sceneNum = scene.sceneNumber;

      const imagePath = path.join(tempDir, `scene_${sceneNum}.jpg`);
      const audioPath = path.join(tempDir, `scene_${sceneNum}.mp3`);
      const srtPath = path.join(tempDir, `scene_${sceneNum}.srt`);
      const clipPath = path.join(tempDir, `scene_${sceneNum}.mp4`);

      console.log(`Production Pipeline: Processing Scene ${sceneNum}/${currentJob.scenes.length}...`);

      // Ensure any partial/stale files from previous failed runs are removed
      try {
        if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
        if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
        if (fs.existsSync(srtPath)) fs.unlinkSync(srtPath);
        if (fs.existsSync(clipPath)) fs.unlinkSync(clipPath);
      } catch (e) {}

      // Wrap scene processing in try/catch to handle individual scene failures without killing the whole pipeline
      try {
        // Step 1: Visual Generation
        updateSceneStatus(jobId, sceneNum, "generating_image");

        let startingImageBase64: string | undefined;
        if (sceneNum > 1) {
          const prevScene = currentJob.scenes.find(s => s.sceneNumber === sceneNum - 1);
          if (prevScene && prevScene.clipPath && fs.existsSync(prevScene.clipPath)) {
            try {
              console.log(`Production Pipeline: Extracting last frame of Scene ${sceneNum - 1} for Scene ${sceneNum}...`);
              const lastFramePath = path.join(tempDir, `scene_${sceneNum - 1}_last_frame.jpg`);
              await extractLastFrame(prevScene.clipPath, lastFramePath);
              if (fs.existsSync(lastFramePath)) {
                startingImageBase64 = `data:image/jpeg;base64,${fs.readFileSync(lastFramePath, { encoding: "base64" })}`;
              }
            } catch (err) {
              console.warn(`Production Pipeline: Non-fatal error extracting last frame of previous scene:`, err);
            }
          }
        }

        const visualPath = await generateVisual(
          scene.visualPrompt, 
          imagePath, 
          sceneNum, 
          scene.dialogueOrNarration, 
          scene.audioPrompt || "",
          currentJob.characters,
          startingImageBase64
        );

        // Step 2: Audio/Narration Generation
        updateSceneStatus(jobId, sceneNum, "generating_audio");
        const cleanNarrationText = scene.dialogueOrNarration
          .replace(/^[A-Z0-9\s_-]+:\s*/i, "")
          .replace(/^["']|["']$/g, "")
          .trim();

        const speakerMatch = scene.dialogueOrNarration.match(/^([A-Z0-9\s_-]+):\s*/i);
        const speakerName = speakerMatch ? speakerMatch[1].toUpperCase().trim() : "NARRATOR";
        
        let voice = "en-US-GuyNeural";
        if (speakerName.includes("JENNY") || speakerName.includes("FEMALE") || speakerName.includes("WOMAN") || speakerName.includes("GIRL") || speakerName.includes("AVA") || speakerName.includes("EMMA") || speakerName.includes("SINGER") || speakerName.includes("SISTER") || speakerName.includes("MOTHER") || speakerName.includes("PRINCESS")) {
          voice = "en-US-JennyNeural";
        } else if (speakerName.includes("ANDREW") || speakerName.includes("BOY") || speakerName.includes("MAN") || speakerName.includes("DETECTIVE") || speakerName.includes("COP") || speakerName.includes("VILLAIN") || speakerName.includes("HERO") || speakerName.includes("BROTHER") || speakerName.includes("FATHER") || speakerName.includes("KING")) {
          voice = "en-US-AndrewNeural";
        } else if (speakerName.includes("KID") || speakerName.includes("CHILD")) {
          voice = "en-US-AnaNeural";
        } else if (speakerName !== "NARRATOR") {
          const hash = speakerName.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
          voice = hash % 2 === 0 ? "en-US-GuyNeural" : "en-US-JennyNeural";
        }

        await generateAudio(cleanNarrationText, audioPath, scene.estimatedDuration, voice);

        // Step 3: Subtitle SRT Generation
        generateSRT(cleanNarrationText, scene.estimatedDuration, srtPath);

        // Step 4: Assemble Scene Video Clip
        updateSceneStatus(jobId, sceneNum, "assembling_clip");
        await assembleClip(visualPath, audioPath, srtPath, clipPath, scene.estimatedDuration, {
          burnSubtitles: false,
          sceneText: scene.visualPrompt + " " + scene.dialogueOrNarration + " " + (scene.audioPrompt || ""),
        });

        // Step 5: Upload completed clip to GCS
        let gcsClipUrl: string | undefined;
        try {
          gcsClipUrl = await uploadToGCS(clipPath, `jobs/${jobId}/scene_${sceneNum}.mp4`);
          console.log(`Production Pipeline: Scene ${sceneNum} uploaded to GCS: ${gcsClipUrl}`);
        } catch (gcsErr: any) {
          console.warn(`Production Pipeline: GCS upload failed for scene ${sceneNum}, keeping local only. Error: ${gcsErr.message}`);
        }

        // Save paths and update status to complete
        updateSceneStatus(jobId, sceneNum, "complete", {
          imagePath: visualPath,
          audioPath,
          srtPath,
          clipPath,
          gcsClipUrl,
        });

      } catch (sceneErr: any) {
        console.error(`Production Pipeline: Scene ${sceneNum} failed:`, sceneErr);
        updateSceneStatus(jobId, sceneNum, "error", {
          error: sceneErr.message || String(sceneErr),
        });
        // We set the overall job to error so the UI shows the global error state,
        // but the loop will continue if there are other queued scenes.
        updateJobStatus(jobId, "error", sceneErr.message || String(sceneErr));
        break; // Stop processing further scenes if one fails, wait for user intervention
      }
    }

  } catch (error: any) {
    console.error(`Production Pipeline Failed for job ${jobId}:`, error);
    updateJobStatus(jobId, "error", error.message || String(error));
  } finally {
    activePipelines.delete(lockKey);
  }
}

/**
 * Merge all completed scene clips into the final movie.
 * Called manually by the user via the "Merge All Videos" button.
 */
export async function mergeScenes(jobId: string, sequence?: number[]): Promise<void> {
  const job = getJob(jobId);
  if (!job) {
    throw new Error(`Job ${jobId} not found.`);
  }

  updateJobStatus(jobId, "merging");

  const workspaceRoot = path.join(process.cwd(), "public");
  const tempDir = path.join(workspaceRoot, "temp", jobId);

  try {
    // Gather clip paths for all completed scenes in order
    const clipPaths: string[] = [];

    // If sequence is provided, validate and use it. Otherwise, use original order.
    const order = sequence || job.scenes.map(s => s.sceneNumber);

    for (const sceneNum of order) {
      const scene = job.scenes.find(s => s.sceneNumber === sceneNum);
      if (!scene) {
        throw new Error(`Scene ${sceneNum} not found in job.`);
      }
      if (scene.status !== "complete" || !scene.clipPath) {
        throw new Error(`Scene ${scene.sceneNumber} is not complete. Cannot merge.`);
      }
      if (!fs.existsSync(scene.clipPath)) {
        throw new Error(`Scene ${scene.sceneNumber} clip file not found at ${scene.clipPath}.`);
      }
      clipPaths.push(scene.clipPath);
    }

    // Concatenate all clips into final movie
    console.log("Production Pipeline: Stitching final movie...");
    const finalMoviePath = path.join(tempDir, "final_movie.mp4");
    await concatenateClips(clipPaths, finalMoviePath);

    // Upload final movie to GCS
    let gcsFinalUrl: string | undefined;
    try {
      gcsFinalUrl = await uploadToGCS(finalMoviePath, `jobs/${jobId}/final_movie.mp4`);
      console.log(`Production Pipeline: Final movie uploaded to GCS: ${gcsFinalUrl}`);
    } catch (gcsErr: any) {
      console.warn(`Production Pipeline: GCS upload of final movie failed, keeping local only. Error: ${gcsErr.message}`);
    }

    // Save final movie path and complete job
    const finalJob = getJob(jobId);
    if (finalJob) {
      finalJob.status = "completed";
      finalJob.finalVideoPath = finalMoviePath;
      finalJob.gcsFinalUrl = gcsFinalUrl;
      if (sequence) {
        finalJob.sceneSequence = sequence;
      }
      saveJob(finalJob);
    }

    console.log(`Production Pipeline: Job ${jobId} completed successfully!`);

  } catch (error: any) {
    console.error(`Merge failed for job ${jobId}:`, error);
    updateJobStatus(jobId, "error", error.message || String(error));
    throw error;
  }
}
