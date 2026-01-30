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

