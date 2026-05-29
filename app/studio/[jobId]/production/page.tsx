"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { ProductionHeader } from "@/components/studio/production-header";
import { ProductionCard } from "@/components/studio/production-card";
import { Clapperboard, ChevronLeft, Sparkles, AlertCircle, Film, RotateCcw } from "lucide-react";
import Link from "next/link";
import { Job, SceneJob } from "@/lib/job-store";

export default function ProductionPage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params?.jobId as string;

  const [job, setJob] = useState<Job | null>(null);
  const [orderedScenes, setOrderedScenes] = useState<SceneJob[]>([]);
  const [error, setError] = useState("");
  const [isMerging, setIsMerging] = useState(false);

  // Drag and drop state
  const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);
  const [dragOverItemIndex, setDragOverItemIndex] = useState<number | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Setup EventSource for real-time progress stream
  useEffect(() => {
    let eventSource: EventSource | null = null;

    if (jobId) {
      console.log(`SSE: Connecting to progress stream for job ${jobId}`);
      eventSource = new EventSource(`/api/production-status/${jobId}`);

      eventSource.onmessage = (event) => {
        try {
          const updatedJob: Job = JSON.parse(event.data);
          setJob(updatedJob);

          // Initialize orderedScenes if not set or if new scenes added
          setOrderedScenes(prev => {
            if (prev.length === 0 || prev.length !== updatedJob.scenes.length) {
              // If the job already has a custom sequence, use it, otherwise default to chronological
              if (updatedJob.sceneSequence && updatedJob.sceneSequence.length === updatedJob.scenes.length) {
                return updatedJob.sceneSequence.map(seq => updatedJob.scenes.find(s => s.sceneNumber === seq)!).filter(Boolean);
              }
              return updatedJob.scenes;
            }
            // Update existing scenes in ordered array with new status from SSE
            return prev.map(scene => updatedJob.scenes.find(s => s.sceneNumber === scene.sceneNumber) || scene);
          });

          // Redirect to screening room on completion
          if (updatedJob.status === "completed") {
            console.log(`SSE: Job ${jobId} completed! Closing stream and redirecting.`);
            eventSource?.close();

            // Short delay to let the user see 100% completion before redirection
            setTimeout(() => {
              router.push(`/studio/${jobId}/screening`);
            }, 1500);
          }

          if (updatedJob.status === "error") {
            setError(updatedJob.error || "An error occurred during production.");
            eventSource?.close();
          }
        } catch (err) {
          console.error("SSE: Error parsing stream message:", err);
        }
      };

      eventSource.onerror = (err) => {
        console.error("SSE: Stream connection error:", err);
        setError("Production server stream disconnected. Pipeline may still be running in background.");
        eventSource?.close();
      };
    }

    return () => {
      if (eventSource) {
        console.log("SSE: Closing connection on unmount");
        eventSource.close();
      }
    };
  }, [jobId, router, retryCount]);

  const handleRetryScene = async (sceneNumber: number) => {
    if (!job) return;
    try {
      // The backend pipeline intelligently skips already completed scenes.
      // By sending the entire job back, it will resume from where it failed.
      const response = await fetch('/api/start-production', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: job.id,
          scenes: job.scenes,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        setError(errorData.error || `Failed to restart scene ${sceneNumber}.`);
      } else {
        // Clear global error if a retry is successfully initiated
        setError("");
        // Re-establish the SSE connection so UI receives new statuses
        setRetryCount(prev => prev + 1);
      }
    } catch (err) {
      setError(`Network error while trying to retry scene ${sceneNumber}.`);
    }
  };

  const handleResumePipeline = async () => {
    if (!job) return;
    try {
      setError("");
      const response = await fetch('/api/start-production', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: job.id,
          scenes: job.scenes,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        setError(errorData.error || "Failed to resume production.");
      } else {
        setRetryCount(prev => prev + 1);
      }
    } catch (err) {
      setError("Network error while trying to resume production.");
    }
  };

  const handleMergeVideos = async () => {
    setIsMerging(true);
    try {
      const sequence = orderedScenes.map(s => s.sceneNumber);
      const response = await fetch('/api/merge-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, sequence }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        setError(errorData.error || "Failed to start merging.");
        setIsMerging(false);
      }
    } catch (err) {
      setError("Network error while trying to merge videos.");
      setIsMerging(false);
    }
  };

  // Drag and Drop Handlers
  const handleDragStart = (index: number) => {
    setDraggedItemIndex(index);
  };

  const handleDragEnter = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedItemIndex !== null && index !== draggedItemIndex) {
      setDragOverItemIndex(index);
    }
  };

  const handleDragEnd = () => {
    if (draggedItemIndex !== null && dragOverItemIndex !== null && draggedItemIndex !== dragOverItemIndex) {
      const newOrder = [...orderedScenes];
      const draggedItem = newOrder[draggedItemIndex];
      newOrder.splice(draggedItemIndex, 1);
      newOrder.splice(dragOverItemIndex, 0, draggedItem);
      setOrderedScenes(newOrder);
    }
    setDraggedItemIndex(null);
    setDragOverItemIndex(null);
  };

  const handleEditScene = async (updatedScene: SceneJob) => {
    if (!job) return;
    try {
      // Replace the old scene with the updated one
      const updatedScenes = job.scenes.map((s) =>
        s.sceneNumber === updatedScene.sceneNumber ? updatedScene : s
      );

      const response = await fetch('/api/start-production', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: job.id,
          scenes: updatedScenes,
          forceRegenerate: [updatedScene.sceneNumber]
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        setError(errorData.error || `Failed to restart edited scene ${updatedScene.sceneNumber}.`);
      } else {
        setError("");
        // Trigger a re-connection to SSE or just let SSE pull the updated 'queued' status
        setRetryCount(prev => prev + 1);
      }
    } catch (err) {
      setError(`Network error while trying to regenerate scene ${updatedScene.sceneNumber}.`);
    }
  };

  if (error && !job) {
    return (
      <div className="min-h-screen bg-[#030307] flex flex-col items-center justify-center p-6 text-center space-y-6">
        <div className="h-16 w-16 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
          <AlertCircle className="h-8 w-8" />
        </div>
        <div className="max-w-md space-y-2">
          <h2 className="font-heading text-xl font-bold text-white">Pipeline Interrupted</h2>
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

  if (!job) {
    return (
      <div className="min-h-screen bg-[#030307] flex flex-col items-center justify-center space-y-4">
        <div className="relative h-12 w-12 rounded-xl bg-gradient-to-tr from-[#7c3aed] to-[#06b6d4] flex items-center justify-center animate-pulse">
          <Clapperboard className="h-6 w-6 text-white" />
        </div>
        <span className="text-neutral-400 text-sm font-semibold tracking-wider animate-pulse">
          Synchronizing with production desk...
        </span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#030307] text-[#ededf5] flex flex-col">
      {/* Top Header */}
      <header className="sticky top-0 z-30 w-full bg-[#030307]/80 backdrop-blur-md border-b border-white/[0.03]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href={`/studio/${jobId}/script`}
              className="p-2 rounded-lg bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.08] text-neutral-400 hover:text-white transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </Link>
            <div>
              <span className="block text-[10px] font-bold tracking-widest text-[#7c3aed] bg-[#7c3aed]/10 border border-[#7c3aed]/20 px-2 rounded-full uppercase w-fit px-2.5 py-0.5">
                Phase 3: Production Studio
              </span>
              <h1 className="font-heading text-lg font-bold text-white tracking-wide mt-1">
                Aethera Processing Deck
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-cyan-500 animate-ping" />
            <span className="text-xs font-semibold text-cyan-400 uppercase tracking-widest">
              Live Feed
            </span>
          </div>
        </div>
      </header>

      {/* Main Grid Content */}
      <main className="max-w-5xl w-full mx-auto px-6 py-8 flex-1 space-y-8">

        {/* Header progress panel */}
        <ProductionHeader job={job} />

        {/* Global Error Banner */}
        {(error || job.error) && (
          <div className="p-5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm space-y-4 shadow-lg">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-bold block">Production Error Encountered</span>
                <p className="font-light leading-relaxed">{error || job.error}</p>
              </div>
            </div>
            
            <div className="flex flex-wrap gap-3 pt-3 border-t border-rose-500/10">
              <button
                onClick={handleResumePipeline}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-colors shadow-md shadow-indigo-900/30"
              >
                <Sparkles className="h-3.5 w-3.5 animate-pulse" />
                Resume Processing Remaining Scenes
              </button>

              <Link
                href="/"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-neutral-300 font-semibold text-xs transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Regenerate Script with New Prompt
              </Link>
            </div>
          </div>
        )}

        {/* Scene Cards Grid */}
        <div className="space-y-4">
          <div className="border-b border-white/[0.05] pb-3">
            <h3 className="font-heading text-lg font-bold text-white tracking-wide">
              Scene Rendering Queue
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {orderedScenes.map((scene, index) => {
              const canReorder = job.status === "ready_to_merge" || job.status === "merging" || (job.status === "error" && job.scenes.every(s => s.status === "complete"));

              return (
                <div
                  key={scene.sceneNumber}
                  draggable={canReorder}
                  onDragStart={() => handleDragStart(index)}
                  onDragEnter={(e) => handleDragEnter(e, index)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => e.preventDefault()}
                  className={`transition-all duration-300 transform ${canReorder ? 'cursor-grab active:cursor-grabbing' : ''} ${draggedItemIndex === index ? 'opacity-40 scale-95 z-10' : ''} ${dragOverItemIndex === index ? 'scale-105 shadow-[0_0_25px_rgba(99,102,241,0.5)] z-20 ring-2 ring-indigo-500 rounded-xl' : ''}`}
                >
                  <div>
                    <ProductionCard
                      jobId={jobId}
                      scene={scene}
                      onRetry={handleRetryScene}
                      onEditScene={handleEditScene}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Manual Merge Action */}
          {(job.status === "ready_to_merge" || job.status === "merging" || (job.status === "error" && job.scenes.every(s => s.status === "complete"))) && (
            <div className="mt-12 p-8 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 text-center space-y-6">
              <div className="max-w-md mx-auto space-y-2">
                <h3 className="font-heading text-xl font-bold text-white tracking-wide">
                  All Scenes Rendered Successfully
                </h3>
                <p className="text-sm text-neutral-400">
                  Review the individual scene clips above. If you're satisfied, merge them into the final seamless movie to proceed to the screening room.
                </p>
              </div>
              <button
                onClick={handleMergeVideos}
                disabled={job.status === "merging" || isMerging}
                className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold tracking-wide shadow-xl shadow-indigo-900/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {(job.status === "merging" || isMerging) ? (
                  <>
                    <span className="h-5 w-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    Stitching Final Movie...
                  </>
                ) : (
                  <>
                    <Film className="h-5 w-5" />
                    Merge All Videos
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full bg-[#030307] border-t border-white/[0.03] py-6 px-6 text-center text-xs text-neutral-500 flex flex-col sm:flex-row items-center justify-between gap-4 max-w-7xl mx-auto">
        <span className="flex items-center gap-1.5 justify-center sm:justify-start">
          <Sparkles className="h-3.5 w-3.5 text-amber-500" /> Powered by Veo 3.1 + Gemini
        </span>
        <span>Please do not close this browser tab while rendering or merging is in progress.</span>
      </footer>
    </div>
  );
}
