import type { ChatMessage } from "../types";

// Aspen (runonaspen.com) is a private, locally-run AI that exposes a standard
// OpenAI-compatible API. We talk to it through the standard /chat/completions
// contract and return the assistant's text — the exact same contract as the
// Claude helpers, so the rest of the pipeline (storyboard JSON parsing, brand
// JSON, stills copy) is unchanged. Open models: Qwen, Llama, DeepSeek, Mistral.

export interface AspenConfig {
  key?: string;
  baseUrl?: string;
  model?: string;
}

const DEFAULT_BASE = "https://my.runonaspen.com/v1"; // Aspen's documented endpoint
const DEFAULT_MODEL = "qwen2.5:7b";

// Aspen is in play when its key is set (matches "use an API key from Aspen").
export function aspenConfigured(cfg?: AspenConfig): boolean {
  return !!cfg?.key;
}

export async function aspenChat(
  opts: { system: string; messages: ChatMessage[]; maxTokens: number; timeoutMs?: number },
  cfg: AspenConfig
): Promise<string> {
  const base = (cfg.baseUrl || DEFAULT_BASE).replace(/\/+$/, "");
  const model = cfg.model || DEFAULT_MODEL;

  // Time-box the request: the relay forwards to your device, so if it's asleep or
  // the local model is slow we want a clear failure instead of hanging the route.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 90_000);

  let res: Response;
  try {
    res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${cfg.key ?? ""}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: opts.maxTokens,
        messages: [
          { role: "system", content: opts.system },
          ...opts.messages.map((m) => ({ role: m.role, content: m.content })),
        ],
      }),
      signal: ctrl.signal,
    });
  } catch (e: any) {
    // Network-level failure (relay unreachable, device offline, or timed out).
    const why = e?.name === "AbortError" ? "timed out" : "could not be reached";
    throw new Error(`Aspen ${why} at ${base} — make sure the Aspen app is running and your device is online.`);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.text();
    const hint =
      res.status === 401 || res.status === 403
        ? " — check your Aspen API key."
        : res.status === 404
        ? ` — check the base URL and that model "${model}" is installed in Aspen.`
        : "";
    throw new Error(`Aspen ${res.status}: ${body}${hint}`);
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string") throw new Error("Aspen returned no message content");
  return text.trim();
}
