import type { NextRequest } from "next/server";
import { ideate } from "@/lib/providers/anthropic";
import { resolveKeys, jsonError } from "@/lib/route-utils";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const { messages, mode } = await req.json();
    const keys = resolveKeys(req);
    const aspen = { key: keys.aspen, baseUrl: keys.aspenBaseUrl, model: keys.aspenModel };
    const reply = await ideate(messages ?? [], keys.anthropic, mode === "script" ? "script" : "chat", aspen);
    return Response.json({ reply, mock: !keys.anthropic && !keys.aspen });
  } catch (e: any) {
    return jsonError(e?.message ?? "ideate failed");
  }
}
