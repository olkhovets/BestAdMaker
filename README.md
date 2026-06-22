# AdMaker

**AI video ads for the rest of us.** Ideate with a creative director, storyboard into model-sized scenes, generate the footage, voiceover and music, then assemble a finished MP4 — in the browser. Bring your own keys.

Built because the AI video stack is powerful but scattered across five tools with no glue. AdMaker is the glue.

---

## The flow

1. **Ideate** — a Claude-powered creative director you brainstorm with. It finds the angle and writes the script. Lock it when it's right.
2. **Storyboard** — Claude splits the script into scenes, each capped at **2–8 seconds** because that is what video models actually produce. Every scene is tagged:
   - `ai_video` — a generated moving shot.
   - `designed_card` — anything with readable words (stats, persona slides, logos, kinetic type). Models mangle text, so these are rendered, never generated.
   - `screen_rec` — a placeholder for your own product recording. A real demo beats a hallucinated one.
3. **Continuity, handled honestly.** If a subject recurs, AdMaker generates **one reference still** and animates it across flagged scenes using an image→video model. If your chosen model can't reuse a reference, it tells you the look will drift instead of pretending otherwise.
4. **Budget** — pick your model per job, see the estimated cost (per-second video + per-character voice + token envelope) **before** anything runs. Generate only when you like the number.
5. **Produce** — fans out: reference still → video per scene → voiceover per line → music bed.
6. **Assemble** — stitches clips in order, lays VO and a ducked music bed, exports an MP4. Runs in-browser via ffmpeg.wasm, so hosting the public app costs nothing per render.
7. **Stills** — a standalone tab that produces platform-sized static ads (1080², 1080×1350, 1200×628, 1080×1920) from just a brief — no video required. Claude writes three distinct concepts; each renders in your chosen style: **real photo** (Pexels), **AI image** (fal/FLUX), or **typography** (text on your brand color). Backgrounds are fetched server-side so the canvas export never trips on CORS.

## Bring your own keys

Keys live in your browser (localStorage) and go straight to each provider. Nothing is stored server-side.

| Provider | Used for | Get a key |
| --- | --- | --- |
| **Anthropic** | creative director + storyboard | console.anthropic.com |
| **fal.ai** | video + reference image (Kling, Veo, Seedance) | fal.ai/dashboard/keys |
| **ElevenLabs** | voiceover + music | elevenlabs.io |

Leave any field blank and that step runs in **mock mode** — the full pipeline still works with placeholders, so you can explore the whole thing before spending a cent.

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
```

Deploy to Vercel as-is. The only config is the cross-origin isolation headers in `next.config.mjs`, which ffmpeg.wasm needs and which are already set.

Optional server-side key fallback (so visitors don't each need their own) — copy `.env.example` to `.env.local` and fill in any keys. Leave blank to force pure BYO mode.

## Architecture

```
app/
  page.tsx                 renders the Studio
  api/
    ideate, plan           Claude: creative + storyboard JSON
    generate/{video,image,voice,music}   provider proxies (BYO key via headers)
components/
  Studio.tsx               the Ideate → Storyboard → Budget → Produce wizard
  Filmstrip.tsx            the signature: scenes as cells on a sprocketed strip
  Settings.tsx             key management
lib/
  pricing.ts               model catalog + cost engine (edit rates here)
  providers/               anthropic, fal, elevenlabs, mock
  assemble.ts              ffmpeg.wasm: normalize, concat, mix, export
  types.ts                 shared data model
```

Swapping models is one edit: add an entry to `VIDEO_MODELS` in `lib/pricing.ts` and the matching fal model id flows through.

## v1 status — what's wired, what to verify

This is a working v1. Honest about the edges:

- ✅ Ideation, storyboarding, scene editing, cost estimation, mock pipeline — working and tested.
- ✅ Provider calls for Claude, fal, ElevenLabs are wired to live endpoints. Test against your own keys; provider response shapes occasionally shift, and adapters are isolated in `lib/providers/` for easy fixes.
- ⚠️ **Browser assembly** is the part most likely to need iteration. ffmpeg.wasm is fiddly: it needs a Chromium-based browser with cross-origin isolation, and concatenating clips of mixed resolutions can be slow. For heavy use, swap `lib/assemble.ts` for a hosted renderer (Shotstack / Creatomate) behind the same interface.
- 🔜 Roadmap: per-scene re-roll without regenerating the batch, saved projects (Supabase), a hosted-render option, and timed VO alignment per scene rather than sequential concat.

## License

MIT. Fork it, ship it, make ads.
