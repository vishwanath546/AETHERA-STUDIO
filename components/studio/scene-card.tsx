"use client";

import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Film,
  Volume2,
  Clock,
  Sparkles,
  CheckCircle2,
  PencilLine,
  Lock,
  Unlock,
} from "lucide-react";
import { Scene } from "@/lib/job-store";

interface SceneCardProps {
  scene: Scene;
  approved: boolean;
  onChange: (updatedScene: Scene) => void;
  onApprove: (approved: boolean) => void;
}

export function SceneCard({ scene, approved, onChange, onApprove }: SceneCardProps) {
  const [editing, setEditing] = useState(false);

  const handleFieldChange = (field: keyof Scene, value: any) => {
    onChange({ ...scene, [field]: value });
  };

  const handleApprove = () => {
    setEditing(false);
    onApprove(true);
  };

  const handleEdit = () => {
    onApprove(false);
    setEditing(true);
  };

  return (
    <Card
      className={`relative overflow-hidden transition-all duration-500 ${
        approved
          ? "border-emerald-500/40 bg-emerald-950/10 shadow-lg shadow-emerald-900/10"
          : editing
          ? "border-violet-500/50 glass-panel shadow-lg shadow-violet-900/10"
          : "glass-panel hover:border-violet-500/30"
      }`}
    >
      {/* Left accent strip */}
      <div
        className={`absolute left-0 top-0 bottom-0 w-1.5 transition-colors duration-500 ${
          approved
            ? "bg-gradient-to-b from-emerald-400 to-teal-500"
            : "bg-gradient-to-b from-[#7c3aed] to-[#06b6d4]"
        }`}
      />

      <div className="p-6 pl-8 space-y-5">
        {/* ── Header row ── */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <span
              className={`h-8 w-8 rounded-lg flex items-center justify-center text-sm font-bold text-white shadow-md transition-colors duration-500 ${
                approved
                  ? "bg-gradient-to-tr from-emerald-500 to-teal-400"
                  : "bg-gradient-to-tr from-[#7c3aed] to-[#06b6d4]"
              }`}
            >
              {scene.sceneNumber}
            </span>
            <h3
              className={`font-heading text-lg font-bold transition-colors duration-300 ${
                approved ? "text-emerald-300" : "text-white"
              }`}
            >
              Scene {scene.sceneNumber}
            </h3>

            {approved && (
              <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-0.5 rounded-full tracking-wide">
                <Lock className="h-3 w-3" /> APPROVED
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Duration badge */}
            <span className="flex items-center gap-1 text-[11px] font-semibold text-neutral-400 bg-white/[0.03] border border-white/[0.06] px-2.5 py-1 rounded-md">
              <Clock className="h-3 w-3 text-[#06b6d4]" />
              {scene.estimatedDuration}s
            </span>

            {/* Approve / Edit toggle */}
            {approved ? (
              <button
                onClick={handleEdit}
                className="flex items-center gap-1.5 text-[11px] font-semibold text-neutral-300 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] px-3 py-1.5 rounded-lg transition-all"
              >
                <PencilLine className="h-3 w-3" /> Edit
              </button>
            ) : (
              <button
                onClick={handleApprove}
                className="flex items-center gap-1.5 text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 rounded-lg transition-all shadow-md shadow-emerald-900/30"
              >
                <CheckCircle2 className="h-3 w-3" /> Approve Scene
              </button>
            )}
          </div>
        </div>

        {/* ── Content: locked vs editable ── */}
        {approved ? (
          /* Locked preview */
          <div className="space-y-3">
            <div className="rounded-lg bg-emerald-950/20 border border-emerald-800/20 p-3 space-y-1">
              <span className="text-[10px] font-bold tracking-widest text-emerald-600 uppercase flex items-center gap-1.5">
                <Film className="h-3 w-3" /> Visual Direction
              </span>
              <p className="text-sm text-emerald-200/80 leading-relaxed line-clamp-3">
                {scene.visualPrompt}
              </p>
            </div>
            <div className="rounded-lg bg-emerald-950/20 border border-emerald-800/20 p-3 space-y-1">
              <span className="text-[10px] font-bold tracking-widest text-emerald-600 uppercase flex items-center gap-1.5">
                <Volume2 className="h-3 w-3" /> Dialogue / Narration
              </span>
              <p className="text-sm text-emerald-200/80 leading-relaxed line-clamp-2">
                {scene.dialogueOrNarration}
              </p>
            </div>
          </div>
        ) : (
          /* Editable form */
          <div className="space-y-4">
            {/* Visual Prompt */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold tracking-wider text-neutral-400 uppercase flex items-center gap-1.5">
                <Film className="h-3.5 w-3.5 text-[#7c3aed]" /> Visual Direction (Veo 3.1)
              </Label>
              <Textarea
                value={scene.visualPrompt}
                onChange={(e) => handleFieldChange("visualPrompt", e.target.value)}
                className="bg-black/30 border-white/[0.05] focus:border-[#7c3aed]/50 text-white rounded-lg text-sm placeholder:text-neutral-600 resize-none min-h-[80px] focus:ring-0"
                placeholder="Describe the visual action, setting, camera angle..."
              />
            </div>

            {/* Dialogue */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold tracking-wider text-neutral-400 uppercase flex items-center gap-1.5">
                <Volume2 className="h-3.5 w-3.5 text-[#06b6d4]" /> Dialogue / Narration
              </Label>
              <Textarea
                value={scene.dialogueOrNarration}
                onChange={(e) => handleFieldChange("dialogueOrNarration", e.target.value)}
                className="bg-black/30 border-white/[0.05] focus:border-[#06b6d4]/50 text-white rounded-lg text-sm placeholder:text-neutral-600 resize-none min-h-[60px] focus:ring-0"
                placeholder="CHARACTER: spoken line or narration text..."
              />
            </div>

            {/* Duration + tip */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold tracking-wider text-neutral-500 uppercase flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Scene Duration (sec)
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={3}
                    max={20}
                    value={scene.estimatedDuration}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      handleFieldChange("estimatedDuration", isNaN(val) ? 6 : val);
                    }}
                    className="bg-black/30 border-white/[0.05] focus:border-violet-500/50 text-white rounded-lg text-sm focus:ring-0 max-w-[100px]"
                  />
                  <span className="text-xs text-neutral-500">6–20s recommended</span>
                </div>
              </div>

              <div className="hidden sm:flex items-start gap-1.5 bg-white/[0.01] border border-white/[0.03] p-2.5 rounded-lg text-[11px] text-neutral-500">
                <Sparkles className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />
                <span>
                  Edit any field then click <strong className="text-neutral-300">Approve Scene</strong> to lock it.
                </span>
              </div>
            </div>

            {/* Inline approve CTA */}
            <button
              onClick={handleApprove}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600/80 hover:bg-emerald-500 text-white text-sm font-bold transition-all shadow shadow-emerald-900/30 mt-1"
            >
              <CheckCircle2 className="h-4 w-4" />
              Approve &amp; Lock Scene {scene.sceneNumber}
            </button>
          </div>
        )}
      </div>
    </Card>
  );
}
