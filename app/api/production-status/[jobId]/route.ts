import { NextResponse } from "next/server";
import { getJob } from "@/lib/job-store";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  if (!jobId) {
    return NextResponse.json({ error: "Job ID is required" }, { status: 400 });
  }

  const job = getJob(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // Dual SSE / JSON handler: check Accept header
  const acceptHeader = request.headers.get("accept");
  if (!acceptHeader || !acceptHeader.includes("text/event-stream")) {
    return NextResponse.json(job);
  }

  const encoder = new TextEncoder();

  let active = true;
  let interval: NodeJS.Timeout;

  // Create a readable stream for Server-Sent Events (SSE)
  const stream = new ReadableStream({
    async start(controller) {
      // Send initial job status immediately
      const initialJob = getJob(jobId);
      if (initialJob) {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(initialJob)}\n\n`));
        } catch (err) {
          active = false;
          return;
        }
      }

      // Check status and stream updates every 1 second
      interval = setInterval(() => {
        if (!active) {
          clearInterval(interval);
          return;
        }

        const currentJob = getJob(jobId);
        if (!currentJob) {
          clearInterval(interval);
          active = false;
          try {
            controller.close();
          } catch (err) {}
          return;
        }

        // Stream the current job state
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(currentJob)}\n\n`));
        } catch (err) {
          clearInterval(interval);
          active = false;
          return;
        }

        // If completed, close connection
        if (currentJob.status === "completed") {
          clearInterval(interval);
          active = false;
          try {
            controller.close();
          } catch (err) {}
        }
      }, 1000);

      // Clean up when client closes the connection
      request.signal.addEventListener("abort", () => {
        active = false;
        clearInterval(interval);
      });
    },
    cancel() {
      active = false;
      if (interval) clearInterval(interval);
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
    },
  });
}

