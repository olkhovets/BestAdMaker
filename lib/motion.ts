"use client";
import type { Scene } from "./types";

export interface Theme {
  bg: string;
  text: string;
  accent: string;
  muted: string;
}
const DEFAULT_THEME: Theme = { bg: "#0E0E0F", text: "#ECE7DA", accent: "#FF5631", muted: "#867D70" };

const DISPLAY = '"Bricolage Grotesque", system-ui, sans-serif';
const MONO = '"JetBrains Mono", monospace';

export const FPS = 24;

export function sceneFrameCount(scene: Scene): number {
  return Math.max(1, Math.round(scene.durationSec * FPS));
}

export async function ensureFonts() {
  try {
    await Promise.all([
      (document as any).fonts.load(`800 80px ${DISPLAY}`),
      (document as any).fonts.load(`600 80px ${DISPLAY}`),
      (document as any).fonts.ready,
    ]);
  } catch {}
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

function hexToRgba(hex: string, a: number) {
  const m = hex.replace("#", "");
  const n = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  const r = parseInt(n.slice(0, 2), 16) || 255;
  const g = parseInt(n.slice(2, 4), 16) || 86;
  const b = parseInt(n.slice(4, 6), 16) || 49;
  return `rgba(${r},${g},${b},${a})`;
}

type Template = "statement" | "list" | "stat" | "logo";

function classify(scene: Scene, isLast: boolean): Template {
  const text = (scene.onScreenText || scene.voiceover || "").trim();
  const parts = splitClauses(text);
  const stat = text.match(/(\$?\d[\d,.]*\s*[%xX+]?)/);
  if (isLast && text.split(/\s+/).length <= 6) return "logo";
  if (stat && text.split(/\s+/).length <= 6) return "stat";
  if (parts.length >= 2) return "list";
  return "statement";
}

function splitClauses(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\s*[•|]\s*|\n+/)
    .map((s) => s.trim().replace(/\.$/, ""))
    .filter((s) => s.length > 0);
}

function parseHighlights(text: string): { word: string; hot: boolean }[] {
  const out: { word: string; hot: boolean }[] = [];
  const re = /\*([^*]+)\*|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m[1]) m[1].split(/\s+/).forEach((w) => out.push({ word: w, hot: true }));
    else out.push({ word: m[2], hot: false });
  }
  return out;
}

function fitFont(ctx: CanvasRenderingContext2D, words: { word: string }[], maxW: number, maxLines: number, weight: number, start: number): number {
  for (let size = start; size > 16; size -= 2) {
    ctx.font = `${weight} ${size}px ${DISPLAY}`;
    const lines = layout(ctx, words, maxW).reduce((mx, p) => Math.max(mx, p.line), 0) + 1;
    const longest = Math.max(...words.map((w) => ctx.measureText(w.word).width));
    if (lines <= maxLines && longest <= maxW) return size;
  }
  return 18;
}

function layout(ctx: CanvasRenderingContext2D, words: { word: string; hot?: boolean }[], maxW: number) {
  const space = ctx.measureText(" ").width;
  const placed: { word: string; hot?: boolean; x: number; line: number }[] = [];
  let x = 0, line = 0;
  for (const w of words) {
    const ww = ctx.measureText(w.word).width;
    if (x > 0 && x + ww > maxW) { line++; x = 0; }
    placed.push({ word: w.word, hot: w.hot, x, line });
    x += ww + space;
  }
  return placed;
}

let grain: HTMLCanvasElement | null = null;
function grainTile() {
  if (grain) return grain;
  const c = document.createElement("canvas");
  c.width = c.height = 140;
  const g = c.getContext("2d")!;
  const img = g.createImageData(140, 140);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 120 + Math.random() * 135;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 9;
  }
  g.putImageData(img, 0, 0);
  grain = c;
  return c;
}

function background(ctx: CanvasRenderingContext2D, w: number, h: number, gp: number, C: Theme) {
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, w, h);
  const gx = w * (0.2 + 0.15 * Math.sin(gp * Math.PI * 2));
  const gy = h * (0.15 + 0.1 * Math.cos(gp * Math.PI * 2));
  const rad = ctx.createRadialGradient(gx, gy, 0, gx, gy, w * 0.7);
  rad.addColorStop(0, hexToRgba(C.accent, 0.1));
  rad.addColorStop(1, hexToRgba(C.accent, 0));
  ctx.fillStyle = rad;
  ctx.fillRect(0, 0, w, h);
  const pat = ctx.createPattern(grainTile(), "repeat")!;
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, w, h);
}

function progress(ctx: CanvasRenderingContext2D, p: number, w: number, h: number, m: number, C: Theme) {
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.fillRect(m, h - m, w - 2 * m, 2);
  ctx.fillStyle = C.accent;
  ctx.fillRect(m, h - m, (w - 2 * m) * clamp01(p), 2);
}

export function drawSceneFrame(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  frame: number,
  total: number,
  w: number,
  h: number,
  opts: { index: number; count: number; isLast: boolean; overFootage?: boolean; theme?: Theme }
) {
  const C = opts.theme || DEFAULT_THEME;
  const m = Math.round(w * 0.075);
  const p = frame / Math.max(1, total - 1);
  const gp = (opts.index + p) / opts.count;

  // Start every frame from a clean text state so shadow/tracking from the previous
  // scene can never bleed into this scene's background or progress bar.
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  if ("letterSpacing" in ctx) (ctx as any).letterSpacing = "0px";

  if (opts.overFootage) {
    ctx.clearRect(0, 0, w, h);
    const scrim = ctx.createLinearGradient(0, 0, 0, h);
    scrim.addColorStop(0, "rgba(8,8,9,0.5)");
    scrim.addColorStop(0.45, "rgba(8,8,9,0.2)");
    scrim.addColorStop(1, "rgba(8,8,9,0.8)");
    ctx.fillStyle = scrim;
    ctx.fillRect(0, 0, w, h);
  } else {
    background(ctx, w, h, gp, C);
  }
  progress(ctx, p, w, h, m, C);

  // Type treatment: slightly tighter tracking reads as designed rather than default,
  // and a soft drop-shadow keeps text legible over busy moving footage without an
  // ugly solid box. (Background/progress above are drawn before this is set.)
  if ("letterSpacing" in ctx) (ctx as any).letterSpacing = "-0.015em";
  if (opts.overFootage) {
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = Math.round(w * 0.012);
    ctx.shadowOffsetY = Math.round(w * 0.004);
  }

  const tmpl = classify(scene, opts.isLast);
  const text = (scene.onScreenText || scene.voiceover || "").trim();
  const drift = -6 * easeOut(clamp01(p * 1.2));
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  if (tmpl === "list") {
    const items = splitClauses(text);
    const maxW = w - 2 * m;
    const size = Math.min(64, fitFont(ctx, items.map((t) => ({ word: t })), maxW, 1, 600, 64));
    ctx.font = `600 ${size}px ${DISPLAY}`;
    const lh = size * 1.35;
    let y = (h - items.length * lh) / 2 + size + drift;
    items.forEach((item, i) => {
      const rp = easeOut(clamp01((frame - i * (FPS * 0.35)) / (FPS * 0.5)));
      ctx.globalAlpha = rp;
      ctx.fillStyle = i === items.length - 1 ? C.accent : C.text;
      ctx.fillText(item, m + (1 - rp) * 24, y);
      y += lh;
    });
    ctx.globalAlpha = 1;
    return;
  }

  if (tmpl === "stat") {
    const num = (text.match(/\$?\d[\d,.]*\s*[%xX+]?/) || [text.split(" ")[0]])[0];
    const label = text.replace(num, "").trim();
    ctx.font = `800 ${Math.min(220, w * 0.18)}px ${DISPLAY}`;
    ctx.fillStyle = C.accent;
    ctx.globalAlpha = easeOut(clamp01(frame / (FPS * 0.6)));
    ctx.fillText(num, m, h / 2 + drift);
    ctx.font = `500 ${Math.min(40, w * 0.032)}px ${DISPLAY}`;
    ctx.fillStyle = C.text;
    ctx.globalAlpha = easeOut(clamp01((frame - FPS * 0.4) / (FPS * 0.5)));
    ctx.fillText(label, m, h / 2 + w * 0.09 + drift);
    ctx.globalAlpha = 1;
    return;
  }

  if (tmpl === "logo") {
    const np = easeOut(clamp01(frame / (FPS * 0.7)));
    ctx.textAlign = "center";
    ctx.font = `800 ${Math.min(150, w * 0.11)}px ${DISPLAY}`;
    ctx.fillStyle = C.text;
    ctx.globalAlpha = np;
    const words = text.split(/\s+/);
    const brand = words[0];
    const tag = words.slice(1).join(" ");
    ctx.fillText(brand, w / 2, h / 2 + drift);
    const uw = Math.min(w * 0.18, ctx.measureText(brand).width);
    ctx.fillStyle = C.accent;
    ctx.fillRect(w / 2 - uw / 2, h / 2 + w * 0.03, uw * easeInOut(np), 4);
    if (tag) {
      ctx.font = `500 ${Math.min(30, w * 0.024)}px ${DISPLAY}`;
      ctx.fillStyle = C.muted;
      ctx.globalAlpha = easeOut(clamp01((frame - FPS * 0.5) / (FPS * 0.6)));
      ctx.fillText(tag, w / 2, h / 2 + w * 0.075 + drift);
    }
    ctx.globalAlpha = 1;
    return;
  }

  // statement: word-by-word reveal with wrapping
  const words = parseHighlights(text);
  const maxW = w - 2 * m;
  const size = fitFont(ctx, words, maxW, 4, 700, Math.min(110, w * 0.085));
  ctx.font = `700 ${size}px ${DISPLAY}`;
  const placed = layout(ctx, words, maxW);
  const lines = Math.max(...placed.map((pp) => pp.line)) + 1;
  const lh = size * 1.12;
  const top = (h - lines * lh) / 2 + size + drift;
  placed.forEach((pp, i) => {
    const rp = easeOut(clamp01((frame - i * 2.6) / (FPS * 0.55)));
    ctx.globalAlpha = rp;
    ctx.fillStyle = pp.hot ? C.accent : C.text;
    ctx.fillText(pp.word, m + pp.x, top + pp.line * lh + (1 - rp) * 20);
  });
  ctx.globalAlpha = 1;
}
