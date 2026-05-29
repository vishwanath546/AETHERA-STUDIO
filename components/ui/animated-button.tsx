"use client";
import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface AnimatedButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  status: "idle" | "loading" | "success" | "error";
  loadingText?: string;
  successText?: string;
  errorText?: string;
}

export const AnimatedButton = React.forwardRef<HTMLButtonElement, AnimatedButtonProps>(
  ({ className, status, children, loadingText, successText, errorText, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "relative overflow-hidden rounded-xl font-semibold tracking-wide shadow-lg transition-all duration-300 px-6 py-3",
          status === "idle" ? "bg-white text-black hover:bg-neutral-200 shadow-white/10" : "",
          status === "loading" ? "bg-[#7c3aed] text-white shadow-violet-500/30" : "",
          status === "success" ? "bg-emerald-500 text-white shadow-emerald-500/30" : "",
          status === "error" ? "bg-rose-500 text-white shadow-rose-500/30" : "",
          className
        )}
        disabled={status !== "idle" || props.disabled}
        {...props}
      >
        <AnimatePresence mode="wait">
          {status === "idle" && (
            <motion.div
              key="idle"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex items-center justify-center gap-2"
            >
              {children}
            </motion.div>
          )}
          
          {status === "loading" && (
            <motion.div
              key="loading"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex items-center justify-center gap-2"
            >
              <Loader2 className="h-5 w-5 animate-spin" />
              {loadingText || "Processing..."}
            </motion.div>
          )}

          {status === "success" && (
            <motion.div
              key="success"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="h-5 w-5" />
              {successText || "Success!"}
            </motion.div>
          )}

          {status === "error" && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex items-center justify-center gap-2"
            >
              <AlertCircle className="h-5 w-5" />
              {errorText || "Error"}
            </motion.div>
          )}
        </AnimatePresence>
      </button>
    );
  }
);
AnimatedButton.displayName = "AnimatedButton";
