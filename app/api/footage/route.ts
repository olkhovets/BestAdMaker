import type { NextRequest } from "next/server";
import { searchFootage } from "@/lib/providers/pexels";
import { resolveKeys, jsonError } from "@/lib/route-utils";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const { query, aspectRatio, exclude } = await req.json();
    const keys = resolveKeys(req);
    const out = await searchFootage({ query, aspectRatio, key: keys.pexels, exclude });
    return Response.json(out);
  } catch (e: any) {
    return jsonError(e?.message ?? "footage search failed");
  }
}
