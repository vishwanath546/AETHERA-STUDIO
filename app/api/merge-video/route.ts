import { NextResponse } from "next/server";
import { getJob } from "@/lib/job-store";
import { mergeScenes } from "@/lib/production-pipeline";

export async function POST(request: Request) {
  try {
    const { jobId, sequence } = await request.json();

    if (!jobId || typeof jobId !== "string") {
      return NextResponse.json({ error: "Job ID is required." }, { status: 400 });
    }

    const job = getJob(jobId);
    if (!job) {
      return NextResponse.json({ error: "Job not found." }, { status: 404 });
    }

    // Only allow merging if all scenes are complete
    const allComplete = job.scenes.every((s) => s.status === "complete");
    if (!allComplete) {
      return NextResponse.json(
        { error: "Not all scenes are complete. Please retry failed scenes first." },
        { status: 400 }
      );
    }

    // Fire-and-forget the merge in the background
    mergeScenes(jobId, sequence).catch((err) => {
      console.error(`Background merge failed for job ${jobId}:`, err);
    });

    return NextResponse.json({ jobId, status: "merging" });
  } catch (error: any) {
    console.error("API Error in merge-video:", error);
    return NextResponse.json(
      { error: error.message || "Failed to start merge." },
      { status: 500 }
    );
  }
}
