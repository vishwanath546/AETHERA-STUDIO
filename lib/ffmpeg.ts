import { exec } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import { resolveFFmpeg, resolveFFprobe } from "./system-paths";

export function getVideoDuration(videoPath: string): Promise<number> {
  return new Promise((resolve) => {
    try {
      const ffprobe = resolveFFprobe();
      const command = `${ffprobe} -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`;
      
      exec(command, (error, stdout) => {
        if (error) {
          console.warn("getVideoDuration: Failed to probe duration, falling back to 8s. Error:", error.message);
          resolve(8);
          return;
        }
        const parsed = parseFloat(stdout.trim());
        resolve(isNaN(parsed) ? 8 : parsed);
      });
    } catch (e) {
      resolve(8);
    }
  });
}

export function checkAudioStatus(videoPath: string): Promise<{ hasAudio: boolean; isSilent: boolean }> {
  return new Promise((resolve) => {
    try {
      const ffmpeg = resolveFFmpeg();
      const ffprobe = resolveFFprobe();
        
      // 1. Check if an audio stream exists
      const streamCmd = `${ffprobe} -v error -select_streams a -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`;
      exec(streamCmd, (err, stdout) => {
        if (err || !stdout.trim()) {
          resolve({ hasAudio: false, isSilent: true });
          return;
        }
        
        // 2. Audio stream exists. Check if it's silent
        const volCmd = `${ffmpeg} -i "${videoPath}" -filter:a volumedetect -f null - 2>&1`;
        exec(volCmd, (volErr, volStdout) => {
          if (volErr) {
            resolve({ hasAudio: true, isSilent: false });
            return;
          }
          const output = volStdout.toString();
          const meanMatch = output.match(/mean_volume:\s*(-?\d+(\.\d+)?)\s*dB/i);
          if (meanMatch) {
            const meanVol = parseFloat(meanMatch[1]);
            if (meanVol < -60) {
              resolve({ hasAudio: true, isSilent: true });
              return;
            }
          }
          resolve({ hasAudio: true, isSilent: false });
        });
      });
    } catch (e) {
      resolve({ hasAudio: false, isSilent: true });
    }
  });
}

/**
 * Selects the ambient background noise filter based on scene keywords.
 * Covers 10 environment types: space, ocean, rain, forest, fire, wind/desert,
 * city/noir, battle/action, indoor room tone, and a generic cinematic default.
 */
function selectBgSynth(d: number, lowerText: string): string {
  if (lowerText.includes("space") || lowerText.includes("galaxy") || lowerText.includes("cosmos") || lowerText.includes("nebula") || lowerText.includes("scifi") || lowerText.includes("sci-fi") || lowerText.includes("cyberpunk")) {
    // Deep sub-bass space drone
    return `anoisesrc=d=${d}:c=pink:r=44100,lowpass=f=60,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,volume=0.07[bg_track]`;
  } else if (lowerText.includes("ocean") || lowerText.includes("sea") || lowerText.includes("waves") || lowerText.includes("shore") || lowerText.includes("beach")) {
    // Rolling ocean waves
    return `anoisesrc=d=${d}:c=brown:r=44100,bandpass=f=250:width=200,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,volume=0.12[bg_track]`;
  } else if (lowerText.includes("rain") || lowerText.includes("storm") || lowerText.includes("thunder") || lowerText.includes("downpour") || lowerText.includes("drizzle")) {
    // Heavy rain pattering
    return `anoisesrc=d=${d}:c=brown:r=44100,bandpass=f=350:width=180,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,volume=0.13[bg_track]`;
  } else if (lowerText.includes("forest") || lowerText.includes("jungle") || lowerText.includes("woods") || lowerText.includes("nature") || lowerText.includes("birds") || lowerText.includes("leaves")) {
    // Ambient forest air with high-frequency rustle
    return `anoisesrc=d=${d}:c=pink:r=44100,bandpass=f=600:width=300,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,volume=0.08[bg_track]`;
  } else if (lowerText.includes("fire") || lowerText.includes("flame") || lowerText.includes("burning") || lowerText.includes("inferno") || lowerText.includes("blaze")) {
    // Crackling fire texture
    return `anoisesrc=d=${d}:c=brown:r=44100,bandpass=f=500:width=400,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,volume=0.10[bg_track]`;
  } else if (lowerText.includes("wind") || lowerText.includes("desert") || lowerText.includes("mountain") || lowerText.includes("cliff") || lowerText.includes("cold") || lowerText.includes("tundra")) {
    // Howling wind
    return `anoisesrc=d=${d}:c=pink:r=44100,bandpass=f=380:width=120,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,volume=0.09[bg_track]`;
  } else if (lowerText.includes("city") || lowerText.includes("street") || lowerText.includes("urban") || lowerText.includes("traffic") || lowerText.includes("noir") || lowerText.includes("neon")) {
    // City rumble + low-frequency urban hum
    return `anoisesrc=d=${d}:c=brown:r=44100,lowpass=f=200,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,volume=0.09[bg_track]`;
  } else if (lowerText.includes("battle") || lowerText.includes("war") || lowerText.includes("fight") || lowerText.includes("combat") || lowerText.includes("action")) {
    // Tense low rumble / tension drone
    return `anoisesrc=d=${d}:c=brown:r=44100,lowpass=f=90,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,volume=0.10[bg_track]`;
  } else if (lowerText.includes("interior") || lowerText.includes("int.") || lowerText.includes("indoor") || lowerText.includes("room") || lowerText.includes("office") || lowerText.includes("house") || lowerText.includes("hall")) {
    // Subtle room tone
    return `anoisesrc=d=${d}:c=pink:r=44100,lowpass=f=150,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,volume=0.03[bg_track]`;
  } else {
    // Generic cinematic air
    return `anoisesrc=d=${d}:c=pink:r=44100,lowpass=f=130,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,volume=0.05[bg_track]`;
  }
}

/**
 * Selects an optional SFX layer based on scene keywords.
 * Covers 8 categories: explosion/blast, crash/shatter, gunshot, whoosh/speed,
 * laser/energy beam, alarm/beep, thunder/lightning, heartbeat/suspense.
 */
function selectSfx(d: number, lowerText: string): string | null {
  if (lowerText.includes("explosion") || lowerText.includes("boom") || lowerText.includes("blast") || lowerText.includes("bomb") || lowerText.includes("detonate")) {
    return `anoisesrc=d=${Math.min(d, 3.5)}:c=brown:r=44100,lowpass=f=90,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,volume=0.7[sfx_track]`;
  } else if (lowerText.includes("crash") || lowerText.includes("shatter") || lowerText.includes("smash") || lowerText.includes("breaking") || lowerText.includes("shards")) {
    return `anoisesrc=d=${Math.min(d, 2.0)}:c=white:r=44100,bandpass=f=1200:width=800,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,volume=0.5[sfx_track]`;
  } else if (lowerText.includes("gunshot") || lowerText.includes("gunfire") || lowerText.includes("pistol") || lowerText.includes("rifle") || lowerText.includes("shot fired")) {
    return `anoisesrc=d=0.3:c=white:r=44100,lowpass=f=3000,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,volume=0.8[sfx_track]`;
  } else if (lowerText.includes("whoosh") || lowerText.includes("swoosh") || lowerText.includes("fly") || lowerText.includes("zoom") || lowerText.includes("dash") || lowerText.includes("speed")) {
    return `anoisesrc=d=${Math.min(d, 1.5)}:c=pink:r=44100,bandpass=f=320:width=200,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,volume=0.45[sfx_track]`;
  } else if (lowerText.includes("laser") || lowerText.includes("beam") || lowerText.includes("energy") || lowerText.includes("plasma") || lowerText.includes("photon")) {
    return `sine=d=${Math.min(d, 0.8)}:f=1100:r=44100,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,volume=0.3[sfx_track]`;
  } else if (lowerText.includes("beep") || lowerText.includes("alert") || lowerText.includes("alarm") || lowerText.includes("notification") || lowerText.includes("signal tone")) {
    return `sine=d=${Math.min(d, 0.5)}:f=880:r=44100,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,volume=0.25[sfx_track]`;
  } else if (lowerText.includes("thunder") || lowerText.includes("lightning") || lowerText.includes("rumble")) {
    return `anoisesrc=d=${Math.min(d, 2.0)}:c=brown:r=44100,lowpass=f=120,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,volume=0.65[sfx_track]`;
  } else if (lowerText.includes("heartbeat") || lowerText.includes("pulse") || lowerText.includes("tense") || lowerText.includes("suspense") || lowerText.includes("horror")) {
    return `sine=d=${d}:f=60:r=44100,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,volume=0.15[sfx_track]`;
  }
  return null;
}

export async function assembleClip(
  visualPath: string,
  audioPath: string,
  srtPath: string,
  outputPath: string,
  estimatedDuration: number,
  options: { burnSubtitles?: boolean; sceneText?: string } = {}
): Promise<string> {
  // Determine if it is a video (Veo clip) or a static storyboard fallback card
  const isVeoVideo = visualPath.toLowerCase().endsWith("_raw.mp4");
  const burnSubtitles = options.burnSubtitles ?? false;
  const sceneText = options.sceneText ?? "";
  // lowerText already includes audioPrompt because sceneText is composed as:
  // visualPrompt + " " + dialogueOrNarration + " " + audioPrompt in production-pipeline.ts
  const lowerText = sceneText.toLowerCase();
  
  let clipDuration = estimatedDuration;
  let hasNativeAudio = false;
  let isNativeSilent = true;

  if (isVeoVideo) {
    // Determine actual duration of the generated video clip
    clipDuration = await getVideoDuration(visualPath);
    console.log(`FFmpeg: Detected Veo video duration is ${clipDuration}s (estimated was ${estimatedDuration}s).`);
    
    // Check if the generated video clip has non-silent audio
    const audioStatus = await checkAudioStatus(visualPath);
    hasNativeAudio = audioStatus.hasAudio;
    isNativeSilent = audioStatus.isSilent;
    console.log(`FFmpeg: Veo audio status -> Has Audio: ${hasNativeAudio}, Is Silent: ${isNativeSilent}`);
  }

  return new Promise((resolve, reject) => {
    try {
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const ffmpeg = resolveFFmpeg();
      const escapedSrtPath = srtPath.replace(/\\/g, "/").replace(/:/g, "\\:");

      const bgSynth = selectBgSynth(clipDuration, lowerText);
      const sfxSynth = selectSfx(clipDuration, lowerText);

      // ─── BRANCH A: Veo video clip ─────────────────────────────────────────
      if (isVeoVideo) {
        const videoFilter = burnSubtitles
          ? `[0:v]scale=1920x1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,subtitles='${escapedSrtPath}':force_style='FontSize=16,PrimaryColour=&H00FFFFFF,OutlineColour=&H80000000,BorderStyle=3,Outline=1,MarginV=28'[v_out]`
          : `[0:v]scale=1920x1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2[v_out]`;

        let audioFilter = "";

        if (hasNativeAudio && !isNativeSilent) {
          // Keep native Veo dialogue/vocals — boost it and layer atmospheric bg + optional SFX on top
          if (sfxSynth) {
            audioFilter = `${bgSynth};${sfxSynth};` +
              `[0:a]aresample=44100,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,volume=1.5[veo_audio];` +
              `[veo_audio][bg_track][sfx_track]amix=inputs=3:duration=first:normalize=0[a_mixed]`;
          } else {
            audioFilter = `${bgSynth};` +
              `[0:a]aresample=44100,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,volume=1.5[veo_audio];` +
              `[veo_audio][bg_track]amix=inputs=2:duration=first:normalize=0[a_mixed]`;
          }
        } else {
          // Veo clip is silent — layer TTS voice-over + ambient background + optional SFX
          if (sfxSynth) {
            audioFilter = `${bgSynth};${sfxSynth};` +
              `[1:a]aresample=44100,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,volume=1.8[tts_voice];` +
              `[tts_voice][bg_track][sfx_track]amix=inputs=3:duration=first:normalize=0[a_mixed]`;
          } else {
            audioFilter = `${bgSynth};` +
              `[1:a]aresample=44100,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,volume=1.8[tts_voice];` +
              `[tts_voice][bg_track]amix=inputs=2:duration=first:normalize=0[a_mixed]`;
          }
        }

        const filterComplex = `${audioFilter};${videoFilter}`;

        const command = `${ffmpeg} -y -t ${clipDuration} -i "${visualPath}" -i "${audioPath}" ` +
          `-filter_complex "${filterComplex}" -map "[v_out]" -map "[a_mixed]" ` +
          `-c:v libx264 -preset fast -pix_fmt yuv420p -c:a aac -b:a 192k "${outputPath}"`;

        console.log(`Executing FFmpeg Veo-native command:\n${command}`);
        exec(command, (error, stdout, stderr) => {
          if (error) {
            console.error("FFmpeg assembleClip (Veo) error:", error);
            console.error("FFmpeg stderr:", stderr);
            return reject(error);
          }
          resolve(outputPath);
        });
        return;
      }

      // ─── BRANCH B: Static storyboard image (Ken Burns zoom + TTS voice + ambient + SFX) ─────
      let audioFilter = "";
      if (sfxSynth) {
        audioFilter = `${bgSynth};${sfxSynth};` +
          `[1:a]aresample=44100,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,volume=1.8[dialogue];` +
          `[dialogue][bg_track][sfx_track]amix=inputs=3:duration=first:normalize=0[a_mixed]`;
      } else {
        audioFilter = `${bgSynth};` +
          `[1:a]aresample=44100,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,volume=1.8[dialogue];` +
          `[dialogue][bg_track]amix=inputs=2:duration=first:normalize=0[a_mixed]`;
      }

      const videoFilter = burnSubtitles
        ? `[0:v]scale=2560x1440,zoompan=z='min(zoom+0.0008,1.25)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${Math.ceil(clipDuration * 30)}:s=1920x1080:fps=30[v_zoomed];[v_zoomed]subtitles='${escapedSrtPath}':force_style='FontSize=16,PrimaryColour=&H00FFFFFF,OutlineColour=&H80000000,BorderStyle=3,Outline=1,MarginV=28'[v_out]`
        : `[0:v]scale=2560x1440,zoompan=z='min(zoom+0.0008,1.25)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${Math.ceil(clipDuration * 30)}:s=1920x1080:fps=30[v_out]`;

      const filterComplex = `${audioFilter};${videoFilter}`;

      const command = `${ffmpeg} -y -loop 1 -t ${clipDuration} -i "${visualPath}" -i "${audioPath}" ` +
        `-filter_complex "${filterComplex}" -map "[v_out]" -map "[a_mixed]" ` +
        `-c:v libx264 -preset fast -pix_fmt yuv420p -c:a aac -b:a 192k -shortest "${outputPath}"`;

      console.log(`Executing FFmpeg image-clip command:\n${command}`);
      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error("FFmpeg assembleClip (image) error:", error);
          console.error("FFmpeg stderr:", stderr);
          return reject(error);
        }
        resolve(outputPath);
      });
    } catch (err) {
      reject(err);
    }
  });
}

export async function concatenateClips(clipPaths: string[], outputPath: string): Promise<string> {
  return new Promise(async (resolve, reject) => {
    try {
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const ffmpeg = resolveFFmpeg();

      if (clipPaths.length === 0) {
        return reject(new Error("No clips provided to concatenate."));
      }

      if (clipPaths.length === 1) {
        const command = `${ffmpeg} -y -i "${clipPaths[0].replace(/\\/g, "/")}" -c copy "${outputPath}"`;
        exec(command, (error) => {
          if (error) return reject(error);
          resolve(outputPath);
        });
        return;
      }

      // Generate a temporary text file for the concat demuxer
      const listPath = path.join(dir, "concat_list.txt");
      const listContent = clipPaths.map(p => `file '${p.replace(/\\/g, "/")}'`).join("\n");
      fs.writeFileSync(listPath, listContent, "utf8");

      // Use the concat demuxer to merge without re-encoding (instantaneous)
      const command = `${ffmpeg} -y -f concat -safe 0 -i "${listPath.replace(/\\/g, "/")}" -c copy "${outputPath}"`;

      console.log(`Executing FFmpeg fast concat command:\n${command}`);

      exec(command, (error, stdout, stderr) => {
        // Clean up the temporary list file
        if (fs.existsSync(listPath)) {
          fs.unlinkSync(listPath);
        }

        if (error) {
          console.error("FFmpeg concatenateClips (concat demuxer) error:", error);
          console.error("FFmpeg stderr:", stderr);
          return reject(error);
        }
        resolve(outputPath);
      });
    } catch (err) {
      reject(err);
    }
  });
}

export function extractLastFrame(videoPath: string, outputPath: string): Promise<string> {
  return new Promise(async (resolve, reject) => {
    try {
      const duration = await getVideoDuration(videoPath);
      const seekTime = Math.max(0, duration - 0.2); // Seek 0.2 seconds before the end
      const ffmpeg = resolveFFmpeg();
      // Extract one frame at seekTime
      const command = `${ffmpeg} -y -ss ${seekTime} -i "${videoPath}" -vframes 1 -q:v 2 "${outputPath}"`;
      
      console.log(`FFmpeg: Extracting last frame at ${seekTime}s of ${videoPath} to ${outputPath}`);
      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error("extractLastFrame failed:", error);
          return reject(error);
        }
        resolve(outputPath);
      });
    } catch (e) {
      reject(e);
    }
  });
}

