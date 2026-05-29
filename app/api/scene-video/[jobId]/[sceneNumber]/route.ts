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

    const clipPathNormalized = scene.clipPath.replace(/\\/g, "/");
    const publicIndex = clipPathNormalized.indexOf("/public/temp/");
    if (publicIndex !== -1) {
      const relativeUrl = clipPathNormalized.substring(publicIndex + 7); // "/temp/..."
      return NextResponse.redirect(new URL(`${relativeUrl}?t=${Date.now()}`, request.url));
    }

    const stat = fs.statSync(scene.clipPath);
    const fileStream = fs.createReadStream(scene.clipPath);

    let isClosed = false;
    const stream = new ReadableStream({
      start(controller) {
        fileStream.on("data", (chunk) => {
          if (!isClosed) {
            try {
              controller.enqueue(chunk);
            } catch (err) {
              isClosed = true;
              fileStream.destroy();
            }
          }
        });
        fileStream.on("end", () => {
          if (!isClosed) {
            isClosed = true;
            try {
              controller.close();
            } catch (err) {}
          }
        });
        fileStream.on("error", (err) => {
          if (!isClosed) {
            isClosed = true;
            try {
              controller.error(err);
            } catch (err2) {}
          }
        });
      },
      cancel() {
        isClosed = true;
        fileStream.destroy();
      }
    });

    return new Response(stream, {
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
