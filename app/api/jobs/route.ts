import { NextResponse } from "next/server";
import { jobStore } from "@/lib/job-store";

export const dynamic = "force-dynamic";

import fs from "fs";

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
