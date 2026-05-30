import { NextResponse } from "next/server";
import { jobStore, deleteJob, getJob } from "@/lib/job-store";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const jobs = Array.from(jobStore.values()).map((j) => {
      let actualPath = j.finalVideoPath || null;
      if (actualPath && !fs.existsSync(actualPath)) {
        actualPath = null;
      }
      
      return {
        id: j.id,
        status: j.status,
        prompt: j.prompt,
        createdAt: j.createdAt,
        finalVideoPath: actualPath,
      };
    });

    return NextResponse.json({ jobs });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    console.error("API Error in /api/jobs:", err);
    return NextResponse.json({ error: err.message || "Failed to list jobs" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { jobId } = await request.json();

    if (!jobId || typeof jobId !== "string") {
      return NextResponse.json({ error: "Job ID is required" }, { status: 400 });
    }

    // Gather all directories that might contain files for this jobId
    const dirsToDelete = new Set<string>();

    // 1. Standard locations in the current workspace (resolved dynamically via process.cwd())
    dirsToDelete.add(path.join(process.cwd(), "public", "temp", jobId));
    dirsToDelete.add(path.join(process.cwd(), "temp", jobId));

    // 2. Extract parent directories of any files saved in the job store for this job
    const job = getJob(jobId);
    if (job) {
      const checkAndAddPathDir = (filePath?: string) => {
        if (!filePath) return;
        try {
          const absolutePath = path.resolve(filePath);
          const parentDir = path.dirname(absolutePath);
          // Only add to deletion if the folder name is exactly the jobId (job-specific directory)
          if (path.basename(parentDir) === jobId) {
            dirsToDelete.add(parentDir);
          }
        } catch (e) {
          // Ignore resolution / parsing errors
        }
      };

      checkAndAddPathDir(job.finalVideoPath);
      if (job.scenes) {
        for (const scene of job.scenes) {
          checkAndAddPathDir(scene.imagePath);
          checkAndAddPathDir(scene.audioPath);
          checkAndAddPathDir(scene.srtPath);
          checkAndAddPathDir(scene.clipPath);
        }
      }
    }

    // Delete all resolved directories from disk recursively
    for (const dirPath of dirsToDelete) {
      if (fs.existsSync(dirPath)) {
        try {
          fs.rmSync(dirPath, { recursive: true, force: true });
          console.log(`API: Deleted job directory ${dirPath}`);
        } catch (err) {
          console.warn(`API: Failed to delete job directory ${dirPath}:`, err);
        }
      }
    }

    // 4. Finally delete the job from the store
    deleteJob(jobId);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("API Error in DELETE /api/jobs:", err);
    return NextResponse.json({ error: err.message || "Failed to delete job" }, { status: 500 });
  }
}

