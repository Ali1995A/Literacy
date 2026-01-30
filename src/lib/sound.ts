export function playCheer() {
  if (typeof window === "undefined") return;
  const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return;

  const ctx = new AudioContextCtor();
  const now = ctx.currentTime;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.2, now + 0.02);
  master.gain.exponentialRampToValueAtTime(0.0001, now + 0.65);
  master.connect(ctx.destination);

  const notes = [659.25, 783.99, 987.77, 1174.66]; // E5 G5 B5 D6-ish
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0, now);
    const start = now + i * 0.08;
    gain.gain.linearRampToValueAtTime(0.8, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
    osc.connect(gain);
    gain.connect(master);
    osc.start(start);
    osc.stop(start + 0.2);
  });

  window.setTimeout(() => {
    void ctx.close();
  }, 900);
}

