import fs from "fs";
import path from "path";

export interface Scene {
  sceneNumber: number;
  visualPrompt: string;
  dialogueOrNarration: string;
  estimatedDuration: number;
  audioPrompt?: string;
}

export interface SceneJob extends Scene {
  status: "idle" | "queued" | "generating_image" | "generating_audio" | "assembling_clip" | "complete" | "error";
  approved?: boolean;
  imagePath?: string;
  audioPath?: string;
  srtPath?: string;
  clipPath?: string;
  gcsClipUrl?: string;
  error?: string;
}

export interface Job {
  id: string;
  status: "draft" | "queued" | "producing" | "ready_to_merge" | "merging" | "completed" | "error";
  prompt: string;
  sceneCount: number;
  scenes: SceneJob[];
  createdAt: string;
  finalVideoPath?: string;
  gcsFinalUrl?: string;
  error?: string;
  sceneSequence?: number[];
  characters?: any[];
}

const SAVE_PATH = path.join(process.cwd(), "temp", "job-store.json");

let lastLoadedTime = 0;

function loadJobsFromFile(): Map<string, Job> {
  const store = new Map<string, Job>();
  try {
    if (fs.existsSync(SAVE_PATH)) {
      const data = fs.readFileSync(SAVE_PATH, "utf8");
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        for (const [key, value] of parsed) {
          store.set(key, value);
        }
      }
      console.log(`Loaded ${store.size} jobs from disk cache.`);
      const stats = fs.statSync(SAVE_PATH);
      lastLoadedTime = stats.mtimeMs;
    }
  } catch (err) {
    console.error("Failed to load jobs from disk cache:", err);
  }
  return store;
}

function saveJobsToFile(store: Map<string, Job>) {
  try {
    const dir = path.dirname(SAVE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const serialized = JSON.stringify(Array.from(store.entries()), null, 2);
    fs.writeFileSync(SAVE_PATH, serialized, "utf8");
  } catch (err) {
    console.error("Failed to save jobs to disk cache:", err);
  }
}

// Global declaration to maintain store across hot reloads in dev mode
const globalForJobs = globalThis as unknown as {
  jobStore?: Map<string, Job>;
};

export const jobStore = globalForJobs.jobStore ?? loadJobsFromFile();

if (process.env.NODE_ENV !== "production") {
  globalForJobs.jobStore = jobStore;
}

function syncStoreWithFile() {
  try {
    if (fs.existsSync(SAVE_PATH)) {
      const stats = fs.statSync(SAVE_PATH);
      if (stats.mtimeMs > lastLoadedTime) {
        const freshStore = loadJobsFromFile();
        jobStore.clear();
        for (const [key, val] of freshStore.entries()) {
          jobStore.set(key, val);
        }
        lastLoadedTime = stats.mtimeMs;
        console.log("jobStore synced with disk cache due to file update.");
      }
    }
  } catch (err) {
    console.error("Failed to sync jobStore with file:", err);
  }
}

export function getJob(id: string): Job | undefined {
  syncStoreWithFile();
  return jobStore.get(id);
}

export function saveJob(job: Job): void {
  jobStore.set(job.id, job);
  saveJobsToFile(jobStore);
  try {
    if (fs.existsSync(SAVE_PATH)) {
      lastLoadedTime = fs.statSync(SAVE_PATH).mtimeMs;
    }
  } catch (e) {}
}

export function updateJobStatus(id: string, status: Job["status"], error?: string): void {
  const job = getJob(id);
  if (job) {
    job.status = status;
    if (error) job.error = error;
    saveJob(job);
  }
}

export function updateSceneStatus(
  jobId: string,
  sceneNumber: number,
  status: SceneJob["status"],
  updates?: Partial<Omit<SceneJob, "sceneNumber" | "status">>
): void {
  const job = getJob(jobId);
  if (job) {
    job.scenes = job.scenes.map((scene) => {
      if (scene.sceneNumber === sceneNumber) {
        return {
          ...scene,
          status,
          ...updates,
        };
      }
      return scene;
    });
    saveJob(job);
  }
}

export function deleteJob(id: string): void {
  jobStore.delete(id);
  saveJobsToFile(jobStore);
}

