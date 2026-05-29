"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { SceneCard } from "@/components/studio/scene-card";
import { TimelineView } from "@/components/studio/timeline-view";
import { AnimatedButton } from "@/components/ui/animated-button";
import {
  Film,
  Clapperboard,
  ChevronLeft,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  CheckCheck,
  PlayCircle,
  X,
  Clock,
  ListVideo,
} from "lucide-react";
import Link from "next/link";
import { Scene } from "@/lib/job-store";

export default function ScriptReviewPage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params?.jobId as string;

  const [scenes, setScenes] = useState<Scene[]>([]);
  const [approvedSet, setApprovedSet] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitStatus, setSubmitStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Prevent accidental navigation away from script review
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // If we are actively saving/launching production, definitely warn.
      // Even if idle, warn because they might lose their local edits.
      e.preventDefault();
      e.returnValue = "You have unsaved changes in your screenplay. Are you sure you want to discard them?";
      return e.returnValue;
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  // Fetch draft job script on mount
  useEffect(() => {
    async function fetchJob() {
      try {
        const response = await fetch(`/api/production-status/${jobId}`, {
          headers: { Accept: "application/json" },
        });
        if (!response.ok) {
          setError("Could not retrieve the generated screenplay draft. Please return to the homepage.");
          setLoading(false);
          return;
        }
        const data = await response.json();
        const sortedScenes = [...data.scenes].sort((a, b) => a.sceneNumber - b.sceneNumber);
        setScenes(sortedScenes);
      } catch (err: any) {
        console.error(err);
        setError("Could not retrieve the generated screenplay draft. Please return to the homepage.");
      } finally {
        setLoading(false);
      }
    }
    if (jobId) fetchJob();
  }, [jobId]);

  const handleSceneChange = (index: number, updatedScene: Scene) => {
    const updated = [...scenes];
    updated[index] = updatedScene;
    setScenes(updated);
  };

  const handleSceneApprove = (sceneNumber: number, approved: boolean) => {
    setApprovedSet((prev) => {
      const next = new Set(prev);
      if (approved) next.add(sceneNumber);
      else next.delete(sceneNumber);
      return next;
    });
  };

  const handleApproveAll = () => {
    setApprovedSet(new Set(scenes.map((s) => s.sceneNumber)));
  };

  const allApproved = scenes.length > 0 && approvedSet.size === scenes.length;
  const approvedCount = approvedSet.size;
  const totalScenes = scenes.length;
  const totalDuration = scenes.reduce((sum, s) => sum + s.estimatedDuration, 0);

  const handleStartProduction = useCallback(async () => {
    setShowConfirmModal(false);
    setSubmitStatus("loading");
    setError("");
    try {
      const response = await fetch("/api/start-production", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, scenes }),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to start production");
      }
      setSubmitStatus("success");
      setTimeout(() => router.push(`/studio/${jobId}/production`), 900);
    } catch (err: any) {
      console.error(err);
      setSubmitStatus("error");
      setError(err.message || "An unexpected error occurred while launching production.");
      setTimeout(() => setSubmitStatus("idle"), 4000);
    }
  }, [jobId, scenes, router]);

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[#030307] flex flex-col items-center justify-center space-y-4">
        <div className="relative h-12 w-12 rounded-xl bg-gradient-to-tr from-[#7c3aed] to-[#06b6d4] flex items-center justify-center animate-pulse">
          <Clapperboard className="h-6 w-6 text-white" />
        </div>
        <span className="text-neutral-400 text-sm font-semibold tracking-wider animate-pulse">
          Retrieving screenplay draft...
        </span>
      </div>
    );
  }

  // ── Error (no scenes) ─────────────────────────────────────────────────────
  if (error && scenes.length === 0) {
    return (
      <div className="min-h-screen bg-[#030307] flex flex-col items-center justify-center p-6 text-center space-y-6">
        <div className="h-16 w-16 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
          <AlertCircle className="h-8 w-8" />
        </div>
        <div className="max-w-md space-y-2">
          <h2 className="font-heading text-xl font-bold text-white">Draft Not Found</h2>
          <p className="text-sm text-neutral-400 leading-relaxed">{error}</p>
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

  // ── Main Review UI ────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#030307] text-[#ededf5] flex flex-col">

      {/* ── Confirmation Modal ── */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowConfirmModal(false)}
          />
          {/* Card */}
          <div className="relative z-10 w-full max-w-md rounded-2xl bg-[#0d0d14] border border-white/[0.08] shadow-2xl shadow-black/60 p-8 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-200">
            <button
              onClick={() => setShowConfirmModal(false)}
              className="absolute top-4 right-4 p-1 rounded-lg text-neutral-500 hover:text-white hover:bg-white/[0.08] transition-colors"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex flex-col items-center text-center space-y-3">
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-tr from-[#7c3aed] to-[#06b6d4] flex items-center justify-center shadow-xl">
                <PlayCircle className="h-7 w-7 text-white" />
              </div>
              <h2 className="font-heading text-xl font-bold text-white">
                Start Production?
              </h2>
              <p className="text-sm text-neutral-400 leading-relaxed">
                Your screenplay is approved and locked. The pipeline will generate{" "}
                <strong className="text-white">{totalScenes} scenes</strong> — this may
                take several minutes. You can watch progress in real time.
              </p>
            </div>

            {/* Summary */}
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4 grid grid-cols-3 gap-3 text-center">
              <div>
                <span className="block text-xl font-bold text-white font-heading">{totalScenes}</span>
                <span className="text-[10px] font-semibold tracking-wider text-neutral-500 uppercase">Scenes</span>
              </div>
              <div>
                <span className="block text-xl font-bold text-white font-heading">{totalDuration}s</span>
                <span className="text-[10px] font-semibold tracking-wider text-neutral-500 uppercase">Duration</span>
              </div>
              <div>
                <span className="block text-xl font-bold text-emerald-400 font-heading">{approvedCount}</span>
                <span className="text-[10px] font-semibold tracking-wider text-neutral-500 uppercase">Approved</span>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={handleStartProduction}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-[#7c3aed] to-[#06b6d4] text-white font-bold text-sm shadow-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
              >
                <PlayCircle className="h-4 w-4" />
                Roll Cameras — Start Production
              </button>
              <button
                onClick={() => setShowConfirmModal(false)}
                className="w-full py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-neutral-400 hover:text-white hover:bg-white/[0.08] text-sm font-semibold transition-all"
              >
                Back to Review
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Sticky Header ── */}
      <header className="sticky top-0 z-30 w-full bg-[#030307]/80 backdrop-blur-md border-b border-white/[0.03]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              onClick={(e) => {
                if (!window.confirm("You have unsaved changes in your screenplay. Are you sure you want to discard them and return to the homepage?")) {
                  e.preventDefault();
                }
              }}
              className="p-2 rounded-lg bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.08] text-neutral-400 hover:text-white transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </Link>
            <div>
              <span className="block text-[10px] font-bold tracking-widest text-[#06b6d4] uppercase">
                Phase 2: Director's Review
              </span>
              <h1 className="font-heading text-lg font-bold text-white tracking-wide">
                Screenplay Approval Board
              </h1>
            </div>
          </div>

          {/* Approval progress + action */}
          <div className="flex items-center gap-4">
            {/* Progress pill */}
            <div className="hidden sm:flex items-center gap-2 bg-white/[0.04] border border-white/[0.07] rounded-full px-4 py-1.5">
              <CheckCircle2
                className={`h-3.5 w-3.5 transition-colors ${allApproved ? "text-emerald-400" : "text-neutral-500"}`}
              />
              <span className="text-xs font-bold text-white">
                {approvedCount}
                <span className="text-neutral-500 font-normal">/{totalScenes}</span>
              </span>
              <span className="text-[10px] text-neutral-500 uppercase tracking-wide">Approved</span>
            </div>

            {/* Approve All shortcut */}
            {!allApproved && (
              <button
                onClick={handleApproveAll}
                className="hidden sm:flex items-center gap-1.5 text-xs font-bold text-emerald-300 bg-emerald-900/20 border border-emerald-700/30 hover:bg-emerald-800/30 px-3 py-1.5 rounded-lg transition-all"
              >
                <CheckCheck className="h-3.5 w-3.5" /> Approve All
              </button>
            )}

            {/* Start Production CTA */}
            <button
              disabled={!allApproved || submitStatus === "loading" || submitStatus === "success"}
              onClick={() => setShowConfirmModal(true)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-lg min-w-[180px] justify-center ${
                allApproved
                  ? "bg-gradient-to-r from-[#7c3aed] to-[#06b6d4] text-white hover:opacity-90 shadow-violet-900/30 cursor-pointer"
                  : "bg-white/[0.04] border border-white/[0.06] text-neutral-600 cursor-not-allowed"
              }`}
            >
              {submitStatus === "loading" ? (
                <>
                  <span className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Launching...
                </>
              ) : submitStatus === "success" ? (
                <>
                  <CheckCircle2 className="h-4 w-4" /> Rolling!
                </>
              ) : (
                <>
                  <PlayCircle className="h-4 w-4" />
                  {allApproved ? "Start Production" : `Approve All ${totalScenes} Scenes`}
                </>
              )}
            </button>
          </div>
        </div>

        {/* Approval progress bar */}
        <div className="h-0.5 bg-white/[0.04]">
          <div
            className="h-full bg-gradient-to-r from-[#7c3aed] to-emerald-500 transition-all duration-500"
            style={{ width: totalScenes > 0 ? `${(approvedCount / totalScenes) * 100}%` : "0%" }}
          />
        </div>
      </header>

      {/* ── Main content grid ── */}
      <main className="max-w-7xl w-full mx-auto px-6 py-8 flex-1 grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* Left: Scene cards */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between border-b border-white/[0.05] pb-4 flex-wrap gap-3">
            <div className="space-y-1">
              <h2 className="font-heading text-xl font-bold text-white flex items-center gap-2">
                <Film className="h-5 w-5 text-[#7c3aed]" /> Screenplay Scenes
              </h2>
              <p className="text-xs text-neutral-400">
                Edit any scene, then click{" "}
                <strong className="text-emerald-400">Approve Scene</strong> to lock it.
                Approve all scenes to unlock production.
              </p>
            </div>

            {/* Mobile approve all */}
            {!allApproved && (
              <button
                onClick={handleApproveAll}
                className="sm:hidden flex items-center gap-1.5 text-xs font-bold text-emerald-300 bg-emerald-900/20 border border-emerald-700/30 px-3 py-1.5 rounded-lg"
              >
                <CheckCheck className="h-3.5 w-3.5" /> Approve All
              </button>
            )}
          </div>

          {error && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-6">
            {scenes.map((scene, index) => (
              <div key={scene.sceneNumber} id={`scene-card-${scene.sceneNumber}`}>
                <SceneCard
                  scene={scene}
                  approved={approvedSet.has(scene.sceneNumber)}
                  onChange={(updated) => handleSceneChange(index, updated)}
                  onApprove={(approved) => handleSceneApprove(scene.sceneNumber, approved)}
                />
              </div>
            ))}
          </div>

          {/* Bottom CTA when all approved */}
          {allApproved && (
            <div className="rounded-2xl bg-gradient-to-r from-emerald-950/40 to-teal-950/40 border border-emerald-700/30 p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                  <CheckCheck className="h-5 w-5 text-emerald-400" />
                </div>
                <div>
                  <p className="font-bold text-emerald-300 text-sm">All scenes approved!</p>
                  <p className="text-xs text-neutral-500">
                    {totalScenes} scenes · {totalDuration}s total runtime
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowConfirmModal(true)}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-[#7c3aed] to-[#06b6d4] text-white font-bold text-sm shadow-lg hover:opacity-90 transition-opacity"
              >
                <PlayCircle className="h-4 w-4" /> Start Production
              </button>
            </div>
          )}
        </div>

        {/* Right: Sticky sidebar */}
        <div className="lg:col-span-1 space-y-6">
          <div className="sticky top-24 space-y-6">
            {/* Approval scorecard */}
            <div className="rounded-2xl bg-white/[0.02] border border-white/[0.06] p-5 space-y-4">
              <h3 className="text-xs font-bold tracking-widest text-neutral-400 uppercase flex items-center gap-2">
                <ListVideo className="h-3.5 w-3.5" /> Approval Status
              </h3>

              {/* Mini scene chips */}
              <div className="flex flex-wrap gap-2">
                {scenes.map((s) => (
                  <a
                    key={s.sceneNumber}
                    href={`#scene-card-${s.sceneNumber}`}
                    className={`h-7 w-7 rounded-md text-[11px] font-bold flex items-center justify-center transition-all ${
                      approvedSet.has(s.sceneNumber)
                        ? "bg-emerald-500/20 border border-emerald-500/40 text-emerald-300"
                        : "bg-white/[0.03] border border-white/[0.07] text-neutral-500 hover:border-violet-500/40 hover:text-white"
                    }`}
                  >
                    {s.sceneNumber}
                  </a>
                ))}
              </div>

              {/* Progress ring summary */}
              <div className="rounded-xl bg-black/20 border border-white/[0.05] p-4 grid grid-cols-3 gap-3 text-center">
                <div>
                  <span className="block text-2xl font-bold font-heading text-white">{approvedCount}</span>
                  <span className="text-[10px] text-neutral-500 uppercase tracking-wide">Approved</span>
                </div>
                <div>
                  <span className="block text-2xl font-bold font-heading text-neutral-400">{totalScenes - approvedCount}</span>
                  <span className="text-[10px] text-neutral-500 uppercase tracking-wide">Pending</span>
                </div>
                <div>
                  <span className="block text-2xl font-bold font-heading text-[#06b6d4]">{totalDuration}s</span>
                  <span className="text-[10px] text-neutral-500 uppercase tracking-wide">Runtime</span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-neutral-500">
                  <span>Progress</span>
                  <span>{totalScenes > 0 ? Math.round((approvedCount / totalScenes) * 100) : 0}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-500 to-emerald-500 transition-all duration-500"
                    style={{ width: totalScenes > 0 ? `${(approvedCount / totalScenes) * 100}%` : "0%" }}
                  />
                </div>
              </div>

              {!allApproved && (
                <button
                  onClick={handleApproveAll}
                  className="w-full py-2 rounded-lg bg-emerald-700/20 border border-emerald-700/30 text-emerald-300 text-xs font-bold hover:bg-emerald-700/30 transition-all flex items-center justify-center gap-1.5"
                >
                  <CheckCheck className="h-3.5 w-3.5" /> Approve All Scenes
                </button>
              )}

              {allApproved && (
                <button
                  onClick={() => setShowConfirmModal(true)}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#7c3aed] to-[#06b6d4] text-white text-sm font-bold hover:opacity-90 transition-opacity flex items-center justify-center gap-2 shadow-lg"
                >
                  <PlayCircle className="h-4 w-4" /> Start Production
                </button>
              )}
            </div>

            {/* Timeline */}
            <TimelineView scenes={scenes} />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full bg-[#030307] border-t border-white/[0.03] py-5 px-6 text-center text-xs text-neutral-500 flex flex-col sm:flex-row items-center justify-between gap-4 max-w-7xl mx-auto">
        <span className="flex items-center gap-1.5 justify-center sm:justify-start">
          <Sparkles className="h-3.5 w-3.5 text-amber-500" /> Powered by Gemini 2.5 Flash &amp; Veo 3
        </span>
        <span className="flex items-center gap-1.5 text-neutral-600">
          <Clock className="h-3 w-3" /> Estimated runtime: {totalDuration}s across {totalScenes} scenes
        </span>
      </footer>
    </div>
  );
}
