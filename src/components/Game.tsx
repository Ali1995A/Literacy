"use client";

import confetti from "canvas-confetti";
import { useEffect, useMemo, useRef, useState } from "react";
import type { WordEntry } from "@/lib/types";
import { pickUniqueIndices, shuffle, weightedPickUniqueIndices } from "@/lib/random";
import { decMistake, incMistake, loadMistakes, type MistakeStats, wordKey } from "@/lib/progress";
import { speechSupported } from "@/lib/speech";
import { playCheer } from "@/lib/sound";
import { prefetchText, speakText, unlockRemoteAudio } from "@/lib/tts";

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

function buildRound(bank: WordEntry[], stats: MistakeStats): RoundState {
  const weights = bank.map((w) => 1 + (stats[wordKey(w.hanzi)] ?? 0) * 4);
  const questionIndices = weightedPickUniqueIndices(weights, ROUND_SIZE);
  const items: RoundItem[] = questionIndices.map((wordIndex) => {
    const correct = bank[wordIndex]!;
    const distractorIndices = pickUniqueIndices(bank.length, OPTION_COUNT - 1, new Set([wordIndex]));
    const options = shuffle([
      correct,
      ...distractorIndices.map((i) => bank[i]!)
    ]);
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
          className="inline-block h-8 w-9 border-b-4 border-pink-300/90 md:h-10 md:w-12"
        />
      ))}
    </div>
  );
}

export default function Game() {
  const [bank, setBank] = useState<WordEntry[] | null>(null);
  const [mistakes, setMistakes] = useState<MistakeStats>({});
  const [mistakesLoaded, setMistakesLoaded] = useState(false);
  const [round, setRound] = useState<RoundState | null>(null);
  const [status, setStatus] = useState<"idle" | "correct" | "wrong" | "done">("idle");
  const [speechOn, setSpeechOn] = useState(true);
  const [autoNextOnCorrect, setAutoNextOnCorrect] = useState(true);
  const [unlocked, setUnlocked] = useState(() => !needsUnlock());
  const lastSpokenRef = useRef<string>("");

  const current = round ? round.items[round.currentIndex] : null;
  const hintMode = useMemo(() => isBeforeBeijingDate("2026-04-01"), []);
  const progressLabel = useMemo(() => {
    if (!round) return "加载中…";
    if (status === "done") return `本组完成：${round.correctCount}/${ROUND_SIZE}`;
    return `第 ${round.currentIndex + 1} / ${ROUND_SIZE} 题`;
  }, [round, status]);

  useEffect(() => {
    const loaded = loadMistakes();
    setMistakes(loaded);
    setMistakesLoaded(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const res = await fetch("/api/words");
        if (!res.ok) throw new Error(`words http ${res.status}`);
        const json = (await res.json()) as { words?: WordEntry[] };
        const words = json.words ?? [];
        if (!Array.isArray(words) || words.length < 50) throw new Error("invalid word bank");
        if (!cancelled) setBank(words);
      } catch {
        if (!cancelled) setBank([]);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!mistakesLoaded) return;
    if (!bank || bank.length === 0) return;
    if (round) return;
    setRound(buildRound(bank, mistakes));
  }, [bank, mistakes, mistakesLoaded, round]);

  useEffect(() => {
    if (!speechOn) return;
    if (!unlocked) return;
    if (!round) return;
    const words = round.items.map((x) => x.word.hanzi);
    if (words.length === 0) return;

    let cancelled = false;
    const run = async () => {
      // Prefetch with small concurrency to avoid blocking UI.
      for (let i = 0; i < words.length; i++) {
        if (cancelled) return;
        const text = words[i]!;
        try {
          await prefetchText(text);
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
  }, [round, speechOn, unlocked]);

  useEffect(() => {
    if (!current) return;
    setStatus("idle");
    if (!speechOn) return;
    if (!unlocked) return;

    const text = current.word.hanzi;
    lastSpokenRef.current = text;
    void speakText(text, {
      preferRemote: true,
      remoteTimeoutMs: 15000,
      fallback: "silent"
    });
  }, [current, speechOn, unlocked]);

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
    if (!round) return;
    const nextIndex = round.currentIndex + 1;
    if (nextIndex >= round.items.length) {
      setStatus("done");
      void celebrate();
      return;
    }
    setRound((r) => (r ? { ...r, currentIndex: nextIndex } : r));
  }

  function restartRound() {
    setStatus("idle");
    if (!bank || bank.length === 0) return;
    setRound(buildRound(bank, mistakes));
  }

  async function onPick(option: WordEntry) {
    if (!current || status === "done") return;
    if (status === "correct") return;

    const isCorrect = option.hanzi === current.word.hanzi;
    if (!isCorrect) {
      setStatus("wrong");
      setMistakes((m) => incMistake(m, wordKey(current.word.hanzi)));
      return;
    }

    setStatus("correct");
    setMistakes((m) => decMistake(m, wordKey(current.word.hanzi)));
    setRound((r) => (r ? { ...r, correctCount: r.correctCount + 1 } : r));

    if (!autoNextOnCorrect) return;
    window.setTimeout(() => nextQuestion(), 650);
  }

  function replay() {
    if (!speechOn) return;
    if (!unlocked) return;
    const text = lastSpokenRef.current || current?.word.hanzi;
    if (!text) return;
    void unlockRemoteAudio();
    void speakText(text, {
      preferRemote: true,
      remoteTimeoutMs: 15000,
      fallback: "silent"
    });
  }

  function unlockAudioAndSpeech() {
    if (unlocked) return;
    setUnlocked(true);
    if (!speechOn) return;
    const text = current?.word.hanzi;
    if (!text) return;
    lastSpokenRef.current = text;
    void unlockRemoteAudio();
    void speakText(text, {
      preferRemote: true,
      remoteTimeoutMs: 15000,
      fallback: "silent"
    });
  }

  return (
    <section className="relative w-full flex-1 rounded-3xl bg-white/70 p-5 shadow-soft ring-1 ring-pink-100 backdrop-blur md:p-6 lg:min-h-[78svh]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-pink-600 px-3 py-1 text-sm font-semibold text-white">
            {progressLabel}
          </div>
          {round && (
            <div className="text-sm text-pink-700/80">
              正确：{round.correctCount}/{ROUND_SIZE}
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

      {!bank || bank.length === 0 || !round ? (
        <div className="flex min-h-0 flex-1 items-center justify-center py-10 text-center">
          <div className="rounded-2xl bg-white/90 px-5 py-4 text-sm font-semibold text-pink-700 ring-1 ring-pink-100">
            正在加载词库…
          </div>
        </div>
      ) : status === "done" ? (
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
            <div className="mt-1 text-2xl font-extrabold tracking-wide text-pink-800 sm:text-3xl md:text-4xl">
              {current?.word.pinyin}
            </div>
            <div className="mt-4 md:mt-6">
              <BlankWord text={current?.word.hanzi ?? ""} />
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
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

            <div className="mt-4 min-h-10 text-center">
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

          <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:auto-rows-fr">
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
                    "touch-manipulation group h-full rounded-2xl border-2 bg-white px-3 py-3 text-left shadow-sm transition sm:px-5 sm:py-5 md:py-6",
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
                        "mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-xl text-xs font-extrabold text-white sm:h-10 sm:w-10 sm:text-sm md:h-11 md:w-11",
                        showAnswerHint ? "bg-emerald-600" : "bg-pink-600"
                      ].join(" ")}
                    >
                      {label}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div
                        className={[
                          "text-2xl font-extrabold group-hover:text-pink-900 sm:text-3xl md:text-4xl",
                          showAnswerHint ? "text-emerald-700" : "text-pink-800"
                        ].join(" ")}
                      >
                        {opt.hanzi}
                      </div>
                      <div
                        className={[
                          "mt-1 text-xs font-semibold sm:text-sm md:text-base",
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
