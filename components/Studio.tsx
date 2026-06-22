"use client";
import { useEffect, useRef, useState } from "react";
import {
  Sparkles, Clapperboard, Wallet, Clapperboard as Produce, Settings as Gear,
  ArrowRight, Lock, Send, Loader2, Download, Play, Film, Wand2, Globe,
} from "lucide-react";
import Settings from "./Settings";
import Filmstrip from "./Filmstrip";
import { api, loadKeys, hasAnyKey } from "@/lib/client";
import { estimateCost, fmtUsd, VIDEO_MODELS, IMAGE_MODELS } from "@/lib/pricing";
import { VOICE_PRESETS } from "@/lib/providers/elevenlabs";
import { assemble } from "@/lib/assemble";
import { renderStill, STILL_SIZES, type StillConcept, type StillSize } from "@/lib/stills";
import type { AspectRatio, BrandProfile, ChatMessage, ModelChoice, Scene, Storyboard, VideoModelId } from "@/lib/types";

type Stage = "ideate" | "storyboard" | "budget" | "produce";
const STAGES: { id: Stage; label: string; icon: any }[] = [
  { id: "ideate", label: "Ideate", icon: Sparkles },
  { id: "storyboard", label: "Storyboard", icon: Clapperboard },
  { id: "budget", label: "Budget", icon: Wallet },
  { id: "produce", label: "Produce", icon: Produce },
];

export default function Studio() {
  const [stage, setStage] = useState<Stage>("ideate");
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Ideate
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [script, setScript] = useState("");
  const [writingScript, setWritingScript] = useState(false);
  const [brand, setBrand] = useState<BrandProfile | null>(null);
  const [brandUrl, setBrandUrl] = useState("");
  const [extractingBrand, setExtractingBrand] = useState(false);

  // Storyboard
  const [aspect, setAspect] = useState<AspectRatio>("16:9");
  const [board, setBoard] = useState<Storyboard | null>(null);
  const [planning, setPlanning] = useState(false);
  const [planError, setPlanError] = useState<string>();
  const [activeScene, setActiveScene] = useState<string>();

  // Budget / produce
  const [choice, setChoice] = useState<ModelChoice>({
    style: "stock",
    videoModel: "fal-ai/kling-video/v3/standard/text-to-video",
    imageModel: "fal-ai/flux/dev",
    voiceId: VOICE_PRESETS[0].id,
    music: true,
  });
  const [producing, setProducing] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [debug, setDebug] = useState<
    { t: string; scene: string; kind: "req" | "ok" | "err"; label: string; detail?: string }[]
  >([]);
  const [showDebug, setShowDebug] = useState(true);
  const [finalUrl, setFinalUrl] = useState<string>();
  const [stills, setStills] = useState<{ concept: StillConcept; imgs: { size: StillSize; url: string }[] }[]>([]);
  const [stillsLoading, setStillsLoading] = useState(false);
  const sceneMedia = useRef<Record<string, { url: string; mock?: boolean }>>({});
  const voUrls = useRef<Record<string, string>>({});
  const measuredDur = useRef<Record<string, number>>({});
  const musicUrl = useRef<string>();

  async function audioDuration(dataUrl: string): Promise<number> {
    try {
      const buf = await (await fetch(dataUrl)).arrayBuffer();
      const AC = (window.AudioContext || (window as any).webkitAudioContext);
      const ac = new AC();
      const decoded = await ac.decodeAudioData(buf);
      ac.close();
      return decoded.duration;
    } catch {
      return 0;
    }
  }

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const keyed = mounted && hasAnyKey(loadKeys());
  const pushLog = (s: string) => setLog((l) => [...l.slice(-40), s]);
  const addDebug = (
    scene: string,
    kind: "req" | "ok" | "err",
    label: string,
    detail?: string
  ) =>
    setDebug((d) => [
      ...d,
      { t: new Date().toLocaleTimeString(), scene, kind, label, detail },
    ]);

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || thinking) return;
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setInput("");
    setThinking(true);
    try {
      const { reply } = await api<{ reply: string }>("/api/ideate", { messages: next });
      setMessages([...next, { role: "assistant", content: reply }]);
    } catch (e: any) {
      setMessages([...next, { role: "assistant", content: `Error: ${e.message}` }]);
    } finally {
      setThinking(false);
    }
  }

  async function extractBrand() {
    if (!brandUrl.trim() || extractingBrand) return;
    setExtractingBrand(true);
    try {
      const { brand } = await api<{ brand: BrandProfile & { mock?: boolean } }>("/api/brand", { url: brandUrl.trim() });
      if (brand && brand.name) {
        setBrand(brand);
        send(
          `We're launching ${brand.name}. ${brand.what} Audience: ${brand.audience}. Brand tone: ${brand.tone}. Write me a provocative, anthem-style 30-second launch ad.`
        );
      } else {
        setMessages((m) => [...m, { role: "assistant", content: "I couldn't read that site. Add your Anthropic key, or just tell me what the company does." }]);
      }
    } catch (e: any) {
      setMessages((m) => [...m, { role: "assistant", content: `Couldn't pull that site: ${e.message}` }]);
    } finally {
      setExtractingBrand(false);
    }
  }

  async function writeScript() {
    if (writingScript) return;
    const convo = messages.length
      ? messages
      : [{ role: "user" as const, content: input.trim() || "Write me an ad." }];
    setWritingScript(true);
    try {
      const { reply } = await api<{ reply: string }>("/api/ideate", { messages: convo, mode: "script" });
      setScript(reply);
    } catch (e: any) {
      pushLog(`script error: ${e.message}`);
    } finally {
      setWritingScript(false);
    }
  }

  async function plan(scriptText?: string) {
    const src = (scriptText ?? script).trim();
    if (!src) return;
    if (scriptText) setScript(scriptText);
    setStage("storyboard");
    setPlanning(true);
    setPlanError(undefined);
    try {
      const { board } = await api<{ board: Storyboard }>("/api/plan", { script: src, aspectRatio: aspect });
      if (!board?.scenes?.length) {
        setPlanError("The storyboard came back empty. Try again, or shorten the script a little.");
        return;
      }
      setBoard(board);
      setActiveScene(board.scenes[0]?.id);
    } catch (e: any) {
      setPlanError(e.message || "Planning failed. Check your Anthropic key in Settings.");
    } finally {
      setPlanning(false);
    }
  }

  function updateScene(id: string, patch: Partial<Scene>) {
    if (!board) return;
    setBoard({ ...board, scenes: board.scenes.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  }

  const cost = board ? estimateCost(board, choice) : null;

  async function produce() {
    if (!board) return;
    setProducing(true);
    setFinalUrl(undefined);
    setDebug([]);
    sceneMedia.current = {};
    voUrls.current = {};
    measuredDur.current = {};
    const supportsRef = VIDEO_MODELS[choice.videoModel].supportsImageRef;

    try {
      // 1. Reference still for continuity (non-fatal if it fails)
      let refUrl: string | undefined;
      if (board.characterRef && supportsRef && choice.style === "ai_video") {
        const payload = { model: choice.imageModel, prompt: board.characterRef.description, aspectRatio: board.aspectRatio };
        addDebug("ref", "req", `image · ${choice.imageModel}`, JSON.stringify(payload, null, 2));
        pushLog("generating character still…");
        try {
          const r = await api<{ url: string }>("/api/generate/image", payload);
          refUrl = r.url || undefined;
          addDebug("ref", "ok", `image url: ${r.url || "(mock)"}`);
        } catch (e: any) {
          addDebug("ref", "err", "image failed", e.message);
          pushLog(`character still failed (continuing): ${e.message}`);
        }
      }

      // 2. Video per ai_video scene — only when AI-video style is selected.
      if (choice.style === "ai_video") {
        for (const s of board.scenes) {
          updateScene(s.id, { status: "running" });
          const videoPrompt =
            s.videoPrompt?.trim() ||
            `Cinematic, evocative shot illustrating: ${s.voiceover || s.onScreenText || board.title}. ${s.durationSec} seconds.`;
          const payload = {
            model: choice.videoModel, prompt: videoPrompt, durationSec: s.durationSec,
            aspectRatio: board.aspectRatio, index: s.index,
            imageUrl: s.usesCharacterRef ? refUrl : undefined,
          };
          addDebug(`scene ${s.index + 1}`, "req", `video · ${choice.videoModel}`, JSON.stringify(payload, null, 2));
          pushLog(`scene ${s.index + 1}: video…`);
          try {
            const r = await api<{ url: string; mock?: boolean }>("/api/generate/video", payload);
            sceneMedia.current[s.id] = { url: r.url, mock: r.mock };
            updateScene(s.id, { status: "done", videoUrl: r.url || `mock:${s.index}` });
            addDebug(`scene ${s.index + 1}`, r.mock ? "err" : "ok", r.mock ? "returned MOCK (no fal key?)" : `video url: ${r.url}`);
            pushLog(`scene ${s.index + 1}: ${r.mock ? "mock" : "done"}`);
          } catch (e: any) {
            updateScene(s.id, { status: "error", error: e.message });
            addDebug(`scene ${s.index + 1}`, "err", "video failed", e.message);
            pushLog(`scene ${s.index + 1} failed: ${e.message}`);
          }
        }
      } else {
        addDebug("visuals", "ok", "designed motion — rendered at assembly, no video API cost");
      }

      // 2b. Stock footage per scene (matched to the script beat). Track every clip
      // we've used so repeated footage queries don't pull the same b-roll twice —
      // distinct visuals per scene are a big step up from a looping montage.
      if (choice.style === "stock") {
        const usedFootage: string[] = [];
        for (const s of board.scenes) {
          const q = s.footageQuery?.trim() || s.onScreenText || board.title;
          addDebug(`scene ${s.index + 1}`, "req", `footage · "${q}"`);
          try {
            const r = await api<{ url: string | null; mock?: boolean }>("/api/footage", { query: q, aspectRatio: board.aspectRatio, exclude: usedFootage });
            if (r.url) {
              usedFootage.push(r.url);
              sceneMedia.current[s.id] = { url: r.url, mock: r.mock };
              addDebug(`scene ${s.index + 1}`, r.mock ? "err" : "ok", r.mock ? "footage mock (no Pexels key) → designed motion" : "footage matched");
            } else {
              addDebug(`scene ${s.index + 1}`, "err", "no footage match → designed motion");
            }
          } catch (e: any) {
            addDebug(`scene ${s.index + 1}`, "err", "footage failed → designed motion", e.message);
          }
        }
      }

      // 3. Voiceover per scene, measuring real duration so the cut locks to voice
      for (const s of board.scenes) {
        if (!s.voiceover?.trim()) {
          measuredDur.current[s.id] = s.durationSec;
          continue;
        }
        pushLog(`scene ${s.index + 1}: voiceover…`);
        try {
          const r = await api<{ dataUrl: string; mock?: boolean }>("/api/generate/voice", { text: s.voiceover, voiceId: choice.voiceId });
          voUrls.current[s.id] = r.dataUrl;
          const d = await audioDuration(r.dataUrl);
          measuredDur.current[s.id] = d > 0.3 ? Math.round((d + 0.5) * 10) / 10 : s.durationSec;
          addDebug(`scene ${s.index + 1}`, r.mock ? "err" : "ok", r.mock ? "VO mock (no ElevenLabs key?)" : `VO ok · ${measuredDur.current[s.id]}s`);
        } catch (e: any) {
          measuredDur.current[s.id] = s.durationSec;
          addDebug(`scene ${s.index + 1}`, "err", "VO failed", e.message);
          pushLog(`scene ${s.index + 1} VO failed: ${e.message}`);
        }
      }

      // 4. Music bed sized to the whole ad (non-fatal)
      if (choice.music && board.musicPrompt) {
        pushLog("music bed…");
        try {
          const totalMs = board.scenes.reduce((n, s) => n + s.durationSec, 0) * 1000;
          const r = await api<{ dataUrl: string; mock?: boolean }>("/api/generate/music", { prompt: board.musicPrompt, lengthMs: totalMs });
          musicUrl.current = r.dataUrl;
          addDebug("music", r.mock ? "err" : "ok", r.mock ? "music mock (no key?)" : "music ok");
        } catch (e: any) {
          addDebug("music", "err", "music failed", e.message);
          pushLog(`music failed (continuing): ${e.message}`);
        }
      }
      pushLog("all assets ready. assemble when you are.");
    } catch (e: any) {
      addDebug("run", "err", "produce error", e.message);
      pushLog(`produce error: ${e.message}`);
    } finally {
      setProducing(false);
    }
  }

  async function generateStills() {
    if (!board || stillsLoading) return;
    setStillsLoading(true);
    try {
      const brief =
        `Brand: ${brand?.name || board.title}. ${brand?.what || board.logline}\n` +
        `Audience: ${brand?.audience || "marketers"}\nTone: ${brand?.tone || ""}\n` +
        `Video script beats:\n` + board.scenes.map((s) => s.onScreenText || s.voiceover).filter(Boolean).join(" / ");
      const { concepts } = await api<{ concepts: StillConcept[] }>("/api/stills", { brief });
      const theme = brand ? { ...brand.colors, muted: "#8B8275" } : undefined;
      const brandName = brand?.name || board.title.split(" ")[0];
      const out: { concept: StillConcept; imgs: { size: StillSize; url: string }[] }[] = [];
      for (const c of (concepts || []).slice(0, 3)) {
        const imgs: { size: StillSize; url: string }[] = [];
        for (const size of STILL_SIZES) {
          imgs.push({ size, url: await renderStill(c, theme, brandName, size) });
        }
        out.push({ concept: c, imgs });
      }
      setStills(out);
    } catch (e: any) {
      pushLog(`stills error: ${e.message}`);
    } finally {
      setStillsLoading(false);
    }
  }

  async function runAssemble() {
    if (!board) return;
    setProducing(true);
    pushLog("loading ffmpeg…");
    try {
      const url = await assemble({
        board, style: choice.style, sceneMedia: sceneMedia.current, voUrls: voUrls.current,
        durations: measuredDur.current, musicUrl: musicUrl.current,
        theme: brand ? { ...brand.colors, muted: "#8B8275" } : undefined,
        onProgress: pushLog,
      });
      setFinalUrl(url);
      pushLog("done — your ad is ready.");
    } catch (e: any) {
      pushLog(`assemble error: ${e.message}. Tip: assembly needs a Chromium-based browser with cross-origin isolation.`);
    } finally {
      setProducing(false);
    }
  }

  const scene = board?.scenes.find((s) => s.id === activeScene);

  return (
    <div className="relative z-10 mx-auto max-w-6xl px-5 py-6">
      {/* Header */}
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-marker text-ink">
            <Clapperboard className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-display leading-none">AdMaker</h1>
            <p className="font-mono text-[11px] text-muted">ai video ads for the rest of us</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {keyed && (
            <span className="hidden items-center gap-1.5 rounded-full border border-teal/40 bg-teal/10 px-2.5 py-1 text-[11px] text-teal sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-teal" /> your keys · this browser
            </span>
          )}
          <button className="btn-ghost" onClick={() => setSettingsOpen(true)}>
            <Gear className="h-4 w-4" /> {keyed ? "Keys" : "Add keys"}
          </button>
        </div>
      </header>

      {/* Stepper */}
      <nav className="mb-6 flex items-center gap-1.5">
        {STAGES.map((s, i) => {
          const reachable =
            s.id === "ideate" ||
            (s.id === "storyboard" && !!script) ||
            (s.id === "budget" && !!board) ||
            (s.id === "produce" && !!board);
          const on = stage === s.id;
          return (
            <button
              key={s.id}
              disabled={!reachable}
              onClick={() => reachable && setStage(s.id)}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                on ? "bg-bone text-ink" : reachable ? "text-bone hover:bg-line/40" : "text-muted/40"
              }`}
            >
              <s.icon className="h-4 w-4" />
              <span className="font-medium">{s.label}</span>
              {i < STAGES.length - 1 && <span className="ml-1 text-muted/40">/</span>}
            </button>
          );
        })}
      </nav>

      {/* ---------------- IDEATE ---------------- */}
      {stage === "ideate" && (
        <div className="grid gap-5 md:grid-cols-[1fr_360px]">
          <div className="md:col-span-2">
            <div className="panel flex flex-wrap items-center gap-2 p-3">
              <Globe className="ml-1 h-4 w-4 shrink-0 text-teal" />
              <span className="label shrink-0">Brand</span>
              <input
                className="input min-w-[180px] flex-1"
                placeholder="yourcompany.com — I'll learn what you do, your tone, and your colors"
                value={brandUrl}
                onChange={(e) => setBrandUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && extractBrand()}
              />
              <button className="btn-primary shrink-0" onClick={extractBrand} disabled={extractingBrand || !brandUrl.trim()}>
                {extractingBrand ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
                Pull brand
              </button>
            </div>
            {brand && (
              <div className="mt-2 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-raise px-3 py-2 text-sm">
                <span className="font-display text-bone">{brand.name}</span>
                <span className="text-muted">{brand.tone}</span>
                <span className="ml-auto flex items-center gap-1.5">
                  {[brand.colors.bg, brand.colors.text, brand.colors.accent].map((c, i) => (
                    <span key={i} className="h-4 w-4 rounded-full border border-line" style={{ background: c }} title={c} />
                  ))}
                </span>
              </div>
            )}
          </div>
          {!keyed && (
            <div className="md:col-span-2 -mt-1 mb-1 flex items-center gap-2 rounded-lg border border-marker/40 bg-marker/10 px-3 py-2 text-sm text-bone">
              <Wand2 className="h-4 w-4 shrink-0 text-marker" />
              No Anthropic key yet, so the creative director runs in mock mode and can't research or write.
              <button onClick={() => setSettingsOpen(true)} className="ml-auto shrink-0 font-medium text-marker hover:underline">
                Add key
              </button>
            </div>
          )}
          <section className="panel flex h-[60vh] flex-col p-4">
            <p className="label mb-3">Creative director</p>
            <div className="flex-1 space-y-3 overflow-y-auto pr-1">
              {messages.length === 0 && (
                <div className="grid h-full place-items-center text-center">
                  <div className="max-w-sm">
                    <Wand2 className="mx-auto mb-3 h-7 w-7 text-marker" />
                    <p className="text-bone">Tell me what you're launching and who it's for.</p>
                    <p className="mt-1 text-sm text-muted">
                      I'll find the angle and write the script. Lock it when it's right.
                    </p>
                  </div>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={m.role === "user" ? "text-right" : ""}>
                  <div
                    className={`inline-block max-w-[85%] whitespace-pre-wrap rounded-xl px-3.5 py-2.5 text-sm ${
                      m.role === "user" ? "bg-marker/90 text-ink" : "bg-ink/60 text-bone"
                    }`}
                  >
                    {m.content}
                    {m.role === "assistant" && i === messages.length - 1 && (
                      <button
                        onClick={() => plan(m.content)}
                        className="mt-2 flex items-center gap-1 text-xs text-teal hover:underline"
                      >
                        <Lock className="h-3 w-3" /> use as script + plan
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {thinking && <Loader2 className="h-4 w-4 animate-spin text-teal" />}
            </div>
            <div className="mt-3 flex gap-2">
              <input
                className="input"
                placeholder="e.g. launching Gather, a customer-research tool, to skeptical marketers"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
              />
              <button className="btn-primary" onClick={() => send()} disabled={thinking}>
                <Send className="h-4 w-4" />
              </button>
            </div>
          </section>

          <aside className="panel flex h-[60vh] flex-col p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="label">Locked script</p>
              <button
                className="flex items-center gap-1 text-xs text-teal hover:underline disabled:opacity-40"
                onClick={writeScript}
                disabled={writingScript}
              >
                {writingScript ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                write full script
              </button>
            </div>
            <textarea
              className="input flex-1 resize-none font-mono text-[13px] leading-relaxed"
              placeholder="Brainstorm on the left, then hit 'write full script' — or paste your own here."
              value={script}
              onChange={(e) => setScript(e.target.value)}
            />
            <div className="mt-3 flex items-center gap-2">
              <select className="input w-auto" value={aspect} onChange={(e) => setAspect(e.target.value as AspectRatio)}>
                <option value="16:9">16:9</option>
                <option value="9:16">9:16</option>
                <option value="1:1">1:1</option>
              </select>
              <button className="btn-primary flex-1" onClick={() => plan()} disabled={!script.trim() || planning}>
                {planning ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                Plan storyboard
              </button>
            </div>
            {planError && <p className="mt-2 text-xs text-marker">{planError}</p>}
          </aside>
        </div>
      )}

      {/* ---------------- STORYBOARD ---------------- */}
      {stage === "storyboard" && !board && (
        <div className="panel grid min-h-[40vh] place-items-center p-8 text-center">
          {planning ? (
            <div>
              <Loader2 className="mx-auto mb-3 h-7 w-7 animate-spin text-teal" />
              <p className="text-bone">Planning your storyboard…</p>
              <p className="mt-1 text-sm text-muted">Splitting the script into model-sized scenes.</p>
            </div>
          ) : (
            <div>
              <Clapperboard className="mx-auto mb-3 h-7 w-7 text-marker" />
              <p className="text-bone">{planError || "No storyboard yet."}</p>
              <p className="mt-1 text-sm text-muted">
                {script ? "Plan it from your locked script." : "Write a script first."}
              </p>
              <div className="mt-4 flex justify-center gap-2">
                <button className="btn-ghost" onClick={() => setStage("ideate")}>Back to ideate</button>
                {script && (
                  <button className="btn-primary" onClick={() => plan()} disabled={planning}>
                    <ArrowRight className="h-4 w-4" /> Plan storyboard
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {stage === "storyboard" && board && (
        <div className="space-y-5">
          <div className="panel p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="font-display text-xl">{board.title}</h2>
                <p className="text-sm text-muted">{board.logline}</p>
              </div>
              <span className="label">{board.scenes.length} scenes · {board.aspectRatio}</span>
            </div>
            <Filmstrip scenes={board.scenes} active={activeScene} onSelect={setActiveScene} />
          </div>

          {scene && (
            <div className="grid gap-5 md:grid-cols-2">
              <div className="panel p-4">
                <p className="label mb-3">Scene {scene.index + 1}</p>

                <label className="label">On-screen text</label>
                <input
                  className="input mb-1 mt-1"
                  value={scene.onScreenText ?? ""}
                  onChange={(e) => updateScene(scene.id, { onScreenText: e.target.value })}
                  placeholder="The words shown on screen"
                />
                <p className="mb-3 text-[11px] text-muted">Wrap the punch word in *asterisks* to highlight it.</p>

                <label className="label">Footage</label>
                <input
                  className="input mb-1 mt-1"
                  value={scene.footageQuery ?? ""}
                  onChange={(e) => updateScene(scene.id, { footageQuery: e.target.value })}
                  placeholder="e.g. empty boardroom, city at night"
                />
                <p className="mb-3 text-[11px] text-muted">2-4 words of real b-roll pulled in Stock mode. The text sits on top of it.</p>

                <label className="label">Voiceover</label>
                <textarea
                  className="input mt-1 h-16 resize-none text-[13px]"
                  value={scene.voiceover}
                  onChange={(e) => updateScene(scene.id, { voiceover: e.target.value })}
                />
                <div className="mt-3 flex items-center gap-2">
                  <label className="label">Duration</label>
                  <input type="range" min={2} max={8} value={scene.durationSec}
                    onChange={(e) => updateScene(scene.id, { durationSec: Number(e.target.value) })} className="flex-1 accent-marker" />
                  <span className="font-mono text-sm text-bone">{scene.durationSec}s</span>
                </div>
                <p className="mt-2 text-[11px] text-muted">Final cut length follows the voiceover.</p>
              </div>

              <div className="panel p-4">
                <p className="label mb-3">How visuals work</p>
                <p className="text-sm text-muted">
                  In <span className="text-bone">Stock + text</span> mode (chosen in Budget), every scene pulls
                  real footage matching its Footage term, with the on-screen text layered on top and the cut
                  timed to the voiceover. In <span className="text-bone">Designed motion</span> mode, scenes
                  render as kinetic typography instead. Footage is fetched at Produce and composited at Assemble.
                </p>
                <div className="mt-4">
                  <p className="label mb-1">Music bed</p>
                  <textarea
                    className="input h-28 resize-none text-[13px]"
                    value={board.musicPrompt}
                    onChange={(e) => setBoard({ ...board, musicPrompt: e.target.value })}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <button className="btn-primary" onClick={() => setStage("budget")}>
              Set budget <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ---------------- BUDGET ---------------- */}
      {stage === "budget" && board && cost && (
        <div className="grid gap-5 md:grid-cols-[1fr_340px]">
          <div className="space-y-4">
            <div className="panel p-4">
              <p className="label mb-3">Visual style</p>
              <div className="grid gap-2 sm:grid-cols-3">
                <button
                  onClick={() => setChoice({ ...choice, style: "stock" })}
                  className={`rounded-lg border p-3 text-left transition ${
                    choice.style === "stock" ? "border-marker bg-marker/10" : "border-line hover:border-muted"
                  }`}
                >
                  <span className="font-medium text-bone">Stock + text</span>
                  <p className="mt-0.5 text-xs text-muted">Real footage matched to each beat, kinetic text on top, cut to the VO. Recommended.</p>
                </button>
                <button
                  onClick={() => setChoice({ ...choice, style: "designed" })}
                  className={`rounded-lg border p-3 text-left transition ${
                    choice.style === "designed" ? "border-marker bg-marker/10" : "border-line hover:border-muted"
                  }`}
                >
                  <span className="font-medium text-bone">Designed motion</span>
                  <p className="mt-0.5 text-xs text-muted">Pure kinetic typography. No footage, $0 to render.</p>
                </button>
                <button
                  onClick={() => setChoice({ ...choice, style: "ai_video" })}
                  className={`rounded-lg border p-3 text-left transition ${
                    choice.style === "ai_video" ? "border-marker bg-marker/10" : "border-line hover:border-muted"
                  }`}
                >
                  <span className="font-medium text-bone">AI video</span>
                  <p className="mt-0.5 text-xs text-muted">Generated footage. Higher ceiling, costs per second.</p>
                </button>
              </div>
              {choice.style === "stock" && (
                <p className="mt-3 text-xs text-teal">Needs a free Pexels key in Settings. Scenes with no match fall back to designed motion.</p>
              )}
            </div>

            {choice.style === "ai_video" && (
            <div className="panel p-4">
              <p className="label mb-3">Video model</p>
              <div className="grid gap-2">
                {(Object.keys(VIDEO_MODELS) as VideoModelId[]).map((id) => (
                  <button
                    key={id}
                    onClick={() => setChoice({ ...choice, videoModel: id })}
                    className={`rounded-lg border p-3 text-left transition ${
                      choice.videoModel === id ? "border-marker bg-marker/10" : "border-line hover:border-muted"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-bone">{VIDEO_MODELS[id].label}</span>
                      <span className="font-mono text-sm text-teal">${VIDEO_MODELS[id].usdPerSec}/s</span>
                    </div>
                    <p className="text-xs text-muted">{VIDEO_MODELS[id].note}</p>
                  </button>
                ))}
              </div>
            </div>
            )}
            <div className="panel grid gap-4 p-4 sm:grid-cols-2">
              <div>
                <p className="label mb-2">Voice</p>
                <select className="input" value={choice.voiceId} onChange={(e) => setChoice({ ...choice, voiceId: e.target.value })}>
                  {VOICE_PRESETS.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <p className="label mb-2">Reference still</p>
                <select className="input" value={choice.imageModel} onChange={(e) => setChoice({ ...choice, imageModel: e.target.value as any })}>
                  {Object.entries(IMAGE_MODELS).map(([id, m]) => <option key={id} value={id}>{m.label}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-bone">
                <input type="checkbox" checked={choice.music} onChange={(e) => setChoice({ ...choice, music: e.target.checked })} className="accent-marker" />
                Generate music bed
              </label>
            </div>
          </div>

          <aside className="panel h-fit p-4">
            <p className="label mb-3">Estimated cost</p>
            <div className="space-y-2.5">
              {cost.lines.map((l, i) => (
                <div key={i} className="flex items-start justify-between gap-2 text-sm">
                  <div>
                    <p className="text-bone">{l.label}</p>
                    <p className="text-[11px] text-muted">{l.detail}</p>
                  </div>
                  <span className="font-mono text-bone">{fmtUsd(l.usd)}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
              <span className="font-display text-lg">Total</span>
              <span className="font-mono text-xl text-marker">{fmtUsd(cost.totalUsd)}</span>
            </div>
            <p className="mt-2 text-[11px] text-muted">Estimate. Actual depends on provider rates and re-rolls.</p>
            {!keyed && <p className="mt-2 text-[11px] text-teal">No keys yet — this will run as a free mock dry run.</p>}
            <button className="btn-primary mt-4 w-full" onClick={() => { setStage("produce"); produce(); }} disabled={producing}>
              <Play className="h-4 w-4" /> Generate everything
            </button>
          </aside>
        </div>
      )}

      {/* ---------------- PRODUCE ---------------- */}
      {stage === "produce" && board && (
        <div className="space-y-5">
          <div className="panel p-4">
            <Filmstrip scenes={board.scenes} active={activeScene} onSelect={setActiveScene} />
          </div>
          <div className="grid gap-5 md:grid-cols-[1fr_340px]">
            <div className="panel p-4">
              <p className="label mb-3">Preview</p>
              {finalUrl ? (
                <video src={finalUrl} controls className="w-full rounded-lg bg-black" />
              ) : (
                <div className="grid aspect-video place-items-center rounded-lg border border-dashed border-line text-muted">
                  {producing ? <Loader2 className="h-6 w-6 animate-spin" /> : "Generate, then assemble"}
                </div>
              )}
              <div className="mt-3 flex gap-2">
                <button className="btn-ghost" onClick={produce} disabled={producing}>
                  {producing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Re-generate
                </button>
                <button className="btn-primary flex-1" onClick={runAssemble} disabled={producing}>
                  <Film className="h-4 w-4" /> Assemble ad
                </button>
                {finalUrl && (
                  <a className="btn-ghost" href={finalUrl} download="admaker-ad.mp4">
                    <Download className="h-4 w-4" /> Download
                  </a>
                )}
              </div>
            </div>
            <aside className="panel flex max-h-[520px] flex-col p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="label">Debug</p>
                <div className="flex items-center gap-2">
                  <button
                    className="text-[11px] text-teal hover:underline"
                    onClick={() => setShowDebug((v) => !v)}
                  >
                    {showDebug ? "show raw log" : "show debug"}
                  </button>
                  <button
                    className="text-[11px] text-teal hover:underline"
                    onClick={() => {
                      const text = debug
                        .map((d) => `[${d.t}] ${d.scene} · ${d.kind.toUpperCase()} · ${d.label}${d.detail ? "\n" + d.detail : ""}`)
                        .join("\n\n");
                      navigator.clipboard?.writeText(text || "(empty)");
                      pushLog("debug copied to clipboard");
                    }}
                  >
                    copy
                  </button>
                </div>
              </div>
              {showDebug ? (
                <div className="flex-1 space-y-2 overflow-y-auto">
                  {debug.length === 0 && <p className="font-mono text-[11px] text-muted">no events yet — hit Re-generate</p>}
                  {debug.map((d, i) => (
                    <div
                      key={i}
                      className={`rounded-md border p-2 text-[11px] ${
                        d.kind === "err"
                          ? "border-marker/50 bg-marker/10"
                          : d.kind === "ok"
                          ? "border-teal/30 bg-teal/5"
                          : "border-line bg-ink/40"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-bone">{d.scene}</span>
                        <span className={`font-mono ${d.kind === "err" ? "text-marker" : d.kind === "ok" ? "text-teal" : "text-muted"}`}>
                          {d.kind}
                        </span>
                      </div>
                      <p className="mt-0.5 text-bone/90">{d.label}</p>
                      {d.detail && (
                        <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] text-muted">
                          {d.detail}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex-1 space-y-1 overflow-y-auto font-mono text-[11px] text-muted">
                  {log.length === 0 && <p>waiting…</p>}
                  {log.map((l, i) => (
                    <p key={i}>{l}</p>
                  ))}
                </div>
              )}
            </aside>
          </div>

          <div className="panel p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="label">Still creatives</p>
                <p className="mt-1 text-xs text-muted">Agency-style static ads in your brand, sized for each platform.</p>
              </div>
              <button className="btn-primary" onClick={generateStills} disabled={stillsLoading}>
                {stillsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                Generate stills
              </button>
            </div>
            {stills.length === 0 ? (
              <div className="grid place-items-center rounded-lg border border-dashed border-line py-8 text-sm text-muted">
                {stillsLoading ? "Writing copy and rendering…" : "Generate a set of static ads to run alongside the video."}
              </div>
            ) : (
              <div className="space-y-6">
                {stills.map((group, gi) => (
                  <div key={gi}>
                    <p className="mb-2 font-display text-bone">{group.concept.headline.replace(/\*/g, "")}</p>
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                      {group.imgs.map((im, ii) => (
                        <div key={ii} className="rounded-lg border border-line bg-ink/40 p-2">
                          <img src={im.url} alt="" className="w-full rounded" />
                          <div className="mt-1.5 flex items-center justify-between">
                            <span className="text-[10px] text-muted">{im.size.platform}</span>
                            <a href={im.url} download={`${group.concept.cta || "ad"}-${im.size.id}.png`} className="flex items-center gap-1 text-[11px] text-teal hover:underline">
                              <Download className="h-3 w-3" /> {im.size.label}
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
