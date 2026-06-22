import type { NextRequest } from "next/server";
import type { ApiKeys } from "./types";

export function resolveKeys(req: NextRequest): ApiKeys {
  const h = req.headers;
  return {
    anthropic: h.get("x-anthropic-key") || process.env.ANTHROPIC_API_KEY || undefined,
    fal: h.get("x-fal-key") || process.env.FAL_KEY || undefined,
    elevenlabs: h.get("x-elevenlabs-key") || process.env.ELEVENLABS_API_KEY || undefined,
    pexels: h.get("x-pexels-key") || process.env.PEXELS_API_KEY || undefined,
    aspen: h.get("x-aspen-key") || process.env.ASPEN_API_KEY || undefined,
    aspenBaseUrl: h.get("x-aspen-base-url") || process.env.ASPEN_BASE_URL || undefined,
    aspenModel: h.get("x-aspen-model") || process.env.ASPEN_MODEL || undefined,
  };
}

export function jsonError(message: string, status = 500) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}
