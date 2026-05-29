import { NextResponse } from "next/server";
import { getJob } from "@/lib/job-store";
import fs from "fs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string; sceneNumber: string }> }
) {
  try {
    const { jobId, sceneNumber } = await params;
    const sceneNum = parseInt(sceneNumber, 10);

    if (!jobId || isNaN(sceneNum)) {
      return NextResponse.json({ error: "Invalid job ID or scene number." }, { status: 400 });
    }

    const job = getJob(jobId);
    if (!job) {
      return NextResponse.json({ error: "Job not found." }, { status: 404 });
    }

    const scene = job.scenes.find((s) => s.sceneNumber === sceneNum);
    if (!scene || scene.status !== "complete" || !scene.clipPath) {
      return NextResponse.json({ error: `Scene ${sceneNum} is not ready for preview.` }, { status: 404 });
    }

    if (!fs.existsSync(scene.clipPath)) {
      return NextResponse.json({ error: "Scene video file not found on disk." }, { status: 404 });
    }

    const stat = fs.statSync(scene.clipPath);
    const buffer = fs.readFileSync(scene.clipPath);

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": "inline",
        "Content-Length": stat.size.toString(),
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });
  } catch (error: any) {
    console.error("API Error in scene-video:", error);
    return NextResponse.json({ error: error.message || "Failed to stream scene video." }, { status: 500 });
  }
}
