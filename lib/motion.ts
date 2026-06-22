"use client";
import type { Scene } from "./types";

// ---- Art direction (one consistent system) ----
const INK = "#0E0E0F";
const BONE = "#ECE7DA";
const MUTED = "#867D70";
const MARKER = "#FF5631";
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
      (document as any).fonts.load(`500 14px ${MONO}`),
      (document as any).fonts.ready,
    ]);
  } catch {
    /* fall back to system fonts */
  }
}

// ---- easing ----
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

type Template = "statement" | "list" | "stat" | "logo";

function classify(scene: Scene, isLast: boolean): Template {
  const text = (scene.onScreenText || scene.voiceover || "").trim();
  const parts = splitClauses(text);
  const stat = text.match(/(\$?\d[\d,.]*\s*[%xX+]?|\bsix\b|\bweeks?\b)/);
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

// Parse *highlighted* words; returns segments with an accent flag.
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

function fitFont(
  ctx: CanvasRenderingContext2D,
  words: { word: string }[],
  maxW: number,
  maxLines: number,
  weight: number,
  start: number
): number {
  for (let size = start; size > 16; size -= 2) {
    ctx.font = `${weight} ${size}px ${DISPLAY}`;
    const lines = layout(ctx, words, maxW).length;
    const longest = Math.max(
      ...words.map((w) => ctx.measureText(w.word).width)
    );
    if (lines <= maxLines && longest <= maxW) return size;
  }
  return 18;
}

function layout(
  ctx: CanvasRenderingContext2D,
  words: { word: string; hot?: boolean }[],
  maxW: number
): { word: string; hot?: boolean; x: number; line: number }[] {
  const space = ctx.measureText(" ").width;
  const placed: { word: string; hot?: boolean; x: number; line: number }[] = [];
  let x = 0;
  let line = 0;
  for (const w of words) {
    const ww = ctx.measureText(w.word).width;
    if (x > 0 && x + ww > maxW) {
      line++;
      x = 0;
    }
    placed.push({ word: w.word, hot: w.hot, x, line });
    x += ww + space;
  }
  return placed;
}

// ---- background: ink + drifting accent glow + subtle grain ----
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
    img.data[i + 3] = 10;
  }
  g.putImageData(img, 0, 0);
  grain = c;
  return c;
}

function background(ctx: CanvasRenderingContext2D, w: number, h: number, gp: number) {
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, w, h);
  // drifting glow
  const gx = w * (0.2 + 0.15 * Math.sin(gp * Math.PI * 2));
  const gy = h * (0.15 + 0.1 * Math.cos(gp * Math.PI * 2));
  const rad = ctx.createRadialGradient(gx, gy, 0, gx, gy, w * 0.7);
  rad.addColorStop(0, "rgba(255,86,49,0.10)");
  rad.addColorStop(1, "rgba(255,86,49,0)");
  ctx.fillStyle = rad;
  ctx.fillRect(0, 0, w, h);
  // grain
  const t = grainTile();
  const pat = ctx.createPattern(t, "repeat")!;
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, w, h);
}

function kicker(ctx: CanvasRenderingContext2D, label: string, m: number) {
  ctx.font = `500 14px ${MONO}`;
  ctx.fillStyle = MUTED;
  ctx.textAlign = "left";
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.fillText(label.toUpperCase(), m, m + 6);
  ctx.restore();
}

function progress(ctx: CanvasRenderingContext2D, p: number, w: number, h: number, m: number) {
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(m, h - m, w - 2 * m, 2);
  ctx.fillStyle = MARKER;
  ctx.fillRect(m, h - m, (w - 2 * m) * clamp01(p), 2);
}

/**
 * Draw one frame of a scene. `frame` is 0..count-1.
 * Renders an art-directed typographic composition with staggered reveals.
 */
export function drawSceneFrame(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  frame: number,
  total: number,
  w: number,
  h: number,
  opts: { index: number; count: number; isLast: boolean }
) {
  const m = Math.round(w * 0.075);
  const p = frame / Math.max(1, total - 1);
  const gp = (opts.index + p) / opts.count;
  background(ctx, w, h, gp);
  kicker(ctx, `${String(opts.index + 1).padStart(2, "0")} / ${String(opts.count).padStart(2, "0")}`, m);
  progress(ctx, p, w, h, m);

  const tmpl = classify(scene, opts.isLast);
  const text = (scene.onScreenText || scene.voiceover || "").trim();
  const drift = -6 * easeOut(clamp01(p * 1.2)); // whole block slowly rises

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  if (tmpl === "list") {
    const items = splitClauses(text);
    const maxW = w - 2 * m;
    const size = Math.min(64, fitFont(ctx, items.map((t) => ({ word: t })), maxW, 1, 600, 64));
    ctx.font = `600 ${size}px ${DISPLAY}`;
    const lh = size * 1.35;
    const blockH = items.length * lh;
    let y = (h - blockH) / 2 + size + drift;
    items.forEach((item, i) => {
      const rp = easeOut(clamp01((frame - i * (FPS * 0.35)) / (FPS * 0.5)));
      ctx.globalAlpha = rp;
      ctx.fillStyle = i === items.length - 1 ? MARKER : BONE;
      ctx.fillText(item, m + (1 - rp) * 24, y);
      y += lh;
    });
    ctx.globalAlpha = 1;
    return;
  }

  if (tmpl === "stat") {
    const num = (text.match(/\$?\d[\d,.]*\s*[%xX+]?/) || [text.split(" ")[0]])[0];
    const label = text.replace(num, "").trim();
    const np = easeOut(clamp01(frame / (FPS * 0.6)));
    ctx.font = `800 ${Math.min(220, w * 0.18)}px ${DISPLAY}`;
    ctx.fillStyle = MARKER;
    ctx.globalAlpha = np;
    ctx.fillText(num, m, h / 2 + drift);
    ctx.font = `500 ${Math.min(40, w * 0.032)}px ${DISPLAY}`;
    ctx.fillStyle = BONE;
    ctx.globalAlpha = easeOut(clamp01((frame - FPS * 0.4) / (FPS * 0.5)));
    ctx.fillText(label, m, h / 2 + w * 0.09 + drift);
    ctx.globalAlpha = 1;
    return;
  }

  if (tmpl === "logo") {
    const np = easeOut(clamp01(frame / (FPS * 0.7)));
    ctx.textAlign = "center";
    ctx.font = `800 ${Math.min(150, w * 0.11)}px ${DISPLAY}`;
    ctx.fillStyle = BONE;
    ctx.globalAlpha = np;
    const words = text.split(/\s+/);
    const brand = words[0];
    const tag = words.slice(1).join(" ");
    ctx.fillText(brand, w / 2, h / 2 + drift);
    // marker underline draws in
    const uw = Math.min(w * 0.18, ctx.measureText(brand).width);
    ctx.fillStyle = MARKER;
    ctx.fillRect(w / 2 - uw / 2, h / 2 + w * 0.03, uw * easeInOut(np), 4);
    if (tag) {
      ctx.font = `500 ${Math.min(30, w * 0.024)}px ${DISPLAY}`;
      ctx.fillStyle = MUTED;
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
    ctx.fillStyle = pp.hot ? MARKER : BONE;
    ctx.fillText(pp.word, m + pp.x, top + pp.line * lh + (1 - rp) * 20);
  });
  ctx.globalAlpha = 1;
}
