export type AspectRatio = "16:9" | "9:16" | "1:1";

export type VisualType = "ai_video" | "designed_card" | "screen_rec";

export type SceneStatus = "idle" | "queued" | "running" | "done" | "error";

export interface CardSpec {
  headline?: string;
  sub?: string;
  bullets?: string[];
  note?: string; // styling hint, e.g. "looks like an internal deck slide"
}

export interface Scene {
  id: string;
  index: number;
  durationSec: number; // clamped 2..8 — models can't do long clips
  visualType: VisualType;
  videoPrompt?: string; // for ai_video
  footageQuery?: string; // for stock footage (2-4 words of b-roll)
  card?: CardSpec; // for designed_card
  voiceover?: string; // VO line under this scene (may be empty)
  onScreenText?: string;
  usesCharacterRef?: boolean; // reuse the reference still for continuity
  // runtime / generated:
  status: SceneStatus;
  videoUrl?: string;
  error?: string;
}

export interface CharacterRef {
  description: string; // prompt used to make the recurring still
  imageUrl?: string; // generated reference frame
}

export interface Storyboard {
  title: string;
  logline: string;
  aspectRatio: AspectRatio;
  characterRef: CharacterRef | null;
  musicPrompt: string;
  scenes: Scene[];
}

export interface ModelChoice {
  style: "stock" | "designed" | "ai_video";
  videoModel: VideoModelId;
  imageModel: ImageModelId;
  voiceId: string;
  music: boolean;
}

export type VideoModelId =
  | "fal-ai/kling-video/v3/standard/text-to-video"
  | "fal-ai/kling-video/v2.1/pro/image-to-video"
  | "fal-ai/veo3.1";

export type ImageModelId = "fal-ai/flux/dev" | "fal-ai/flux-pro/v1.1";

export interface CostLine {
  label: string;
  detail: string;
  usd: number;
}

export interface CostEstimate {
  lines: CostLine[];
  totalUsd: number;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ApiKeys {
  anthropic?: string;
  fal?: string;
  elevenlabs?: string;
  pexels?: string;
  // Aspen: an OpenAI-compatible (local) LLM endpoint. When the key is set it
  // takes over the text work (creative director, script, storyboard, brand,
  // stills copy) in place of Claude. baseUrl/model are config, not secrets.
  aspen?: string;
  aspenBaseUrl?: string;
  aspenModel?: string;
}

export interface BrandProfile {
  name: string;
  what: string; // one sentence: what the company does
  audience: string;
  tone: string; // 3-5 adjectives
  colors: { bg: string; text: string; accent: string };
}
