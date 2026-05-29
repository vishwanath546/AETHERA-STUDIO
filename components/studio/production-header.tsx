"use client";

import React, { useEffect, useState } from "react";
import { Progress } from "@/components/ui/progress";
import { Clapperboard, Hourglass, CheckCircle2 } from "lucide-react";
import { Job } from "@/lib/job-store";

interface ProductionHeaderProps {
  job: Job;
}

export function ProductionHeader({ job }: ProductionHeaderProps) {
  const [seconds, setSeconds] = useState(0);

  // Simple timer for elapsed time
  useEffect(() => {
    if (job.status === "producing" || job.status === "queued") {
      const interval = setInterval(() => {
        setSeconds((prev) => prev + 1);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [job.status]);

  // Calculate statistics
  const totalScenes = job.scenes.length;
  const completedScenes = job.scenes.filter((s) => s.status === "complete").length;
  const progressPercent = Math.round((completedScenes / totalScenes) * 100);

  // Formatting time
  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remaining = secs % 60;
    return `${mins}:${remaining.toString().padStart(2, "0")}`;
  };

  return (
    <div className="glass-panel p-6 sm:p-8 space-y-6 overflow-hidden rounded-xl border border-white/[0.04] relative">
      {/* Absolute decorative ambient glow */}
      <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-violet-500/10 blur-3xl" />
      <div className="absolute left-0 bottom-0 h-40 w-40 rounded-full bg-cyan-500/5 blur-3xl" />

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative z-10">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-violet-500/20 bg-violet-500/5 text-violet-300 text-xs font-semibold uppercase tracking-wider">
              {job.status === "completed" ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <Hourglass className="h-3.5 w-3.5 text-cyan-400 animate-spin" />
              )}
              {job.status === "completed" 
                ? "Stitching Finished" 
                : job.status === "error"
                ? "Production Terminated"
                : `Production Active (Rendering ${completedScenes}/${totalScenes})`
              }
            </div>

            {/* Quality Mode Badge */}
            <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-400 text-[10px] font-bold uppercase tracking-wider">
              <Clapperboard className="h-3 w-3" /> Veo 3.1 Video Generation
            </div>
          </div>
          <h2 className="font-heading text-2xl sm:text-3xl font-extrabold text-white tracking-tight pt-1">
            Rendering Masterpiece
          </h2>
          <p className="text-sm text-neutral-400 max-w-xl font-light">
            {job.status === "completed"
              ? "Your movie is fully stitched and compiled. Proceeding to screening room."
              : job.status === "error"
              ? "An error occurred during scene orchestration. Check logs below."
              : "Gemini is building your cinematic vision. Stand by as neural voices and visual Pan/Zooms are rendered."
            }
          </p>
        </div>

        {/* Counter Widget */}
        <div className="bg-black/30 border border-white/[0.05] py-3.5 px-5 rounded-xl text-center min-w-[120px] shadow-inner">
          <span className="text-[10px] font-bold tracking-widest text-neutral-500 uppercase block">
            Elapsed Time
          </span>
          <span className="text-2xl font-extrabold text-white font-mono block pt-0.5">
            {formatTime(seconds)}
          </span>
        </div>
      </div>

      {/* Progress Bar with Percent */}
      <div className="space-y-3.5 pt-2 relative z-10">
        <div className="flex items-center justify-between text-xs font-semibold tracking-wider uppercase text-neutral-400">
          <span>Overall Construction Progress</span>
          <span className="text-[#06b6d4] font-bold text-sm bg-[#06b6d4]/10 px-2.5 py-0.5 rounded-md border border-[#06b6d4]/20">
            {progressPercent}%
          </span>
        </div>
        <Progress value={progressPercent} className="h-2.5 bg-black/40 [&>div]:bg-gradient-to-r [&>div]:from-[#7c3aed] [&>div]:to-[#06b6d4] [&>div]:rounded-full rounded-full" />
      </div>
    </div>
  );
}
