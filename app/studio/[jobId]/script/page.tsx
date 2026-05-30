"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { SceneCard, performSafetyCheck } from "@/components/studio/scene-card";
import { TimelineView } from "@/components/studio/timeline-view";
import { Label } from "@/components/ui/label";
import {
  Film,
  Clapperboard,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  CheckCheck,
  PlayCircle,
  X,
  Clock,
  ListVideo,
  Wand2,
  ListRestart,
  Loader2,
  Video,
  FileVideo,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { Job, SceneJob } from "@/lib/job-store";

export default function ScriptReviewPage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params?.jobId as string;

  const [job, setJob] = useState<Job | null>(null);
  const [scenes, setScenes] = useState<SceneJob[]>([]);
  const [approvedSet, setApprovedSet] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  // Script Refinement states
  const [refinementPrompt, setRefinementPrompt] = useState("");
  const [refinementStatus, setRefinementStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [refinementError, setRefinementError] = useState("");
  const [showGlobalRefine, setShowGlobalRefine] = useState(false);

  // New scene additions states
  const [isAddingScene, setIsAddingScene] = useState(false);
  const [showAiAddInput, setShowAiAddInput] = useState(false);
  const [aiAddPrompt, setAiAddPrompt] = useState("");



  // Stitch & Merge state
  const [isMerging, setIsMerging] = useState(false);
  const [sidebarMinimized, setSidebarMinimized] = useState(false);
  const prevStatusRef = useRef<string | null>(null);
  const scenesRef = useRef<SceneJob[]>([]);
  const isMergingRef = useRef<boolean>(false);
  const loadingRef = useRef<boolean>(true);

  useEffect(() => {
    scenesRef.current = scenes;
  }, [scenes]);

  useEffect(() => {
    isMergingRef.current = isMerging;
  }, [isMerging]);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  // Connect to SSE stream on mount to keep scenes and statuses in sync
  useEffect(() => {
    let eventSource: EventSource | null = null;

    if (jobId) {
      console.log(`SSE: Connecting to progress stream for script page ${jobId}`);
      eventSource = new EventSource(`/api/production-status/${jobId}`);

      eventSource.onmessage = (event) => {
        try {
          const updatedJob: Job = JSON.parse(event.data);
          setJob(updatedJob);
          
          const sortedScenes = [...updatedJob.scenes].sort((a, b) => a.sceneNumber - b.sceneNumber);
          setScenes(sortedScenes);
          
          // Re-populate approved set if they were already approved (e.g. if page is refreshed)
          // Since scene-card uses local set for locks, we want to align it with completed statuses
          setApprovedSet(prev => {
            const next = new Set(prev);
            sortedScenes.forEach(s => {
              if (s.approved || s.status === "complete") {
                next.add(s.sceneNumber);
              } else {
                next.delete(s.sceneNumber);
              }
            });
            return next;
          });

          // Redirect to screening room automatically on completion ONLY if it transitioned from merging
          if (updatedJob.status === "completed" && prevStatusRef.current === "merging") {
            console.log(`SSE: Job ${jobId} merged successfully! Redirecting to screening room.`);
            eventSource?.close();
            router.push(`/studio/${jobId}/screening`);
          }

          if (updatedJob.status === "merging") {
            setIsMerging(true);
          } else if (updatedJob.status === "completed" || updatedJob.status === "error") {
            setIsMerging(false);
          }

          // Track the status transition
          prevStatusRef.current = updatedJob.status;

          if (updatedJob.status === "error" && updatedJob.error && !updatedJob.error.toLowerCase().includes("video")) {
            setError(updatedJob.error);
          }

          setLoading(false);
        } catch (err) {
          console.error("SSE parsing error:", err);
        }
      };

      eventSource.onopen = () => {
        console.log("SSE: Connection established");
        setError(""); // Clear any disconnection error
      };

      eventSource.onerror = (err) => {
        const hasActiveScenes = scenesRef.current.some((s) =>
          ["queued", "generating_image", "generating_audio", "assembling_clip"].includes(s.status)
        );
        const active = loadingRef.current || isMergingRef.current || hasActiveScenes;

        if (active) {
          console.error("SSE stream error:", err);
          setError("Disconnected from live production feed. Retrying connection...");
        } else {
          console.debug("SSE stream connection closed/retrying silently in idle state");
        }
      };
    }

    return () => {
      if (eventSource) {
        console.log("SSE: Closing connection on unmount");
        eventSource.close();
      }
    };
  }, [jobId, router]);

  // Prevent accidental navigation warning
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (scenes.some(s => s.status !== "complete")) {
        e.preventDefault();
        e.returnValue = "You have unsaved changes in your screenplay. Are you sure you want to discard them?";
        return e.returnValue;
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [scenes]);

  const handleSceneChange = (index: number, updatedScene: SceneJob) => {
    const updated = [...scenes];
    updated[index] = updatedScene;
    setScenes(updated);
  };

  const handleSceneApprove = async (sceneNumber: number, approved: boolean) => {
    setApprovedSet((prev) => {
      const next = new Set(prev);
      if (approved) next.add(sceneNumber);
      else next.delete(sceneNumber);
      return next;
    });

    const scene = scenes.find(s => s.sceneNumber === sceneNumber);
    if (scene) {
      try {
        await fetch("/api/update-scene", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobId,
            sceneNumber,
            visualPrompt: scene.visualPrompt,
            dialogueOrNarration: scene.dialogueOrNarration,
            estimatedDuration: scene.estimatedDuration,
            approved,
          }),
        });
      } catch (err) {
        console.error("Failed to auto-save scene status on approve/unlock:", err);
      }
    }
  };

  const handleApproveAll = async () => {
    const allNums = scenes.map((s) => s.sceneNumber);
    setApprovedSet(new Set(allNums));

    try {
      await Promise.all(
        scenes.map((scene) =>
          fetch("/api/update-scene", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jobId,
              sceneNumber: scene.sceneNumber,
              visualPrompt: scene.visualPrompt,
              dialogueOrNarration: scene.dialogueOrNarration,
              estimatedDuration: scene.estimatedDuration,
              approved: true,
            }),
          })
        )
      );
    } catch (err) {
      console.error("Failed to auto-save all scenes on approve all:", err);
    }
  };

  const allApproved = scenes.length > 0 && approvedSet.size === scenes.length;
  const approvedCount = approvedSet.size;
  const totalScenes = scenes.length;
  const totalDuration = scenes.reduce((sum, s) => sum + s.estimatedDuration, 0);

  // Count generated video clips
  const completedVideosCount = scenes.filter(s => s.status === "complete").length;
  const allVideosGenerated = totalScenes > 0 && completedVideosCount === totalScenes;

  // Single-Scene Video Generation Trigger
  const handleGenerateSceneVideo = async (scene: SceneJob) => {
    // Immediately set local status to queued so the loader appears instantly
    setScenes((prevScenes) =>
      prevScenes.map((s) =>
        s.sceneNumber === scene.sceneNumber ? { ...s, status: "queued", error: undefined } : s
      )
    );

    try {
      const response = await fetch("/api/generate-scene-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          sceneNumber: scene.sceneNumber,
          visualPrompt: scene.visualPrompt,
          dialogueOrNarration: scene.dialogueOrNarration,
          estimatedDuration: scene.estimatedDuration,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        // Revert to idle on failure
        setScenes((prevScenes) =>
          prevScenes.map((s) =>
            s.sceneNumber === scene.sceneNumber ? { ...s, status: "idle", error: errData.error } : s
          )
        );
        alert(errData.error || `Failed to initiate Scene ${scene.sceneNumber} rendering.`);
      }
    } catch (err: any) {
      console.error(err);
      // Revert to idle on failure
      setScenes((prevScenes) =>
        prevScenes.map((s) =>
          s.sceneNumber === scene.sceneNumber ? { ...s, status: "idle", error: err.message } : s
        )
      );
      alert(`Network error while rendering Scene ${scene.sceneNumber}.`);
    }
  };

  // Single-Scene AI Rewrite Trigger
  const handleRegenerateSceneWithAI = async (sceneNumber: number, prompt: string) => {
    try {
      const response = await fetch("/api/regenerate-scene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          sceneNumber,
          prompt,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || `Failed to rewrite Scene ${sceneNumber} with AI.`);
      }

      // Update the scenes state with the newly rewritten scene from response
      setScenes((prevScenes) =>
        prevScenes.map((s) => (s.sceneNumber === sceneNumber ? data.scene : s))
      );

      // Force the lock state to unapproved so the user reviews the new generation
      setApprovedSet((prev) => {
        const next = new Set(prev);
        next.delete(sceneNumber);
        return next;
      });

    } catch (err: any) {
      console.error(err);
      alert(err.message || "An unexpected error occurred during AI rewrite.");
      throw err;
    }
  };

  const refinementSafety = performSafetyCheck(refinementPrompt);

  // Screenplay Refinement Trigger
  const handleRegenerateScript = async (isFresh = false) => {
    if (!isFresh && !refinementSafety.safe) {
      const confirmProceed = window.confirm(
        "Warning: Your refinement prompt contains terms that may trigger Google safety filters. We recommend clicking 'Auto-Rephrase' first. Do you want to apply this instruction anyway?"
      );
      if (!confirmProceed) return;
    }
    setRefinementStatus("loading");
    setRefinementError("");
    try {
      const response = await fetch("/api/regenerate-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          prompt: isFresh ? "" : refinementPrompt,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to regenerate screenplay.");
      }

      setRefinementStatus("success");
      setRefinementPrompt("");
      setApprovedSet(new Set()); // Reset locks
      setTimeout(() => setRefinementStatus("idle"), 2000);
    } catch (err: any) {
      console.error(err);
      setRefinementStatus("error");
      setRefinementError(err.message || "An unexpected error occurred while regenerating the screenplay.");
      setTimeout(() => setRefinementStatus("idle"), 4000);
    }
  };



  // Stitch & Merge Video clips Trigger
  const handleMergeVideo = async () => {
    setIsMerging(true);
    setError("");
    try {
      const response = await fetch("/api/merge-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.error || "Failed to start merging video clips.");
        setIsMerging(false);
      }
    } catch (err) {
      setError("Network error while trying to merge videos.");
      setIsMerging(false);
    }
  };

  const aiAddPromptSafety = performSafetyCheck(aiAddPrompt);

  const handleDeleteScene = async (sceneNumber: number) => {
    try {
      const response = await fetch("/api/delete-scene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, sceneNumber }),
      });

      if (!response.ok) {
        const data = await response.json();
        alert(data.error || "Failed to delete scene.");
        return;
      }

      // Fetch fresh job state to update the UI instantly
      const updatedJobRes = await fetch(`/api/production-status/${jobId}`);
      if (updatedJobRes.ok) {
        const updatedJob = await updatedJobRes.json();
        setJob(updatedJob);
        const sortedScenes = [...updatedJob.scenes].sort((a, b) => a.sceneNumber - b.sceneNumber);
        setScenes(sortedScenes);
        setApprovedSet(prev => {
          const next = new Set<number>();
          sortedScenes.forEach(s => {
            if (s.approved || s.status === "complete") {
              next.add(s.sceneNumber);
            }
          });
          return next;
        });
      }
    } catch (err) {
      console.error("Error deleting scene:", err);
      alert("An error occurred while deleting the scene.");
    }
  };

  const handleAddScene = async (mode: "blank" | "ai") => {
    if (mode === "ai" && !aiAddPrompt.trim()) return;

    if (mode === "ai" && !aiAddPromptSafety.safe) {
      const confirmProceed = window.confirm(
        "Warning: Your AI prompt contains keywords that may violate safety policies. We recommend rephrasing first. Do you want to proceed anyway?"
      );
      if (!confirmProceed) return;
    }

    setIsAddingScene(true);
    try {
      const response = await fetch("/api/add-scene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          mode,
          prompt: mode === "ai" ? aiAddPrompt.trim() : undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        alert(data.error || "Failed to add scene.");
        return;
      }

      setAiAddPrompt("");
      setShowAiAddInput(false);

      // Fetch fresh job state to update the UI instantly
      const updatedJobRes = await fetch(`/api/production-status/${jobId}`);
      if (updatedJobRes.ok) {
        const updatedJob = await updatedJobRes.json();
        setJob(updatedJob);
        const sortedScenes = [...updatedJob.scenes].sort((a, b) => a.sceneNumber - b.sceneNumber);
        setScenes(sortedScenes);
        setApprovedSet(prev => {
          const next = new Set<number>();
          sortedScenes.forEach(s => {
            if (s.approved || s.status === "complete") {
              next.add(s.sceneNumber);
            }
          });
          return next;
        });
      }
    } catch (err) {
      console.error("Error adding scene:", err);
      alert("An error occurred while adding the scene.");
    } finally {
      setIsAddingScene(false);
    }
  };

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading && scenes.length === 0) {
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

      {/* ── Sticky Header ── */}
      <header className="sticky top-0 z-30 w-full bg-[#030307]/80 backdrop-blur-md border-b border-white/[0.03]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              onClick={(e) => {
                if (scenes.some(s => s.status !== "complete")) {
                  if (!window.confirm("You have unsaved changes in your screenplay. Are you sure you want to discard them and return to the homepage?")) {
                    e.preventDefault();
                  }
                }
              }}
              className="p-2 rounded-lg bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.08] text-neutral-400 hover:text-white transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </Link>
            <div>
              <span className="block text-[10px] font-bold tracking-widest text-[#06b6d4] uppercase">
                Director's Creative Desk
              </span>
              <h1 className="font-heading text-lg font-bold text-white tracking-wide">
                Screenplay &amp; Scene Production Board
              </h1>
            </div>
          </div>

          {/* Header Action progress */}
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


            {/* Stitch & Merge CTA */}
            <button
              disabled={!allVideosGenerated || isMerging}
              onClick={handleMergeVideo}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-lg min-w-[180px] justify-center ${
                allVideosGenerated && !isMerging
                  ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:opacity-90 shadow-emerald-950/20 cursor-pointer"
                  : "bg-white/[0.04] border border-white/[0.06] text-neutral-600 cursor-not-allowed"
              }`}
            >
              {isMerging ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Stitching Movie...
                </>
              ) : (
                <>
                  <Film className="h-4 w-4" />
                  Stitch &amp; Merge Movie
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

        {isMerging && (
          <div className="col-span-full p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-sm flex items-center gap-3 shadow-lg shadow-indigo-950/20 animate-pulse">
            <Loader2 className="h-4 w-4 animate-spin text-indigo-400 shrink-0" />
            <span className="font-semibold">
              🎥 Movie Compiler: Stitching all scene clips into your final movie. Please do not close this browser tab or edit scenes...
            </span>
          </div>
        )}

        {/* Left Column: Screenplay Scenes Editor */}
        <div className={`space-y-6 ${sidebarMinimized ? "lg:col-span-3" : "lg:col-span-2"}`}>
          <div className="flex items-center justify-between border-b border-white/[0.05] pb-4 flex-wrap gap-3">
            <div className="space-y-1">
              <h2 className="font-heading text-xl font-bold text-white flex items-center gap-2">
                <Film className="h-5 w-5 text-[#7c3aed]" /> Screenplay screenplay draft
              </h2>
              <p className="text-xs text-neutral-400">
                Refine prompts, generate videos scene-by-scene, and lock them by clicking{" "}
                <strong className="text-emerald-400">Approve Scene</strong>.
              </p>
            </div>

            {!allApproved && (
              <button
                onClick={handleApproveAll}
                className="flex items-center gap-1.5 text-xs font-bold text-emerald-300 bg-emerald-900/20 border border-emerald-700/30 px-3 py-1.5 rounded-lg transition-all hover:bg-emerald-800/30"
              >
                <CheckCheck className="h-3.5 w-3.5" /> Approve All
              </button>
            )}
          </div>

          {error && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm flex items-center gap-2 shadow-md">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-6">
            {scenes.map((scene, index) => {
              const isPrevComplete = index === 0 || scenes[index - 1].status === "complete";
              return (
                <div key={scene.sceneNumber} id={`scene-card-${scene.sceneNumber}`}>
                  <SceneCard
                    scene={scene}
                    approved={approvedSet.has(scene.sceneNumber)}
                    onChange={(updated) => handleSceneChange(index, updated)}
                    onApprove={(approved) => handleSceneApprove(scene.sceneNumber, approved)}
                    onGenerateVideo={() => handleGenerateSceneVideo(scene)}
                    onRegenerateSceneWithAI={handleRegenerateSceneWithAI}
                    onDeleteScene={handleDeleteScene}
                    jobId={jobId}
                    isPrevComplete={isPrevComplete}
                    isMerging={isMerging}
                  />
                </div>
              );
            })}
          </div>

          {/* Add/Generate Scenes Panel */}
          {!isMerging && (
            <div className="rounded-2xl border border-dashed border-white/[0.08] bg-[#0d0d14]/40 p-6 space-y-4 shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-[#06b6d4]" /> Expand Screenplay
                  </h4>
                  <p className="text-xs text-neutral-500 mt-1">
                    Add new scenes to your film. You can draft them manually or let Gemini generate them.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleAddScene("blank")}
                    disabled={isAddingScene}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.06] text-neutral-300 hover:text-white text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Blank Scene
                  </button>
                  <button
                    onClick={() => setShowAiAddInput(!showAiAddInput)}
                    disabled={isAddingScene}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all disabled:opacity-50 cursor-pointer shadow-md shadow-indigo-950/20"
                  >
                    <Wand2 className="h-3.5 w-3.5" /> Generate Scene with AI
                  </button>
                </div>
              </div>

              {showAiAddInput && (
                <div className="p-4 rounded-xl bg-black/35 border border-white/[0.05] space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                  <Label className="text-[10px] font-bold tracking-wider text-neutral-400 uppercase flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-[#06b6d4]" /> AI Scene Prompt Director
                  </Label>
                  <textarea
                    value={aiAddPrompt}
                    onChange={(e) => setAiAddPrompt(e.target.value)}
                    placeholder="Describe what happens in this scene... (e.g. 'Show Liam and Elara sharing a cup of coffee under a warm sunset, smiling as they flip pages together.')"
                    disabled={isAddingScene}
                    className={`w-full bg-black/40 border text-white rounded-lg text-xs placeholder:text-neutral-600 resize-none min-h-[80px] focus:ring-0 p-3 transition-all ${
                      !aiAddPromptSafety.safe
                        ? "border-amber-500/40 focus:border-amber-500"
                        : "border-white/[0.05] focus:border-[#06b6d4]/50"
                    }`}
                  />

                  {aiAddPrompt.trim() && (
                    <div className="mt-1">
                      {aiAddPromptSafety.safe ? (
                        <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 bg-emerald-500/5 border border-emerald-500/10 p-2 rounded-lg">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                          <span>Google Safety Scan: Compliant</span>
                        </div>
                      ) : (
                        <div className="p-2.5 rounded-lg border border-amber-500/20 bg-amber-500/5 flex flex-col gap-2 text-[10px] text-amber-200">
                          <div className="flex items-start gap-1.5">
                            <AlertCircle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                            <div>
                              <span className="font-bold block text-amber-300">Policy Violation Warning</span>
                              <span>
                                Disallowed terms: <strong className="text-amber-300">{Array.from(new Set(aiAddPromptSafety.violations.flatMap(v => v.words))).join(", ")}</strong>
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setAiAddPrompt(aiAddPromptSafety.autoFixedText)}
                            className="px-2 py-1 rounded bg-gradient-to-r from-amber-500 to-amber-600 text-black font-extrabold text-[9px] transition-all self-end cursor-pointer"
                          >
                            ✨ Auto-Rephrase prompt
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex justify-end gap-3.5">
                    <button
                      type="button"
                      onClick={() => {
                        setShowAiAddInput(false);
                        setAiAddPrompt("");
                      }}
                      className="px-4 py-2 rounded-lg border border-white/[0.06] hover:bg-white/[0.03] text-neutral-400 text-xs font-semibold cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddScene("ai")}
                      disabled={isAddingScene || !aiAddPrompt.trim()}
                      className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-white/[0.02] disabled:text-neutral-600 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-md"
                    >
                      {isAddingScene ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-3.5 w-3.5" />
                          Generate Scene
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Bottom CTA when all approved */}
          {allApproved && (
            <div className="rounded-2xl bg-gradient-to-r from-emerald-950/40 to-teal-950/40 border border-emerald-700/30 p-6 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-lg shadow-emerald-950/10">
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
              
              {allVideosGenerated ? (
                <button
                  onClick={handleMergeVideo}
                  disabled={isMerging}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold text-sm shadow-lg hover:opacity-90 transition-opacity cursor-pointer"
                >
                  {isMerging ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Merging Movie...
                    </>
                  ) : (
                    <>
                      <Film className="h-4 w-4" /> Stitch &amp; Merge Movie
                    </>
                  )}
                </button>
              ) : (
                <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-xs font-semibold text-neutral-400">
                  <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
                  Generating clips: {completedVideosCount} / {totalScenes} completed
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column: Sticky controls sidebar */}
        <div className={`lg:col-span-1 space-y-6 ${sidebarMinimized ? "hidden" : "block"}`}>
          <div className="sticky top-24 space-y-6">
            {/* Sidebar Control Header */}
            <div className="flex items-center justify-between bg-white/[0.01] border border-white/[0.05] rounded-xl px-4 py-2.5 shadow-sm">
              <span className="text-[10px] font-bold tracking-widest text-[#06b6d4] uppercase flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[#06b6d4] animate-pulse" />
                Production Desk
              </span>
              <button
                onClick={() => setSidebarMinimized(true)}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-rose-400 hover:bg-white/[0.05] transition-all cursor-pointer flex items-center justify-center"
                title="Collapse Sidebar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            
            {/* Screenplay Refinement Desk (Collapsible Accordion) */}
            <div className="rounded-2xl bg-white/[0.02] border border-white/[0.06] shadow-xl overflow-hidden transition-all duration-300">
              <button
                type="button"
                onClick={() => setShowGlobalRefine(!showGlobalRefine)}
                className="w-full flex items-center justify-between p-5 hover:bg-white/[0.02] transition-colors text-left cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Wand2 className="h-4 w-4 text-[#06b6d4]" />
                  <h3 className="text-xs font-bold tracking-widest text-[#06b6d4] uppercase">
                    Global Refiner &amp; Re-write
                  </h3>
                </div>
                {showGlobalRefine ? (
                  <ChevronUp className="h-4 w-4 text-neutral-400" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-neutral-400" />
                )}
              </button>
              
              {showGlobalRefine && (
                <div className="p-5 pt-0 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="space-y-1">
                    <p className="text-xs text-neutral-400 leading-normal">
                      Instruct Gemini to modify this screenplay draft based on your feedback (e.g. setting, dialogue adjustments, character shifts).
                    </p>
                  </div>

                  {refinementError && (
                    <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-[11px] leading-relaxed">
                      {refinementError}
                    </div>
                  )}

                  {refinementStatus === "success" && (
                    <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[11px]">
                      Screenplay rewritten successfully! Updating editor...
                    </div>
                  )}

                  <div className="space-y-3">
                    <textarea
                      value={refinementPrompt}
                      onChange={(e) => setRefinementPrompt(e.target.value)}
                      placeholder="Describe your desired changes... (e.g., 'Make it set on a rainy cyberpunk space station and add a dramatic tone')"
                      disabled={refinementStatus === "loading"}
                      className={`w-full bg-black/30 border text-white rounded-lg text-xs placeholder:text-neutral-600 resize-none min-h-[90px] focus:ring-0 p-3 transition-all ${
                        !refinementSafety.safe
                          ? "border-amber-500/40 focus:border-amber-500"
                          : "border-white/[0.05] focus:border-[#06b6d4]/50"
                      }`}
                    />

                    {refinementPrompt.trim() && (
                      <div className="mt-1">
                        {refinementSafety.safe ? (
                          <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 bg-emerald-500/5 border border-emerald-500/10 p-2 rounded-lg">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                            <span>Google Safety Scan: Compliant</span>
                          </div>
                        ) : (
                          <div className="p-2.5 rounded-lg border border-amber-500/20 bg-amber-500/5 flex flex-col gap-2 text-[10px] text-amber-200">
                            <div className="flex items-start gap-1.5">
                              <AlertCircle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                              <div>
                                <span className="font-bold block text-amber-300">Policy Violation Warning</span>
                                <span>
                                  Disallowed terms: <strong className="text-amber-300">{Array.from(new Set(refinementSafety.violations.flatMap(v => v.words))).join(", ")}</strong>
                                </span>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setRefinementPrompt(refinementSafety.autoFixedText)}
                              className="px-2 py-1 rounded bg-gradient-to-r from-amber-500 to-amber-600 text-black font-extrabold text-[9px] transition-all self-end cursor-pointer"
                            >
                              ✨ Auto-Rephrase instruction
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => handleRegenerateScript(false)}
                        disabled={refinementStatus === "loading" || !refinementPrompt.trim()}
                        className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-white/[0.02] disabled:text-neutral-600 disabled:border-white/[0.04] text-white text-xs font-bold border border-indigo-500/20 transition-all flex items-center justify-center gap-2 shadow-md shadow-indigo-950/20 cursor-pointer"
                      >
                        {refinementStatus === "loading" ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Re-writing screenplay...
                          </>
                        ) : (
                          <>
                            <Wand2 className="h-3.5 w-3.5" />
                            Apply Refinement Prompt
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Production & Stitch Status card */}
            <div className="rounded-2xl bg-white/[0.02] border border-white/[0.06] p-5 space-y-4 shadow-xl">
              <h3 className="text-xs font-bold tracking-widest text-[#7c3aed] uppercase flex items-center gap-2">
                <ListVideo className="h-3.5 w-3.5" /> Production Progress
              </h3>

              <div className="rounded-xl bg-black/20 border border-white/[0.05] p-4 grid grid-cols-3 gap-3 text-center">
                <div>
                  <span className="block text-2xl font-bold font-heading text-white">{completedVideosCount}</span>
                  <span className="text-[10px] text-neutral-500 uppercase tracking-wide">Clips Ready</span>
                </div>
                <div>
                  <span className="block text-2xl font-bold font-heading text-neutral-400">{totalScenes - completedVideosCount}</span>
                  <span className="text-[10px] text-neutral-500 uppercase tracking-wide">Pending</span>
                </div>
                <div>
                  <span className="block text-2xl font-bold font-heading text-emerald-400">{approvedCount}</span>
                  <span className="text-[10px] text-neutral-500 uppercase tracking-wide">Approved</span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-neutral-500">
                  <span>Rendering Progress</span>
                  <span>{totalScenes > 0 ? Math.round((completedVideosCount / totalScenes) * 100) : 0}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#7c3aed] to-emerald-500 transition-all duration-500"
                    style={{ width: totalScenes > 0 ? `${(completedVideosCount / totalScenes) * 100}%` : "0%" }}
                  />
                </div>
              </div>

              {/* Conditional Stitch / Auto pipeline guidance */}
              {allVideosGenerated ? (
                <div className="space-y-2">
                  <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/10 text-[11px] text-emerald-300 leading-relaxed text-center">
                    All scene videos have been rendered successfully! Merging them will compile your final film.
                  </div>
                  <button
                    onClick={handleMergeVideo}
                    disabled={isMerging}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-sm font-bold hover:opacity-90 transition-opacity flex items-center justify-center gap-2 shadow-lg cursor-pointer"
                  >
                    {isMerging ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Stitching Final Movie...
                      </>
                    ) : (
                      <>
                        <Film className="h-4 w-4" />
                        Stitch &amp; Merge Movie
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04] text-[10px] text-neutral-500 leading-normal">
                    Generate videos scene-by-scene using the editor panels on the left. The Stitching button will be enabled once all clips are completed.
                  </div>
                </div>
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
          <Sparkles className="h-3.5 w-3.5 text-amber-500" /> Powered by Gemini 2.5 Pro &amp; Veo 3.1
        </span>
        <span className="flex items-center gap-1.5 text-neutral-600">
          <Clock className="h-3 w-3" /> Total Duration: {totalDuration}s across {totalScenes} scenes
        </span>
      </footer>

      {sidebarMinimized && (
        <button
          onClick={() => setSidebarMinimized(false)}
          className="fixed right-0 top-1/2 -translate-y-1/2 z-40 bg-[#0d0d14]/80 backdrop-blur-md hover:bg-[#12121c]/90 border-l border-y border-white/[0.06] hover:border-[#06b6d4]/40 text-neutral-400 hover:text-[#06b6d4] p-3.5 rounded-l-2xl transition-all duration-300 shadow-2xl flex items-center justify-center cursor-pointer group"
          title="Open Production Panel"
        >
          <PanelRightOpen className="h-5 w-5 group-hover:scale-110 transition-transform" />
        </button>
      )}
    </div>
  );
}
