export function shuffle<T>(items: T[]) {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function pickUniqueIndices(
  maxExclusive: number,
  count: number,
  exclude: Set<number> = new Set()
) {
  if (count < 0) throw new Error("count must be >= 0");
  if (count > maxExclusive - exclude.size) {
    throw new Error("Not enough unique indices to sample");
  }

  const picked = new Set<number>();
  while (picked.size < count) {
    const idx = Math.floor(Math.random() * maxExclusive);
    if (exclude.has(idx)) continue;
    if (picked.has(idx)) continue;
    picked.add(idx);
  }
  return [...picked];
}

export function weightedPickUniqueIndices(
  weights: number[],
  count: number,
  exclude: Set<number> = new Set()
) {
  if (count < 0) throw new Error("count must be >= 0");
  if (weights.length === 0) return [];

  const available = weights
    .map((w, idx) => ({ idx, w: Number.isFinite(w) ? Math.max(0, w) : 0 }))
    .filter((x) => !exclude.has(x.idx) && x.w > 0);

  if (count > available.length) {
    throw new Error("Not enough unique indices to sample (weighted)");
  }

  const result: number[] = [];
  const pool = available.slice();

  for (let n = 0; n < count; n++) {
    let total = 0;
    for (const p of pool) total += p.w;
    if (total <= 0) break;

    let r = Math.random() * total;
    let chosen = 0;
    for (let i = 0; i < pool.length; i++) {
      r -= pool[i]!.w;
      if (r <= 0) {
        chosen = i;
        break;
      }
    }

    result.push(pool[chosen]!.idx);
    pool.splice(chosen, 1);
  }

  if (result.length !== count) {
    throw new Error("Failed to sample enough indices (weighted)");
  }

  return result;
}
