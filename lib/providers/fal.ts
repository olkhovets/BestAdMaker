import { createFalClient } from "@fal-ai/client";
import type { AspectRatio, VideoModelId, ImageModelId } from "../types";
import { mockVideo, mockImage } from "./mock";

const KLING_TEXT = "fal-ai/kling-video/v3/standard/text-to-video";
const KLING_IMAGE = "fal-ai/kling-video/v2.1/pro/image-to-video";
const VEO = "fal-ai/veo3.1";

function klingDuration(sec: number): string {
  // Kling accepts "5" or "10". Round our 2-8s scene up to the nearest valid value.
  return Math.round(sec) > 6 ? "10" : "5";
}

function imageSize(ar: AspectRatio) {
  if (ar === "9:16") return "portrait_16_9";
  if (ar === "1:1") return "square_hd";
  return "landscape_16_9";
}

function pickUrl(data: any, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = k.split(".").reduce((o: any, p) => o?.[p], data);
    if (typeof v === "string") return v;
  }
  return data?.images?.[0]?.url ?? data?.videos?.[0]?.url;
}

function friendlyError(e: any): string {
  const detail = e?.body?.detail ?? e?.body?.message ?? e?.body;
  if (Array.isArray(detail)) {
    return detail.map((d: any) => `${(d.loc || []).join(".")}: ${d.msg}`).join("; ");
  }
  if (typeof detail === "string") return detail;
  if (detail) return JSON.stringify(detail);
  return e?.message || "fal request failed";
}

// Build the right model id + input for the chosen family. Critically: if an
// image-to-video model was chosen but we have no reference image, fall back to
// the text-to-video sibling so the scene still generates instead of erroring.
function buildVideoCall(opts: {
  model: VideoModelId;
  prompt: string;
  durationSec: number;
  aspectRatio: AspectRatio;
  imageUrl?: string;
}): { model: string; input: any } {
  const { prompt, durationSec, aspectRatio, imageUrl } = opts;

  if (opts.model === KLING_IMAGE) {
    if (imageUrl) {
      return {
        model: KLING_IMAGE,
        input: { prompt, image_url: imageUrl, duration: klingDuration(durationSec), aspect_ratio: aspectRatio },
      };
    }
    // No reference image — degrade gracefully to text-to-video.
    return {
      model: KLING_TEXT,
      input: { prompt, duration: klingDuration(durationSec), aspect_ratio: aspectRatio },
    };
  }

  if (opts.model === VEO) {
    return { model: VEO, input: { prompt, resolution: "720p", aspect_ratio: aspectRatio, audio: false } };
  }

  // Kling text-to-video (default)
  return { model: KLING_TEXT, input: { prompt, duration: klingDuration(durationSec), aspect_ratio: aspectRatio } };
}

export async function generateVideo(opts: {
  model: VideoModelId;
  prompt: string;
  durationSec: number;
  aspectRatio: AspectRatio;
  imageUrl?: string;
  index: number;
  key?: string;
}): Promise<{ url: string; mock?: boolean; prompt?: string; index?: number; usedModel?: string }> {
  if (!opts.key) return mockVideo(opts.prompt, opts.index);
  const fal = createFalClient({ credentials: opts.key });
  const { model, input } = buildVideoCall(opts);
  try {
    const { data } = await fal.subscribe(model, { input });
    const url = pickUrl(data, ["video.url", "url"]);
    if (!url) throw new Error(`fal returned no video url (model ${model})`);
    return { url, usedModel: model };
  } catch (e: any) {
    throw new Error(`[${model}] ${friendlyError(e)}`);
  }
}

export async function generateImage(opts: {
  model: ImageModelId;
  prompt: string;
  aspectRatio: AspectRatio;
  key?: string;
}): Promise<{ url: string; mock?: boolean; prompt?: string }> {
  if (!opts.key) return mockImage(opts.prompt);
  const fal = createFalClient({ credentials: opts.key });
  try {
    const { data } = await fal.subscribe(opts.model, {
      input: { prompt: opts.prompt, image_size: imageSize(opts.aspectRatio), num_images: 1 },
    });
    const url = pickUrl(data, ["images.0.url", "image.url"]);
    if (!url) throw new Error("fal returned no image url");
    return { url };
  } catch (e: any) {
    throw new Error(`[${opts.model}] ${friendlyError(e)}`);
  }
}
