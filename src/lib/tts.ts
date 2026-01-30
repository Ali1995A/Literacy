import { cancelSpeech, speakChinese, speechSupported } from "@/lib/speech";

type SpeakOptions = {
  preferRemote?: boolean;
  signal?: AbortSignal;
};

const audioUrlCache = new Map<string, string>();
let currentAudio: HTMLAudioElement | null = null;
let activeSeq = 0;
let activeAbort: AbortController | null = null;

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
  activeSeq += 1;
  if (activeAbort) {
    try {
      activeAbort.abort();
    } catch {
      // ignore
    }
    activeAbort = null;
  }
  cancelSpeech();
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

function makeAbortController(parent?: AbortSignal) {
  const controller = new AbortController();
  if (!parent) return controller;
  if (parent.aborted) {
    controller.abort();
    return controller;
  }
  const onAbort = () => controller.abort();
  parent.addEventListener("abort", onAbort, { once: true });
  return controller;
}

export async function speakText(text: string, opts: SpeakOptions = {}) {
  const preferRemote = opts.preferRemote ?? true;

  stopCurrent();
  const seq = activeSeq;
  const controller = makeAbortController(opts.signal);
  activeAbort = controller;

  if (preferRemote) {
    try {
      const cached = audioUrlCache.get(text);
      const url = cached ?? (await fetchWavForText(text, controller.signal));
      if (!cached) audioUrlCache.set(text, url);

      if (controller.signal.aborted || seq !== activeSeq) return;

      const audio = new Audio(url);
      audio.preload = "auto";
      currentAudio = audio;
      await audio.play();
      if (controller.signal.aborted || seq !== activeSeq) {
        stopCurrent();
      }
      return;
    } catch {
      // fall through to local engine
    }
  }

  if (!controller.signal.aborted && seq === activeSeq && speechSupported()) {
    await speakChinese(text);
  }
}
