import type {
  CostEstimate,
  ImageModelId,
  ModelChoice,
  Storyboard,
  VideoModelId,
} from "./types";

// Rates are ESTIMATES, current as of mid-2026, and easy to edit in one place.
// Video is priced per second of output. Sources: fal.ai model pages + vendor docs.
export const VIDEO_MODELS: Record<
  VideoModelId,
  { label: string; usdPerSec: number; supportsImageRef: boolean; note: string }
> = {
  "fal-ai/kling-video/v3/standard/text-to-video": {
    label: "Kling 3.0 (text→video)",
    usdPerSec: 0.1,
    supportsImageRef: false,
    note: "Cheapest, reliable, needs no reference image. Best default.",
  },
  "fal-ai/kling-video/v2.1/pro/image-to-video": {
    label: "Kling 2.1 Pro (image→video)",
    usdPerSec: 0.15,
    supportsImageRef: true,
    note: "Animates a reference still to keep a character consistent across scenes.",
  },
  "fal-ai/veo3.1": {
    label: "Veo 3.1 (text→video, native audio)",
    usdPerSec: 0.4,
    supportsImageRef: false,
    note: "Highest quality with synced audio. Pricier ($0.40/s with audio).",
  },
};

export const IMAGE_MODELS: Record<ImageModelId, { label: string; usdPerImage: number }> = {
  "fal-ai/flux/dev": { label: "FLUX dev", usdPerImage: 0.025 },
  "fal-ai/flux-pro/v1.1": { label: "FLUX 1.1 Pro", usdPerImage: 0.04 },
};

// ElevenLabs is credit-based; this approximates the per-character cost on a paid tier.
const VOICE_USD_PER_CHAR = 0.00018;
const MUSIC_USD_PER_TRACK = 0.8; // ~one instrumental bed
// Claude ideation/planning — a rough envelope, not billed per scene.
const LLM_FLAT_USD = 0.08;

function clampDuration(sec: number) {
  return Math.max(2, Math.min(8, Math.round(sec)));
}

export function estimateCost(board: Storyboard, choice: ModelChoice): CostEstimate {
  const lines: CostEstimate["lines"] = [];

  const aiScenes = board.scenes.filter((s) => s.visualType === "ai_video");
  const videoSeconds = aiScenes.reduce((n, s) => n + clampDuration(s.durationSec), 0);
  const vModel = VIDEO_MODELS[choice.videoModel];

  if (choice.style === "designed") {
    lines.push({
      label: "Designed motion",
      detail: "art-directed typography, rendered in-browser",
      usd: 0,
    });
  } else {
    const videoUsd = videoSeconds * vModel.usdPerSec;
    lines.push({
      label: "AI video",
      detail: `${aiScenes.length} scenes · ${videoSeconds}s · ${vModel.label} @ $${vModel.usdPerSec}/s`,
      usd: videoUsd,
    });
    if (board.characterRef && vModel.supportsImageRef) {
      const img = IMAGE_MODELS[choice.imageModel];
      lines.push({ label: "Character still", detail: `1 reference frame · ${img.label}`, usd: img.usdPerImage });
    }
  }

  const voChars = board.scenes.reduce((n, s) => n + (s.voiceover?.length ?? 0), 0);
  if (voChars > 0) {
    lines.push({
      label: "Voiceover",
      detail: `${voChars} characters · ElevenLabs`,
      usd: voChars * VOICE_USD_PER_CHAR,
    });
  }

  if (choice.music && board.musicPrompt) {
    lines.push({ label: "Music bed", detail: "1 instrumental track", usd: MUSIC_USD_PER_TRACK });
  }

  lines.push({ label: "Scripting", detail: "Claude ideation + storyboard", usd: LLM_FLAT_USD });

  const totalUsd = lines.reduce((n, l) => n + l.usd, 0);
  return { lines, totalUsd: Math.round(totalUsd * 100) / 100 };
}

export function fmtUsd(n: number) {
  return `$${n.toFixed(2)}`;
}
