import type { NextRequest } from "next/server";
import { stillCopy } from "@/lib/providers/anthropic";
import { resolveKeys, jsonError } from "@/lib/route-utils";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { brief } = await req.json();
    const keys = resolveKeys(req);
    const aspen = { key: keys.aspen, baseUrl: keys.aspenBaseUrl, model: keys.aspenModel };
    const concepts = await stillCopy(brief ?? "", keys.anthropic, aspen);
    return Response.json({ concepts, mock: !keys.anthropic && !keys.aspen });
  } catch (e: any) {
    return jsonError(e?.message ?? "stills copy failed");
  }
}
