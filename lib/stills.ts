"use client";
import { ensureFonts, type Theme } from "./motion";

const DISPLAY = '"Bricolage Grotesque", system-ui, sans-serif';
const MONO = '"JetBrains Mono", monospace';

export interface StillConcept {
  headline: string;
  subhead?: string;
  cta?: string;
  imageQuery?: string; // stock photo search term (photo style)
  imagePrompt?: string; // AI image art-direction (ai style)
}

export type StillStyle = "photo" | "ai" | "typography";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src; // data URL — same-origin, never taints the canvas
  });
}

// Cover-fit an image into w×h (scale to fill, center-crop the overflow).
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number) {
  const scale = Math.max(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

export interface StillSize {
  id: string;
  label: string;
  platform: string;
  w: number;
  h: number;
}

export const STILL_SIZES: StillSize[] = [
  { id: "square", label: "1080×1080", platform: "Meta · Reddit feed", w: 1080, h: 1080 },
  { id: "portrait", label: "1080×1350", platform: "Instagram · Meta", w: 1080, h: 1350 },
  { id: "wide", label: "1200×628", platform: "LinkedIn · Reddit", w: 1200, h: 628 },
  { id: "story", label: "1080×1920", platform: "Stories · Reels", w: 1080, h: 1920 },
];

const DEFAULT_THEME: Theme = { bg: "#0E0E0F", text: "#ECE7DA", accent: "#FF5631", muted: "#8B8275" };

function hexToRgba(hex: string, a: number) {
  const m = hex.replace("#", "");
  const n = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  return `rgba(${parseInt(n.slice(0, 2), 16) || 14},${parseInt(n.slice(2, 4), 16) || 14},${parseInt(n.slice(4, 6), 16) || 15},${a})`;
}

function highlights(text: string): { word: string; hot: boolean }[] {
  const out: { word: string; hot: boolean }[] = [];
  const re = /\*([^*]+)\*|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m[1]) m[1].split(/\s+/).forEach((w) => out.push({ word: w, hot: true }));
    else out.push({ word: m[2], hot: false });
  }
  return out;
}

function layoutLines(ctx: CanvasRenderingContext2D, words: { word: string; hot: boolean }[], maxW: number) {
  const space = ctx.measureText(" ").width;
  const lines: { word: string; hot: boolean; x: number }[][] = [[]];
  let x = 0;
  for (const w of words) {
    const ww = ctx.measureText(w.word).width;
    if (x > 0 && x + ww > maxW) { lines.push([]); x = 0; }
    lines[lines.length - 1].push({ ...w, x });
    x += ww + space;
  }
  return lines;
}

function fitHeadline(ctx: CanvasRenderingContext2D, words: { word: string; hot: boolean }[], maxW: number, maxLines: number, start: number) {
  for (let size = start; size > 24; size -= 2) {
    ctx.font = `800 ${size}px ${DISPLAY}`;
    if (layoutLines(ctx, words, maxW).length <= maxLines) return size;
  }
  return 26;
}

let grain: HTMLCanvasElement | null = null;
function grainTile() {
  if (grain) return grain;
  const c = document.createElement("canvas");
  c.width = c.height = 160;
  const g = c.getContext("2d")!;
  const img = g.createImageData(160, 160);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 120 + Math.random() * 135;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 8;
  }
  g.putImageData(img, 0, 0);
  grain = c;
  return c;
}

export async function renderStill(concept: StillConcept, theme: Theme | undefined, brandName: string, size: StillSize, bg?: string): Promise<string> {
  await ensureFonts();
  const C = theme || DEFAULT_THEME;
  const { w, h } = size;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const m = Math.round(Math.min(w, h) * 0.085);

  let img: HTMLImageElement | null = null;
  if (bg) {
    try {
      img = await loadImage(bg);
    } catch {
      img = null; // fall back to the gradient treatment below
    }
  }

  if (img) {
    // Photo / AI background: cover-fit the image, then a brand-tinted scrim that
    // darkens the lower half so the headline and CTA stay legible.
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, w, h);
    drawCover(ctx, img, w, h);
    const scrim = ctx.createLinearGradient(0, 0, 0, h);
    scrim.addColorStop(0, hexToRgba(C.bg, 0.25));
    scrim.addColorStop(0.45, hexToRgba(C.bg, 0.45));
    scrim.addColorStop(1, hexToRgba(C.bg, 0.9));
    ctx.fillStyle = scrim;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = ctx.createPattern(grainTile(), "repeat")!;
    ctx.fillRect(0, 0, w, h);
    // Soft shadow keeps text readable over any photo without an ugly solid box.
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = Math.round(Math.min(w, h) * 0.02);
    ctx.shadowOffsetY = Math.round(Math.min(w, h) * 0.006);
  } else {
    // Background: brand color, accent glow in a corner, subtle grain.
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, w, h);
    const rad = ctx.createRadialGradient(w * 0.85, h * 0.1, 0, w * 0.85, h * 0.1, Math.max(w, h) * 0.8);
    rad.addColorStop(0, hexToRgba(C.accent, 0.16));
    rad.addColorStop(1, hexToRgba(C.accent, 0));
    ctx.fillStyle = rad;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = ctx.createPattern(grainTile(), "repeat")!;
    ctx.fillRect(0, 0, w, h);
  }

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  // Eyebrow: brand name
  ctx.font = `500 ${Math.round(Math.min(w, h) * 0.022)}px ${MONO}`;
  ctx.fillStyle = C.accent;
  ctx.fillText((brandName || "").toUpperCase(), m, m + Math.min(w, h) * 0.02);

  // Headline block
  const maxW = w - 2 * m;
  const words = highlights(concept.headline);
  const wide = w / h > 1.6;
  const size0 = Math.min(wide ? w * 0.07 : w * 0.1, 150);
  const hSize = fitHeadline(ctx, words, maxW, wide ? 3 : 4, size0);
  ctx.font = `800 ${hSize}px ${DISPLAY}`;
  const lines = layoutLines(ctx, words, maxW);
  const lh = hSize * 1.08;
  const blockH = lines.length * lh + (concept.subhead ? Math.min(w, h) * 0.06 : 0);
  let y = h * (wide ? 0.5 : 0.62) - blockH / 2 + hSize;
  for (const line of lines) {
    for (const wd of line) {
      ctx.fillStyle = wd.hot ? C.accent : C.text;
      ctx.fillText(wd.word, m + wd.x, y);
    }
    y += lh;
  }

  // Subhead
  if (concept.subhead) {
    ctx.font = `500 ${Math.round(Math.min(w, h) * 0.03)}px ${DISPLAY}`;
    ctx.fillStyle = C.muted;
    y += Math.min(w, h) * 0.01;
    ctx.fillText(concept.subhead, m, y);
  }

  // CTA pill bottom-left
  if (concept.cta) {
    const cs = Math.round(Math.min(w, h) * 0.026);
    ctx.font = `600 ${cs}px ${DISPLAY}`;
    const tw = ctx.measureText(concept.cta).width;
    const padX = cs * 0.9;
    const padY = cs * 0.7;
    const pillW = tw + padX * 2;
    const pillH = cs + padY * 2;
    const px = m;
    const py = h - m - pillH;
    ctx.fillStyle = C.accent;
    const r = pillH / 2;
    ctx.beginPath();
    ctx.moveTo(px + r, py);
    ctx.arcTo(px + pillW, py, px + pillW, py + pillH, r);
    ctx.arcTo(px + pillW, py + pillH, px, py + pillH, r);
    ctx.arcTo(px, py + pillH, px, py, r);
    ctx.arcTo(px, py, px + pillW, py, r);
    ctx.fill();
    ctx.fillStyle = C.bg;
    ctx.fillText(concept.cta, px + padX, py + padY + cs * 0.85);
  }

  return canvas.toDataURL("image/png");
}
