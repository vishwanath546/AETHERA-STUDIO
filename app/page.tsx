"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { HeroBackground } from "@/components/landing/hero-background";
import { AnimatedButton } from "@/components/ui/animated-button";
import { Film, Sparkles, Clapperboard, HelpCircle, Lightbulb, User, Plus, Trash2, ChevronDown } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const LANGUAGES = ["English", "Spanish", "French", "German", "Japanese", "Korean", "Hindi", "Marathi", "Arabic", "Mandarin (Chinese)", "Italian"];

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
  const [language, setLanguage] = useState("English");
  
  const [characters, setCharacters] = useState<any[]>([]);
  const [newCharName, setNewCharName] = useState("");
  const [newCharImage, setNewCharImage] = useState<File | null>(null);

  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [movies, setMovies] = useState<Array<{ id: string; prompt: string; createdAt: string }>>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/jobs?t=" + Date.now());
        if (!res.ok) return;
        const data = await res.json();
        if (!mounted) return;
        const completed = (data.jobs || []).filter((j: any) => j.status === "completed" && j.finalVideoPath);
        setMovies(completed);
      } catch (e) {
        // ignore
      }
    })();
    return () => { mounted = false };
  }, []);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (status === "loading") {
        e.preventDefault();
        e.returnValue = "You are currently generating a screenplay. Are you sure you want to discard it and leave?";
        return e.returnValue;
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [status]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setNewCharImage(e.target.files[0]);
    }
  };

  const handleAddCharacter = async () => {
    if (newCharName && newCharImage) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setCharacters([...characters, { name: newCharName, imageBase64: reader.result }]);
        setNewCharName("");
        setNewCharImage(null);
        // Clear the file input visually
        const fileInput = document.getElementById("char-image-input") as HTMLInputElement;
        if (fileInput) fileInput.value = "";
      };
      reader.readAsDataURL(newCharImage);
    }
  };

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
          language,
          characters
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
    <div className="relative min-h-screen flex flex-col justify-between bg-[#030307]">
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
                </div>
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g., A lone astronaut discovers an ancient glowing obelisk on Mars that begins transmitting a signal..."
                  className="min-h-[120px] max-h-[300px] bg-black/40 border-white/[0.08] focus:border-[#7c3aed]/50 text-white rounded-xl placeholder:text-neutral-600 text-base resize-y transition-all duration-300 focus:ring-0"
                />
              </div>
              
              {/* Characters */}
              <div className="space-y-2">
                <label className="text-sm font-semibold tracking-wider text-neutral-300 uppercase flex items-center gap-2">
                  <User className="h-4 w-4 text-[#06b6d4]" /> Cast & Characters
                </label>
                <div className="flex flex-col sm:flex-row gap-4">
                  <input type="text" className="bg-black/40 border border-white/[0.08] focus:border-[#7c3aed]/50 text-white rounded-md placeholder:text-neutral-600 px-3 py-2 flex-1" placeholder="Character Name" value={newCharName} onChange={(e) => setNewCharName(e.target.value)} />
                  <input id="char-image-input" type="file" accept="image/*" className="text-white text-xs pt-2" onChange={handleImageUpload} />
                  <button type="button" onClick={handleAddCharacter} disabled={!newCharName || !newCharImage} className="bg-white/5 border border-white/10 hover:bg-white/10 text-white px-4 py-2 rounded-md disabled:opacity-50"><Plus className="h-4 w-4"/></button>
                </div>
                
                {characters.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                    {characters.map((c, i) => (
                      <div key={i} className="bg-white/[0.03] border border-white/[0.05] p-3 flex justify-between items-center rounded-lg">
                        <div className="flex items-center gap-4">
                          <img src={c.imageBase64} className="h-12 w-12 object-cover rounded shadow-lg shadow-black/50 border border-white/10" alt={c.name} />
                          <span className="text-sm font-semibold tracking-wide text-white">{c.name}</span>
                        </div>
                        <button type="button" onClick={() => setCharacters(characters.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-300 p-2"><Trash2 className="h-4 w-4"/></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Slider for Scene Count & Language */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold tracking-wider text-neutral-300 uppercase flex items-center gap-2">
                      <Clapperboard className="h-4 w-4 text-[#7c3aed]" /> Duration
                    </span>
                    <span className="text-xs font-bold text-[#7c3aed] bg-[#7c3aed]/10 border border-[#7c3aed]/20 px-2 py-1 rounded-md">
                      {sceneCount[0]} Scenes
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
                </div>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold tracking-wider text-neutral-300 uppercase flex items-center gap-2">
                      Language
                    </span>
                  </div>
                  <div className="relative">
                    <select value={language} onChange={(e) => setLanguage(e.target.value)} className="w-full bg-black/40 border border-white/[0.08] focus:border-[#7c3aed]/50 text-white rounded-md appearance-none px-3 py-2 text-sm">
                      {LANGUAGES.map(l => <option key={l} value={l} className="bg-black text-white">{l}</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-2.5 h-4 w-4 text-zinc-400 pointer-events-none" />
                  </div>
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
        {movies.length > 0 && (
          <div className="w-full mt-12 max-w-5xl mx-auto px-6 mb-8">
            <h3 className="text-xl font-bold text-white mb-6 text-left border-b border-white/10 pb-2 flex items-center gap-2">
              <Film className="h-5 w-5 text-[#06b6d4]" /> Your Cinematic Universe
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {movies.map((m) => (
                <div key={m.id} className="bg-[#0a0a0f] border border-white/[0.08] hover:border-[#7c3aed]/50 transition-colors rounded-xl overflow-hidden shadow-xl">
                  <video
                    controls
                    className="w-full h-56 object-cover bg-black"
                    src={`/api/download/${m.id}?inline=true&t=${Date.now()}`}
                  />
                  <div className="p-4 text-left">
                    <div className="text-sm font-semibold text-neutral-100 line-clamp-2 leading-relaxed">{m.prompt}</div>
                    <div className="text-xs text-neutral-500 mt-3 flex items-center gap-2">
                      <Sparkles className="h-3 w-3 text-[#7c3aed]"/>
                      {new Date(m.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full max-w-7xl mx-auto px-6 py-8 border-t border-white/[0.03] text-center text-xs text-neutral-500 flex flex-col sm:flex-row items-center justify-between gap-4">
        <span>© {new Date().getFullYear()} Aethera Studio. Powered exclusively by Gemini API.</span>
      </footer>
    </div>
  );
}