"use client";
import { useEffect, useState } from "react";
import { X, KeyRound, ExternalLink } from "lucide-react";
import { loadKeys, saveKeys } from "@/lib/client";
import type { ApiKeys } from "@/lib/types";

const FIELDS: { k: keyof ApiKeys; label: string; help: string; url: string }[] = [
  { k: "anthropic", label: "Anthropic", help: "Creative director + storyboard", url: "https://console.anthropic.com/settings/keys" },
  { k: "fal", label: "fal.ai", help: "Video + image generation", url: "https://fal.ai/dashboard/keys" },
  { k: "elevenlabs", label: "ElevenLabs", help: "Voiceover + music", url: "https://elevenlabs.io/app/settings/api-keys" },
  { k: "pexels", label: "Pexels", help: "Stock footage (free key)", url: "https://www.pexels.com/api/new/" },
];

export default function Settings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [keys, setKeys] = useState<ApiKeys>({});
  useEffect(() => {
    if (open) setKeys(loadKeys());
  }, [open]);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/80 p-4" onClick={onClose}>
      <div className="panel w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-xl font-display">
            <KeyRound className="h-5 w-5 text-marker" /> Your keys
          </h2>
          <button onClick={onClose} className="text-muted hover:text-bone">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-5 text-sm text-muted">
          Stored only in this browser and sent straight to each provider. Leave a field blank to run
          that step in mock mode.
        </p>
        <div className="mb-5 rounded-lg border border-teal/30 bg-teal/10 p-3 text-[13px] text-bone">
          <p className="font-medium text-teal">Publishing this app? Your account is safe.</p>
          <p className="mt-1 text-muted">
            These keys never leave your browser, so visitors to your deployed app can't spend them.
            Each person brings their own keys or runs in free mock mode. Just don't put keys in your
            Vercel environment variables — that would make everyone share (and drain) your account.
          </p>
        </div>
        <div className="space-y-4">
          {FIELDS.map((f) => (
            <div key={f.k}>
              <div className="mb-1 flex items-center justify-between">
                <label className="label">{f.label}</label>
                <a href={f.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-teal hover:underline">
                  get key <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <input
                type="password"
                className="input font-mono"
                placeholder={f.help}
                value={keys[f.k] ?? ""}
                onChange={(e) => setKeys({ ...keys, [f.k]: e.target.value })}
              />
            </div>
          ))}
        </div>

        <div className="mt-5 border-t border-line pt-5">
          <div className="mb-1 flex items-center justify-between">
            <label className="label">Aspen (local AI) — optional</label>
            <a href="https://runonaspen.com" target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-teal hover:underline">
              about <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <p className="mb-2 text-[11px] text-muted">
            A private, locally-run OpenAI-compatible model. When its key is set, Aspen runs the creative
            director, script, storyboard, brand, and stills copy in place of Claude — nothing leaves your device.
          </p>
          <input
            type="password"
            className="input font-mono"
            placeholder="sk-aspen-…"
            value={keys.aspen ?? ""}
            onChange={(e) => setKeys({ ...keys, aspen: e.target.value })}
          />
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              type="text"
              className="input font-mono"
              placeholder="https://my.runonaspen.com/v1"
              value={keys.aspenBaseUrl ?? ""}
              onChange={(e) => setKeys({ ...keys, aspenBaseUrl: e.target.value })}
            />
            <input
              type="text"
              className="input font-mono"
              placeholder="qwen2.5:7b"
              value={keys.aspenModel ?? ""}
              onChange={(e) => setKeys({ ...keys, aspenModel: e.target.value })}
            />
          </div>
          <p className="mt-1 text-[11px] text-muted">Base URL · model. Leave blank to use Aspen's defaults.</p>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            onClick={() => {
              saveKeys(keys);
              onClose();
            }}
          >
            Save keys
          </button>
        </div>
      </div>
    </div>
  );
}
