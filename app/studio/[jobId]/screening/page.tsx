"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  Clapperboard,
  Sparkles,
  Download,
  Play,
  RefreshCw,
  ChevronLeft,
  Film,
  Info
} from "lucide-react";
import Link from "next/link";
import { Job } from "@/lib/job-store";
import { Card } from "@/components/ui/card";

export default function ScreeningPage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params?.jobId as string;

  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Fetch job details on mount
  useEffect(() => {
    async function fetchJob() {
      try {
        const response = await fetch(`/api/production-status/${jobId}`, {
          headers: {
            "Accept": "application/json",
          },
        });
        if (!response.ok) {
          setError("Could not retrieve your completed movie. Please verify the URL.");
          setLoading(false);
          return;
        }
        const data = await response.json();

        if (data.status !== "completed") {
          // If not completed yet, push them back to script review board
          router.push(`/studio/${jobId}/script`);
          return;
        }

        setJob(data);
      } catch (err: any) {
        console.error(err);
        setError("Could not retrieve your completed movie. Please verify the URL.");
      } finally {
        setLoading(false);
      }
    }

    if (jobId) {
      fetchJob();
    }
  }, [jobId, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#030307] flex flex-col items-center justify-center space-y-4">
        <div className="relative h-12 w-12 rounded-xl bg-gradient-to-tr from-[#7c3aed] to-[#06b6d4] flex items-center justify-center animate-pulse">
          <Clapperboard className="h-6 w-6 text-white" />
        </div>
        <span className="text-neutral-400 text-sm font-semibold tracking-wider animate-pulse">
          Opening screening room double doors...
        </span>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="min-h-screen bg-[#030307] flex flex-col items-center justify-center p-6 text-center space-y-6">
        <div className="h-16 w-16 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
          <Info className="h-8 w-8" />
        </div>
        <div className="max-w-md space-y-2">
          <h2 className="font-heading text-xl font-bold text-white">Movie Unavailable</h2>
          <p className="text-sm text-neutral-400 leading-relaxed">{error || "No completed movie job found."}</p>
        </div>
        <Link
          href="/"
          className="px-6 py-3 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white text-sm font-semibold hover:bg-white/[0.08] transition-colors"
        >
          Return to Studio Entrance
        </Link>
      </div>
    );
  }

  const totalDuration = job.scenes.reduce((sum, s) => sum + s.estimatedDuration, 0);

  return (
    <div className="min-h-screen bg-[#030307] text-[#ededf5] flex flex-col justify-between overflow-x-hidden relative">
      {/* Decorative Shifting Light behind player */}
      <div className="absolute top-[20%] left-1/2 translate-x-[-50%] h-[300px] w-[600px] rounded-full bg-violet-600/10 blur-[100px] pointer-events-none" />

      {/* Header */}
      <header className="sticky top-0 z-30 w-full bg-[#030307]/85 backdrop-blur-md border-b border-white/[0.03] relative">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href={`/studio/${jobId}/script`}
              className="p-2 rounded-lg bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.08] text-neutral-400 hover:text-white transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </Link>
            <div>
              <span className="block text-[10px] font-bold tracking-widest text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full w-fit px-2.5 py-0.5 uppercase">
                Phase 4: Screening Room
              </span>
              <h1 className="font-heading text-lg font-bold text-white tracking-wide mt-1">
                Aethera Cinema Box
              </h1>
            </div>
          </div>

          <span className="text-xs font-semibold tracking-wider text-neutral-400 bg-white/[0.02] border border-white/[0.05] px-3.5 py-1.5 rounded-xl">
            Job ID: <span className="font-mono text-neutral-300">{jobId.substring(0, 8)}</span>
          </span>
        </div>
      </header>

      {/* Main Screening Content */}
      <main className="max-w-4xl w-full mx-auto px-6 py-10 flex-1 flex flex-col justify-center space-y-8 relative z-10">

        {/* HTML5 Cinema Video Player */}
        <div className="relative group rounded-2xl overflow-hidden shadow-2xl border border-white/[0.06] bg-black/80 aspect-video">
          <video
            src={`/api/download/${jobId}?inline=true`}
            controls
            autoPlay
            className="w-full h-full object-contain"
          />
        </div>

        {/* Action Panel */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white/[0.02] border border-white/[0.04] p-5 rounded-2xl">
          <div className="space-y-1 text-center sm:text-left">
            <h3 className="font-heading font-bold text-white tracking-wide">
              Your masterpiece is ready.
            </h3>
            <p className="text-xs text-neutral-400 font-light">
              Export in widescreen 1080p HD, complete with burned-in cinematic subtitles and edge neural narration.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
            <a
              href={`/api/download/${jobId}`}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 font-semibold tracking-wide py-3 px-6 rounded-xl bg-gradient-to-r from-[#7c3aed] to-[#4c1d95] hover:from-[#8b5cf6] hover:to-[#5b21b6] border border-white/10 text-white text-sm shadow-md transition-all duration-300 cursor-pointer"
            >
              <Download className="h-4 w-4" /> Download Movie
            </a>

            <Link
              href="/"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 font-semibold tracking-wide py-3 px-6 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.08] text-white text-sm shadow-md transition-all duration-300 cursor-pointer"
            >
              <RefreshCw className="h-4 w-4" /> Produce Another
            </Link>
          </div>
        </div>

        {/* Metadata Details Card */}
        <Card className="glass-panel p-6 space-y-6">
          <div className="flex items-center gap-2 border-b border-white/[0.05] pb-3">
            <Info className="h-4 w-4 text-[#06b6d4]" />
            <h4 className="font-heading font-bold text-white text-sm tracking-wide">
              Movie Spec Sheet
            </h4>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="space-y-1">
              <span className="block text-[10px] font-bold tracking-wider text-neutral-500 uppercase">
                Original Prompt
              </span>
              <p className="text-xs text-neutral-300 leading-relaxed font-light italic">
                "{job.prompt}"
              </p>
            </div>

            <div className="space-y-1">
              <span className="block text-[10px] font-bold tracking-wider text-neutral-500 uppercase">
                Length & Scenes
              </span>
              <p className="text-xs text-neutral-300 leading-relaxed font-light">
                {job.sceneCount} Scenes / ~{totalDuration} seconds runtime
              </p>
            </div>

            <div className="space-y-1">
              <span className="block text-[10px] font-bold tracking-wider text-neutral-500 uppercase">
                Synthesizer
              </span>
              <p className="text-xs text-neutral-300 leading-relaxed font-light">
                Narrator Voice: Guy (Neural)<br />
                Audio Format: 48kHz Stereo AAC
              </p>
            </div>
          </div>
        </Card>
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-white/[0.03] py-8 text-center text-xs text-neutral-500 relative z-10 max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between px-6 gap-4">
        <span>© {new Date().getFullYear()} Aethera Studio. All rights synthesized.</span>
        <div className="flex items-center gap-4">
          <span className="hover:text-neutral-400 transition-colors">Screening Licence</span>
          <span className="hover:text-neutral-400 transition-colors">Director Log</span>
        </div>
      </footer>
    </div>
  );
}
