import type { AspectRatio, Storyboard } from "../types";

// A tiny silent WAV (44 bytes header + a hair of samples) as a data URL.
// Lets the audio steps "succeed" in mock mode without a key.
export const SILENT_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=";

// Deterministic placeholder "video": the client renders a colored slate from this.
export function mockVideo(prompt: string, index: number) {
  return { mock: true as const, prompt, index, url: "" };
}

export function mockImage(prompt: string) {
  return { mock: true as const, prompt, url: "" };
}

// A believable storyboard so the flow is explorable before any key is pasted.
export function mockStoryboard(script: string, aspectRatio: AspectRatio): Storyboard {
  const title = script.split("\n")[0]?.slice(0, 60) || "Mock ad";
  return {
    title,
    logline: "Mock storyboard. Paste an Anthropic key in Settings to generate a real one.",
    aspectRatio,
    characterRef: {
      description:
        "Corporate stock-photo woman ~34, glossy blowout, frozen mid-laugh, holding a salad. Bright airy office, soft studio light, slightly oversaturated.",
    },
    musicPrompt:
      "Instrumental, no vocals. Saccharine corporate piano that slowly curdles into low tense synth, then resolves warm and confident. No drums until the final beat.",
    scenes: [
      {
        id: "s1",
        index: 0,
        durationSec: 5,
        visualType: "designed_card",
        videoPrompt:
          "Stock-photo woman frozen mid-laugh holding a salad, locked camera, eerie stillness, one slow blink, extremely slow push-in. 5 seconds.",
        voiceover: "This is Mary. Marketing Mary.",
        onScreenText: "",
        footageQuery: "smiling woman portrait",
        usesCharacterRef: true,
        status: "idle",
      },
      {
        id: "s2",
        index: 1,
        durationSec: 4,
        visualType: "designed_card",
        card: {
          headline: "MARKETING MARY",
          sub: "Age 34",
          bullets: ["Loves: yoga", "authenticity", "sustainable brands"],
          note: "looks like a real internal deck slide",
        },
        voiceover: "Your entire Q3 strategy is built around Mary.",
        onScreenText: "MARKETING MARY",
        footageQuery: "office presentation screen",
        usesCharacterRef: false,
        status: "idle",
      },
      {
        id: "s3",
        index: 2,
        durationSec: 5,
        visualType: "designed_card",
        videoPrompt:
          "The same woman, completely frozen smile, the salad in her hands slowly wilts and browns, a single tear rolls down. Locked camera. 5 seconds.",
        voiceover: "Mary has never said a single word.",
        onScreenText: "",
        footageQuery: "empty meeting room",
        usesCharacterRef: true,
        status: "idle",
      },
      {
        id: "s4",
        index: 3,
        durationSec: 3,
        visualType: "designed_card",
        card: { headline: "3 responses", sub: "(all employees)", bullets: [], note: "survey result" },
        voiceover: "So you guess.",
        onScreenText: "3 responses",
        footageQuery: "person alone thinking",
        usesCharacterRef: false,
        status: "idle",
      },
      {
        id: "s5",
        index: 4,
        durationSec: 4,
        visualType: "screen_rec",
        voiceover: "Your real customers are right here.",
        onScreenText: "",
        footageQuery: "diverse crowd street",
        usesCharacterRef: false,
        status: "idle",
      },
      {
        id: "s6",
        index: 5,
        durationSec: 3,
        visualType: "designed_card",
        card: { headline: "Gather", sub: "Talk to everyone. Not just Mary.", bullets: [], note: "end card / logo" },
        voiceover: "Gather. Talk to everyone.",
        onScreenText: "Gather",
        footageQuery: "city people walking",
        usesCharacterRef: false,
        status: "idle",
      },
    ],
  };
}
