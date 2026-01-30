import { speakChinese, speechSupported } from "@/lib/speech";

type SpeakOptions = {
  preferRemote?: boolean;
  signal?: AbortSignal;
};

const audioUrlCache = new Map<string, string>();
let currentAudio: HTMLAudioElement | null = null;

async function fetchWavForText(text: string, signal?: AbortSignal) {
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal
  });

  if (!res.ok) throw new Error(`tts http ${res.status}`);
  const buf = await res.arrayBuffer();
  const blob = new Blob([buf], { type: "audio/wav" });
  return URL.createObjectURL(blob);
}

function stopCurrent() {
  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    } catch {
      // ignore
    }
    currentAudio = null;
  }
}

export function cleanupTtsCache() {
  for (const url of audioUrlCache.values()) URL.revokeObjectURL(url);
  audioUrlCache.clear();
}

export async function speakText(text: string, opts: SpeakOptions = {}) {
  const preferRemote = opts.preferRemote ?? true;

  stopCurrent();

  if (preferRemote) {
    try {
      const cached = audioUrlCache.get(text);
      const url = cached ?? (await fetchWavForText(text, opts.signal));
      if (!cached) audioUrlCache.set(text, url);

      const audio = new Audio(url);
      audio.preload = "auto";
      currentAudio = audio;
      await audio.play();
      return;
    } catch {
      // fall through to local engine
    }
  }

  if (speechSupported()) {
    await speakChinese(text);
  }
}

