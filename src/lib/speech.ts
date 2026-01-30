let cachedVoice: SpeechSynthesisVoice | null = null;

function pickChineseVoice(voices: SpeechSynthesisVoice[]) {
  const zhVoices = voices.filter((v) => (v.lang || "").toLowerCase().startsWith("zh"));
  const zhCn =
    zhVoices.find((v) => v.lang.toLowerCase() === "zh-cn") ??
    zhVoices.find((v) => v.lang.toLowerCase().startsWith("zh-cn")) ??
    zhVoices[0];
  return zhCn ?? null;
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
  utter.rate = 0.9;
  utter.pitch = 1.15;
  utter.volume = 1;
  synth.speak(utter);
}
