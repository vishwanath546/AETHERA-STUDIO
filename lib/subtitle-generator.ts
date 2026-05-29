import fs from "fs";
import path from "path";

export function generateSRT(text: string, duration: number, outputPath: string): string {
  try {
    // Ensure parent directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (!text || !text.trim()) {
      fs.writeFileSync(outputPath, "", "utf-8");
      return outputPath;
    }

    const words = text.split(/\s+/);
    const chunks: string[] = [];
    let currentChunk: string[] = [];

    // Group words into chunks of max 40 characters or 7 words
    for (const word of words) {
      const prospectiveChunk = [...currentChunk, word].join(" ");
      if (prospectiveChunk.length > 40 || currentChunk.length >= 7) {
        if (currentChunk.length > 0) {
          chunks.push(currentChunk.join(" "));
          currentChunk = [word];
        } else {
          chunks.push(word);
        }
      } else {
        currentChunk.push(word);
      }
    }
    if (currentChunk.length > 0) {
      chunks.push(currentChunk.join(" "));
    }

    // Proportional timing calculation
    const totalChars = chunks.reduce((sum, chunk) => sum + chunk.length, 0) || 1;
    let accumulatedTime = 0;
    let srtContent = "";

    chunks.forEach((chunk, index) => {
      const chunkDuration = (chunk.length / totalChars) * duration;
      const startTime = accumulatedTime;
      const endTime = accumulatedTime + chunkDuration;
      accumulatedTime = endTime;

      const startTimestamp = formatSRTTime(startTime);
      const endTimestamp = formatSRTTime(endTime);

      srtContent += `${index + 1}\n`;
      srtContent += `${startTimestamp} --> ${endTimestamp}\n`;
      srtContent += `${chunk}\n\n`;
    });

    fs.writeFileSync(outputPath, srtContent, "utf-8");
    return outputPath;
  } catch (error) {
    console.error("Error in generateSRT:", error);
    throw error;
  }
}

function formatSRTTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);

  const pad = (num: number, size: number) => num.toString().padStart(size, "0");

  return `${pad(hrs, 2)}:${pad(mins, 2)}:${pad(secs, 2)},${pad(ms, 3)}`;
}
