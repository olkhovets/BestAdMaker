import type { NextRequest } from "next/server";
import { searchPhoto } from "@/lib/providers/pexels";
import { generateImage } from "@/lib/providers/fal";
import { resolveKeys, jsonError } from "@/lib/route-utils";
import type { ImageModelId } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

// Fetch the source image server-side and hand the client a data URL. Drawing a
// data URL onto a canvas never taints it, so renderStill can call toDataURL even
// when the original host (Pexels / fal CDN) sends no CORS headers.
async function toDataUrl(url: string): Promise<string | null> {
  const res = await fetch(url);
  if (!res.ok) return null;
  const buf = await res.arrayBuffer();
  const mime = res.headers.get("content-type") || "image/jpeg";
  return `data:${mime};base64,${Buffer.from(buf).toString("base64")}`;
}

export async function POST(req: NextRequest) {
  try {
    const { style, query, prompt, aspectRatio, model } = await req.json();
    const keys = resolveKeys(req);
    const ar = aspectRatio ?? "9:16";

    let srcUrl: string | null = null;
    if (style === "photo") {
      const r = await searchPhoto({ query: query ?? "", aspectRatio: ar, key: keys.pexels });
      srcUrl = r.url;
    } else if (style === "ai") {
      const r = await generateImage({
        model: (model as ImageModelId) ?? "fal-ai/flux/dev",
        prompt: prompt ?? "",
        aspectRatio: ar,
        key: keys.fal,
      });
      srcUrl = r.url || null; // mock mode returns an empty url
    }

    // No source (mock mode, no match, or no key) — tell the client to fall back to
    // the typography-only treatment for this concept.
    if (!srcUrl) return Response.json({ dataUrl: null, mock: true });
    return Response.json({ dataUrl: await toDataUrl(srcUrl) });
  } catch (e: any) {
    return jsonError(e?.message ?? "still background failed");
  }
}
