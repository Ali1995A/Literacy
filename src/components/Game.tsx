"use client";

import confetti from "canvas-confetti";
import { useEffect, useMemo, useRef, useState } from "react";
import { WORDS, type WordEntry } from "@/lib/words";
import { pickUniqueIndices, shuffle, weightedPickUniqueIndices } from "@/lib/random";
import { decMistake, incMistake, loadMistakes, type MistakeStats, wordKey } from "@/lib/progress";
import { speechSupported } from "@/lib/speech";
import { playCheer } from "@/lib/sound";
import { prefetchText, speakText, type SpeakResult, unlockRemoteAudio } from "@/lib/tts";

type RoundItem = {
  word: WordEntry;
  options: WordEntry[];
};

type RoundState = {
  items: RoundItem[];
  currentIndex: number;
  correctCount: number;
};

const ROUND_SIZE = 5;
const OPTION_COUNT = 4;

function buildRound(stats: MistakeStats): RoundState {
  const weights = WORDS.map((w) => 1 + (stats[wordKey(w.hanzi, w.pinyin)] ?? 0) * 4);
  const questionIndices = weightedPickUniqueIndices(weights, ROUND_SIZE);
  const items: RoundItem[] = questionIndices.map((wordIndex) => {
    const correct = WORDS[wordIndex];
    const distractorIndices = pickUniqueIndices(WORDS.length, OPTION_COUNT - 1, new Set([wordIndex]));
    const options = shuffle([correct, ...distractorIndices.map((i) => WORDS[i])]);
    return { word: correct, options };
  });

  return { items, currentIndex: 0, correctCount: 0 };
}

function charCount(text: string) {
  return Array.from(text).length;
}

function BlankWord({ text }: { text: string }) {
  const count = charCount(text);
  return (
    <div className="flex items-end justify-center gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          className="inline-block h-10 w-12 border-b-4 border-pink-300/90"
        />
      ))}
    </div>
  );
}

export default function Game() {
  const [mistakes, setMistakes] = useState<MistakeStats>({});
  const [round, setRound] = useState<RoundState>(() => buildRound({}));
  const [status, setStatus] = useState<"idle" | "correct" | "wrong" | "done">("idle");
  const [speechOn, setSpeechOn] = useState(true);
  const [localFallbackOn, setLocalFallbackOn] = useState(false);
  const [autoNextOnCorrect, setAutoNextOnCorrect] = useState(true);
  const [unlocked, setUnlocked] = useState(() => !needsUnlock());
  const [fastMode, setFastMode] = useState(false);
  const [speakResult, setSpeakResult] = useState<SpeakResult>("silent");
  const [cloudVoice, setCloudVoice] = useState("xiaochen");
  const lastSpokenRef = useRef<string>("");

  const current = round.items[round.currentIndex];
  const hintMode = useMemo(() => isBeforeBeijingDate("2026-04-01"), []);
  const progressLabel = useMemo(() => {
    if (status === "done") return `本组完成：${round.correctCount}/${ROUND_SIZE}`;
    return `第 ${round.currentIndex + 1} / ${ROUND_SIZE} 题`;
  }, [round.correctCount, round.currentIndex, status]);

  useEffect(() => {
    const loaded = loadMistakes();
    setMistakes(loaded);
    setRound(buildRound(loaded));
  }, []);

  useEffect(() => {
    if (!speechOn) return;
    if (!unlocked) return;
    const words = round.items.map((x) => x.word.hanzi);
    if (words.length === 0) return;

    let cancelled = false;
    const run = async () => {
      // Prefetch with small concurrency to avoid blocking UI.
      for (let i = 0; i < words.length; i++) {
        if (cancelled) return;
        const text = words[i]!;
        try {
          await prefetchText(text, { voice: cloudVoice });
        } catch {
          // ignore (will fall back at speak time)
        }
      }
    };

    // Let first paint happen; then prefetch.
    const t = window.setTimeout(() => void run(), 250);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [round.items, speechOn, unlocked, cloudVoice]);

  useEffect(() => {
    if (!current) return;
    setStatus("idle");
    if (!speechOn) return;
    if (!unlocked) return;

    const text = current.word.hanzi;
    lastSpokenRef.current = text;
    setSpeakResult("pending");
    void speakText(text, {
      preferRemote: true,
      remoteTimeoutMs: fastMode ? 650 : 15000,
      fallback: localFallbackOn ? "local" : "silent",
      voice: cloudVoice
    }).then((r) => setSpeakResult(r ?? "silent"));
  }, [current, speechOn, unlocked, localFallbackOn, fastMode, cloudVoice]);

  async function celebrate() {
    try {
      playCheer();
    } catch {
      // ignore
    }
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduceMotion) return;
    confetti({
      particleCount: 120,
      spread: 85,
      origin: { y: 0.65 },
      colors: ["#fb7185", "#f472b6", "#fda4af", "#f9a8d4", "#ffe4f3"]
    });
    confetti({
      particleCount: 40,
      spread: 55,
      origin: { y: 0.25 },
      colors: ["#fb7185", "#f472b6", "#fda4af", "#f9a8d4", "#ffe4f3"]
    });
  }

  function nextQuestion() {
    const nextIndex = round.currentIndex + 1;
    if (nextIndex >= round.items.length) {
      setStatus("done");
      void celebrate();
      return;
    }
    setRound((r) => ({ ...r, currentIndex: nextIndex }));
  }

  function restartRound() {
    setStatus("idle");
    setRound(buildRound(mistakes));
  }

  async function onPick(option: WordEntry) {
    if (!current || status === "done") return;
    if (status === "correct") return;

    const isCorrect = option.hanzi === current.word.hanzi;
    if (!isCorrect) {
      setStatus("wrong");
      setMistakes((m) => incMistake(m, wordKey(current.word.hanzi, current.word.pinyin)));
      return;
    }

    setStatus("correct");
    setMistakes((m) => decMistake(m, wordKey(current.word.hanzi, current.word.pinyin)));
    setRound((r) => ({ ...r, correctCount: r.correctCount + 1 }));

    if (!autoNextOnCorrect) return;
    window.setTimeout(() => nextQuestion(), 650);
  }

  function replay() {
    if (!speechOn) return;
    if (!unlocked) return;
    const text = lastSpokenRef.current || current?.word.hanzi;
    if (!text) return;
    void unlockRemoteAudio();
    setSpeakResult("pending");
    void speakText(text, {
      preferRemote: true,
      remoteTimeoutMs: fastMode ? 650 : 15000,
      fallback: localFallbackOn ? "local" : "silent",
      voice: cloudVoice
    }).then((r) => setSpeakResult(r ?? "silent"));
  }

  function unlockAudioAndSpeech() {
    if (unlocked) return;
    setUnlocked(true);
    if (!speechOn) return;
    const text = current?.word.hanzi;
    if (!text) return;
    lastSpokenRef.current = text;
    void unlockRemoteAudio();
    setSpeakResult("pending");
    void speakText(text, {
      preferRemote: true,
      remoteTimeoutMs: fastMode ? 650 : 15000,
      fallback: localFallbackOn ? "local" : "silent",
      voice: cloudVoice
    }).then((r) => setSpeakResult(r ?? "silent"));
  }

  return (
    <section className="relative w-full flex-1 rounded-3xl bg-white/70 p-5 shadow-soft ring-1 ring-pink-100 backdrop-blur md:p-6 lg:min-h-[78svh]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-pink-600 px-3 py-1 text-sm font-semibold text-white">
            {progressLabel}
          </div>
          <div className="text-sm text-pink-700/80">
            正确：{round.correctCount}/{ROUND_SIZE}
          </div>
          {speechOn && (
            <div
              className={[
                "rounded-full px-3 py-1 text-xs font-extrabold ring-1",
                speakResult === "pending"
                  ? "bg-violet-50 text-violet-700 ring-violet-200"
                  : "",
                speakResult === "remote"
                  ? "bg-sky-50 text-sky-700 ring-sky-200"
                  : speakResult === "blocked"
                    ? "bg-amber-50 text-amber-800 ring-amber-200"
                    : speakResult === "local"
                      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                      : speakResult === "error"
                        ? "bg-rose-50 text-rose-700 ring-rose-200"
                      : "bg-white text-pink-700/70 ring-pink-100"
              ].join(" ")}
            >
              {speakResult === "pending"
                ? "云端加载中…"
                : speakResult === "remote"
                ? "云端✓"
                : speakResult === "blocked"
                  ? "云端需点击"
                  : speakResult === "local"
                    ? "本地兜底"
                    : speakResult === "error"
                      ? "朗读失败"
                    : "静音"}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSpeechOn((v) => !v)}
            className={`touch-manipulation rounded-full px-3 py-1 text-sm font-semibold ring-1 ${
              speechOn ? "bg-pink-50 text-pink-700 ring-pink-200" : "bg-white text-pink-700/70 ring-pink-100"
            }`}
          >
            朗读：{speechOn ? "开" : "关"}
          </button>
          <button
            type="button"
            onClick={() => setFastMode((v) => !v)}
            className={`touch-manipulation rounded-full px-3 py-1 text-sm font-semibold ring-1 ${
              fastMode
                ? "bg-indigo-50 text-indigo-700 ring-indigo-200"
                : "bg-white text-pink-700/70 ring-pink-100"
            }`}
          >
            快速模式：{fastMode ? "开" : "关"}
          </button>
          <button
            type="button"
            onClick={() => setCloudVoice((v) => (v === "xiaochen" ? "tongtong" : "xiaochen"))}
            className="touch-manipulation rounded-full bg-white px-3 py-1 text-sm font-semibold text-pink-700/70 ring-1 ring-pink-100 hover:bg-pink-50"
          >
            云端音色：{cloudVoice === "xiaochen" ? "小晨" : "童童"}
          </button>
          <button
            type="button"
            onClick={() => setLocalFallbackOn((v) => !v)}
            className={`touch-manipulation rounded-full px-3 py-1 text-sm font-semibold ring-1 ${
              localFallbackOn
                ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                : "bg-white text-pink-700/70 ring-pink-100"
            }`}
          >
            本地兜底：{localFallbackOn ? "开" : "关"}
          </button>
          <button
            type="button"
            onClick={() => setAutoNextOnCorrect((v) => !v)}
            className={`touch-manipulation rounded-full px-3 py-1 text-sm font-semibold ring-1 ${
              autoNextOnCorrect
                ? "bg-pink-50 text-pink-700 ring-pink-200"
                : "bg-white text-pink-700/70 ring-pink-100"
            }`}
          >
            自动下一题：{autoNextOnCorrect ? "开" : "关"}
          </button>
        </div>
      </div>

      {!speechSupported() && (
        <div className="mb-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
          你的浏览器不支持本地朗读（SpeechSynthesis）。如需声音，请使用云端朗读（需配置）或换个浏览器。
        </div>
      )}

      {status === "done" ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center py-6 text-center">
          <div className="mx-auto mb-2 inline-flex items-center gap-2 rounded-2xl bg-pink-600 px-4 py-2 text-white shadow-soft">
            <span className="text-lg font-extrabold">恭喜完成！</span>
            <span className="text-sm font-semibold">你太棒啦</span>
          </div>
          <div className="mt-2 text-sm text-pink-700/80">
            本组得分：{round.correctCount} / {ROUND_SIZE}
          </div>
          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={restartRound}
              className="touch-manipulation rounded-2xl bg-pink-600 px-5 py-3 text-base font-bold text-white shadow-soft hover:bg-pink-700 active:scale-[0.99]"
            >
              再来一组
            </button>
          </div>
        </div>
      ) : (
        <div className="grid min-h-0 gap-5 lg:grid-cols-[1.05fr,1fr] lg:gap-6">
          <div className="text-center lg:flex lg:flex-col lg:justify-center">
            <div className="text-sm font-semibold text-pink-700/80">拼音</div>
            <div className="mt-1 text-3xl font-extrabold tracking-wide text-pink-800 md:text-4xl">
              {current?.word.pinyin}
            </div>
            <div className="mt-5 md:mt-6">
              <BlankWord text={current?.word.hanzi ?? ""} />
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={replay}
                className="touch-manipulation rounded-full bg-white px-4 py-2 text-sm font-semibold text-pink-700 ring-1 ring-pink-200 hover:bg-pink-50"
              >
                再听一遍
              </button>
              {status === "correct" && !autoNextOnCorrect && (
                <button
                  type="button"
                  onClick={nextQuestion}
                  className="touch-manipulation rounded-full bg-pink-600 px-4 py-2 text-sm font-semibold text-white shadow-soft hover:bg-pink-700 active:scale-[0.99]"
                >
                  {round.currentIndex + 1 >= ROUND_SIZE ? "完成本组" : "下一题"}
                </button>
              )}
              <button
                type="button"
                onClick={restartRound}
                className="touch-manipulation rounded-full bg-white px-4 py-2 text-sm font-semibold text-pink-700/80 ring-1 ring-pink-100 hover:bg-pink-50"
              >
                换一组词
              </button>
            </div>

            <div className="mt-5 min-h-10 text-center">
              {status === "wrong" && (
                <div className="inline-flex items-center gap-2 rounded-2xl bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 ring-1 ring-rose-200">
                  这题已记录，之后会再出现～
                </div>
              )}
              {status === "correct" && (
                <div className="inline-flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-200">
                  太棒了！答对啦～
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:auto-rows-fr">
            {current?.options.map((opt, i) => {
              const label = ["A", "B", "C", "D"][i] ?? "?";
              const disabled = status === "correct";
              const isAnswer = opt.hanzi === current.word.hanzi;
              const showAnswerHint = hintMode && isAnswer;
              return (
                <button
                  key={`${opt.hanzi}-${i}`}
                  type="button"
                  disabled={disabled}
                  onClick={() => onPick(opt)}
                  className={[
                    "touch-manipulation group h-full rounded-2xl border-2 bg-white px-5 py-5 text-left shadow-sm transition md:py-6",
                    "md:hover:-translate-y-0.5 md:hover:border-pink-300 md:hover:shadow-soft active:translate-y-0",
                    disabled ? "opacity-90" : "",
                    showAnswerHint ? "border-emerald-300 ring-2 ring-emerald-200/60" : "",
                    !showAnswerHint && status === "wrong" ? "border-pink-200" : "",
                    !showAnswerHint && status !== "wrong" ? "border-pink-100" : ""
                  ].join(" ")}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={[
                        "mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-xl text-sm font-extrabold text-white md:h-11 md:w-11",
                        showAnswerHint ? "bg-emerald-600" : "bg-pink-600"
                      ].join(" ")}
                    >
                      {label}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div
                        className={[
                          "text-3xl font-extrabold group-hover:text-pink-900 md:text-4xl",
                          showAnswerHint ? "text-emerald-700" : "text-pink-800"
                        ].join(" ")}
                      >
                        {opt.hanzi}
                      </div>
                      <div
                        className={[
                          "mt-1 text-sm font-semibold md:text-base",
                          showAnswerHint ? "text-emerald-700/70" : "text-pink-700/70"
                        ].join(" ")}
                      >
                        {opt.pinyin}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {!unlocked && speechOn && needsUnlock() && status !== "done" && (
        <div className="absolute inset-0 flex items-center justify-center rounded-3xl bg-white/65 p-6 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl bg-white/90 p-5 text-center shadow-soft ring-1 ring-pink-100">
            <div className="text-lg font-extrabold text-pink-800">点一下开始</div>
            <div className="mt-2 text-sm font-semibold text-pink-700/80">
              iPad / 微信内置浏览器需要先点一下才能自动朗读～
            </div>
            <button
              type="button"
              onClick={unlockAudioAndSpeech}
              className="touch-manipulation mt-4 w-full rounded-2xl bg-pink-600 px-5 py-3 text-base font-extrabold text-white shadow-soft hover:bg-pink-700 active:scale-[0.99]"
            >
              开始朗读
            </button>
            <button
              type="button"
              onClick={() => {
                setSpeechOn(false);
                setUnlocked(true);
              }}
              className="touch-manipulation mt-3 w-full rounded-2xl bg-white px-5 py-3 text-sm font-bold text-pink-700 ring-1 ring-pink-100 hover:bg-pink-50"
            >
              不用声音，直接玩
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function needsUnlock() {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isIOS =
    /iPad|iPhone|iPod/i.test(ua) ||
    (/\bMacintosh\b/i.test(ua) && (navigator.maxTouchPoints ?? 0) > 1);
  const isWeChat = /MicroMessenger/i.test(ua);
  return isIOS || isWeChat;
}

function isBeforeBeijingDate(yyyyMmDd: string) {
  if (typeof window === "undefined") return true;
  try {
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date()); // YYYY-MM-DD
    return today < yyyyMmDd;
  } catch {
    // Fallback: assume current locale time; still safe for near-term use.
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}` < yyyyMmDd;
  }
}
