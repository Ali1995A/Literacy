"use client";

import confetti from "canvas-confetti";
import { useEffect, useMemo, useRef, useState } from "react";
import { WORDS, type WordEntry } from "@/lib/words";
import { pickUniqueIndices, shuffle } from "@/lib/random";
import { speechSupported } from "@/lib/speech";
import { playCheer } from "@/lib/sound";
import { speakText } from "@/lib/tts";

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

function buildRound(): RoundState {
  const questionIndices = pickUniqueIndices(WORDS.length, ROUND_SIZE);
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
  const [round, setRound] = useState<RoundState>(() => buildRound());
  const [status, setStatus] = useState<"idle" | "correct" | "wrong" | "done">("idle");
  const [speechOn, setSpeechOn] = useState(true);
  const [autoNextOnCorrect, setAutoNextOnCorrect] = useState(true);
  const [unlocked, setUnlocked] = useState(() => !needsUnlock());
  const lastSpokenRef = useRef<string>("");

  const current = round.items[round.currentIndex];
  const progressLabel = useMemo(() => {
    if (status === "done") return `本组完成：${round.correctCount}/${ROUND_SIZE}`;
    return `第 ${round.currentIndex + 1} / ${ROUND_SIZE} 题`;
  }, [round.correctCount, round.currentIndex, status]);

  useEffect(() => {
    if (!current) return;
    setStatus("idle");
    if (!speechOn) return;
    if (!unlocked) return;

    const text = current.word.hanzi;
    lastSpokenRef.current = text;
    void speakText(text, { preferRemote: true });
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
    setRound(buildRound());
  }

  async function onPick(option: WordEntry) {
    if (!current || status === "done") return;
    if (status === "correct") return;

    const isCorrect = option.hanzi === current.word.hanzi;
    if (!isCorrect) {
      setStatus("wrong");
      return;
    }

    setStatus("correct");
    setRound((r) => ({ ...r, correctCount: r.correctCount + 1 }));

    if (!autoNextOnCorrect) return;
    window.setTimeout(() => nextQuestion(), 650);
  }

  function replay() {
    if (!speechOn) return;
    if (!unlocked) return;
    const text = lastSpokenRef.current || current?.word.hanzi;
    if (!text) return;
    void speakText(text, { preferRemote: true });
  }

  function unlockAudioAndSpeech() {
    if (unlocked) return;
    setUnlocked(true);
    if (!speechOn) return;
    const text = current?.word.hanzi;
    if (!text) return;
    lastSpokenRef.current = text;
    void speakText(text, { preferRemote: true });
  }

  return (
    <section className="relative rounded-3xl bg-white/70 p-6 shadow-soft ring-1 ring-pink-100 backdrop-blur">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-pink-600 px-3 py-1 text-sm font-semibold text-white">
            {progressLabel}
          </div>
          <div className="text-sm text-pink-700/80">
            正确：{round.correctCount}/{ROUND_SIZE}
          </div>
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

      {status === "done" ? (
        <div className="py-6 text-center">
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
        <>
          <div className="mb-5 text-center">
            <div className="text-sm font-semibold text-pink-700/80">拼音</div>
            <div className="mt-1 text-2xl font-extrabold tracking-wide text-pink-800">
              {current?.word.pinyin}
            </div>
            <div className="mt-4">
              <BlankWord text={current?.word.hanzi ?? ""} />
            </div>
            <div className="mt-4 flex items-center justify-center gap-2">
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
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {current?.options.map((opt, i) => {
              const label = ["A", "B", "C", "D"][i] ?? "?";
              const disabled = status === "correct";
              return (
                <button
                  key={`${opt.hanzi}-${i}`}
                  type="button"
                  disabled={disabled}
                  onClick={() => onPick(opt)}
                  className={[
                    "touch-manipulation group rounded-2xl border-2 bg-white px-5 py-4 text-left shadow-sm transition",
                    "md:hover:-translate-y-0.5 md:hover:border-pink-300 md:hover:shadow-soft active:translate-y-0",
                    disabled ? "opacity-90" : "",
                    status === "wrong" ? "border-pink-200" : "border-pink-100"
                  ].join(" ")}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-pink-600 text-sm font-extrabold text-white">
                      {label}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-2xl font-extrabold text-pink-800 group-hover:text-pink-900">
                        {opt.hanzi}
                      </div>
                      <div className="mt-1 text-sm font-semibold text-pink-700/70">
                        {opt.pinyin}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-5 min-h-10 text-center">
            {status === "wrong" && (
              <div className="inline-flex items-center gap-2 rounded-2xl bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 ring-1 ring-rose-200">
                没关系，再试一次～
              </div>
            )}
            {status === "correct" && (
              <div className="inline-flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-200">
                太棒了！答对啦～
              </div>
            )}
          </div>
        </>
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
