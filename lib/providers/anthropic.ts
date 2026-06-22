import type { AspectRatio, ChatMessage, Scene, Storyboard } from "../types";
import { mockStoryboard } from "./mock";

const API = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";

function headers(key: string) {
  return {
    "content-type": "application/json",
    "x-api-key": key,
    "anthropic-version": "2023-06-01",
  };
}

const CREATIVE_SYSTEM = `You are the Head of Video for a top-tier creative agency — the level of Wieden+Kennedy or Droga5. You're paired with a founder who has no time and no patience for mediocre work. Your job is to make ads that other marketers screenshot and share.

How great advertising works, and what you hold yourself to:
- ONE idea. A single sharp insight or tension, not a list of features. If you can't say the idea in one sentence, it isn't ready.
- A creative DEVICE. A metaphor, a reframe, a structural conceit, a turn that recontextualizes everything before it. Problem-then-solution is the floor, not the goal — find the angle that surprises.
- RESTRAINT. Short lines. White space. Let silence and a single word do the work. Never explain the joke or the point.
- SPECIFICITY. Concrete, ownable images over abstract claims. "$80,000 and six weeks for a slide nobody read" beats "slow and expensive research."
- A BUTTON. The final line lands the brand and is genuinely memorable. Earn it.
- Voice: confident, a little subversive, human. Never corporate, never hype.

Banned, on sight: "In a world where…", "Imagine if…", "Introducing…", stacked rhetorical questions, three-adjective filler ("better, cheaper, faster"), and anything a generic B2B SaaS video would say.

If the user names a company or URL, web-search it first so the work is specific to them. Make confident assumptions, ask at most one question, and bias hard toward writing. When they signal go, deliver the full script immediately.`;

const SCRIPT_SYSTEM = `Write a world-class ad script — agency-grade, the kind that wins awards. Pull product, audience, and angle from the conversation; web-search the company if you lack specifics.

Discipline: ONE idea, a creative device or turn, ruthless restraint, concrete specific images, and a memorable closing button that locks the brand. No filler, no feature lists, no clichés ("imagine", "introducing", "in a world"), no three-adjective padding, no em dashes.

Format the output EXACTLY like this, nothing else:

TITLE: <the idea in a few words>

SCENE 1 [Xs]
ON SCREEN: <the few words that appear on screen — punchy, wrap the single punch word in *asterisks*>
VO: <the spoken line, or "(silence)">

SCENE 2 [Xs]
...

Rules for scenes: 5-8 scenes for a 30s ad. Each scene 3-6 seconds. ON SCREEN text is SHORT (under ~8 words) and is the visual — it is not the same as the VO. The last scene is the brand button. Keep total close to the requested length.`;

const WEB_SEARCH_TOOL = { type: "web_search_20250305", name: "web_search", max_uses: 4 };

function extractText(data: any): string {
  return (data.content ?? [])
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("\n")
    .trim();
}

export async function ideate(
  messages: ChatMessage[],
  key?: string,
  mode: "chat" | "script" = "chat"
): Promise<string> {
  if (!key) {
    return mockIdeate(messages);
  }
  const res = await fetch(API, {
    method: "POST",
    headers: headers(key),
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      system: mode === "script" ? SCRIPT_SYSTEM : CREATIVE_SYSTEM,
      tools: [WEB_SEARCH_TOOL],
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  return extractText(await res.json());
}

const PLAN_SYSTEM = `You convert an approved ad script into a production storyboard as STRICT JSON for a motion-graphics engine. Follow exactly:

- Every scene's durationSec is between 2 and 8 (read the [Xs] markers).
- onScreenText: the SHORT words shown on screen (under ~8 words). Preserve any *asterisks* around the punch word — the renderer highlights them. This drives the visual.
- voiceover: the spoken VO line for the scene (empty string if "(silence)").
- visualType: use "designed_card" for every scene by default (the engine renders art-directed kinetic typography). Use "ai_video" ONLY if a scene genuinely needs literal footage, and "screen_rec" only for a product-demo placeholder. When unsure, choose "designed_card".
- characterRef: null (designed motion needs no character continuity).
- musicPrompt: one instrumental bed with a clear arc that matches the script's tone.

Return ONLY the JSON object, no prose, no code fences:
{"title":string,"logline":string,"aspectRatio":"16:9"|"9:16"|"1:1","characterRef":null,"musicPrompt":string,"scenes":[{"durationSec":number,"visualType":"designed_card"|"ai_video"|"screen_rec","onScreenText":string,"voiceover":string,"videoPrompt":string,"usesCharacterRef":false}]}`;

export async function planStoryboard(
  script: string,
  aspectRatio: AspectRatio,
  key?: string
): Promise<Storyboard> {
  if (!key) {
    return mockStoryboard(script, aspectRatio);
  }
  const res = await fetch(API, {
    method: "POST",
    headers: headers(key),
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8000,
      system: PLAN_SYSTEM,
      messages: [
        {
          role: "user",
          content: `Aspect ratio: ${aspectRatio}\n\nScript:\n${script}`,
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const raw = (data.content ?? [])
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("");
  const board = normalizeBoard(raw, aspectRatio);
  // Never hand back a blank storyboard. If the model's JSON couldn't be parsed
  // into scenes, fall back to a deterministic local split of the script.
  if (board.scenes.length === 0) {
    return localSplit(script, aspectRatio);
  }
  return board;
}

function mockIdeate(messages: ChatMessage[]): string {
  return `Mock mode — I can't think or look anything up without an Anthropic key.

Open Settings, paste your Anthropic key, and I'll research your company, find the angle, and write the full script in one pass. Until then this is just a dry run of the interface.`;
}

// Pull the first balanced top-level {...} object out of a noisy string.
function extractJsonObject(raw: string): string | null {
  const start = raw.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < raw.length; i++) {
    const c = raw[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return null; // unbalanced (truncated)
}

// Shared: turn raw model JSON (or mock) into a clean Storyboard with safe defaults.
export function normalizeBoard(raw: string, aspectRatio: AspectRatio): Storyboard {
  let obj: any = null;
  const cleaned = raw
    .trim()
    .replace(/^```json/i, "")
    .replace(/^```/, "")
    .replace(/```$/, "")
    .trim();
  try {
    obj = JSON.parse(cleaned);
  } catch {
    const block = extractJsonObject(cleaned);
    if (block) {
      try {
        obj = JSON.parse(block);
      } catch {
        obj = null;
      }
    }
  }
  if (!obj || !Array.isArray(obj.scenes)) {
    return { title: "Untitled ad", logline: "", aspectRatio, characterRef: null, musicPrompt: "", scenes: [] };
  }
  const scenes = obj.scenes.map((s: any, i: number) => ({
    id: `s${i + 1}`,
    index: i,
    durationSec: Math.max(2, Math.min(8, Math.round(s.durationSec ?? 5))),
    visualType: ["ai_video", "designed_card", "screen_rec"].includes(s.visualType)
      ? s.visualType
      : "ai_video",
    videoPrompt: s.videoPrompt ?? "",
    card: s.card,
    voiceover: s.voiceover ?? "",
    onScreenText: s.onScreenText ?? "",
    usesCharacterRef: !!s.usesCharacterRef,
    status: "idle" as const,
  }));
  return {
    title: obj.title ?? "Untitled ad",
    logline: obj.logline ?? "",
    aspectRatio: (obj.aspectRatio as AspectRatio) ?? aspectRatio,
    characterRef: obj.characterRef?.description ? { description: obj.characterRef.description } : null,
    musicPrompt: obj.musicPrompt ?? "",
    scenes,
  };
}

// Deterministic safety net: split a script into scenes locally so the storyboard
// is NEVER blank, even if the model's JSON fails entirely.
export function localSplit(script: string, aspectRatio: AspectRatio): Storyboard {
  // Break on scene markers, blank lines, or sentences.
  const chunks = script
    .replace(/scene\s*\d+\s*[:.\-]?/gi, "\n")
    .split(/\n+|(?<=[.!?])\s+(?=[A-Z])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1)
    .slice(0, 14);

  const scenes = (chunks.length ? chunks : [script]).map((line, i) => {
    const vo = line.replace(/^vo\s*[:\-]\s*/i, "").trim();
    const looksLikeText = /[A-Z]{3,}|\d|logo|headline|title|%|\$/.test(line) && vo.length < 40;
    return {
      id: `s${i + 1}`,
      index: i,
      durationSec: 4,
      visualType: (looksLikeText ? "designed_card" : "ai_video") as Scene["visualType"],
      videoPrompt: looksLikeText ? "" : `Cinematic shot illustrating: ${vo}. 4 seconds.`,
      card: looksLikeText ? { headline: vo.slice(0, 40) } : undefined,
      voiceover: vo,
      onScreenText: looksLikeText ? vo.slice(0, 40) : "",
      usesCharacterRef: false,
      status: "idle" as const,
    };
  });

  return {
    title: chunks[0]?.slice(0, 50) || "Your ad",
    logline: "Auto-split from your script. Edit any scene below.",
    aspectRatio,
    characterRef: null,
    musicPrompt: "Instrumental bed matching the tone of the script, with a clear build and resolve.",
    scenes,
  };
}
