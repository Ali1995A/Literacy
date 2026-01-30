export type MistakeStats = Record<string, number>;

const STORAGE_KEY = "literacy.mistakes.v2";

export function wordKey(hanzi: string) {
  return hanzi;
}

export function loadMistakes(): MistakeStats {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};

    const out: MistakeStats = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v) && v > 0) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveMistakes(stats: MistakeStats) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
  } catch {
    // ignore
  }
}

export function incMistake(stats: MistakeStats, key: string) {
  const next = { ...stats };
  next[key] = (next[key] ?? 0) + 1;
  saveMistakes(next);
  return next;
}

export function decMistake(stats: MistakeStats, key: string) {
  const cur = stats[key] ?? 0;
  if (cur <= 0) return stats;
  const next = { ...stats };
  const v = cur - 1;
  if (v <= 0) delete next[key];
  else next[key] = v;
  saveMistakes(next);
  return next;
}
