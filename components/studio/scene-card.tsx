"use client";

import React, { useState, useEffect } from "react";
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
  Play,
  Loader2,
  RotateCw,
  AlertTriangle,
  FileVideo,
  Wand2,
  ShieldCheck,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { SceneJob } from "@/lib/job-store";

interface SceneCardProps {
  scene: SceneJob;
  approved: boolean;
  onChange: (updatedScene: SceneJob) => void;
  onApprove: (approved: boolean) => Promise<void> | void;
  onGenerateVideo?: () => void;
  onRegenerateSceneWithAI?: (sceneNumber: number, prompt: string) => Promise<void>;
  onDeleteScene?: (sceneNumber: number) => void;
  jobId: string;
  isPrevComplete?: boolean;
  isMerging?: boolean;
}

// ── Google GenAI Safety Policy & Disallowed Terms ──────────────────────────
export interface SafetyCheckResult {
  safe: boolean;
  violations: { category: string; words: string[] }[];
  autoFixedText: string;
}

export const POLICY_CONSTRAINTS = [
  {
    category: "Weapons & Violence",
    keywords: ["gun", "pistol", "rifle", "knife", "dagger", "sword", "bomb", "grenade", "weapon", "weapons", "shooting", "shoot", "shoots", "bullet", "bullets", "blood", "bleed", "kill", "kills", "dead", "death", "fight", "fights", "fighting", "battle", "wound", "injury", "bruise", "choke", "strangle", "punch", "kick", "stab", "murder"],
    replaces: {
      "gun": "handheld scanner",
      "pistol": "device",
      "rifle": "long scanner",
      "knife": "utility tool",
      "dagger": "pointer tool",
      "sword": "energy rod",
      "bomb": "power core",
      "grenade": "energy canister",
      "weapon": "tool",
      "weapons": "tools",
      "shoot": "capture",
      "shoots": "captures",
      "shooting": "capturing",
      "bullet": "beam",
      "bullets": "beams",
      "blood": "dark crimson mist",
      "bleed": "flow",
      "kill": "vanquish",
      "kills": "vanquishes",
      "dead": "dormant",
      "death": "dormancy",
      "fight": "compete",
      "fights": "competes",
      "fighting": "competing",
      "battle": "match",
      "wound": "affect",
      "injury": "impact",
      "choke": "restrict",
      "strangle": "restrict",
      "punch": "tap",
      "kick": "nudge",
      "stab": "probe",
      "murder": "eliminate"
    }
  },
  {
    category: "Fire, Smoke & Explosions",
    keywords: ["fire", "explode", "explodes", "explosion", "explosions", "blast", "smoke", "flame", "flames", "burning", "combust"],
    replaces: {
      "explode": "emit a bright light pulse",
      "explodes": "emits a bright light pulse",
      "explosion": "dramatic burst of volumetric light",
      "explosions": "dramatic bursts of volumetric light",
      "fire": "warm amber glow",
      "smoke": "dense fog",
      "flame": "orange energy wave",
      "flames": "orange energy waves",
      "burning": "glowing brightly",
      "combust": "glow intense"
    }
  },
  {
    category: "Flags & Public Figures",
    keywords: ["flag", "flags", "president", "king", "queen", "trump", "biden", "obama", "celebrity", "politician", "politicians"],
    replaces: {
      "flag": "colored banner",
      "flags": "colored banners",
      "president": "leader",
      "king": "monarch",
      "queen": "sovereign"
    }
  },
  {
    category: "Copyrighted Terms",
    keywords: ["disney", "marvel", "harry potter", "mickey", "mickey mouse", "star wars", "pixar", "lego", "barbie", "superman", "batman", "spiderman"],
    replaces: {
      "disney": "stylized cartoon animation",
      "marvel": "superhero comic book",
      "harry potter": "young wizard",
      "star wars": "sci-fi space opera",
      "pixar": "3D animated CGI style",
      "lego": "toy brick blocks",
      "mickey": "cartoon character",
      "mickey mouse": "cartoon character",
      "superman": "superhero",
      "batman": "caped hero",
      "spiderman": "web hero"
    }
  },
  {
    category: "Horror & Suspense",
    keywords: ["scary", "terrifying", "creepy", "deadly", "screaming", "scream", "panic", "horror", "monster", "ghost", "demon", "demons"],
    replaces: {
      "scary": "mysterious",
      "terrifying": "intense",
      "creepy": "shadowy",
      "screaming": "calling out",
      "scream": "cry out",
      "panic": "urgency",
      "horror": "thriller",
      "monster": "creature",
      "ghost": "apparition",
      "demon": "entity",
      "demons": "entities"
    }
  }
];

export function performSafetyCheck(text: string): SafetyCheckResult {
  if (!text) return { safe: true, violations: [], autoFixedText: "" };

  const violations: { category: string; words: string[] }[] = [];
  const foundWords = new Set<string>();

  POLICY_CONSTRAINTS.forEach((constraint) => {
    const matchedWordsForCategory: string[] = [];
    constraint.keywords.forEach((keyword) => {
      const regex = new RegExp(`\\b${keyword}\\b`, "gi");
      if (regex.test(text)) {
        matchedWordsForCategory.push(keyword);
        foundWords.add(keyword.toLowerCase());
      }
    });
    if (matchedWordsForCategory.length > 0) {
      violations.push({
        category: constraint.category,
        words: matchedWordsForCategory,
      });
    }
  });

  let fixedText = text;
  POLICY_CONSTRAINTS.forEach((constraint) => {
    const replaces = (constraint.replaces as unknown) as Record<string, string>;
    const replaceKeys = Object.keys(replaces).sort((a, b) => b.length - a.length);
    replaceKeys.forEach((key) => {
      const val = replaces[key];
      const regex = new RegExp(`\\b${key}\\b`, "gi");
      fixedText = fixedText.replace(regex, (match) => {
        if (match[0] === match[0].toUpperCase()) {
          return val.charAt(0).toUpperCase() + val.slice(1);
        }
        return val;
      });
    });
  });

  return {
    safe: violations.length === 0,
    violations,
    autoFixedText: fixedText,
  };
}

export function SceneCard({
  scene,
  approved,
  onChange,
  onApprove,
  onGenerateVideo,
  onRegenerateSceneWithAI,
  onDeleteScene,
  jobId,
  isPrevComplete = true,
  isMerging = false,
}: SceneCardProps) {
  const [editing, setEditing] = useState(!approved);
  const [activeTab, setActiveTab] = useState<"manual" | "ai">("manual");
  const [aiPrompt, setAiPrompt] = useState("");
  const [isAiRegenerating, setIsAiRegenerating] = useState(false);
  const [isStartingVideo, setIsStartingVideo] = useState(false);

  useEffect(() => {
    setEditing(!approved);
    if (approved) {
      setActiveTab("manual");
    }
  }, [approved]);

  // Safety evaluations
  const visualSafety = performSafetyCheck(scene.visualPrompt);
  const dialogueSafety = performSafetyCheck(scene.dialogueOrNarration);
  const aiPromptSafety = performSafetyCheck(aiPrompt);

  const activeSafetyResult = 
    activeTab === "manual" 
      ? {
          safe: visualSafety.safe && dialogueSafety.safe,
          violations: [...visualSafety.violations, ...dialogueSafety.violations],
          fields: { visual: visualSafety, dialogue: dialogueSafety }
        }
      : {
          safe: aiPromptSafety.safe,
          violations: aiPromptSafety.violations,
          fields: { ai: aiPromptSafety }
        };

  const handleAutoRephrase = () => {
    if (activeTab === "manual") {
      if (!visualSafety.safe) {
        onChange({ ...scene, visualPrompt: visualSafety.autoFixedText });
      }
      if (!dialogueSafety.safe) {
        onChange({
          ...scene,
          visualPrompt: visualSafety.safe ? scene.visualPrompt : visualSafety.autoFixedText,
          dialogueOrNarration: dialogueSafety.autoFixedText,
        });
      }
    } else {
      setAiPrompt(aiPromptSafety.autoFixedText);
    }
  };

  const handleGenerateVideo = async () => {
    if (!onGenerateVideo) return;
    setIsStartingVideo(true);
    try {
      await onGenerateVideo();
    } catch (e) {
      console.error("onGenerateVideo error:", e);
    } finally {
      setIsStartingVideo(false);
    }
  };

  const handleRegenerate = async () => {
    if (!onRegenerateSceneWithAI || !aiPrompt.trim()) return;
    
    // Safety prompt warnings check
    if (!aiPromptSafety.safe) {
      const confirmProceed = window.confirm(
        "Warning: Your instruction prompt contains words that may trigger Google safety filters. We recommend clicking 'Auto-Rephrase' first. Do you want to send this instruction anyway?"
      );
      if (!confirmProceed) return;
    }

    setIsAiRegenerating(true);
    try {
      await onRegenerateSceneWithAI(scene.sceneNumber, aiPrompt.trim());
      setAiPrompt("");
    } catch (err) {
      console.error("AI Rewrite error:", err);
    } finally {
      setIsAiRegenerating(false);
    }
  };

  const handleFieldChange = (field: keyof SceneJob, value: any) => {
    onChange({ ...scene, [field]: value });
  };

  const handleApproveOnly = async () => {
    setEditing(false);
    await onApprove(true);
  };

  const handleApproveAndGenerate = async () => {
    // Check safety warning check
    if (!visualSafety.safe || !dialogueSafety.safe) {
      const confirmProceed = window.confirm(
        "Warning: Your visual prompt or dialogue contains keywords that may trigger Google Vertex safety blocks. We recommend rephrasing before generating. Do you want to proceed with video generation anyway?"
      );
      if (!confirmProceed) return;
    }

    setIsStartingVideo(true);
    setEditing(false);
    try {
      await onApprove(true);
      if (onGenerateVideo) {
        await onGenerateVideo();
      }
    } catch (e) {
      console.error("Approve & Generate failed:", e);
    } finally {
      setIsStartingVideo(false);
    }
  };

  const handleEdit = () => {
    onApprove(false);
    setEditing(true);
    // Invalidate old media and reset status to idle
    onChange({
      ...scene,
      status: "idle",
      imagePath: undefined,
      audioPath: undefined,
      srtPath: undefined,
      clipPath: undefined,
      gcsClipUrl: undefined,
      error: undefined,
    });
  };

  const isGenerating = approved && [
    "queued",
    "generating_image",
    "generating_audio",
    "assembling_clip",
  ].includes(scene.status);

  const getStatusMessage = () => {
    switch (scene.status) {
      case "queued":
        return "Waiting in production queue...";
      case "generating_image":
        return "Generating cinematic visual frames (Veo 3.1)...";
      case "generating_audio":
        return "Synthesizing dialogue & voiceover...";
      case "assembling_clip":
        return "Assembling and rendering final clip...";
      default:
        return "Rendering scene video...";
    }
  };

  // Get distinct violating words
  const violatingWords = Array.from(
    new Set(activeSafetyResult.violations.flatMap((v) => v.words))
  );

  return (
    <Card
      className={`relative overflow-hidden transition-all duration-500 border ${
        approved
          ? "border-emerald-500/40 bg-emerald-950/10 shadow-lg shadow-emerald-900/10"
          : editing
          ? "border-violet-500/30 bg-[#0d0d14]/90 shadow-lg shadow-violet-900/10"
          : "bg-white/[0.02] border-white/[0.08] hover:border-violet-500/30"
      } ${isMerging ? "opacity-40 pointer-events-none select-none" : ""}`}
    >
      {/* Left accent strip */}
      <div
        className={`absolute left-0 top-0 bottom-0 w-1.5 transition-all duration-500 ${
          approved
            ? "bg-gradient-to-b from-emerald-400 to-teal-500"
            : isGenerating
            ? "bg-gradient-to-b from-cyan-400 to-indigo-500 animate-pulse"
            : "bg-gradient-to-b from-[#7c3aed] to-[#06b6d4]"
        }`}
      />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 p-6 pl-8">
        {/* ── Left Columns: Screenplay Editor (cols 3) ── */}
        <div className="lg:col-span-3 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <span
                className={`h-8 w-8 rounded-lg flex items-center justify-center text-sm font-bold text-white shadow-md transition-all duration-500 ${
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
                <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-0.5 rounded-full tracking-wide uppercase">
                  <Lock className="h-3 w-3" /> Locked
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 text-[11px] font-semibold text-neutral-400 bg-white/[0.03] border border-white/[0.06] px-2.5 py-1 rounded-md">
                <Clock className="h-3 w-3 text-[#06b6d4]" />
                {scene.estimatedDuration}s
              </span>

              {approved && (
                <button
                  type="button"
                  onClick={handleEdit}
                  className="flex items-center gap-1.5 text-[11px] font-semibold text-neutral-300 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] px-3 py-1.5 rounded-lg transition-all cursor-pointer"
                >
                  <PencilLine className="h-3 w-3 text-indigo-400" /> Unlock &amp; Edit
                </button>
              )}

              {!isMerging && onDeleteScene && (
                <button
                  type="button"
                  onClick={() => {
                    if (
                      window.confirm(
                        `Are you sure you want to permanently delete Scene ${scene.sceneNumber}? This will delete all generated videos, audio narration, and associated data for this scene.`
                      )
                    ) {
                      onDeleteScene(scene.sceneNumber);
                    }
                  }}
                  className="flex items-center gap-1.5 text-[11px] font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 bg-rose-500/5 border border-rose-500/20 px-3 py-1.5 rounded-lg transition-all cursor-pointer"
                  title="Delete Scene"
                >
                  <Trash2 className="h-3.5 w-3.5 text-rose-400" /> Delete Scene
                </button>
              )}
            </div>
          </div>

          {editing ? (
            /* Active Editing Mode with tab switcher */
            <div className="space-y-4">
              
              {/* Tab Selector */}
              <div className="flex bg-white/[0.02] border border-white/[0.06] rounded-xl p-0.5 w-fit">
                <button
                  type="button"
                  onClick={() => setActiveTab("manual")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    activeTab === "manual"
                      ? "bg-white/[0.06] border border-white/[0.1] text-white shadow-sm"
                      : "text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  📝 Manual Scripting
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("ai")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    activeTab === "ai"
                      ? "bg-white/[0.06] border border-white/[0.1] text-white shadow-sm"
                      : "text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  ✨ AI Prompt Director
                </button>
              </div>

              {activeTab === "manual" ? (
                /* Tab 1: Manual form inputs */
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-bold tracking-wider text-neutral-400 uppercase flex items-center gap-1.5">
                      <Film className="h-3.5 w-3.5 text-[#7c3aed]" /> Visual Direction (Veo 3.1)
                    </Label>
                    <Textarea
                      value={scene.visualPrompt}
                      onChange={(e) => handleFieldChange("visualPrompt", e.target.value)}
                      className={`bg-black/30 text-white rounded-xl text-sm placeholder:text-neutral-600 resize-none min-h-[90px] focus:ring-0 transition-all ${
                        !visualSafety.safe
                          ? "border-amber-500/40 focus:border-amber-500"
                          : "border-white/[0.05] focus:border-[#7c3aed]/50"
                      }`}
                      placeholder="Describe the visual action, setting, camera angle..."
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[10px] font-bold tracking-wider text-neutral-400 uppercase flex items-center gap-1.5">
                      <Volume2 className="h-3.5 w-3.5 text-[#06b6d4]" /> Dialogue / Narration
                    </Label>
                    <Textarea
                      value={scene.dialogueOrNarration}
                      onChange={(e) => handleFieldChange("dialogueOrNarration", e.target.value)}
                      className={`bg-black/30 text-white rounded-xl text-sm placeholder:text-neutral-600 resize-none min-h-[65px] focus:ring-0 transition-all ${
                        !dialogueSafety.safe
                          ? "border-amber-500/40 focus:border-amber-500"
                          : "border-white/[0.05] focus:border-[#06b6d4]/50"
                      }`}
                      placeholder="CHARACTER: spoken line or narration text..."
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold tracking-wider text-neutral-500 uppercase flex items-center gap-1">
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

                    <div className="flex items-start gap-1.5 bg-white/[0.01] border border-white/[0.03] p-2.5 rounded-lg text-[11px] text-neutral-500">
                      <Sparkles className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />
                      <span>
                        Verify the live safety scanner below, then lock to prepare for rendering.
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                /* Tab 2: AI Prompt Rewrite */
                <div className="space-y-3 pt-1">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-bold tracking-wider text-neutral-400 uppercase flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-amber-400" /> AI Scene Refinement instructions
                    </Label>
                    <Textarea
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      disabled={isAiRegenerating}
                      placeholder="e.g., 'Make it set during sunset with golden orange light rays filtering through the trees'"
                      className={`bg-black/30 text-white rounded-xl text-sm placeholder:text-neutral-600 resize-none min-h-[90px] focus:ring-0 transition-all ${
                        !aiPromptSafety.safe
                          ? "border-amber-500/40 focus:border-amber-500"
                          : "border-white/[0.05] focus:border-amber-400/50"
                      }`}
                    />
                  </div>

                  {/* AI Quick Presets */}
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      "Make it sunset golden hour",
                      "Make it cyberpunk neon style",
                      "Add dramatic cinematic shadows",
                      "Change to slow-motion camera",
                    ].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setAiPrompt(preset)}
                        className="text-[10px] bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.08] text-neutral-400 hover:text-white px-2 py-1 rounded-md transition-colors"
                      >
                        + {preset}
                      </button>
                    ))}
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      onClick={handleRegenerate}
                      disabled={!aiPrompt.trim() || isAiRegenerating}
                      className="px-4 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-300 hover:text-amber-200 font-bold text-xs transition-all flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {isAiRegenerating ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>Rewriting scene...</span>
                        </>
                      ) : (
                        <>
                          <Wand2 className="h-3.5 w-3.5" />
                          <span>AI Rewrite Scene</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Dynamic Live Safety compliance box */}
              <div className="pt-2 border-t border-white/[0.04]">
                {activeSafetyResult.safe ? (
                  <div className="flex items-center gap-2 text-[11px] text-emerald-400 bg-emerald-500/5 border border-emerald-500/10 p-2.5 rounded-xl">
                    <ShieldCheck className="h-4 w-4 text-emerald-400" />
                    <span>
                      <strong>Google Safety Scan:</strong> Clean &amp; policy compliant. Ready for video generation.
                    </span>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-xl border border-amber-500/20 bg-amber-500/5 shadow-inner flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-200 animate-in fade-in slide-in-from-bottom-2 duration-200">
                    <div className="flex items-start gap-2.5">
                      <ShieldAlert className="h-4.5 w-4.5 text-amber-400 shrink-0 mt-0.5 animate-pulse" />
                      <div>
                        <span className="font-bold block text-amber-300">Google Policy Warning</span>
                        <p className="text-[11px] leading-relaxed text-amber-200/70">
                          Keywords like <strong className="text-amber-300 underline">{violatingWords.join(", ")}</strong> may violate Gemini/Veo safety policies.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleAutoRephrase}
                      className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-extrabold text-[11px] transition-all duration-300 shadow-md shadow-amber-950/20 flex items-center gap-1 shrink-0 cursor-pointer"
                    >
                      <Sparkles className="h-3 w-3 fill-black" /> Auto-Rephrase
                    </button>
                  </div>
                )}
              </div>

              {/* Approval CTAs */}
              <div className="flex flex-wrap gap-2.5 pt-2 border-t border-white/[0.04]">
                <button
                  type="button"
                  onClick={handleApproveOnly}
                  className="flex items-center gap-1.5 text-xs font-semibold text-neutral-300 bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.08] px-4 py-2.5 rounded-xl transition-all cursor-pointer"
                >
                  <Lock className="h-3.5 w-3.5 text-neutral-500" /> Lock Screenplay
                </button>
                
                <button
                  type="button"
                  onClick={handleApproveAndGenerate}
                  disabled={isStartingVideo}
                  className="flex items-center gap-1.5 text-xs font-bold text-white bg-gradient-to-r from-[#7c3aed] to-[#06b6d4] hover:opacity-90 px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-violet-900/20 disabled:opacity-50 cursor-pointer"
                >
                  {isStartingVideo ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Queuing Video...
                    </>
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5 fill-white" /> Approve &amp; Generate Video
                    </>
                  )}
                </button>
              </div>

            </div>
          ) : (
            /* Locked Screenplay View */
            <div className="space-y-3 pt-2">
              <div className="rounded-xl bg-emerald-950/15 border border-emerald-900/20 p-4 space-y-1.5">
                <span className="text-[10px] font-bold tracking-widest text-emerald-500 uppercase flex items-center gap-1.5">
                  <Film className="h-3 w-3" /> Visual Direction
                </span>
                <p className="text-sm text-emerald-100/90 leading-relaxed font-light">
                  {scene.visualPrompt}
                </p>
              </div>
              <div className="rounded-xl bg-emerald-950/15 border border-emerald-900/20 p-4 space-y-1.5">
                <span className="text-[10px] font-bold tracking-widest text-emerald-500 uppercase flex items-center gap-1.5">
                  <Volume2 className="h-3 w-3" /> Dialogue / Narration
                </span>
                <p className="text-sm text-emerald-100/90 leading-relaxed font-light">
                  {scene.dialogueOrNarration}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ── Right Column: Video Generation & Playback (cols 2) ── */}
        <div className="lg:col-span-2 flex flex-col justify-center border-t lg:border-t-0 lg:border-l border-white/[0.08] pt-6 lg:pt-0 lg:pl-6 space-y-4">
          <Label className="text-xs font-semibold tracking-wider text-neutral-400 uppercase flex items-center gap-1.5">
            <FileVideo className="h-3.5 w-3.5 text-violet-400" /> Scene Video Clip
          </Label>

          {isGenerating ? (
            /* Generating State */
            <div className="rounded-xl border border-white/[0.06] bg-black/40 p-6 flex flex-col items-center justify-center text-center space-y-4 min-h-[160px] animate-pulse">
              <Loader2 className="h-8 w-8 text-indigo-400 animate-spin" />
              <div className="space-y-1">
                <span className="text-xs font-semibold text-white block">
                  Processing Video
                </span>
                <span className="text-[11px] text-neutral-400 block max-w-[200px] leading-normal">
                  {getStatusMessage()}
                </span>
              </div>
              <div className="w-full bg-white/[0.04] h-1.5 rounded-full overflow-hidden max-w-[150px]">
                <div className="h-full bg-gradient-to-r from-cyan-400 to-indigo-500 rounded-full animate-[shimmer_1.5s_infinite] w-full" />
              </div>
            </div>
          ) : scene.status === "complete" && (scene.clipPath || scene.gcsClipUrl) ? (
            /* Completed Video Playback State */
            <div className="space-y-3">
              <video
                key={scene.clipPath} 
                src={`/api/scene-video/${jobId}/${scene.sceneNumber}`}
                controls
                className="w-full rounded-xl border border-white/[0.1] shadow-lg shadow-black/40 bg-black/60 aspect-video object-cover"
              />
              <button
                onClick={handleGenerateVideo}
                disabled={isStartingVideo}
                className="w-full py-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-neutral-300 hover:text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                {isStartingVideo ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Queuing...
                  </>
                ) : (
                  <>
                    <RotateCw className="h-3.5 w-3.5" /> Regenerate Video Clip
                  </>
                )}
              </button>
            </div>
          ) : scene.status === "error" ? (
            /* Error State */
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 flex flex-col space-y-3">
              <div className="flex items-start gap-2 text-rose-400">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="text-xs font-bold block">Render Failed</span>
                  <p className="text-[11px] leading-relaxed text-rose-300/80 max-h-[75px] overflow-y-auto whitespace-pre-wrap break-words">
                    {scene.error || "An unknown error occurred during video creation."}
                  </p>
                </div>
              </div>
              <button
                onClick={handleGenerateVideo}
                disabled={isStartingVideo}
                className="w-full py-2 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/30 text-rose-200 text-xs font-bold transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                {isStartingVideo ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Queuing...
                  </>
                ) : (
                  <>
                    <RotateCw className="h-3.5 w-3.5" /> Retry Video Generation
                  </>
                )}
              </button>
            </div>
          ) : (
            /* Idle / Initial State */
            <div className="space-y-3">
              {!approved ? (
                <>
                  <div className="rounded-xl border border-dashed border-white/[0.08] bg-black/20 p-6 flex flex-col items-center justify-center text-center space-y-3 min-h-[140px]">
                    <Lock className="h-6 w-6 text-neutral-600 animate-pulse" />
                    <span className="text-xs text-neutral-500 leading-normal max-w-[180px]">
                      Approve and lock this scene to enable video generation.
                    </span>
                  </div>
                  <button
                    disabled
                    className="w-full py-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-neutral-600 text-sm font-bold flex items-center justify-center gap-2 cursor-not-allowed"
                  >
                    <Play className="h-4 w-4 fill-neutral-600" /> Generate Scene Video
                  </button>
                </>
              ) : (
                <>
                  <div className="rounded-xl border border-dashed border-white/[0.08] bg-black/20 p-6 flex flex-col items-center justify-center text-center space-y-3 min-h-[140px]">
                    <FileVideo className="h-7 w-7 text-indigo-400" />
                    <span className="text-xs text-neutral-400 leading-normal max-w-[180px]">
                      Scene approved. Ready to generate video.
                    </span>
                  </div>

                  {!isPrevComplete && (
                    <div className="flex items-start gap-1.5 bg-amber-500/5 border border-amber-500/10 p-2 rounded-lg text-[10px] text-amber-400">
                      <Sparkles className="h-3 w-3 shrink-0 mt-0.5" />
                      <span>
                        For perfect visual flow, generate Scene {scene.sceneNumber - 1} first so this clip starts exactly where that one ends.
                      </span>
                    </div>
                  )}

                  <button
                    onClick={handleGenerateVideo}
                    disabled={isStartingVideo}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-[#7c3aed] to-[#06b6d4] text-white font-bold text-sm shadow-md hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {isStartingVideo ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Queuing video...
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 fill-white" /> Generate Scene Video
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

