import { NextResponse } from "next/server";
import { getJob } from "@/lib/job-store";
import fs from "fs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;

    if (!jobId) {
      return NextResponse.json({ error: "Job ID is required" }, { status: 400 });
    }

    const job = getJob(jobId);
    if (!job || !job.finalVideoPath) {
      return NextResponse.json({ error: "Movie production job not found or not completed." }, { status: 404 });
    }

    const filePath = job.finalVideoPath;
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: "The generated movie file was not found on disk." }, { status: 404 });
    }

    const url = new URL(request.url);
    const isInline = url.searchParams.get("inline") === "true";

    const pathNormalized = filePath.replace(/\\/g, "/");
    const publicIndex = pathNormalized.indexOf("/public/temp/");
    if (isInline && publicIndex !== -1) {
      const relativeUrl = pathNormalized.substring(publicIndex + 7); // "/temp/..."
      return NextResponse.redirect(new URL(`${relativeUrl}?t=${Date.now()}`, request.url));
    }

    const stat = fs.statSync(filePath);
    const fileStream = fs.createReadStream(filePath);

    // Support inline streaming in video player vs attachment download
    const contentDisposition = isInline 
      ? "inline" 
      : `attachment; filename="aethera_movie_${jobId.substring(0, 8)}.mp4"`;

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
        "Content-Disposition": contentDisposition,
        "Content-Length": stat.size.toString(),
      },
    });

  } catch (error: any) {
    console.error("API Error in download:", error);
    return NextResponse.json({ error: error.message || "Failed to download movie file." }, { status: 500 });
  }
}
