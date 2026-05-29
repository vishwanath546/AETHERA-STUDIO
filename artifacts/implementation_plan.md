# Multi-Lingual TTS Support Plan

To fully support generating video narration in different languages (like Spanish, Hindi, or Japanese), we need to update the audio generation pipeline. Currently, the text-to-speech (TTS) engines are hardcoded to use English voices (e.g., `en-US-GuyNeural`), which causes them to either fail or speak foreign languages with a heavy English accent.

## Proposed Changes

### 1. Store the Selected Language
We need to save the language you selected on the home page into the local database so the audio generator knows what language to speak.

#### [MODIFY] [job-store.ts](file:///c:/Users/ex300/Downloads/AI-movie/lib/job-store.ts)
- Add `language?: string` to the `Job` interface.

#### [MODIFY] [route.ts](file:///c:/Users/ex300/Downloads/AI-movie/app/api/generate-script/route.ts)
- Save the `language` parameter when creating a new job in the database.

### 2. Pass Language to the Audio Pipeline
#### [MODIFY] [production-pipeline.ts](file:///c:/Users/ex300/Downloads/AI-movie/lib/production-pipeline.ts)
- Read the `language` from the job and pass it down into the `generateAudio` function.

### 3. Update the TTS Engines for Multi-Lingual Support
#### [MODIFY] [audio-generator.ts](file:///c:/Users/ex300/Downloads/AI-movie/lib/audio-generator.ts)
- Update `generateAudio` to accept the `language` parameter.
- **Edge-TTS:** Map the requested language to a native Edge-TTS voice (e.g., `es-ES-AlvaroNeural` for Spanish, `hi-IN-MadhurNeural` for Hindi, `ja-JP-KeitaNeural` for Japanese, etc.).
- **Google Translate TTS:** Update the hardcoded `tl=en` parameter to use the correct target language code (e.g., `tl=es`, `tl=hi`, `tl=ja`).

## Verification Plan
- Create a test job using a foreign language (e.g., Hindi or Spanish).
- Verify that Edge-TTS and Google TTS successfully generate audio files that are spoken in the native language instead of crashing or using an English accent.
