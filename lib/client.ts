"use client";
import type { ApiKeys } from "./types";

const KEY = "admaker.keys.v1";

export function loadKeys(): ApiKeys {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}

export function saveKeys(keys: ApiKeys) {
  localStorage.setItem(KEY, JSON.stringify(keys));
}

function keyHeaders(keys: ApiKeys): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json" };
  if (keys.anthropic) h["x-anthropic-key"] = keys.anthropic;
  if (keys.fal) h["x-fal-key"] = keys.fal;
  if (keys.elevenlabs) h["x-elevenlabs-key"] = keys.elevenlabs;
  if (keys.pexels) h["x-pexels-key"] = keys.pexels;
  if (keys.aspen) h["x-aspen-key"] = keys.aspen;
  if (keys.aspenBaseUrl) h["x-aspen-base-url"] = keys.aspenBaseUrl;
  if (keys.aspenModel) h["x-aspen-model"] = keys.aspenModel;
  return h;
}

export async function api<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: keyHeaders(loadKeys()),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data as T;
}

export function hasAnyKey(k: ApiKeys) {
  return !!(k.anthropic || k.fal || k.elevenlabs || k.aspen);
}
