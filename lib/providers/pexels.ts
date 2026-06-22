import type { AspectRatio } from "../types";

const API = "https://api.pexels.com/videos/search";

function orientation(ar: AspectRatio) {
  if (ar === "9:16") return "portrait";
  if (ar === "1:1") return "square";
  return "landscape";
}

// Pick the best mp4 file for one video: prefer ~1280–1920 wide (sharp but light
// enough for in-browser assembly), and skip tiny preview-grade files.
function bestFile(v: any): string | null {
  const files = (v.video_files ?? []).filter(
    (f: any) => f.file_type === "video/mp4" && (f.width || 0) >= 960
  );
  if (!files.length) return null;
  files.sort(
    (a: any, b: any) => Math.abs((a.width || 0) - 1440) - Math.abs((b.width || 0) - 1440)
  );
  return files[0]?.link ?? null;
}

// Returns a direct mp4 URL for a clip matching the query, or null in mock mode.
// `exclude` lets the caller skip clips already used by earlier scenes so the same
// b-roll never repeats across the ad — a major "cheap montage" tell when it does.
export async function searchFootage(opts: {
  query: string;
  aspectRatio: AspectRatio;
  key?: string;
  exclude?: string[];
}): Promise<{ url: string | null; mock?: boolean }> {
  if (!opts.key) return { url: null, mock: true };
  const url = `${API}?query=${encodeURIComponent(opts.query)}&per_page=15&orientation=${orientation(opts.aspectRatio)}&size=medium`;
  const res = await fetch(url, { headers: { Authorization: opts.key } });
  if (!res.ok) throw new Error(`Pexels ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const videos = data.videos ?? [];
  if (!videos.length) return { url: null };

  // Prefer clips with enough length to fill a scene without an obvious loop seam,
  // then walk results choosing the first that hasn't been used yet.
  const exclude = new Set(opts.exclude ?? []);
  const ranked = [...videos].sort((a: any, b: any) => (b.duration || 0) - (a.duration || 0));
  let firstAvailable: string | null = null;
  for (const v of ranked) {
    const link = bestFile(v);
    if (!link) continue;
    if (firstAvailable === null) firstAvailable = link;
    if (!exclude.has(link)) return { url: link };
  }
  // Every match is already used — fall back to the best clip rather than nothing.
  return { url: firstAvailable };
}
