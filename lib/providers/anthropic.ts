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

const SCRIPT_SYSTEM = `Write a script with the craft of a great brand film — think Apple's "1984", Nike, Apple "Think Different". This is an anthem, not an explainer.

The single most important rule: IT MUST BUILD. Energy rises from the first frame to the last. Most ads start punchy and then die into a feature list — that is the failure to avoid at all costs. The voiceover carries ONE escalating argument to an emotional peak, then lands a resonant button.

Structure the arc:
1. Cold open — a hook that creates tension or indicts something the viewer secretly does.
2. Escalate — raise the stakes, make them FEEL the cost of the status quo. Rhythm tightens.
3. The turn — one reframe that flips the tension into possibility.
4. Crescendo — the boldest, most emotional claim. The peak. This is where a lesser ad would start listing features — you do the opposite and go bigger.
5. Button — the brand and a single resonant line they'll remember.

Hard rules:
- NO feature lists in the VO. Features ("real or synthetic", "production-ready assets", integrations) belong in a deck, never in the anthem. The VO is one feeling, one argument.
- Emotion over information. Make them feel the stakes, don't explain the product.
- Rhythm: short fragments, deliberate repetition, escalating cadence. End on the strongest line.
- Specific and concrete over abstract. No clichés ("imagine", "introducing", "in a world"), no three-adjective filler, no em dashes.

Format EXACTLY, nothing else:

TITLE: <the idea in a few words>

SCENE 1 [Xs]
ON SCREEN: <short on-screen words, wrap the single punch word in *asterisks*>
VO: <the spoken line, or "(silence)">

SCENE 2 [Xs]
...

7-9 scenes for a 30s ad, each 2-5s, ON SCREEN under ~8 words, ON SCREEN distinct from VO. Last scene is the brand button. Make the final VO line the best line in the whole script.`;

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

const PLAN_SYSTEM = `You convert an approved ad script into a production storyboard as STRICT JSON for a video engine that pairs real stock footage with kinetic text and a voiceover. Follow exactly:

- The scenes must tell ONE coherent story start to finish: tension, escalation, then resolution into the brand. Each scene is one clear beat that follows from the last.
- durationSec between 2 and 8 (read [Xs] markers). This is a hint; the final cut is timed to the voiceover.
- onScreenText: the SHORT words shown on screen (under ~8 words). Preserve *asterisks* around the punch word.
- voiceover: the spoken VO line (empty string if "(silence)").
- footageQuery: 2-4 concrete words naming real b-roll that literally fits the beat, the kind a stock library would have. Good: "empty boardroom", "city traffic night", "hands typing laptop", "team celebrating office". Bad: abstract concepts like "confident decision". Every scene needs one. CRITICAL: every scene's query must be VISUALLY DISTINCT from every other scene's — never reuse the same subject or location twice, or the ad looks like one looping clip. Favor cinematic, evocative footage (dramatic light, motion, scale, texture) over flat literal desk shots.
- visualType: "designed_card" for all scenes (the engine overlays text on footage). 
- characterRef: null.
- musicPrompt: a vivid, cinematic brief for ONE instrumental score that mirrors the ad's arc. Be specific about instrumentation, tempo, and a clear build to a peak then resolve — the kind of trailer/brand-film score that gives goosebumps. Name real textures (e.g. "lone piano", "swelling strings", "deep sub hits", "a single rising synth", "no drums until the final third"). No vocals, no cheese, no stock-library feel.

Return ONLY the JSON object, no prose, no code fences:
{"title":string,"logline":string,"aspectRatio":"16:9"|"9:16"|"1:1","characterRef":null,"musicPrompt":string,"scenes":[{"durationSec":number,"visualType":"designed_card","onScreenText":string,"voiceover":string,"footageQuery":string,"videoPrompt":string,"usesCharacterRef":false}]}`;

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
    footageQuery: s.footageQuery ?? "",
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

const BRAND_SYSTEM = `You extract a brand profile from a company's website HTML. Return ONLY JSON, no prose, no code fences:
{"name":string,"what":one concise sentence on what the company does and for whom,"audience":string,"tone":"3-5 adjectives describing the brand voice","colors":{"bg":hex,"text":hex,"accent":hex}}

For colors: use any brand colors you can find in the HTML (inline styles, <style> blocks, theme-color meta, hex codes). The bg should be a deep on-brand background, text a high-contrast readable color, accent the brand's signature color. If you cannot find real colors, infer a tasteful palette that matches the brand's vibe. Always return valid 6-digit hex values.`;

export async function extractBrand(url: string, html: string, key?: string): Promise<any> {
  if (!key) {
    return { name: "", what: "", audience: "", tone: "", colors: { bg: "#0E0E0F", text: "#ECE7DA", accent: "#FF5631" }, mock: true };
  }
  const trimmed = html.replace(/<script[\s\S]*?<\/script>/gi, "").slice(0, 18000);
  const res = await fetch(API, {
    method: "POST",
    headers: headers(key),
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 800,
      system: BRAND_SYSTEM,
      messages: [{ role: "user", content: `URL: ${url}\n\nHTML:\n${trimmed}` }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const raw = (data.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
  const m = raw.match(/\{[\s\S]*\}/);
  return m ? JSON.parse(m[0]) : null;
}

const STILLS_SYSTEM = `You write scroll-stopping static ad copy for paid social (Meta, LinkedIn, Reddit). Given a brand and its video ad script, produce 3 DISTINCT static ad concepts, each a different angle (e.g. provocation, proof/outcome, the reframe).

Each concept:
- headline: max ~8 words, sharp enough to stop a thumb. Wrap the single punch word in *asterisks*.
- subhead: one short supporting line.
- cta: 2-3 words (e.g. "Stop guessing", "See it free").
- imageQuery: 2-4 concrete words naming a real stock PHOTO that fits the concept's mood, the kind a photo library would have (e.g. "empty boardroom", "city at dawn", "hands on keyboard"). Shootable, not abstract.
- imagePrompt: one vivid art-direction sentence for an AI-generated background image — cinematic, on-brand, evocative. NO text, words, or logos in the image (text is overlaid separately).

No clichés, no em dashes, no three-adjective filler. Return ONLY a JSON array:
[{"headline":string,"subhead":string,"cta":string,"imageQuery":string,"imagePrompt":string}, ...]`;

export async function stillCopy(brief: string, key?: string): Promise<any[]> {
  if (!key) {
    return [
      { headline: "Stop *guessing* what your market wants.", subhead: "Primary research in hours, not weeks.", cta: "See it free", imageQuery: "empty boardroom", imagePrompt: "A vast empty boardroom at dusk, one chair turned away, dramatic low light, cinematic, moody." },
      { headline: "Ten thousand buyers. *One* morning.", subhead: "Research-grade answers, on demand.", cta: "Start knowing", imageQuery: "crowd city street", imagePrompt: "A dense crowd of diverse people crossing a sunlit city street, shallow depth of field, energetic, cinematic." },
      { headline: "Not opinions. *Proof.*", subhead: "Decide with evidence, not vibes.", cta: "Book a demo", imageQuery: "data on screen", imagePrompt: "Soft-focus glowing data visualizations on a dark screen, abstract, premium, cinematic lighting." },
    ];
  }
  const res = await fetch(API, {
    method: "POST",
    headers: headers(key),
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1000,
      system: STILLS_SYSTEM,
      messages: [{ role: "user", content: brief }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const raw = (data.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
  const m = raw.match(/\[[\s\S]*\]/);
  return m ? JSON.parse(m[0]) : [];
}
