"use client";
import { useRef, useState } from "react";
import {
  Sparkles, Clapperboard, Wallet, Clapperboard as Produce, Settings as Gear,
  ArrowRight, Lock, Send, Loader2, Download, Play, Film, Type, MonitorPlay, Wand2,
} from "lucide-react";
import Settings from "./Settings";
import Filmstrip from "./Filmstrip";
import { api, loadKeys, hasAnyKey } from "@/lib/client";
import { estimateCost, fmtUsd, VIDEO_MODELS, IMAGE_MODELS } from "@/lib/pricing";
import { VOICE_PRESETS } from "@/lib/providers/elevenlabs";
import { assemble } from "@/lib/assemble";
import type { AspectRatio, ChatMessage, ModelChoice, Scene, Storyboard, VideoModelId } from "@/lib/types";

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

  // Storyboard
  const [aspect, setAspect] = useState<AspectRatio>("16:9");
  const [board, setBoard] = useState<Storyboard | null>(null);
  const [planning, setPlanning] = useState(false);
  const [planError, setPlanError] = useState<string>();
  const [activeScene, setActiveScene] = useState<string>();

  // Budget / produce
  const [choice, setChoice] = useState<ModelChoice>({
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
  const sceneMedia = useRef<Record<string, { url: string; mock?: boolean }>>({});
  const voUrls = useRef<Record<string, string>>({});
  const musicUrl = useRef<string>();

  const keyed = hasAnyKey(loadKeys());
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

  async function send() {
    if (!input.trim() || thinking) return;
    const next = [...messages, { role: "user" as const, content: input.trim() }];
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
    const supportsRef = VIDEO_MODELS[choice.videoModel].supportsImageRef;

    try {
      // 1. Reference still for continuity (non-fatal if it fails)
      let refUrl: string | undefined;
      if (board.characterRef && supportsRef) {
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

      // 2. Video per ai_video scene
      for (const s of board.scenes) {
        if (s.visualType !== "ai_video") continue;
        updateScene(s.id, { status: "running" });
        const payload = {
          model: choice.videoModel, prompt: s.videoPrompt, durationSec: s.durationSec,
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

      // 3. Voiceover per scene that has a line (non-fatal per line)
      for (const s of board.scenes) {
        if (!s.voiceover?.trim()) continue;
        pushLog(`scene ${s.index + 1}: voiceover…`);
        try {
          const r = await api<{ dataUrl: string; mock?: boolean }>("/api/generate/voice", { text: s.voiceover, voiceId: choice.voiceId });
          voUrls.current[s.id] = r.dataUrl;
          addDebug(`scene ${s.index + 1}`, r.mock ? "err" : "ok", r.mock ? "VO mock (no ElevenLabs key?)" : "VO ok");
        } catch (e: any) {
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

  async function runAssemble() {
    if (!board) return;
    setProducing(true);
    pushLog("loading ffmpeg…");
    try {
      const url = await assemble({
        board, sceneMedia: sceneMedia.current, voUrls: voUrls.current,
        musicUrl: musicUrl.current, onProgress: pushLog,
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
              <button className="btn-primary" onClick={send} disabled={thinking}>
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
                <div className="mb-3 flex gap-2">
                  {(["ai_video", "designed_card", "screen_rec"] as const).map((t) => {
                    const I = { ai_video: Film, designed_card: Type, screen_rec: MonitorPlay }[t];
                    return (
                      <button
                        key={t}
                        onClick={() => updateScene(scene.id, { visualType: t })}
                        className={`btn flex-1 ${scene.visualType === t ? "bg-bone text-ink" : "border border-line text-muted"}`}
                      >
                        <I className="h-4 w-4" /> {t.replace("_", " ")}
                      </button>
                    );
                  })}
                </div>
                {scene.visualType === "ai_video" ? (
                  <textarea
                    className="input mb-3 h-24 resize-none text-[13px]"
                    value={scene.videoPrompt}
                    onChange={(e) => updateScene(scene.id, { videoPrompt: e.target.value })}
                    placeholder="Shot prompt"
                  />
                ) : scene.visualType === "designed_card" ? (
                  <div className="mb-3 space-y-2">
                    <input className="input" placeholder="Headline" value={scene.card?.headline ?? ""}
                      onChange={(e) => updateScene(scene.id, { card: { ...scene.card, headline: e.target.value } })} />
                    <input className="input" placeholder="Subtext" value={scene.card?.sub ?? ""}
                      onChange={(e) => updateScene(scene.id, { card: { ...scene.card, sub: e.target.value } })} />
                  </div>
                ) : (
                  <p className="mb-3 rounded-lg border border-dashed border-line p-3 text-sm text-muted">
                    Drop in your own screen recording at assembly. A real product shot beats a generated one.
                  </p>
                )}
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
                {scene.usesCharacterRef && (
                  <p className="mt-3 flex items-center gap-1.5 text-xs text-teal">
                    <Sparkles className="h-3 w-3" /> reuses the character still for continuity
                  </p>
                )}
              </div>

              <div className="panel p-4">
                <p className="label mb-3">Continuity</p>
                {board.characterRef ? (
                  <>
                    <p className="text-sm text-bone">Recurring subject detected. One still gets generated and animated across flagged scenes.</p>
                    <p className="mt-2 rounded-lg bg-ink/50 p-3 text-[13px] text-muted">{board.characterRef.description}</p>
                    {!VIDEO_MODELS[choice.videoModel].supportsImageRef && (
                      <p className="mt-2 text-xs text-marker">Your selected video model can't reuse a reference. Switch to an image→video model in Budget, or expect the look to drift between scenes.</p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted">No recurring subject. Each scene stands alone, so model-to-model drift won't show.</p>
                )}
                <div className="mt-4">
                  <p className="label mb-1">Music bed</p>
                  <p className="text-[13px] text-muted">{board.musicPrompt}</p>
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
        </div>
      )}

      <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
