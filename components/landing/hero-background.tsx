"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

export function HeroBackground() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0 bg-[#05050A]">
      {/* Film Grain Layer */}
      <div className="film-grain" />

      {/* Cyberpunk Grid */}
      <div 
        className="absolute inset-0 opacity-[0.1]" 
        style={{
          backgroundImage: `
            linear-gradient(to right, #00f0ff 1px, transparent 1px),
            linear-gradient(to bottom, #ff00a0 1px, transparent 1px)
          `,
          backgroundSize: "80px 80px",
          transform: "perspective(1000px) rotateX(60deg) translateY(-100px) scale(2)",
          transformOrigin: "top center"
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[#05050A] via-transparent to-[#05050A] opacity-90" />

      {/* Pulsing AI Core */}
      <div className="absolute left-1/2 top-[30%] -translate-x-1/2 -translate-y-1/2">
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.6, 0.3],
          }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#ff00a0] rounded-full blur-[150px] opacity-30"
        />
        <motion.div
          animate={{
            scale: [1, 1.5, 1],
            opacity: [0.4, 0.8, 0.4],
            rotate: [0, 90, 0]
          }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-[#00f0ff] rounded-full blur-[100px] opacity-40 mix-blend-screen"
        />
      </div>
    </div>
  );
}