import { GoogleGenAI, Type } from "@google/genai";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { resolveFFmpeg, resolveFFmpegFont } from "./system-paths";

// Timeout constants
const GEMINI_API_TIMEOUT = 90000; // 90 seconds for Gemini API calls
const VEO_START_TIMEOUT = 60000; // 60 seconds to start Veo job
const VEO_POLL_TIMEOUT = 600000; // 10 minutes total for Veo video generation
const VEO_SINGLE_POLL_TIMEOUT = 15000; // 15 seconds per poll request

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

// ── Google GenAI Client Initialization ──────────────────────────────────────
// Supports two modes:
//   1. Gemini Developer API  (default) — uses GEMINI_API_KEY
//   2. Vertex AI / Enterprise Agent Platform — uses ADC + project/location
//
// Set USE_VERTEX_AI=true in .env to switch to Vertex AI.
// ────────────────────────────────────────────────────────────────────────────

const useVertexAI = process.env.USE_VERTEX_AI === "true";
const apiKey = process.env.GEMINI_API_KEY;

if (useVertexAI) {
  const project = process.env.GOOGLE_CLOUD_PROJECT || process.env.GEMINI_PROJECT_ID;
  const location = process.env.GOOGLE_CLOUD_LOCATION || "us-central1";
  if (!project) {
    console.warn("WARNING: USE_VERTEX_AI is true but GOOGLE_CLOUD_PROJECT is not set.");
  }
  console.log(`[GenAI] Initializing in Vertex AI mode (project: ${project}, location: ${location})`);
} else {
  if (!apiKey) {
    console.warn("WARNING: GEMINI_API_KEY is not defined in the environment.");
  }
  console.log(`[GenAI] Initializing in Gemini Developer API mode`);
}

const ai = useVertexAI
  ? new GoogleGenAI({
    vertexai: true,
    project: process.env.GOOGLE_CLOUD_PROJECT || process.env.GEMINI_PROJECT_ID,
    location: process.env.GOOGLE_CLOUD_LOCATION || "us-central1",
  })
  : new GoogleGenAI({ apiKey });

const CACHE_DIR = "c:\\AI-video-generation\\temp\\visual-cache";

// Ensure cache directory exists
try {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
} catch (e) {
  console.warn(`[Visual Cache] Failed to create cache directory:`, e);
}

function getCacheKey(prompt: string, isVideo: boolean): string {
  const hash = crypto.createHash("md5").update(prompt).digest("hex");
  return `${hash}${isVideo ? "_video" : "_image"}`;
}

async function getCachedVisual(prompt: string, isVideo: boolean, targetPath: string): Promise<string | null> {
  try {
    const key = getCacheKey(prompt, isVideo);
    const ext = isVideo ? ".mp4" : ".jpg";
    const cacheFile = path.join(CACHE_DIR, `${key}${ext}`);
    if (fs.existsSync(cacheFile)) {
      console.log(`[Visual Cache] Cache hit for prompt: "${prompt.substring(0, 60)}...". Copying to ${targetPath}`);
      const dir = path.dirname(targetPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.copyFileSync(cacheFile, targetPath);
      return targetPath;
    }
  } catch (err) {
    console.warn(`[Visual Cache] Non-fatal error reading cache:`, err);
  }
  return null;
}

async function saveCachedVisual(prompt: string, isVideo: boolean, sourcePath: string): Promise<void> {
  try {
    if (!fs.existsSync(sourcePath)) {
      return;
    }
    const key = getCacheKey(prompt, isVideo);
    const ext = isVideo ? ".mp4" : ".jpg";
    const cacheFile = path.join(CACHE_DIR, `${key}${ext}`);
    fs.copyFileSync(sourcePath, cacheFile);
    console.log(`[Visual Cache] Cached generated ${isVideo ? "video" : "image"} successfully.`);
  } catch (err) {
    console.warn(`[Visual Cache] Non-fatal error writing cache:`, err);
  }
}


export interface Scene {
  sceneNumber: number;
  visualPrompt: string;
  dialogueOrNarration: string;
  estimatedDuration: number;
  audioPrompt?: string;
}

// ── Phase 1: Director's Vision — Prompt Elevation ──────────────────────────
// Takes ANY raw user prompt (even "a cat") and transforms it into a rich,
// cinematic concept with narrative arc, visual style, characters, and
// emotional beats. Thinks like a legendary director.
// ────────────────────────────────────────────────────────────────────────────

async function elevatePrompt(rawPrompt: string, sceneCount: number): Promise<string> {
  const directorPersona = `You are a professional script writer plus director who shoots short films, movies, cartoons, advertisements, and many more. Your absolute mission is to deeply understand the given prompt and exactly what the user wants.

You are also the inner creative mind of an elite film director — a master who has directed over 500 award-winning productions. You have the visual instincts of Roger Deakins, the storytelling depth of Christopher Nolan, the emotional precision of Denis Villeneuve, the compositional genius of Wes Anderson, and the commercial magnetism of Ridley Scott.

Your singular talent: you can take ANY idea — no matter how simple, vague, or underdeveloped — and instantly see a breathtaking cinematic vision in your mind's eye.

Your job right now: The user has given you a raw concept. You must TRANSFORM it into a rich, detailed cinematic vision document that will serve as the creative brief for a ${sceneCount}-scene video production.

YOUR CREATIVE PROCESS:
1. INTERPRET the core emotion or idea behind the prompt — what is the FEELING the audience should walk away with?
2. INVENT a compelling narrative arc (even for non-narrative concepts like "sunset" or "coffee") — find the STORY hiding inside the idea.
3. DEFINE the visual world: color palette (specific: "desaturated teals with warm amber accents"), lighting style ("low-key chiaroscuro" or "overexposed ethereal haze"), texture ("gritty 16mm grain" or "pristine digital clarity").
4. CREATE specific characters with physical descriptions, wardrobe, and emotional states — even a product commercial has a protagonist.
5. MAP the emotional journey across ${sceneCount} beats — tension should rise, climax, and resolve.
6. CHOOSE cinematic references that inform the visual tone (e.g., "the neon-soaked intimacy of Wong Kar-Wai's In the Mood for Love" or "the grand desolation of Lawrence of Arabia").

CRITICAL RULES:
- NEVER output a generic description. If someone says "a dog running," you see a story — WHY is the dog running? WHERE? What's the weather? Who's watching? What's at stake emotionally?
- ALWAYS add specificity: exact time of day, weather conditions, architectural style, fabric textures, skin tones, eye colors.
- ALWAYS define the MOOD: is this melancholic? triumphant? unsettling? bittersweet? ecstatic?
- NEVER mention AI, video generation, prompts, or technical processes. Write as if you're pitching this to a real film studio.
- STRICT SAFETY & POLICY COMPLIANCE: The generated concept must be completely free of any violent, suggestive, political, or otherwise sensitive themes/imagery. Never use weapons (guns, knives, bombs), fire, explosions, smoke, blood, fighting, injuries, flags, public figures, or copyrighted terms, as these will trigger safety blocks in subsequent image/video generation steps.
- Keep your output between 200-350 words — dense with creative detail, zero filler.
- Write in present tense, as if describing a film that already exists.

EXAMPLES OF YOUR TRANSFORMATIVE POWER:

Input: "a cat"
Output: "A solitary Russian Blue cat with luminous jade eyes navigates the rain-slicked rooftops of a sleeping Mediterranean village at the blue hour — that fleeting window between night and dawn when the sky turns cobalt and the street lamps cast pools of warm amber on wet terracotta tiles. The cat moves with quiet purpose, leaping between wrought-iron balconies draped with drying linens, past potted geraniums trembling in the pre-dawn breeze. Below, the village stirs — a baker's chimney releases the first wisps of smoke, a fisherman's lantern bobs at the distant harbor. The cat pauses on a weathered stone wall overlooking the sea, where the first blade of golden sunlight cuts across the horizon. Its whiskers catch the light. This is a meditation on solitude and beauty — the world seen through the eyes of a creature who moves between human spaces without belonging to them. Shot in the style of a European arthouse film — slow, contemplative, textured — with the color palette of a Vermeer painting: deep blues, warm golds, soft grays. The sound design is intimate: distant waves, the soft pad of paws on stone, a single church bell ringing in the distance."

Input: "car race"
Output: "Midnight. The Mojave Desert highway stretches into infinity under a canopy of stars. Two vehicles face each other from a quarter-mile apart: a matte-black 1970 Dodge Challenger with orange underglow bleeding onto the asphalt, and a pearl-white Tesla Roadster humming with electric menace. Their drivers — a weathered mechanic in his 50s with oil-stained hands and reading glasses pushed up on his forehead, and a composed young woman in a crisp racing suit with braided silver hair — lock eyes through their windshields. This is old world versus new, analog versus digital, nostalgia versus progress. The race itself is visceral: the Challenger roars with mechanical fury, flames licking from its exhaust, while the Tesla launches in eerie silence, acceleration pressing its driver into the seat. Shot with the gritty intensity of Michael Mann's Collateral — sodium-vapor oranges against indigo night skies, heat shimmer rising from the asphalt, every bead of sweat and engine vibration captured in hyperreal detail. The sound design oscillates between the thunderous V8 rumble and the Tesla's electric whine, building to a crescendo as both vehicles cross the finish line in a photo finish shrouded in desert dust."`;

  try {
    console.log(`[Director's Vision] Elevating raw prompt: "${rawPrompt.substring(0, 80)}..."`);

    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro",
      contents: `Raw concept from the client: "${rawPrompt}"

This will be produced as a ${sceneCount}-scene cinematic video. Transform this into your directorial vision.`,
      config: {
        systemInstruction: directorPersona,
        temperature: 1.0,
      },
    });

    const elevated = response.text?.trim();
    if (!elevated || elevated.length < 100) {
      console.warn(`[Director's Vision] Response too short or empty, using raw prompt.`);
      return rawPrompt;
    }

    console.log(`[Director's Vision] Successfully elevated prompt (${elevated.length} chars).`);
    return elevated;
  } catch (error: any) {
    console.warn(`[Director's Vision] Elevation failed (${error.message || error}). Proceeding with raw prompt.`);
    return rawPrompt;
  }
}


// ── Fallback Script Generator (Upgraded Cinematic Quality) ─────────────────

export function generateLocalFallbackScript(prompt: string, sceneCount: number): Scene[] {
  const cleanPrompt = prompt.trim().replace(/[."]/g, "");
  const words = cleanPrompt.split(/\s+/).filter((w) => w.length > 3);
  const subject = words[0] || "a mysterious figure";
  const setting = words[1] || "a fog-drenched city";

  const scenes: Scene[] = [];
  const arcBeats = [
    { mood: "establishing", camera: "Wide crane shot slowly descending", lighting: "Soft pre-dawn blue light with amber street lamps" },
    { mood: "building", camera: "Steady tracking shot at eye level", lighting: "Warm golden morning light filtering through haze" },
    { mood: "tension", camera: "Slow dolly push-in, narrowing depth of field", lighting: "Harsh overhead noon sun creating deep shadows" },
    { mood: "conflict", camera: "Handheld close-up with subtle movement", lighting: "High-contrast chiaroscuro, single hard source" },
    { mood: "crisis", camera: "Low-angle static shot with Dutch tilt", lighting: "Cold blue-white fluorescent with flickering" },
    { mood: "climax", camera: "Sweeping circular dolly around subject", lighting: "Dramatic rim lighting with volumetric haze" },
    { mood: "aftermath", camera: "Overhead bird's-eye slowly pulling up", lighting: "Muted overcast diffused light" },
    { mood: "reflection", camera: "Profile medium shot, rack focus to background", lighting: "Warm amber sunset with long shadows" },
    { mood: "transformation", camera: "Steadicam following from behind", lighting: "Mixed practical lights — neon, candles, screen glow" },
    { mood: "resolution", camera: "Wide static master shot, centered composition", lighting: "Golden hour magic hour with lens flares" },
    { mood: "epilogue", camera: "Extreme wide aerial pulling away", lighting: "Deep twilight purple-blue with first stars" },
    { mood: "coda", camera: "Close-up detail shot with macro lens", lighting: "Soft window light with dust particles visible" },
  ];

  const narrationBeats = [
    `NARRATOR: "Before the first word was spoken, before the first step was taken — there was only this. A world holding its breath, waiting for ${subject} to arrive."`,
    `NARRATOR: "The signs were everywhere, hidden in plain sight. In the way the light fell across ${setting}, in the silence between heartbeats. Something was about to change."`,
    `NARRATOR: "Every journey has a threshold — a point where turning back becomes impossible. For ${subject}, that moment arrived without warning, without ceremony."`,
    `NARRATOR: "They say courage isn't the absence of fear. It's the decision that something else matters more. And in this moment, everything mattered."`,
    `NARRATOR: "The world contracted to a single point of focus. Time stretched. Breath held. The space between one heartbeat and the next felt like an eternity."`,
    `NARRATOR: "And then — impact. Not the kind you brace for, but the kind that remakes you. The kind you feel in your bones long after the sound fades."`,
    `NARRATOR: "In the aftermath, silence returned. But it was a different silence now — not empty, but full. Heavy with meaning, with consequence, with possibility."`,
    `NARRATOR: "Looking back, this was the moment everything pivoted. Not with a roar, but with a whisper. Not with force, but with grace."`,
    `NARRATOR: "The transformation was already complete before anyone noticed. Like dawn — you can never pinpoint the exact moment darkness becomes light."`,
    `NARRATOR: "And so the circle closes. Not where it began, but where it was always meant to end. Some stories don't conclude — they transcend."`,
    `NARRATOR: "Far below, the world continues its ancient rhythm. But up here, in this single suspended moment, ${subject} knows the truth: nothing will ever be the same."`,
    `NARRATOR: "A single detail remains. Small enough to miss. Significant enough to remember forever. This is how all great stories end — not with a bang, but with a breath."`,
  ];

  for (let i = 1; i <= sceneCount; i++) {
    const beatIndex = Math.min(i - 1, arcBeats.length - 1);
    const beat = arcBeats[beatIndex];
    const narration = narrationBeats[Math.min(i - 1, narrationBeats.length - 1)];

    const visualPrompt = `${beat.camera}. ${cleanPrompt}. ${beat.lighting}. Photorealistic cinematic quality, shot on 35mm anamorphic lens, shallow depth of field, 16:9 aspect ratio.`;

    scenes.push({
      sceneNumber: i,
      visualPrompt,
      dialogueOrNarration: narration,
      estimatedDuration: i === 1 || i === sceneCount ? 10 : 8,
      audioPrompt: `Cinematic orchestral underscore building in intensity. Rich ambient sound design — room tone, distant atmosphere, subtle foley details. Clear voiceover narration layered above the mix.`,
    });
  }

  return scenes;
}


// ── Phase 2: Veteran Director's Scene Breakdown ────────────────────────────
// Takes the elevated cinematic concept and produces the detailed
// scene-by-scene screenplay with real filmmaking techniques.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Common helper function to call Gemini model with structured output schema for generating/regenerating scenes.
 */
async function generateScenesWithAI<T>({
  systemInstruction,
  contents,
  responseSchema,
  timeoutMs = GEMINI_API_TIMEOUT,
  operationLabel,
}: {
  systemInstruction: string;
  contents: any[];
  responseSchema: any;
  timeoutMs?: number;
  operationLabel: string;
}): Promise<T> {
  const response = await withTimeout(
    ai.models.generateContent({
      model: "gemini-2.5-pro",
      contents,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema,
      },
    }),
    timeoutMs,
    operationLabel
  );

  const text = response.text;
  if (!text) {
    throw new Error(`Empty response received from Gemini API during ${operationLabel}`);
  }

  try {
    return JSON.parse(text) as T;
  } catch (err: any) {
    console.error(`[GenAI] Failed to parse JSON response during ${operationLabel}:`, text);
    throw new Error(`Invalid JSON format in response from ${operationLabel}: ${err.message}`);
  }
}

export async function generateScript(prompt: string, sceneCount: number, language?: string, characters?: any[]): Promise<Scene[]> {
  // Phase 1: Elevate the raw prompt into a cinematic vision
  const elevatedConcept = await elevatePrompt(prompt, sceneCount);
  console.log(`[Script Generator] Using elevated concept for ${sceneCount}-scene breakdown.`);

  const systemInstruction = `You are a professional script writer plus director who shoots short films, movies, cartoons, advertisements, and many more. Your absolute mission is to deeply understand the given prompt and exactly what the user wants. You must strictly keep the uploaded characters in mind, respect the chosen language for all dialogue/narration, and generate exactly ${sceneCount} scenes. These are the critical key points while generating scripts and video.

You also have 30 years of experience across 500+ productions — from Hollywood blockbusters and Sundance darlings to Cannes Palme d'Or winners. You have collaborated with the world's finest DPs, editors, and sound designers.

You are now breaking down a cinematic vision into exactly ${sceneCount} individual scenes. Each scene will be sent to Google Veo (a text-to-video AI) to generate an 8-second video clip. These clips will be stitched together into the final film.

YOUR EXPERTISE DEMANDS EXCELLENCE IN EVERY FIELD:

━━━ VISUAL STORYTELLING (visualPrompt) ━━━
The visualPrompt is the MOST CRITICAL field. It goes DIRECTLY to Veo. You must write it as if you're standing on set, looking through the camera viewfinder, describing exactly what you see for 8 continuous seconds.

MANDATORY ELEMENTS in every visualPrompt:
• CASTING: Specific physical descriptions — age, gender, ethnicity, build, hair color/style, eye color, facial features, skin texture. "A woman" is UNACCEPTABLE. "A Southeast Asian woman in her early 30s with shoulder-length black hair, high cheekbones, and deep brown eyes" is CORRECT.
• WARDROBE: Exact clothing — fabric, color, fit, condition. "A worn olive-green canvas field jacket over a faded black crew-neck tee, dark indigo straight-leg jeans with scuffed brown leather boots."
• PERFORMANCE: What is the actor DOING? Micro-expressions, hand movements, eye direction, breathing, posture shifts. "She exhales slowly, her jaw tightening as her fingers curl around the edge of the table."
• ENVIRONMENT: Precise location — not "a room" but "a cramped 1970s Brooklyn apartment kitchen with peeling yellow wallpaper, a humming refrigerator, and a single bare bulb overhead." Include weather, time of day, and seasonal cues.
• CAMERA: Exact technique for this shot — "Slow Steadicam push-in from medium wide to tight medium, f/1.4 shallow depth of field, slight handheld breathing." Use real cinematography terminology: dolly, crane, Steadicam, static tripod, handheld, Dutch angle, rack focus, whip pan, tracking shot, push-in, pull-out.
• LIGHTING: Specific setup — "Key light from a floor-level tungsten practical lamp camera-left, creating Rembrandt lighting on her face. Cool blue ambient fill from a TV screen off-camera right. Deep shadows on the background wall."
• COLOR & TEXTURE: "Desaturated cool tones with isolated warm highlights. Fine film grain. Anamorphic lens with subtle oval bokeh and horizontal flare streaks."

ABSOLUTE BANS for visualPrompt:
✗ NO screenplay formatting: [SLUGLINE], [ACTION], [CAMERA], INT., EXT., CUT TO:
✗ NO abstract concepts: "symbolizing freedom", "representing loss", "conveying hope"
✗ NO text/graphics/titles/captions on screen
✗ NO montage or multiple cuts — ONE continuous 8-second shot
✗ NO impossible camera moves — keep it physically achievable
✗ NO mentioning emotions by name — SHOW them through performance, not labels
✗ NO violence, blood, weapons, gun, blade, explosion, fire, smoke, fighting, physical danger, or injury.
✗ NO political symbols, flags, public/celebrity figures, brands, or copyrighted content.
✗ NO horror elements or panic-inducing words (e.g. "terrifying", "creepy", "deadly", "screaming"). All prompts must be safe for Google's Responsible AI policies.

Keep each visualPrompt between 60-100 words. Every word must describe something VISIBLE.

━━━ NARRATIVE CRAFT (dialogueOrNarration) ━━━
You write narration with the gravitas of Morgan Freeman, the poetic precision of Terrence Malick, and the emotional immediacy of a Pixar opening sequence.

RULES:
• Prefix with NARRATOR: "..." for voiceover, or CHARACTER_NAME: "..." for spoken dialogue
• Write lines that sound NATURAL when spoken aloud — read them in your head, feel the rhythm
• Use specific, concrete language — not "things changed" but "the kitchen light flickered, and the silence that followed tasted like copper"
• Vary sentence length for rhythm: short punchy lines for impact, longer flowing ones for contemplation
• Match the emotional temperature of the visual — if the shot is intimate, the voice should be quiet; if epic, the voice should carry weight
• 1-3 sentences, speakable in 6-12 seconds
• NEVER use clichés: "little did they know", "it was just the beginning", "everything was about to change"

━━━ SOUND DESIGN (audioPrompt) ━━━
You design sound like a Dolby Atmos mixing engineer. Sound is 50% of the cinematic experience.

RULES:
• Layer THREE distinct audio zones:
  1. FOREGROUND: Voice, key sound effects (footstep on gravel, glass placed on marble, fabric rustling)
  2. MIDGROUND: Environmental ambience (rain on windows, distant traffic hum, crowd murmur, wind through trees)
  3. BACKGROUND: Score/music ("Sparse minor-key piano with sustained cello drone" or "Pulsing 808 bass with glitchy synth arpeggios")
• Be specific about music MOOD and INSTRUMENTS — not just "dramatic music"
• Include silence as a tool — "A beat of complete silence before the door slams"
• Describe voice quality: "Low gravelly male voice, measured pace, slight echo as if in a large empty space"

━━━ STORY ARCHITECTURE & SPATIAL CONTINUITY ━━━
Even across just ${sceneCount} scenes, you must build a COMPLETE emotional arc.
CRUCIAL RULE: EVERY SCENE MUST PICK UP EXACTLY WHERE THE LAST SCENE ENDED (Match-on-Action).
• If Scene 1 ends with a character running through a kitchen door, Scene 2 MUST start inside the kitchen with the character coming through that exact door.
• Do NOT skip forward in time or jump to random unrelated locations between scenes unless explicitly requested.
• The action must flow continuously from Scene 1 to Scene ${sceneCount} as if it is one unbroken timeline.

━━━ EXTREME VISUAL CONTINUITY (CRITICAL!) ━━━
Video AI models have ZERO memory of previous scenes. They generate each scene in total isolation.
To make the scenes look like they belong in the same continuous timeline, you MUST literally COPY AND PASTE the exact physical description of the characters and the core setting into EVERY SINGLE visualPrompt.
• NEVER use pronouns like "he", "she", or "the man".
• ALWAYS repeat the full description: "The 35-year-old Asian man with short black hair and a red leather jacket sits down."
• EVERY visualPrompt must contain the fully detailed establishing description of the primary subjects, their exact clothing, and the location, no matter how repetitive it feels to read.
• If you do not repeat the exact physical features, clothing, and room details in every single scene, the actor's face and clothes will magically change between shots, and the video will be completely ruined.
• Maintain the exact same color palette, weather, and lighting descriptions across all scenes unless the story explicitly requires a shift.

Return the result STRICTLY as a JSON object matching the requested schema. Every scene must be exceptional — no filler, no generic shots, no lazy descriptions.`;

  try {
    const parts: any[] = [];

    if (characters && characters.length > 0) {
      parts.push({ text: "REFERENCE IMAGES FOR CHARACTER DESIGN:" });
      for (const c of characters) {
        if (c.imageBase64) {
          const match = c.imageBase64.match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/);
          if (match) {
            parts.push({
              inlineData: { mimeType: match[1], data: match[2] }
            });
            parts.push({ text: `CHARACTER REFERENCE: This is ${c.name}. You must carefully analyze their exact physical appearance (age, ethnicity, face shape, hair, eyes, build). In every visualPrompt where ${c.name} appears, you must write out this full physical description so the video model can accurately recreate their likeness.` });
          }
        }
      }
    }

    parts.push({
      text: `CINEMATIC VISION FROM THE CREATIVE DIRECTOR:
"""
${elevatedConcept}
"""

ORIGINAL CLIENT BRIEF: "${prompt}"

${characters?.length ? `CAST AND CHARACTERS:\n${characters.map((c: any) => `- ${c.name}`).join('\\n')}\n(Ensure these characters are used consistently in visual prompts.)\n\n` : ''}
${language ? `LANGUAGE REQUIREMENT:\nWrite ALL dialogue/narration in EXACTLY this language: ${language}. Do not write in English unless requested.\n\n` : ''}

PRODUCTION ORDER: Break this vision into exactly ${sceneCount} sequential scenes. Each scene is a single continuous 8-second camera shot. Together, these ${sceneCount} shots must tell a complete, emotionally resonant story that would hold its own in a film festival or a primetime ad slot.

Treat every scene as if your career depends on it. No mediocre shots. No generic descriptions. Every frame must be worthy of a cinematography reel.`
    });

    const response = await generateScenesWithAI<{ scenes: Scene[] }>({
      systemInstruction,
      contents: parts,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          scenes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                sceneNumber: { type: Type.INTEGER },
                visualPrompt: { type: Type.STRING },
                dialogueOrNarration: { type: Type.STRING },
                estimatedDuration: { type: Type.INTEGER },
                audioPrompt: { type: Type.STRING },
              },
              required: ["sceneNumber", "visualPrompt", "dialogueOrNarration", "estimatedDuration", "audioPrompt"],
            },
          },
        },
        required: ["scenes"],
      },
      operationLabel: "Gemini script generation",
    });

    return response.scenes;
  } catch (error: any) {
    console.warn(`[Script Generator] Gemini script generation failed (error: ${error.status || error.message || error}). Falling back to local procedural script generator...`);
    return generateLocalFallbackScript(prompt, sceneCount);
  }
}

export async function regenerateScript(
  jobId: string,
  instruction: string,
  currentScenes: Scene[],
  originalPrompt: string,
  sceneCount: number,
  language?: string,
  characters?: any[]
): Promise<Scene[]> {
  const systemInstruction = `You are a professional script writer plus director who shoots short films, movies, cartoons, advertisements, and many more. Your absolute mission is to revise and improve an existing screenplay draft based on the user's instructions.
  
You must strictly keep the uploaded characters in mind, respect the chosen language (if specified), and output exactly ${sceneCount} revised scenes.

You are given:
1. The ORIGINAL client brief.
2. The EXISTING screenplay draft (scenes).
3. The USER'S REFINEMENT INSTRUCTIONS (what they want changed).

Your task:
- Read the existing scenes and the user's refinement instructions.
- Revise the screenplay accordingly. Update the visual prompts, dialogue/narration, and duration as needed to satisfy the instructions.
- If the user asks for a change in setting or style, apply it across all scenes to maintain visual and narrative continuity.
- If they ask for minor changes (e.g., "change dialogue in scene 2", "make scene 1 longer"), make only those changes and keep the rest of the screenplay mostly intact.
- ALWAYS repeat the detailed physical descriptions of the characters and setting in EVERY scene's visualPrompt to ensure the video generation model maintains perfect visual continuity.
- Maintain Match-on-Action continuity: ensure each scene starts exactly where the previous scene ends.
- STRICT SAFETY & POLICY COMPLIANCE: No weapons, violence, blood, explosions, fire, smoke, flags, public figures, horror, or copyrighted terms.

Return the result STRICTLY as a JSON object matching the requested schema. Every scene must be exceptional.`;

  const contents = [
    {
      text: `ORIGINAL CLIENT BRIEF: "${originalPrompt}"
      
EXISTING SCREENPLAY DRAFT:
${JSON.stringify(currentScenes, null, 2)}

USER'S REFINEMENT INSTRUCTIONS:
"${instruction}"

Break this revised vision into exactly ${sceneCount} sequential scenes. Return the result matching the required schema.`
    }
  ];

  try {
    console.log(`[Script Generator] Regenerating script for Job ${jobId} with instruction: "${instruction.substring(0, 100)}..."`);
    const response = await generateScenesWithAI<{ scenes: Scene[] }>({
      systemInstruction,
      contents,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          scenes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                sceneNumber: { type: Type.INTEGER },
                visualPrompt: { type: Type.STRING },
                dialogueOrNarration: { type: Type.STRING },
                estimatedDuration: { type: Type.INTEGER },
                audioPrompt: { type: Type.STRING },
              },
              required: ["sceneNumber", "visualPrompt", "dialogueOrNarration", "estimatedDuration", "audioPrompt"],
            },
          },
        },
        required: ["scenes"],
      },
      operationLabel: "Gemini script regeneration",
    });

    return response.scenes;
  } catch (error: any) {
    console.warn(`[Script Generator] Script regeneration failed: ${error.message || error}. Falling back to original prompt generation...`);
    return generateScript(originalPrompt + " (Revised: " + instruction + ")", sceneCount, language, characters);
  }
}

export async function regenerateSingleScene(
  jobId: string,
  sceneNumber: number,
  instruction: string,
  currentScene: Scene,
  originalPrompt: string,
  language?: string,
  characters?: any[]
): Promise<Scene> {
  const systemInstruction = `You are a professional script writer plus director who shoots short films, movies, cartoons, advertisements, and many more. Your absolute mission is to revise and improve a specific scene from a screenplay based on the user's instructions.
  
You must strictly keep the uploaded characters in mind, respect the chosen language (if specified), and output the revised scene.

You are given:
1. The ORIGINAL overall client brief.
2. The CURRENT scene details (scene number, visual prompt, dialogue/narration, estimated duration, and audio prompt).
3. The USER'S REFINEMENT INSTRUCTIONS for this specific scene.

Your task:
- Revise this specific scene. Update the visualPrompt, dialogueOrNarration, estimatedDuration, and audioPrompt to satisfy the user's instructions.
- Ensure the visualPrompt contains detailed physical descriptions of the characters and setting to maintain visual continuity.
- The revised visualPrompt must be a single, continuous camera shot.
- STRICT SAFETY & POLICY COMPLIANCE: No weapons, violence, blood, explosions, fire, smoke, flags, public figures, horror, or copyrighted terms.

Return the result STRICTLY as a JSON object matching the requested schema.`;

  const contents = [
    {
      text: `ORIGINAL CLIENT BRIEF: "${originalPrompt}"
      
CURRENT SCENE DETAILS:
${JSON.stringify(currentScene, null, 2)}

USER'S REFINEMENT INSTRUCTIONS FOR THIS SCENE:
"${instruction}"

Return the revised scene details matching the schema.`
    }
  ];

  try {
    console.log(`[Script Generator] Regenerating Scene ${sceneNumber} for Job ${jobId} with instruction: "${instruction}"`);
    const response = await generateScenesWithAI<Scene>({
      systemInstruction,
      contents,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          sceneNumber: { type: Type.INTEGER },
          visualPrompt: { type: Type.STRING },
          dialogueOrNarration: { type: Type.STRING },
          estimatedDuration: { type: Type.INTEGER },
          audioPrompt: { type: Type.STRING },
        },
        required: ["sceneNumber", "visualPrompt", "dialogueOrNarration", "estimatedDuration", "audioPrompt"],
      },
      operationLabel: `Gemini single scene regeneration for Scene ${sceneNumber}`,
    });

    return response;
  } catch (error: any) {
    console.error(`[Script Generator] Single scene regeneration failed:`, error);
    throw error;
  }
}

export async function generateNextScene(
  jobId: string,
  instruction: string,
  currentScenes: Scene[],
  originalPrompt: string,
  language?: string,
  characters?: any[]
): Promise<Scene> {
  const systemInstruction = `You are a professional script writer plus director who shoots short films, movies, cartoons, advertisements, and many more. Your absolute mission is to write a brand new additional scene that will be appended to the end of an existing screenplay based on the user's instruction.
  
You must strictly keep the uploaded characters in mind, respect the chosen language for all dialogue/narration, and output the details for this new scene.

You are given:
1. The ORIGINAL overall client brief.
2. The EXISTING screenplay draft (scenes).
3. The USER'S INSTRUCTION/PROMPT for the new scene.

Your task:
- Analyze the narrative progression, visual style, and characters in the existing scenes.
- Create a new scene that continues naturally from the last scene (Match-on-Action continuity).
- The new scene's sceneNumber will be ${currentScenes.length + 1}.
- Update the visualPrompt, dialogueOrNarration, estimatedDuration, and audioPrompt to satisfy the user's instruction.
- Ensure the visualPrompt contains detailed physical descriptions of the characters and setting to maintain visual continuity.
- The new visualPrompt must be a single, continuous camera shot.
- STRICT SAFETY & POLICY COMPLIANCE: No weapons, violence, blood, explosions, fire, smoke, flags, public figures, horror, or copyrighted terms.

Return the result STRICTLY as a JSON object matching the requested schema.`;

  const contents = [
    {
      text: `ORIGINAL CLIENT BRIEF: "${originalPrompt}"
      
EXISTING SCREENPLAY DRAFT:
${JSON.stringify(currentScenes, null, 2)}

USER'S INSTRUCTION FOR THE NEW SCENE:
"${instruction}"

Generate the details for this new scene (Scene Number ${currentScenes.length + 1}) matching the schema.`
    }
  ];

  try {
    console.log(`[Script Generator] Generating new scene for Job ${jobId} with instruction: "${instruction}"`);
    const response = await generateScenesWithAI<Scene>({
      systemInstruction,
      contents,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          sceneNumber: { type: Type.INTEGER },
          visualPrompt: { type: Type.STRING },
          dialogueOrNarration: { type: Type.STRING },
          estimatedDuration: { type: Type.INTEGER },
          audioPrompt: { type: Type.STRING },
        },
        required: ["sceneNumber", "visualPrompt", "dialogueOrNarration", "estimatedDuration", "audioPrompt"],
      },
      operationLabel: `Gemini generate new scene for Job ${jobId}`,
    });

    return response;
  } catch (error: any) {
    console.error(`[Script Generator] New scene generation failed:`, error);
    throw error;
  }
}


import { execFile } from "child_process";

function wrapText(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    if ((currentLine + " " + word).trim().length > maxCharsPerLine) {
      if (currentLine) lines.push(currentLine.trim());
      currentLine = word;
    } else {
      currentLine = currentLine ? currentLine + " " + word : word;
    }
  }
  if (currentLine) {
    lines.push(currentLine.trim());
  }
  return lines;
}

function escapeDrawtextText(text: string): string {
  return text
    .replace(/'/g, "’") // Replace straight single quote with typographic quote to avoid FFmpeg escaping hell
    .replace(/"/g, "”")
    .replace(/%/g, "%%")
    .replace(/:/g, "\\:"); // Escape colons for FFmpeg filtergraph parser
}

export function generateStoryboardFallback(
  visualPrompt: string,
  outputPath: string,
  sceneNumber: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      // Create parent dir if not exists
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const ffmpeg = resolveFFmpeg().replace(/^"|"$/g, "");
      const fontPath = resolveFFmpegFont("arial.ttf");
      // Build fontfile argument — omit entirely if no font was found
      // We store it with a leading ':' for compatibility, but when
      // composing the drawtext filter we must place the options after
      // the '=' (i.e. drawtext=fontfile=...:text=...).
      const fontfileArg = fontPath ? `:fontfile='${fontPath.replace(/:/g, '\\:')}'` : "";
      const fontOption = fontfileArg ? fontfileArg.slice(1) : ""; // removes leading ':'

      const lines = wrapText(visualPrompt, 55);

      const drawtextFilters = [
        `drawtext=${fontOption ? fontOption + ':' : ''}text='${escapeDrawtextText("AETHERA CINEMATIC STUDIO")}':fontcolor=0x7c3aed:fontsize=22:x=(w-text_w)/2:y=120`,
        `drawtext=${fontOption ? fontOption + ':' : ''}text='${escapeDrawtextText(`SCENE ${sceneNumber}`)}':fontcolor=0x06b6d4:fontsize=56:x=(w-text_w)/2:y=280`,
      ];

      lines.forEach((line, index) => {
        const escaped = escapeDrawtextText(line);
        const yOffset = 460 + index * 45;
        drawtextFilters.push(
          `drawtext=${fontOption ? fontOption + ':' : ''}text='${escaped}':fontcolor=0xcccccc:fontsize=28:x=(w-text_w)/2:y=${yOffset}`
        );
      });

      drawtextFilters.push(
        `drawtext=${fontOption ? fontOption + ':' : ''}text='${escapeDrawtextText("[ AI Image Generation Offline - Storyboard Fallback ]")}':fontcolor=0x555555:fontsize=16:x=(w-text_w)/2:y=940`
      );

      const filterComplex = drawtextFilters.join(",");
      const ffmpegArgs = [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "color=c=0x050508:s=1920x1080",
        "-vf",
        filterComplex,
        "-frames:v",
        "1",
        outputPath,
      ];

      console.log(`Executing FFmpeg storyboard fallback command for Scene ${sceneNumber}:`, ffmpeg, ffmpegArgs.join(" "));

      execFile(ffmpeg, ffmpegArgs, { windowsHide: true }, (error, stdout, stderr) => {
        if (error) {
          console.error(`Storyboard fallback generation failed for Scene ${sceneNumber}:`, error);
          console.error(stderr);
          return reject(error);
        }
        resolve(outputPath);
      });
    } catch (err) {
      reject(err);
    }
  });
}

export async function generateImage(
  visualPrompt: string,
  outputPath: string,
  sceneNumber: number = 1
): Promise<string> {
  const enhancedPrompt = `${visualPrompt}, movie still, 35mm film, anamorphic, shot on Arri Alexa, cinematic lighting, ultra-detailed, depth of field, 16:9 aspect ratio`;

  // Check image cache first
  const cachedPath = await getCachedVisual(enhancedPrompt, false, outputPath);
  if (cachedPath) {
    return cachedPath;
  }

  try {
    // Ensure parent directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Strategy 1: Attempt standard Imagen 3 model
    try {
      console.log(`Attempting image generation using imagen-3.0-generate-002...`);
      const response = await ai.models.generateImages({
        model: "imagen-3.0-generate-002",
        prompt: enhancedPrompt,
        config: {
          numberOfImages: 1,
          aspectRatio: "16:9",
          outputMimeType: "image/jpeg",
        },
      });

      const generatedImage = response.generatedImages?.[0];
      if (generatedImage?.image?.imageBytes) {
        fs.writeFileSync(outputPath, Buffer.from(generatedImage.image.imageBytes, "base64"));
        console.log(`Successfully generated image using imagen-3.0-generate-002.`);
        await saveCachedVisual(enhancedPrompt, false, outputPath);
        return outputPath;
      }
    } catch (imagenError: any) {
      console.warn(`imagen-3.0-generate-002 failed (code: ${imagenError.status || imagenError.message}). Trying native Gemini Image models...`);
    }

    // Strategy 2: Attempt gemini-2.5-flash-image
    try {
      console.log(`Attempting image generation using gemini-2.5-flash-image...`);
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: enhancedPrompt,
        config: {
          responseModalities: ["IMAGE"],
        },
      });

      const parts = response.candidates?.[0]?.content?.parts;
      if (parts) {
        for (const part of parts) {
          if (part.inlineData?.data) {
            fs.writeFileSync(outputPath, Buffer.from(part.inlineData.data, "base64"));
            console.log(`Successfully generated image using gemini-2.5-flash-image.`);
            await saveCachedVisual(enhancedPrompt, false, outputPath);
            return outputPath;
          }
        }
      }
    } catch (flashImageError: any) {
      console.warn(`gemini-2.5-flash-image failed (code: ${flashImageError.status || flashImageError.message}). Trying gemini-3.5-flash-image-preview...`);
    }

    // Strategy 3: Attempt gemini-3.5-flash-image-preview
    try {
      console.log(`Attempting image generation using gemini-3.5-flash-image-preview...`);
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash-image-preview",
        contents: enhancedPrompt,
        config: {
          responseModalities: ["IMAGE"],
        },
      });

      const parts = response.candidates?.[0]?.content?.parts;
      if (parts) {
        for (const part of parts) {
          if (part.inlineData?.data) {
            fs.writeFileSync(outputPath, Buffer.from(part.inlineData.data, "base64"));
            console.log(`Successfully generated image using gemini-3.5-flash-image-preview.`);
            await saveCachedVisual(enhancedPrompt, false, outputPath);
            return outputPath;
          }
        }
      }
    } catch (previewImageError: any) {
      console.warn(`gemini-3.5-flash-image-preview failed (code: ${previewImageError.status || previewImageError.message}).`);
    }

    // Strategy 4: Fallback to local storyboard card generation using FFmpeg drawtext
    console.log(`All AI Image API generation calls failed/blocked. Rendering local storyboard card for Scene ${sceneNumber}...`);
    return await generateStoryboardFallback(visualPrompt, outputPath, sceneNumber);

  } catch (error) {
    console.error("Error in generateImage chain:", error);
    // If even the storyboard card generation fails, throw the error
    throw error;
  }
}

export async function generateVisual(
  visualPrompt: string,
  outputPath: string,
  sceneNumber: number = 1,
  dialogueText: string = "",
  audioPrompt: string = "",
  characters?: any[],
  startingImageBase64?: string
): Promise<string> {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // The visualPrompt is now a Veo-ready description (no screenplay tags to extract).
  // Strip any residual [TAG] markers just in case the model included them.
  const cleanVisual = visualPrompt
    .replace(/\[SLUGLINE\][^\n]*/gi, "")
    .replace(/\[ACTION\]/gi, "")
    .replace(/\[CAMERA\]/gi, "")
    .replace(/INT\.|EXT\./gi, "")
    .replace(/\n+/g, " ")
    .trim();

  // Clean dialogue: strip speaker prefix and quotes for on-screen speech
  const cleanDialogue = dialogueText
    .replace(/^[A-Z0-9\s_-]+:\s*/i, "")
    .replace(/^"|"$/g, "")
    .trim();

  // Build the Veo prompt: cinematic prefix + visual description + dialogue + sound design
  const speechLine = cleanDialogue ? ` A character speaks aloud: "${cleanDialogue}".` : "";
  const audioLine = audioPrompt ? ` Soundscape: ${audioPrompt}.` : "";

  const enhancedPrompt = `Photorealistic cinematic film footage, shot on 35mm film. ${cleanVisual}${speechLine}${audioLine} Ultra realistic, no text on screen, no graphics, no animation. Looks like a real Hollywood movie scene. 16:9 aspect ratio.`;
  console.log(`Scene ${sceneNumber} Veo prompt: ${enhancedPrompt.substring(0, 200)}...`);

  const videoOutputPath = outputPath.replace(/\.jpg$/i, "_raw.mp4");

  // Check video cache first
  const cachedVideoPath = await getCachedVisual(enhancedPrompt, true, videoOutputPath);
  if (cachedVideoPath) {
    return cachedVideoPath;
  }

  // Wrap entire visual generation with timeout
  try {
    return await withTimeout(
      generateVisualWithTimeout(enhancedPrompt, videoOutputPath, sceneNumber, characters, startingImageBase64),
      VEO_POLL_TIMEOUT,
      `Veo video generation for Scene ${sceneNumber}`
    );
  } catch (error) {
    console.error(`Visual generation failed for Scene ${sceneNumber}:`, error);
    throw error;
  }
}

async function generateVisualWithTimeout(
  enhancedPrompt: string,
  videoOutputPath: string,
  sceneNumber: number,
  characters?: any[],
  startingImageBase64?: string
): Promise<string> {
  let useCharacters = true;
  let useStartingImage = true;

  for (let strategy = 1; strategy <= 4; strategy++) {
    try {
      console.log(`[Veo Safety Retry] Strategy ${strategy} for Scene ${sceneNumber}: useCharacters=${useCharacters}, useStartingImage=${useStartingImage}`);
      return await executeVeoGeneration(
        enhancedPrompt,
        videoOutputPath,
        sceneNumber,
        useCharacters ? characters : undefined,
        useStartingImage ? startingImageBase64 : undefined
      );
    } catch (error: any) {
      const errorMsg = error.message || String(error);
      const isInputImageSafetyBlock = 
        errorMsg.toLowerCase().includes("blocked by your current safety settings") || 
        errorMsg.toLowerCase().includes("person/face generation") ||
        errorMsg.toLowerCase().includes("input image contains content");

      if (isInputImageSafetyBlock) {
        console.warn(`[Veo Safety Block] Detected safety block on Strategy ${strategy} for Scene ${sceneNumber}. Error: ${errorMsg}`);
        
        if (strategy === 1) {
          // Fallback to Strategy 2: Remove character reference images
          useCharacters = false;
          console.log(`[Veo Safety Fallback] Retrying without character reference images...`);
          continue;
        } else if (strategy === 2) {
          // Fallback to Strategy 3: Restore characters, remove starting image
          useCharacters = true;
          useStartingImage = false;
          console.log(`[Veo Safety Fallback] Retrying without starting image...`);
          continue;
        } else if (strategy === 3) {
          // Fallback to Strategy 4: Remove both
          useCharacters = false;
          useStartingImage = false;
          console.log(`[Veo Safety Fallback] Retrying without both characters and starting image...`);
          continue;
        }
      }
      // If it's not a safety block or we've run out of options, throw the error
      throw error;
    }
  }
  throw new Error("Veo 3.1 video generation failed after all safety fallback attempts.");
}

async function executeVeoGeneration(
  enhancedPrompt: string,
  videoOutputPath: string,
  sceneNumber: number,
  characters?: any[],
  startingImageBase64?: string
): Promise<string> {
  // Strategy 0: Veo 3.1 — High Quality, Google DeepMind
  let operation;
  let attempt = 0;
  const maxAttempts = 4;
  let lastErrorMsg = "";

  const config: any = {
    numberOfVideos: 1,
    aspectRatio: "16:9",
  };

  if (characters && characters.length > 0) {
    const referenceImages = characters
      .map(c => {
        if (!c.imageBase64) return null;
        const match = c.imageBase64.match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/);
        if (match) {
          return {
            referenceType: "ASSET",
            image: {
              mimeType: match[1],
              imageBytes: match[2]
            }
          };
        }
        return null;
      })
      .filter(Boolean);

    if (referenceImages.length > 0) {
      config.referenceImages = referenceImages;
      console.log(`Included ${referenceImages.length} character reference images in Veo config for Scene ${sceneNumber}.`);
    }
  }

  const veoParams: any = {
    model: "veo-3.1-fast-generate-001",
    prompt: enhancedPrompt,
    config,
  };

  if (startingImageBase64) {
    const match = startingImageBase64.match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/);
    if (match) {
      veoParams.image = {
        mimeType: match[1],
        imageBytes: match[2]
      };
    } else {
      veoParams.image = {
        mimeType: "image/jpeg",
        imageBytes: startingImageBase64
      };
    }
    console.log(`Included starting frame (image) in Veo request for Scene ${sceneNumber}.`);
  }

  while (attempt < maxAttempts) {
    try {
      console.log(`Attempting video generation using veo-3.1-fast-generate-001 (Attempt ${attempt + 1}/${maxAttempts})...`);
      operation = await withTimeout(
        ai.models.generateVideos(veoParams),
        VEO_START_TIMEOUT,
        `Veo start for scene ${sceneNumber}`
      );
      break; // Successfully started operation, exit retry loop
    } catch (startError: any) {
      lastErrorMsg = startError.message || String(startError);
      console.warn(`Veo 3.1 start failed (attempt ${attempt + 1}): ${lastErrorMsg}`);

      // If it's a high load or quota error, wait and retry. Otherwise, it might be a safety block.
      if (lastErrorMsg.toLowerCase().includes("load") || lastErrorMsg.toLowerCase().includes("quota") || lastErrorMsg.toLowerCase().includes("429") || lastErrorMsg.toLowerCase().includes("503")) {
        attempt++;
        if (attempt < maxAttempts) {
          const waitSeconds = attempt * 15; // 15s, 30s, 45s
          console.log(`Waiting ${waitSeconds} seconds before retrying Veo...`);
          await new Promise(res => setTimeout(res, waitSeconds * 1000));
        }
      } else {
        // Not a high load error (e.g. safety filter), throw immediately
        throw new Error(`Veo 3.1 Video Generation Failed: ${lastErrorMsg}`);
      }
    }
  }

  if (!operation) {
    throw new Error(`Veo API error: The service is currently experiencing high load after ${maxAttempts} attempts. Please try again later. Last error: ${lastErrorMsg}`);
  }

  try {
    // Poll for completion — Veo can take several minutes
    let pollCount = 0;
    const maxPolls = 60; // ~10 minutes max with 10 second waits

    while (!operation.done && pollCount < maxPolls) {
      console.log(`Polling Veo 3.1 for Scene ${sceneNumber} (attempt ${pollCount + 1}/${maxPolls})...`);
      await new Promise((resolve) => setTimeout(resolve, 10000));

      try {
        operation = await withTimeout(
          ai.operations.getVideosOperation({ operation }),
          VEO_SINGLE_POLL_TIMEOUT,
          `Veo poll for scene ${sceneNumber}`
        );
      } catch (pollError: any) {
        console.warn(`Poll timeout for scene ${sceneNumber}, retrying...`);
        // Continue to next poll instead of failing immediately
      }

      pollCount++;
    }

    if (operation.error) {
      throw new Error(`Veo API error: ${operation.error.message || JSON.stringify(operation.error)}`);
    }

    if (!operation.done) {
      throw new Error("Veo video generation timed out after 10 minutes.");
    }

    const videoObj = operation.response?.generatedVideos?.[0]?.video;

    if (videoObj?.videoBytes) {
      // Veo 3.1 on Vertex AI returns raw base64 encoded bytes
      const videoBuffer = Buffer.from(videoObj.videoBytes, "base64");
      fs.writeFileSync(videoOutputPath, videoBuffer);
      console.log(`Successfully decoded and saved Veo 3 video clip for Scene ${sceneNumber}.`);
      await saveCachedVisual(enhancedPrompt, true, videoOutputPath);
      return videoOutputPath;
    } else if (videoObj?.uri) {
      const downloadLink = videoObj.uri;
      const downloadUrl = useVertexAI ? downloadLink : `${downloadLink}&key=${apiKey}`;

      try {
        const response = await withTimeout(
          fetch(downloadUrl),
          30000,
          `Download Veo video for scene ${sceneNumber}`
        );

        if (response.ok) {
          const videoBuffer = Buffer.from(await response.arrayBuffer());
          fs.writeFileSync(videoOutputPath, videoBuffer);
          console.log(`Successfully generated and downloaded Veo 3 video clip for Scene ${sceneNumber}.`);
          await saveCachedVisual(enhancedPrompt, true, videoOutputPath);
          return videoOutputPath;
        } else {
          throw new Error(`Failed to download Veo video from URI: ${response.status} ${response.statusText}`);
        }
      } catch (downloadError: any) {
        throw new Error(`Video download failed: ${downloadError.message}`);
      }
    } else {
      throw new Error("Veo 3.1 did not return a valid video link.");
    }
  } catch (veoError: any) {
    const errorMsg = veoError.message || String(veoError);
    console.error(`Veo 3.1 generation failed: ${errorMsg}`);
    throw new Error(`Veo 3.1 Video Generation Failed: ${errorMsg}`);
  }
}
