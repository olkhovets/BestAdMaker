import type { NextRequest } from "next/server";
import { extractBrand } from "@/lib/providers/anthropic";
import { resolveKeys, jsonError } from "@/lib/route-utils";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    let { url } = await req.json();
    if (!url) return jsonError("no url", 400);
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    const keys = resolveKeys(req);
    let html = "";
    try {
      const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 AdMaker" } });
      html = await r.text();
    } catch {
      return jsonError("could not reach that site", 502);
    }
    const aspen = { key: keys.aspen, baseUrl: keys.aspenBaseUrl, model: keys.aspenModel };
    const brand = await extractBrand(url, html, keys.anthropic, aspen);
    return Response.json({ brand, mock: !keys.anthropic && !keys.aspen });
  } catch (e: any) {
    return jsonError(e?.message ?? "brand extraction failed");
  }
}
