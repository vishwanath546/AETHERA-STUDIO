"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { HeroBackground } from "@/components/landing/hero-background";
import { AnimatedButton } from "@/components/ui/animated-button";
import { Film, Sparkles, Clapperboard, HelpCircle, Lightbulb } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const PRESETS = [
  {
    title: "Neo-Tokyo Noir",
    prompt: "A gritty cyberpunk detective wanders through the neon-drenched streets of Neo-Tokyo in heavy rain, looking for a rogue AI courier. Rich atmospheric shadows, glowing magenta holograms, and retro-futuristic vibes.",
  },
  {
    title: "Highland Solitude",
    prompt: "A cozy stone cottage nestled in the misty, rolling green hills of the Scottish Highlands during a gentle autumn drizzle. Smoke curling from the chimney, warm amber lights inside, quiet and serene.",
  },
  {
    title: "Black Hole Horizon",
    prompt: "An epic space explorer vessel navigating the intense, golden accretion disk of a supermassive black hole. Time dilation effects, warped light, high stakes science fiction realism.",
  },
];

export default function Home() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [sceneCount, setSceneCount] = useState([2]);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  // const [movies, setMovies] = useState<Array<{ id: string; prompt: string; createdAt: string }>>([]);

  // useEffect(() => {
  //   let mounted = true;
  //   (async () => {
  //     try {
  //       const res = await fetch("/api/jobs");
  //       if (!res.ok) return;
  //       const data = await res.json();
  //       if (!mounted) return;
  //       const completed = (data.jobs || []).filter((j: any) => j.status === "completed" && j.finalVideoPath);
  //       setMovies(completed);
  //     } catch (e) {
  //       // ignore
  //     }
  //   })();
  //   return () => { mounted = false };
  // }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setStatus("loading");
    setErrorMessage("");

    try {
      const response = await fetch("/api/generate-script", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: prompt.trim(),
          sceneCount: sceneCount[0],
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to generate script");
      }

      const data = await response.json();
      setStatus("success");
      
      // Short delay for satisfying success animation before redirecting
      setTimeout(() => {
        router.push(`/studio/${data.jobId}/script`);
      }, 1000);
    } catch (err: any) {
      console.error(err);
      setStatus("error");
      setErrorMessage(err.message || "An unexpected error occurred. Please try again.");
      setTimeout(() => setStatus("idle"), 4000);
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col justify-between overflow-hidden bg-[#030307]">
      <HeroBackground />

      {/* Main Header */}
      <header className="relative z-10 w-full max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-[#7c3aed] to-[#06b6d4] flex items-center justify-center shadow-lg shadow-violet-500/20">
            <Clapperboard className="h-5 w-5 text-white animate-pulse" />
          </div>
          <span className="font-heading text-xl font-bold tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-white via-neutral-200 to-neutral-500">
            AETHERA <span className="text-[#06b6d4]">STUDIO</span>
          </span>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-xs font-semibold tracking-widest text-[#7c3aed] bg-[#7c3aed]/10 border border-[#7c3aed]/20 px-3 py-1 rounded-full uppercase">
            Gemini Core
          </span>
        </div>
      </header>

      {/* Hero Content */}
      <main className="relative z-10 w-full max-w-4xl mx-auto px-6 py-12 flex-1 flex flex-col items-center justify-center text-center">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="space-y-4"
        >
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-violet-500/30 bg-violet-500/5 text-violet-300 text-xs font-medium tracking-wide">
            <Sparkles className="h-3.5 w-3.5 text-[#06b6d4]" />
            Complete AI Movie Studio — Screenwriting to Production
          </div>

          <h1 className="font-heading text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight leading-none text-glow select-none">
            Unleash Your <br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-white via-[#a78bfa] to-[#06b6d4]">
              Cinematic Vision
            </span>
          </h1>

          <p className="max-w-2xl mx-auto text-neutral-400 text-base sm:text-lg leading-relaxed font-light">
            Write a simple description. Aethera will generate an intricate multi-scene script, record rich narrated voices, and assemble a breathtaking movie with cinematic Ken Burns pacing and burned-in subtitles.
          </p>
        </motion.div>

        {/* Input Panel */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.15 }}
          className="w-full mt-10"
        >
          <Card className="glass-panel-glow p-6 sm:p-8 text-left space-y-6 overflow-hidden relative">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Text Prompt */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold tracking-wider text-neutral-300 uppercase flex items-center gap-2">
                    <Film className="h-4 w-4 text-[#7c3aed]" /> Describe your movie
                  </label>
                  <Tooltip>
                    <TooltipTrigger
                      type="button"
                      suppressHydrationWarning
                      className="text-neutral-500 hover:text-neutral-300 transition-colors cursor-pointer"
                    >
                      <HelpCircle className="h-4 w-4" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="bg-[#0c0c14] border-neutral-800 text-neutral-300">
                      Explain the plot, characters, setting, and emotional tone.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g., A lone astronaut discovers an ancient glowing obelisk on Mars that begins transmitting a signal..."
                  className="min-h-[140px] max-h-[300px] bg-black/40 border-white/[0.08] focus:border-[#7c3aed]/50 text-white rounded-xl placeholder:text-neutral-600 text-base resize-y transition-all duration-300 focus:ring-0"
                />
              </div>

              {/* Slider for Scene Count */}
              <div className="space-y-4 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold tracking-wider text-neutral-300 uppercase flex items-center gap-2">
                    <Clapperboard className="h-4 w-4 text-[#06b6d4]" /> Movie Duration
                  </span>
                  <span className="text-sm font-bold text-[#06b6d4] bg-[#06b6d4]/10 border border-[#06b6d4]/20 px-3 py-1 rounded-md">
                    {sceneCount[0]} Scenes (~{sceneCount[0] * 8}s movie)
                  </span>
                </div>
                <Slider
                  min={1}
                  max={12}
                  step={1}
                  value={sceneCount}
                  onValueChange={(value) =>
                    setSceneCount(Array.isArray(value) ? value : [value])
                  }
                  className="py-2"
                />
                <div className="flex justify-between text-xs text-neutral-500 px-1">
                  <span>Short Clip (1 scene)</span>
                  <span>Featurette (12 scenes)</span>
                </div>
                <div className="text-[11px] text-[#06b6d4]/80 flex items-center gap-1.5 bg-[#06b6d4]/5 border border-[#06b6d4]/10 p-2.5 rounded-lg mt-2 select-none">
                  <Sparkles className="h-3.5 w-3.5 text-[#06b6d4] shrink-0" />
                  <span>Tip: Lower scene counts and choosing "Fast Mode" reduces API token usage and speeds up movie construction!</span>
                </div>
              </div>

              {/* Error Display */}
              {errorMessage && (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm">
                  {errorMessage}
                </div>
              )}

              {/* Submit Button */}
              <div className="pt-2 flex justify-center sm:justify-end">
                <AnimatedButton
                  status={status}
                  loadingText="Scriptwriting via Gemini..."
                  successText="Screenplay Completed!"
                  errorText="Error Generating Script"
                  disabled={!prompt.trim()}
                  className="w-full sm:w-auto min-w-[200px]"
                >
                  Write Screenplay
                </AnimatedButton>
              </div>
            </form>

            {/* Presets / Prompts */}
            <div className="border-t border-white/[0.05] pt-6 space-y-3">
              <span className="text-xs font-semibold tracking-widest text-neutral-500 uppercase flex items-center gap-1.5">
                <Lightbulb className="h-3.5 w-3.5 text-amber-400" /> Need inspiration? Try these presets:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {PRESETS.map((preset, index) => (
                  <button
                    key={index}
                    type="button"
                    suppressHydrationWarning
                    onClick={() => {
                      setPrompt(preset.prompt);
                    }}
                    className="p-3 text-left rounded-xl bg-white/[0.02] border border-white/[0.04] hover:bg-[#7c3aed]/5 hover:border-[#7c3aed]/30 transition-all duration-300 group cursor-pointer"
                  >
                    <span className="block text-xs font-bold text-neutral-300 group-hover:text-white transition-colors">
                      {preset.title}
                    </span>
                    <span className="block text-[11px] text-neutral-500 line-clamp-2 mt-1">
                      {preset.prompt}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </Card>
        </motion.div>

        {/* Recent Movies */}
        {/* {movies.length > 0 && (
          <div className="w-full mt-8 max-w-5xl mx-auto px-6">
            <h3 className="text-lg font-semibold text-white mb-4">Recent Movies</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {movies.map((m) => (
                <div key={m.id} className="bg-white/[0.03] border border-white/[0.04] rounded-xl overflow-hidden">
                  <video
                    controls
                    className="w-full h-48 object-cover bg-black"
                    src={`/api/download/${m.id}?inline=true`}
                  />
                  <div className="p-3">
                    <div className="text-sm font-semibold text-neutral-100 line-clamp-2">{m.prompt}</div>
                    <div className="text-xs text-neutral-500 mt-1">{new Date(m.createdAt).toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )} */}
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full max-w-7xl mx-auto px-6 py-8 border-t border-white/[0.03] text-center text-xs text-neutral-500 flex flex-col sm:flex-row items-center justify-between gap-4">
        <span>© {new Date().getFullYear()} Aethera Studio. Powered exclusively by Gemini API.</span>
        <div className="flex gap-4">
          <span className="hover:text-neutral-400 transition-colors">Terms of Production</span>
          <span className="hover:text-neutral-400 transition-colors">Studio Privacy</span>
        </div>
      </footer>
    </div>
  );
}
