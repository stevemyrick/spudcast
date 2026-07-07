// Tiny WebAudio helpers for retro TV sounds — no assets, synthesized on the fly.
// All calls are best-effort and silently no-op if audio can't start.

let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Short "ka-chunk" blip when changing channels. */
export function playChannelChange(): void {
  const ac = audio();
  if (!ac) return;
  try {
    const t = ac.currentTime;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(340, t);
    osc.frequency.exponentialRampToValueAtTime(110, t + 0.09);
    gain.gain.setValueAtTime(0.07, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    osc.connect(gain).connect(ac.destination);
    osc.start(t);
    osc.stop(t + 0.14);
  } catch {
    /* ignore */
  }
}

let hiss: { src: AudioBufferSourceNode; gain: GainNode } | null = null;

/** Start a low, looping white-noise hiss (for the color-bars / dead-channel slate). */
export function startHiss(): void {
  const ac = audio();
  if (!ac || hiss) return;
  try {
    const buffer = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const gain = ac.createGain();
    gain.gain.value = 0.035;
    src.connect(gain).connect(ac.destination);
    src.start();
    hiss = { src, gain };
  } catch {
    /* ignore */
  }
}

export function stopHiss(): void {
  if (!hiss) return;
  try {
    hiss.src.stop();
  } catch {
    /* ignore */
  }
  hiss = null;
}
