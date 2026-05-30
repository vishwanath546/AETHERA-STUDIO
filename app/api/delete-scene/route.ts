import { NextResponse } from "next/server";
import { getJob, saveJob, SceneJob } from "@/lib/job-store";
import fs from "fs";
import path from "path";

export async function POST(request: Request) {
  try {
    const { jobId, sceneNumber } = await request.json();

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

    // Gather temp directories
    const tempDirs = [
      path.join(process.cwd(), "public", "temp", jobId),
      path.join(process.cwd(), "temp", jobId)
    ];

    // Helper to delete all files matching sceneNumber
    const deleteSceneFiles = (num: number) => {
      const fileNames = [
        `scene_${num}.jpg`,
        `scene_${num}.mp3`,
        `scene_${num}.srt`,
        `scene_${num}.mp4`,
        `scene_${num}_raw.mp4`,
        `scene_${num}_last_frame.jpg`,
        `scene_${num}.mp3.tmp.wav`
      ];

      for (const dir of tempDirs) {
        if (fs.existsSync(dir)) {
          for (const file of fileNames) {
            const filePath = path.join(dir, file);
            if (fs.existsSync(filePath)) {
              try {
                fs.unlinkSync(filePath);
              } catch (e) {
                console.warn(`API: Failed to delete scene file ${filePath}:`, e);
              }
            }
          }
        }
      }
    };

    // Helper to rename files when scene numbers shift
    const renameSceneFiles = (oldNum: number, newNum: number) => {
      const renamePairs = [
        { oldName: `scene_${oldNum}.jpg`, newName: `scene_${newNum}.jpg` },
        { oldName: `scene_${oldNum}.mp3`, newName: `scene_${newNum}.mp3` },
        { oldName: `scene_${oldNum}.srt`, newName: `scene_${newNum}.srt` },
        { oldName: `scene_${oldNum}.mp4`, newName: `scene_${newNum}.mp4` },
        { oldName: `scene_${oldNum}_raw.mp4`, newName: `scene_${newNum}_raw.mp4` },
        { oldName: `scene_${oldNum}_last_frame.jpg`, newName: `scene_${newNum}_last_frame.jpg` }
      ];

      for (const dir of tempDirs) {
        if (fs.existsSync(dir)) {
          for (const pair of renamePairs) {
            const oldPath = path.join(dir, pair.oldName);
            const newPath = path.join(dir, pair.newName);
            if (fs.existsSync(oldPath)) {
              try {
                // If the target new path already exists for some reason, delete it first to avoid collision
                if (fs.existsSync(newPath)) {
                  fs.unlinkSync(newPath);
                }
                fs.renameSync(oldPath, newPath);
              } catch (e) {
                console.warn(`API: Failed to rename ${oldPath} to ${newPath}:`, e);
              }
            }
          }
        }
      }
    };

    // 1. Delete files of the scene we want to remove
    deleteSceneFiles(sceneNumber);

    // 2. Remove the scene from the list
    job.scenes.splice(sceneIndex, 1);

    // 3. Renumber remaining scenes and rename their files on disk if their sceneNumber changes
    const updatedScenes: SceneJob[] = [];
    for (let i = 0; i < job.scenes.length; i++) {
      const scene = job.scenes[i];
      const newSceneNumber = i + 1;
      const oldSceneNumber = scene.sceneNumber;

      if (oldSceneNumber !== newSceneNumber) {
        // Rename physical files on disk
        renameSceneFiles(oldSceneNumber, newSceneNumber);

        // Update paths stored inside the scene object
        const updatePathStr = (p?: string) => {
          if (!p) return undefined;
          return p.replace(`scene_${oldSceneNumber}`, `scene_${newSceneNumber}`);
        };

        updatedScenes.push({
          ...scene,
          sceneNumber: newSceneNumber,
          imagePath: updatePathStr(scene.imagePath),
          audioPath: updatePathStr(scene.audioPath),
          srtPath: updatePathStr(scene.srtPath),
          clipPath: updatePathStr(scene.clipPath),
        });
      } else {
        updatedScenes.push(scene);
      }
    }

    job.scenes = updatedScenes;
    job.sceneCount = job.scenes.length;

    // 4. Invalidate final movie files
    for (const dir of tempDirs) {
      const finalPath = path.join(dir, "final_movie.mp4");
      if (fs.existsSync(finalPath)) {
        try {
          fs.unlinkSync(finalPath);
        } catch (e) {
          console.warn(`API: Failed to delete final movie ${finalPath}:`, e);
        }
      }
    }
    job.finalVideoPath = undefined;
    job.gcsFinalUrl = undefined;

    // 5. Update job status
    const allComplete = job.scenes.length > 0 && job.scenes.every(s => s.status === "complete");
    job.status = allComplete ? "ready_to_merge" : "draft";

    saveJob(job);
    console.log(`API: Deleted scene ${sceneNumber} from job ${jobId}. Remaining count: ${job.scenes.length}`);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("API Error in delete-scene:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete scene." },
      { status: 500 }
    );
  }
}
