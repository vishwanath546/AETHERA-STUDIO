import { Storage } from "@google-cloud/storage";
import fs from "fs";
import path from "path";

// ── Google Cloud Storage Utility ──────────────────────────────────────────
// Uses the same service account credentials as Vertex AI.
// Bucket name is configured via the GCS_BUCKET_NAME environment variable.
// ──────────────────────────────────────────────────────────────────────────

const bucketName = process.env.GCS_BUCKET_NAME || "ai-movie-assets";

let storage: Storage;

try {
  const keyFilePath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (keyFilePath && fs.existsSync(keyFilePath)) {
    storage = new Storage({ keyFilename: keyFilePath });
  } else {
    // Fallback to Application Default Credentials
    storage = new Storage();
  }
} catch {
  storage = new Storage();
}

const bucket = storage.bucket(bucketName);

/**
 * Upload a local file to Google Cloud Storage.
 * @returns The GCS URI (gs://bucket/path) of the uploaded file.
 */
export async function uploadToGCS(
  localFilePath: string,
  gcsDestination: string
): Promise<string> {
  try {
    await bucket.upload(localFilePath, {
      destination: gcsDestination,
      resumable: false,
      metadata: {
        cacheControl: "public, max-age=31536000",
      },
    });
    const gcsUri = `gs://${bucketName}/${gcsDestination}`;
    console.log(`[GCS] Uploaded ${path.basename(localFilePath)} → ${gcsUri}`);
    return gcsUri;
  } catch (error: any) {
    console.error(`[GCS] Upload failed for ${localFilePath}:`, error.message);
    throw error;
  }
}

/**
 * Download a file from GCS to a local path.
 */
export async function downloadFromGCS(
  gcsPath: string,
  localDestination: string
): Promise<string> {
  try {
    const dir = path.dirname(localDestination);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Strip gs://bucket/ prefix if present
    const objectName = gcsPath.replace(`gs://${bucketName}/`, "");

    await bucket.file(objectName).download({ destination: localDestination });
    console.log(`[GCS] Downloaded ${objectName} → ${localDestination}`);
    return localDestination;
  } catch (error: any) {
    console.error(`[GCS] Download failed for ${gcsPath}:`, error.message);
    throw error;
  }
}

/**
 * Generate a signed URL for streaming/downloading a file from GCS.
 * Valid for 1 hour by default.
 */
export async function getSignedUrl(
  gcsPath: string,
  expiresInMinutes: number = 60
): Promise<string> {
  try {
    const objectName = gcsPath.replace(`gs://${bucketName}/`, "");
    const [url] = await bucket.file(objectName).getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + expiresInMinutes * 60 * 1000,
    });
    return url;
  } catch (error: any) {
    console.error(`[GCS] getSignedUrl failed for ${gcsPath}:`, error.message);
    throw error;
  }
}

/**
 * Check if a file exists in GCS.
 */
export async function existsInGCS(gcsPath: string): Promise<boolean> {
  try {
    const objectName = gcsPath.replace(`gs://${bucketName}/`, "");
    const [exists] = await bucket.file(objectName).exists();
    return exists;
  } catch {
    return false;
  }
}

/**
 * Get the bucket name for reference.
 */
export function getBucketName(): string {
  return bucketName;
}
