"use client";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import type { Storyboard } from "./types";
import { FPS, sceneFrameCount, drawSceneFrame, ensureFonts } from "./motion";

let ff: FFmpeg | null = null;

async function getFFmpeg(onLog?: (s: string) => void) {
  if (ff) return ff;
  ff = new FFmpeg();
  if (onLog) ff.on("log", ({ message }) => onLog(message));
  const base = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
  await ff.load({
    coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm"),
  });
  return ff;
}

export interface AssembleInput {
  board: Storyboard;
  style: "designed" | "ai_video";
  sceneMedia: Record<string, { url: string; mock?: boolean } | undefined>;
  voUrls: Record<string, string | undefined>;
  musicUrl?: string;
  onProgress?: (msg: string) => void;
}

const SIZE: Record<string, [number, number]> = {
  "16:9": [1280, 720],
  "9:16": [720, 1280],
  "1:1": [1024, 1024],
};

function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((res) =>
    canvas.toBlob(async (b) => res(new Uint8Array(await b!.arrayBuffer())), "image/png")
  );
}

export async function assemble(input: AssembleInput): Promise<string> {
  const { board, style, sceneMedia, voUrls, musicUrl, onProgress } = input;
  const log = onProgress ?? (() => {});
  await ensureFonts();
  const ffmpeg = await getFFmpeg(log);
  const [w, h] = SIZE[board.aspectRatio] || SIZE["16:9"];

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  const segFiles: string[] = [];

  for (let i = 0; i < board.scenes.length; i++) {
    const scene = board.scenes[i];
    const dur = Math.max(2, Math.min(8, scene.durationSec));
    const seg = `seg${i}.mp4`;
    const media = sceneMedia[scene.id];
    const useClip = style === "ai_video" && scene.visualType === "ai_video" && media?.url && !media.mock;

    if (useClip) {
      log(`scene ${i + 1}: clip`);
      await ffmpeg.writeFile(`clip${i}`, await fetchFile(media!.url));
      await ffmpeg.exec([
        "-i", `clip${i}`, "-t", String(dur),
        "-vf", `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1,fps=${FPS}`,
        "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", String(FPS), seg,
      ]);
    } else {
      log(`scene ${i + 1}: rendering motion`);
      const frames = sceneFrameCount(scene);
      for (let f = 0; f < frames; f++) {
        drawSceneFrame(ctx, scene, f, frames, w, h, { index: i, count: board.scenes.length, isLast: i === board.scenes.length - 1 });
        await ffmpeg.writeFile(`f${i}_${String(f).padStart(4, "0")}.png`, await canvasToPng(canvas));
      }
      await ffmpeg.exec([
        "-framerate", String(FPS), "-i", `f${i}_%04d.png`,
        "-t", String(dur), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", String(FPS), seg,
      ]);
      for (let f = 0; f < frames; f++) {
        try { await ffmpeg.deleteFile(`f${i}_${String(f).padStart(4, "0")}.png`); } catch {}
      }
    }
    segFiles.push(seg);
  }

  await ffmpeg.writeFile("concat.txt", segFiles.map((f) => `file '${f}'`).join("\n"));
  await ffmpeg.exec(["-f", "concat", "-safe", "0", "-i", "concat.txt", "-c", "copy", "video.mp4"]);
  log("stitched");

  const voList: string[] = [];
  for (let i = 0; i < board.scenes.length; i++) {
    const scene = board.scenes[i];
    const url = voUrls[scene.id];
    const name = `vo${i}.mp3`;
    if (url && !url.startsWith("data:audio/wav")) {
      await ffmpeg.writeFile(name, await fetchFile(url));
    } else {
      await ffmpeg.exec([
        "-f", "lavfi", "-t", String(scene.durationSec),
        "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
        "-c:a", "libmp3lame", name,
      ]);
    }
    voList.push(name);
  }
  await ffmpeg.writeFile("vo.txt", voList.map((f) => `file '${f}'`).join("\n"));
  await ffmpeg.exec(["-f", "concat", "-safe", "0", "-i", "vo.txt", "-c", "copy", "vo.mp3"]);

  if (musicUrl && !musicUrl.startsWith("data:audio/wav")) {
    await ffmpeg.writeFile("music.mp3", await fetchFile(musicUrl));
    await ffmpeg.exec([
      "-i", "video.mp4", "-i", "vo.mp3", "-i", "music.mp3",
      "-filter_complex", "[2:a]volume=0.28[m];[1:a][m]amix=inputs=2:duration=first:dropout_transition=2[a]",
      "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-shortest", "final.mp4",
    ]);
  } else {
    await ffmpeg.exec([
      "-i", "video.mp4", "-i", "vo.mp3",
      "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-shortest", "final.mp4",
    ]);
  }
  log("mixed");

  const data = (await ffmpeg.readFile("final.mp4")) as Uint8Array;
  return URL.createObjectURL(new Blob([data.buffer as ArrayBuffer], { type: "video/mp4" }));
}
