import { ttsSave } from "edge-tts";
import fs from "fs";
import path from "path";
import { exec, execFile } from "child_process";
import { resolveFFmpeg } from "./system-paths";
import util from "util";

const execPromise = util.promisify(exec);

// Timeout constants
const SAPI_TIMEOUT = 15000; // 15 seconds for Windows SAPI
const EDGE_TTS_TIMEOUT = 20000; // 20 seconds for Edge-TTS
const GOOGLE_TTS_TIMEOUT = 10000; // 10 seconds for Google Translate
const AUDIO_GENERATION_TOTAL_TIMEOUT = 45000; // 45 seconds total timeout

/**
 * Wrap a promise with a timeout
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${operation} timed out after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}

function generateSilentAudio(duration: number, outputPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const ffmpeg = resolveFFmpeg();
      const isMp3 = outputPath.toLowerCase().endsWith(".mp3");
      const codec = isMp3 ? "libmp3lame" : "aac";
      const command = `${ffmpeg} -y -f lavfi -i anullsrc=r=44100:cl=stereo -t ${duration} -c:a ${codec} -b:a 128k "${outputPath}"`;
      
      console.log(`Executing FFmpeg silent audio command: ${command}`);
      exec(command, (error) => {
        if (error) return reject(error);
        resolve(outputPath);
      });
    } catch (e) {
      reject(e);
    }
  });
}

async function fetchGoogleTTS(text: string, outputPath: string): Promise<string> {
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=en&client=tw-ob`;
  
  try {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), GOOGLE_TTS_TIMEOUT);
    
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.0.0 Safari/537.36"
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutHandle);

    if (!response.ok) {
      throw new Error(`Google Translate TTS response status: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    fs.writeFileSync(outputPath, Buffer.from(arrayBuffer));
    return outputPath;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error(`Google Translate TTS request timed out after ${GOOGLE_TTS_TIMEOUT}ms`);
    }
    throw error;
  }
}

async function generateSapiTTS(text: string, outputPath: string): Promise<string> {
  console.log(`Attempting voice generation using Windows SAPI (PowerShell)...`);
  const escapedText = text.replace(/'/g, "''");
  const psCommand = `
    Add-Type -AssemblyName System.Speech;
    $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer;
    $synth.SetOutputToWaveFile('${outputPath}');
    $synth.Speak('${escapedText}');
    $synth.Dispose();
  `;
  
  try {
    await withTimeout(
      execPromise(`powershell -NoProfile -Command "${psCommand.replace(/\n/g, ' ')}"`),
      SAPI_TIMEOUT,
      "Windows SAPI TTS"
    );
  } catch (error) {
    throw error;
  }
  
  if (!fs.existsSync(outputPath)) {
    throw new Error("SAPI TTS failed to create output file.");
  }
  
  // SAPI outputs WAV. We need to convert it to MP3 or whatever the requested extension is if needed, 
  // but FFmpeg can handle WAV perfectly in the pipeline so returning it is fine! 
  // However, the caller expects the exact outputPath filename. If it's .mp3, SAPI still writes WAV format headers.
  // We should enforce conversion using ffmpeg to ensure compatibility.
  const tempWav = outputPath + ".tmp.wav";
  fs.renameSync(outputPath, tempWav);
  
  const ffmpeg = resolveFFmpeg();
  const isMp3 = outputPath.toLowerCase().endsWith(".mp3");
  const codec = isMp3 ? "libmp3lame" : "aac";
  
  try {
    await withTimeout(
      execPromise(`${ffmpeg} -y -i "${tempWav}" -c:a ${codec} -b:a 128k "${outputPath}"`),
      SAPI_TIMEOUT,
      "FFmpeg WAV to MP3 conversion"
    );
  } catch (error) {
    throw error;
  } finally {
    if (fs.existsSync(tempWav)) {
      fs.unlinkSync(tempWav);
    }
  }
  
  if (fs.existsSync(outputPath)) {
    const stats = fs.statSync(outputPath);
    if (stats.size < 2000) { // If it's less than ~2KB, it's just headers and no audio
      fs.unlinkSync(outputPath);
      throw new Error("SAPI TTS generated an empty audio file (likely unsupported characters)");
    }
  } else {
    throw new Error("SAPI TTS failed to create output file.");
  }
  
  return outputPath;
}

export async function generateAudio(
  text: string,
  outputPath: string,
  estimatedDuration: number = 8,
  voice: string = "en-US-GuyNeural"
): Promise<string> {
  try {
    // Ensure parent directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (!text || !text.trim()) {
      console.log(`No narration text provided. Generating silent audio of duration ${estimatedDuration}s...`);
      return await generateSilentAudio(estimatedDuration, outputPath);
    }

    // Strategy 1: Attempt Windows SAPI TTS (Offline, Free, No API Quota!)
    try {
      await generateSapiTTS(text, outputPath);
      console.log(`Successfully generated voice narration using Windows SAPI TTS.`);
      return outputPath;
    } catch (sapiError: any) {
      console.warn(`Windows SAPI TTS failed: ${sapiError.message}. Trying Edge-TTS...`);
    }

    // Strategy 2: Attempt Edge-TTS
    try {
      console.log(`Attempting voice generation using Edge-TTS voice ${voice}...`);
      await ttsSave(text, outputPath, {
        voice: voice,
        rate: "-5%",
        pitch: "+0Hz",
      });
      if (fs.existsSync(outputPath) && fs.statSync(outputPath).size < 2000) {
        fs.unlinkSync(outputPath);
        throw new Error("Edge-TTS generated an empty audio file");
      }
      console.log(`Successfully generated voice narration using Edge-TTS.`);
      return outputPath;
    } catch (edgeError: any) {
      console.warn(`Edge-TTS voice generation failed (code: ${edgeError.message || edgeError}). Trying Google Translate TTS...`);
    }

    // Strategy 3: Attempt Google Translate public TTS endpoint
    try {
      console.log(`Attempting voice generation using Google Translate TTS...`);
      await fetchGoogleTTS(text, outputPath);
      console.log(`Successfully generated voice narration using Google Translate TTS.`);
      return outputPath;
    } catch (googleTTSError: any) {
      console.warn(`Google Translate TTS failed (code: ${googleTTSError.message || googleTTSError}).`);
    }

    // Strategy 4: Local Silent Audio fallback via FFmpeg
    console.warn(`All voice synthesis endpoints failed/blocked. Rendering local silent audio for duration: ${estimatedDuration}s...`);
    return await generateSilentAudio(estimatedDuration, outputPath);

  } catch (error) {
    console.error("Error in generateAudio chain:", error);
    throw error;
  }
}

