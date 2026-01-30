let cachedVoice: SpeechSynthesisVoice | null = null;

function scoreVoice(v: SpeechSynthesisVoice) {
  const lang = (v.lang || "").toLowerCase();
  const name = (v.name || "").toLowerCase();
  const uri = (v.voiceURI || "").toLowerCase();

  let score = 0;
  if (lang === "zh-cn") score += 200;
  if (lang.startsWith("zh-cn")) score += 150;
  if (lang.startsWith("zh")) score += 90;

  // Prefer local/native voices on iOS, often more natural and lower latency.
  if (v.localService) score += 40;

  // Heuristics for nicer Mandarin voices (best-effort across platforms).
  const prefer = ["ting", "婷婷", "xiaoxiao", "yunxi", "yunxia", "xiaoyi", "huilian", "huihui", "mandarin"];
  if (prefer.some((p) => name.includes(p) || uri.includes(p))) score += 30;

  // Avoid some obviously "robotic"/fallback voices.
  const avoid = ["compact", "default", "speech", "robot", "generic"];
  if (avoid.some((p) => name.includes(p) || uri.includes(p))) score -= 20;

  return score;
}

function pickChineseVoice(voices: SpeechSynthesisVoice[]) {
  const zhVoices = voices.filter((v) => (v.lang || "").toLowerCase().startsWith("zh"));
  if (zhVoices.length === 0) return null;
  const sorted = zhVoices
    .slice()
    .sort((a, b) => scoreVoice(b) - scoreVoice(a));
  return sorted[0] ?? null;
}

export function speechSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

export function cancelSpeech() {
  if (!speechSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // ignore
  }
}

export async function speakChinese(text: string) {
  if (!speechSupported()) return;
  const synth = window.speechSynthesis;

  const ensureVoice = () => {
    if (cachedVoice) return cachedVoice;
    const voices = synth.getVoices();
    cachedVoice = pickChineseVoice(voices);
    return cachedVoice;
  };

  let voice = ensureVoice();
  if (!voice) {
    await new Promise<void>((resolve) => {
      const onVoicesChanged = () => {
        synth.removeEventListener("voiceschanged", onVoicesChanged);
        resolve();
      };
      synth.addEventListener("voiceschanged", onVoicesChanged);
      window.setTimeout(() => {
        synth.removeEventListener("voiceschanged", onVoicesChanged);
        resolve();
      }, 600);
    });
    voice = ensureVoice();
  }

  cancelSpeech();

  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "zh-CN";
  if (voice) utter.voice = voice;
  utter.rate = 1;
  utter.pitch = 1;
  utter.volume = 1;
  synth.speak(utter);
}
