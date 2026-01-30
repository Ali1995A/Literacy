import { cancelSpeech, speakChinese, speechSupported } from "@/lib/speech";

type SpeakOptions = {
  preferRemote?: boolean;
  remoteTimeoutMs?: number;
  fallback?: "local" | "silent";
  voice?: string;
  speed?: number;
  signal?: AbortSignal;
};

export type SpeakResult = "pending" | "remote" | "local" | "silent" | "blocked" | "error";

const audioUrlCache = new Map<string, string>();
let sharedAudio: HTMLAudioElement | null = null;
let activeSeq = 0;
let activeAbort: AbortController | null = null;

async function fetchWavForText(
  text: string,
  params: { voice?: string; speed?: number },
  signal?: AbortSignal
) {
  const voice = (params.voice ?? "").trim();
  const speed = typeof params.speed === "number" ? params.speed : null;
  const url =
    `/api/tts?text=${encodeURIComponent(text)}` +
    (voice ? `&voice=${encodeURIComponent(voice)}` : "") +
    (speed !== null ? `&speed=${encodeURIComponent(String(speed))}` : "");
  const res = await fetch(url, {
    method: "GET",
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
  if (sharedAudio) {
    try {
      sharedAudio.pause();
      sharedAudio.currentTime = 0;
    } catch {
      // ignore
    }
  }
}

export function cleanupTtsCache() {
  for (const url of audioUrlCache.values()) URL.revokeObjectURL(url);
  audioUrlCache.clear();
}

export async function prefetchText(
  text: string,
  opts: { voice?: string; speed?: number } = {}
) {
  const cacheKey = `${text}__${(opts.voice ?? "").trim()}__${typeof opts.speed === "number" ? opts.speed : ""}`;
  if (audioUrlCache.has(cacheKey)) return;
  const url = await fetchWavForText(text, opts);
  audioUrlCache.set(cacheKey, url);
}

export async function unlockRemoteAudio() {
  if (typeof window === "undefined") return;
  sharedAudio = sharedAudio ?? new Audio();

  // Try to unlock WebAudio as well (helps some iOS/WebView environments).
  try {
    const AudioContextCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioContextCtor) {
      const ctx = new AudioContextCtor();
      await ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0.00001;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.02);
      window.setTimeout(() => void ctx.close(), 200);
    }
  } catch {
    // ignore
  }

  // Also try to "prime" the <audio> element. Some environments only allow play after a user gesture.
  try {
    sharedAudio.src =
      "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA="; // tiny silent wav
    await sharedAudio.play();
    sharedAudio.pause();
    sharedAudio.currentTime = 0;
  } catch {
    // ignore
  }
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

function withTimeout(signal: AbortSignal, ms: number) {
  if (ms <= 0) return signal;
  const controller = new AbortController();
  if (signal.aborted) controller.abort();
  const t = window.setTimeout(() => controller.abort(), ms);
  const onAbort = () => controller.abort();
  signal.addEventListener("abort", onAbort, { once: true });
  controller.signal.addEventListener(
    "abort",
    () => {
      window.clearTimeout(t);
      signal.removeEventListener("abort", onAbort);
    },
    { once: true }
  );
  return controller.signal;
}

export async function speakText(text: string, opts: SpeakOptions = {}) {
  const preferRemote = opts.preferRemote ?? true;
  const remoteTimeoutMs = opts.remoteTimeoutMs ?? 5000;
  const fallback = opts.fallback ?? "silent";
  const voice = opts.voice;
  const speed = opts.speed;

  stopCurrent();
  const seq = activeSeq;
  const controller = makeAbortController(opts.signal);
  activeAbort = controller;

  if (preferRemote) {
    try {
      const cacheKey = `${text}__${voice ?? ""}__${typeof speed === "number" ? speed : ""}`;
      const cached = audioUrlCache.get(cacheKey);
      const timedSignal =
        typeof window === "undefined"
          ? controller.signal
          : withTimeout(controller.signal, remoteTimeoutMs);
      const url = cached ?? (await fetchWavForText(text, { voice, speed }, timedSignal));
      if (!cached) audioUrlCache.set(cacheKey, url);

      if (controller.signal.aborted || seq !== activeSeq) return;

      sharedAudio = sharedAudio ?? new Audio();
      sharedAudio.preload = "auto";
      sharedAudio.src = url;
      sharedAudio.currentTime = 0;
      try {
        await sharedAudio.play();
      } catch (e) {
        const name = (e as { name?: string } | null)?.name ?? "";
        if (name === "NotAllowedError") {
          // iOS/WebView auto-play policy: keep src ready; user can tap "再听一遍".
          return "blocked" satisfies SpeakResult;
        }
        throw e;
      }
      if (controller.signal.aborted || seq !== activeSeq) {
        stopCurrent();
      }
      return "remote" satisfies SpeakResult;
    } catch {
      // fall through to local engine (or error/silent)
    }
  }

  if (!controller.signal.aborted && seq === activeSeq && speechSupported()) {
    if (fallback === "local") {
      await speakChinese(text);
      return "local" satisfies SpeakResult;
    }
  }

  // If the user asked for local but we can't, report error; otherwise silent.
  if (fallback === "local" && !speechSupported()) {
    return "error" satisfies SpeakResult;
  }
  return "silent" satisfies SpeakResult;
}
