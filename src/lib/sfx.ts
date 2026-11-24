// Tiny sound effects made with the Web Audio API (no audio files). Off unless the user turns
// them on; the browser only allows audio after a click, which the sound toggle provides.

export type SoundKind = "open" | "sparkle" | "message" | "shuffle";

let enabled = false;
let context: AudioContext | null = null;

export function setSoundEnabled(on: boolean) {
  enabled = on;
  if (!on) return;
  try {
    context ??= new AudioContext();
  } catch {
    enabled = false; // no Web Audio support
    return;
  }
  // Browsers keep audio suspended until the user interacts with the page.
  if (context.state !== "running") {
    void context.resume().catch(() => undefined);
    const resume = () => void context?.resume().catch(() => undefined);
    document.addEventListener("pointerdown", resume, { once: true });
    document.addEventListener("keydown", resume, { once: true });
  }
}

// Each sound is a short run of notes: [frequency Hz, start offset s, length s].
const SOUNDS: Record<SoundKind, { wave: OscillatorType; notes: [number, number, number][] }> = {
  open: { wave: "sine", notes: [[520, 0, 0.08], [780, 0.06, 0.1]] },
  sparkle: { wave: "triangle", notes: [[880, 0, 0.1], [1175, 0.08, 0.1], [1568, 0.16, 0.18]] },
  message: { wave: "sine", notes: [[660, 0, 0.07], [990, 0.09, 0.09]] },
  shuffle: { wave: "triangle", notes: [[700, 0, 0.06], [560, 0.07, 0.06], [440, 0.14, 0.06], [620, 0.21, 0.1]] },
};

export function playSound(kind: SoundKind) {
  playNotes(SOUNDS[kind].wave, SOUNDS[kind].notes);
}

/**
 * One soft "voice" blip, for speech bubbles that type themselves out. `pitch` (Hz) is the
 * speaker's voice; `wobble` (0..1) nudges each letter up or down a little so it sounds like talk.
 */
export function playBlip(pitch: number, wobble: number) {
  playNotes("square", [[pitch * (0.9 + wobble * 0.25), 0, 0.045]], 0.025);
}

function playNotes(wave: OscillatorType, notes: [number, number, number][], volume = 0.08) {
  if (!enabled || !context || context.state !== "running") return;
  const now = context.currentTime;
  for (const [frequency, offset, length] of notes) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = wave;
    oscillator.frequency.value = frequency;
    // Quick fade in and out so notes don't click.
    gain.gain.setValueAtTime(0, now + offset);
    gain.gain.linearRampToValueAtTime(volume, now + offset + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + length);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now + offset);
    oscillator.stop(now + offset + length + 0.02);
  }
}
