/**
 * system-paths.ts
 * ───────────────
 * Dynamic resolution of system tool paths (FFmpeg, FFprobe) and system
 * fonts so the project is fully portable across machines / OS versions.
 *
 * Resolution order for FFmpeg:
 *   1. FFMPEG_PATH environment variable (set in .env.local)
 *   2. Well-known WinGet install patterns (glob-safe, works for any version)
 *   3. Common Chocolatey / Scoop / Homebrew locations
 *   4. Plain "ffmpeg" (assumes it is on PATH)
 */

import fs from "fs";
import os from "os";
import path from "path";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function firstExisting(...candidates: string[]): string | null {
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      // ignore
    }
  }
  return null;
}

/**
 * On Windows, WinGet installs ffmpeg under a versioned directory whose name
 * changes with every update. We scan the parent folder so users never have
 * to hard-code a version number.
 */
function findWinGetFFmpeg(): string | null {
  const wingetBase = path.join(
    os.homedir(),
    "AppData",
    "Local",
    "Microsoft",
    "WinGet",
    "Packages"
  );
  if (!fs.existsSync(wingetBase)) return null;

  try {
    const entries = fs.readdirSync(wingetBase);
    for (const entry of entries) {
      if (!entry.toLowerCase().startsWith("gyan.ffmpeg")) continue;
      const pkgDir = path.join(wingetBase, entry);
      // Inside the package dir there is one versioned sub-folder
      const subs = fs.readdirSync(pkgDir);
      for (const sub of subs) {
        const candidate = path.join(pkgDir, sub, "bin", "ffmpeg.exe");
        if (fs.existsSync(candidate)) return candidate;
      }
    }
  } catch {
    // ignore read errors
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// FFmpeg / FFprobe resolution
// ─────────────────────────────────────────────────────────────────────────────

let _cachedFFmpegPath: string | null | undefined = undefined;

/**
 * Returns the full quoted path to ffmpeg (or just "ffmpeg" if it is on PATH).
 * The result is cached after the first call.
 */
export function resolveFFmpeg(): string {
  if (_cachedFFmpegPath !== undefined) return _cachedFFmpegPath as string;

  // 1. Explicit env override
  if (process.env.FFMPEG_PATH) {
    const envPath = process.env.FFMPEG_PATH.replace(/^["']|["']$/g, "");
    _cachedFFmpegPath = `"${envPath}"`;
    console.log(`[system-paths] Using FFMPEG_PATH env: ${_cachedFFmpegPath}`);
    return _cachedFFmpegPath;
  }

  // 2. WinGet auto-discovery (Windows)
  if (os.platform() === "win32") {
    const winget = findWinGetFFmpeg();
    if (winget) {
      _cachedFFmpegPath = `"${winget}"`;
      console.log(`[system-paths] Auto-detected WinGet FFmpeg: ${_cachedFFmpegPath}`);
      return _cachedFFmpegPath;
    }

    // 3. Other common Windows locations
    const windowsCandidates = [
      "C:\\ffmpeg\\bin\\ffmpeg.exe",
      "C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe",
      "C:\\ProgramData\\chocolatey\\bin\\ffmpeg.exe",
      path.join(os.homedir(), "scoop", "apps", "ffmpeg", "current", "bin", "ffmpeg.exe"),
    ];
    const found = firstExisting(...windowsCandidates);
    if (found) {
      _cachedFFmpegPath = `"${found}"`;
      console.log(`[system-paths] Found Windows FFmpeg at: ${_cachedFFmpegPath}`);
      return _cachedFFmpegPath;
    }
  }

  // 4. Linux / macOS common paths
  const unixCandidates = [
    "/usr/bin/ffmpeg",
    "/usr/local/bin/ffmpeg",
    "/opt/homebrew/bin/ffmpeg",
    "/snap/bin/ffmpeg",
  ];
  const unixFound = firstExisting(...unixCandidates);
  if (unixFound) {
    _cachedFFmpegPath = `"${unixFound}"`;
    console.log(`[system-paths] Found Unix FFmpeg at: ${_cachedFFmpegPath}`);
    return _cachedFFmpegPath;
  }

  // 5. Rely on PATH
  _cachedFFmpegPath = "ffmpeg";
  console.log(`[system-paths] Falling back to 'ffmpeg' (assuming it is on PATH).`);
  return _cachedFFmpegPath;
}

/**
 * Returns the full quoted path to ffprobe, derived from the resolved ffmpeg path.
 */
export function resolveFFprobe(): string {
  const ffmpeg = resolveFFmpeg();
  if (ffmpeg.includes("ffmpeg.exe")) {
    return ffmpeg.replace("ffmpeg.exe", "ffprobe.exe");
  }
  if (ffmpeg.includes("/ffmpeg")) {
    return ffmpeg.replace("/ffmpeg", "/ffprobe");
  }
  return "ffprobe";
}

// ─────────────────────────────────────────────────────────────────────────────
// Font resolution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns an FFmpeg-safe font path for use inside drawtext filter expressions.
 * Colons in drive letters are escaped with a backslash as required by the
 * libavfilter drawtext filter.
 */
export function resolveFFmpegFont(preferredFilename = "arial.ttf"): string {
  // 1. Explicit env override
  if (process.env.FFMPEG_FONT_PATH) {
    const raw = process.env.FFMPEG_FONT_PATH.replace(/^["']|["']$/g, "");
    return toFFmpegFontPath(raw);
  }

  const candidates: string[] = [];

  if (os.platform() === "win32") {
    candidates.push(
      path.join(process.env.SystemRoot || "C:\\Windows", "Fonts", preferredFilename),
      path.join(process.env.LOCALAPPDATA || "", "Microsoft", "Windows", "Fonts", preferredFilename),
      `C:\\Windows\\Fonts\\${preferredFilename}`,
    );
  } else if (os.platform() === "darwin") {
    candidates.push(
      `/Library/Fonts/${preferredFilename}`,
      `/System/Library/Fonts/${preferredFilename}`,
      path.join(os.homedir(), "Library", "Fonts", preferredFilename),
    );
  } else {
    // Linux
    candidates.push(
      `/usr/share/fonts/truetype/msttcorefonts/${preferredFilename}`,
      `/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf`,
      `/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf`,
      `/usr/share/fonts/${preferredFilename}`,
    );
  }

  const found = firstExisting(...candidates);
  if (found) return toFFmpegFontPath(found);

  // Ultimate fallback — no fontfile argument (uses FFmpeg's built-in font)
  return "";
}

/**
 * Converts a native OS font path to an FFmpeg drawtext-safe path string.
 * On Windows: C:\Windows\Fonts\arial.ttf → C\:/Windows/Fonts/arial.ttf
 */
function toFFmpegFontPath(nativePath: string): string {
  // Normalise backslashes → forward slashes
  return nativePath.replace(/\\/g, "/");
}
