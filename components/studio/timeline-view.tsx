"use client";

import React from "react";
import { Film, Clapperboard, Clock, Sparkles } from "lucide-react";
import { Scene } from "@/lib/job-store";

interface TimelineViewProps {
  scenes: Scene[];
}

export function TimelineView({ scenes }: TimelineViewProps) {
  // Sum up estimated duration
  const totalDuration = scenes.reduce((sum, s) => sum + s.estimatedDuration, 0);

  const scrollToScene = (sceneNumber: number) => {
    const element = document.getElementById(`scene-card-${sceneNumber}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  return (
    <div className="glass-panel p-5 sticky top-8 space-y-6 overflow-hidden rounded-xl">
      <div className="flex items-center gap-2 border-b border-white/[0.05] pb-4">
        <Clapperboard className="h-5 w-5 text-[#06b6d4]" />
        <h3 className="font-heading font-bold text-white tracking-wide">
          Movie Timeline
        </h3>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white/[0.02] border border-white/[0.04] p-3.5 rounded-xl space-y-1">
          <span className="text-[10px] font-semibold tracking-wider text-neutral-500 uppercase block">
            Scene Count
          </span>
          <span className="text-xl font-extrabold text-[#7c3aed] font-heading block">
            {scenes.length}
          </span>
        </div>

        <div className="bg-white/[0.02] border border-white/[0.04] p-3.5 rounded-xl space-y-1">
          <span className="text-[10px] font-semibold tracking-wider text-neutral-500 uppercase block">
            Total Length
          </span>
          <span className="text-xl font-extrabold text-[#06b6d4] font-heading block">
            ~{totalDuration}s
          </span>
        </div>
      </div>

      {/* Mini Interactive Dot Timeline */}
      <div className="space-y-4 pt-2">
        <span className="text-[10px] font-semibold tracking-wider text-neutral-500 uppercase block">
          Visual Chronology
        </span>

        <div className="relative pl-4 space-y-5 border-l border-white/[0.06] ml-2">
          {scenes.map((scene) => (
            <button
              key={scene.sceneNumber}
              onClick={() => scrollToScene(scene.sceneNumber)}
              className="flex items-center gap-3 w-full text-left group transition-all duration-300 relative cursor-pointer"
            >
              {/* Connecting node dot */}
              <div className="absolute left-[-21px] top-1.5 h-2.5 w-2.5 rounded-full bg-neutral-700 border border-black group-hover:bg-[#06b6d4] group-hover:border-[#06b6d4]/50 group-hover:scale-125 transition-all duration-300" />
              
              <div className="space-y-0.5">
                <span className="block text-xs font-semibold text-neutral-400 group-hover:text-white transition-colors">
                  Scene {scene.sceneNumber}
                </span>
                <span className="block text-[10px] text-neutral-600 group-hover:text-[#06b6d4] transition-colors truncate max-w-[170px]">
                  {scene.visualPrompt || "Empty visual prompt..."}
                </span>
              </div>

              <span className="text-[10px] text-neutral-500 font-mono ml-auto bg-white/[0.02] px-1.5 py-0.5 rounded border border-white/[0.04]">
                {scene.estimatedDuration}s
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-white/[0.05] pt-4 flex items-center gap-2 text-[10px] text-neutral-500 leading-relaxed">
        <Sparkles className="h-3.5 w-3.5 text-amber-500 shrink-0" />
        <span>Click on any scene above to instantly center and edit it.</span>
      </div>
    </div>
  );
}
