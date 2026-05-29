"use client";

import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { SceneJob } from "@/lib/job-store";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { 
  Film, 
  Volume2, 
  Settings, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Hourglass,
  RotateCcw,
  Loader2,
  PlayCircle,
  PencilLine
} from "lucide-react";

interface ProductionCardProps {
  jobId: string;
  scene: SceneJob;
  onRetry?: (sceneNumber: number) => void;
  onEditScene?: (updatedScene: SceneJob) => Promise<void>;
}

export function ProductionCard({ jobId, scene, onRetry, onEditScene }: ProductionCardProps) {
  const [isRetrying, setIsRetrying] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedVisual, setEditedVisual] = useState(scene.visualPrompt);
  const [editedDialogue, setEditedDialogue] = useState(scene.dialogueOrNarration);
  const [isSaving, setIsSaving] = useState(false);
  
  const status = scene.status;

  // Custom states and styling
  const stateConfig = {
    queued: {
      border: "border-white/[0.04]",
      glow: "",
      badgeText: "Queued",
      badgeColor: "bg-neutral-500/10 text-neutral-400 border-neutral-500/20",
      step: 0,
    },
    generating_image: {
      border: "border-violet-500/30 animate-pulse",
      glow: "shadow-[0_0_20px_rgba(124,58,237,0.1)]",
      badgeText: "Filming Scene (Veo 3.1)",
      badgeColor: "bg-violet-500/10 text-violet-300 border-violet-500/20",
      step: 1,
    },
    generating_audio: {
      border: "border-[#06b6d4]/30 animate-pulse",
      glow: "shadow-[0_0_20px_rgba(6,182,212,0.1)]",
      badgeText: "Recording Voice (Edge TTS)",
      badgeColor: "bg-[#06b6d4]/10 text-[#06b6d4] border-[#06b6d4]/20",
      step: 2,
    },
    assembling_clip: {
      border: "border-amber-500/30 animate-pulse",
      glow: "shadow-[0_0_20px_rgba(245,158,11,0.1)]",
      badgeText: "Stitching Visuals & Subtitles (FFmpeg)",
      badgeColor: "bg-amber-500/10 text-amber-300 border-amber-500/20",
      step: 3,
    },
    complete: {
      border: "border-emerald-500/30",
      glow: "shadow-[0_0_25px_rgba(10,185,129,0.08)]",
      badgeText: "Scene Complete",
      badgeColor: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
      step: 4,
    },
    error: {
      border: "border-rose-500/50",
      glow: "shadow-[0_0_30px_rgba(244,63,94,0.15)]",
      badgeText: "Production Failure",
      badgeColor: "bg-rose-500/20 text-rose-200 border-rose-500/30 font-bold",
      step: -1,
    },
  };

  const current = stateConfig[status] || stateConfig.queued;

  const handleSaveAndRegenerate = async () => {
    setIsSaving(true);
    if (onEditScene) {
      try {
        await onEditScene({
          ...scene,
          visualPrompt: editedVisual,
          dialogueOrNarration: editedDialogue,
        });
      } finally {
        setIsSaving(false);
        setIsEditing(false);
      }
    } else {
      setIsSaving(false);
      setIsEditing(false);
    }
  };

  return (
    <Card className={cn(
      "glass-panel p-5 relative overflow-hidden transition-all duration-500",
      current.border,
      current.glow
    )}>
      {/* Background Subtle Shimmer for active scenes */}
      {["generating_image", "generating_audio", "assembling_clip"].includes(status) && (
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.01] to-transparent translate-x-[-100%] animate-shimmer" />
      )}

      {/* Red error background tint if failed */}
      {status === "error" && (
        <div className="absolute inset-0 bg-rose-500/[0.02]" />
      )}

      <div className="space-y-4 relative z-10">
        {/* Header (Scene Badge + Status Indicator) */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className={cn(
              "h-7 w-7 rounded-md flex items-center justify-center text-xs font-bold transition-colors duration-300",
              status === "complete" 
                ? "bg-emerald-500 text-white" 
                : status === "error"
                ? "bg-rose-600 text-white shadow-[0_0_10px_rgba(225,29,72,0.4)]"
                : "bg-white/[0.04] text-neutral-300 border border-white/[0.06]"
            )}>
              {scene.sceneNumber}
            </span>
            <span className="font-heading text-sm font-bold text-white">
              Scene {scene.sceneNumber}
            </span>
          </div>

          <span className={cn(
            "text-[10px] font-bold tracking-wider px-2.5 py-0.5 rounded-full border uppercase transition-all duration-300",
            current.badgeColor
          )}>
            {current.badgeText}
          </span>
        </div>

        {/* Prompt snippets summary */}
        {!isEditing && (
          <div className="space-y-1">
            <span className="block text-[10px] font-bold tracking-wider text-neutral-500 uppercase">
              Visual Setup
            </span>
            <p className="text-xs text-neutral-300 line-clamp-2 leading-relaxed">
              {scene.visualPrompt}
            </p>
          </div>
        )}

        {/* Interactive Progress Steps */}
        {isEditing ? (
          <div className="space-y-4 pt-2 border-t border-white/[0.05]">
            <div className="space-y-2">
              <Label className="text-[10px] font-bold tracking-wider text-neutral-400 uppercase flex items-center gap-1.5">
                <Film className="h-3.5 w-3.5 text-[#7c3aed]" /> Visual Direction
              </Label>
              <Textarea
                value={editedVisual}
                onChange={(e) => setEditedVisual(e.target.value)}
                className="bg-black/40 border-white/[0.05] focus:border-[#7c3aed]/50 text-white rounded-lg text-xs placeholder:text-neutral-600 resize-none min-h-[70px] focus:ring-0 leading-relaxed"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-bold tracking-wider text-neutral-400 uppercase flex items-center gap-1.5">
                <Volume2 className="h-3.5 w-3.5 text-[#06b6d4]" /> Dialogue / Narration
              </Label>
              <Textarea
                value={editedDialogue}
                onChange={(e) => setEditedDialogue(e.target.value)}
                className="bg-black/40 border-white/[0.05] focus:border-[#06b6d4]/50 text-white rounded-lg text-xs placeholder:text-neutral-600 resize-none min-h-[50px] focus:ring-0 leading-relaxed"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setIsEditing(false)}
                disabled={isSaving}
                className="flex-1 py-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] text-white text-xs font-semibold transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveAndRegenerate}
                disabled={isSaving}
                className="flex-[2] flex items-center justify-center gap-1.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-md shadow-emerald-900/30 disabled:opacity-50"
              >
                {isSaving ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Starting...</>
                ) : (
                  <><CheckCircle2 className="h-3.5 w-3.5" /> Save &amp; Regenerate</>
                )}
              </button>
            </div>
          </div>
        ) : status === "complete" ? (
          <div className="space-y-3">
            <div className="relative group rounded-lg overflow-hidden border border-emerald-500/20 bg-black aspect-video mt-2">
              <video
                src={`/api/scene-video/${jobId}/${scene.sceneNumber}`}
                controls
                className="w-full h-full object-contain"
                poster={scene.imagePath ? `/api/scene-video/${jobId}/${scene.sceneNumber}` : undefined}
              />
              <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-md px-2 py-1 rounded text-[10px] font-bold tracking-widest text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
                <PlayCircle className="h-3 w-3" /> SCENE PREVIEW
              </div>
            </div>
            
            {onEditScene && (
              <button
                onClick={() => setIsEditing(true)}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.1] text-neutral-300 text-xs font-semibold transition-colors"
              >
                <PencilLine className="h-3.5 w-3.5" /> Notice a mistake? Edit &amp; Regenerate
              </button>
            )}
          </div>
        ) : status !== "error" ? (
          <div className="grid grid-cols-3 gap-2 pt-2 text-center text-[10px] font-medium tracking-wide">
            {/* Step 1: Image */}
            <div className={cn(
              "py-1.5 px-2 rounded-lg border transition-all duration-300 flex items-center justify-center gap-1.5",
              current.step >= 1 
                ? "bg-violet-500/10 border-violet-500/20 text-violet-300"
                : "bg-white/[0.01] border-white/[0.03] text-neutral-600"
            )}>
              <Film className="h-3 w-3" />
              <span>Visuals</span>
            </div>

            {/* Step 2: Voice */}
            <div className={cn(
              "py-1.5 px-2 rounded-lg border transition-all duration-300 flex items-center justify-center gap-1.5",
              current.step >= 2 
                ? "bg-[#06b6d4]/10 border-[#06b6d4]/20 text-[#06b6d4]"
                : "bg-white/[0.01] border-white/[0.03] text-neutral-600"
            )}>
              <Volume2 className="h-3 w-3" />
              <span>Voice</span>
            </div>

            {/* Step 3: FFmpeg Stitch */}
            <div className={cn(
              "py-1.5 px-2 rounded-lg border transition-all duration-300 flex items-center justify-center gap-1.5",
              current.step >= 4 
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300" // Fully complete
                : current.step === 3
                ? "bg-amber-500/10 border-amber-500/20 text-amber-300" // Active
                : "bg-white/[0.01] border-white/[0.03] text-neutral-600"
            )}>
              <Settings className="h-3 w-3" />
              <span>Stitch</span>
            </div>
          </div>
        ) : (
          /* Error Stack display */
          <div className="p-3 rounded-lg bg-rose-500/5 border border-rose-500/15 text-rose-300 text-[11px] leading-relaxed flex flex-col gap-2">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-3.5 w-3.5 text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-1 flex-1">
                <span className="block font-bold">Failure Log:</span>
                <p className="font-mono text-rose-400/90 break-words">{scene.error || "Execution terminated unexpectedly"}</p>
              </div>
            </div>
            
            <div className="pt-2 mt-1 border-t border-rose-500/10 flex justify-end gap-2">
              {onEditScene && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.08] text-neutral-300 font-semibold transition-colors"
                >
                  <PencilLine className="h-3.5 w-3.5" />
                  <span>Edit Prompt</span>
                </button>
              )}

              {onRetry && (
                <button
                  onClick={() => {
                    setIsRetrying(true);
                    onRetry(scene.sceneNumber);
                    setTimeout(() => setIsRetrying(false), 2000);
                  }}
                  disabled={isRetrying}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isRetrying ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="h-3.5 w-3.5" />
                  )}
                  <span>{isRetrying ? "Restarting..." : "Retry Scene"}</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
