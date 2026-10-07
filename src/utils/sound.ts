/**
 * Tiny WebAudio sound kit.
 *
 * Sounds are synthesised rather than shipped as files: no extra payload, no
 * licensing questions, and they stay subtle by design. Everything is a no-op
 * until the player has interacted with the page (browser autoplay policy) and
 * while the sound setting is off.
 */

type SoundName =
  | 'draw'
  | 'discard'
  | 'turn'
  | 'notify'
  | 'roundComplete'
  | 'win'
  | 'select'
  | 'error';

let context: AudioContext | null = null;
let enabled = true;
let volume = 0.3;

function ensureContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!context) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    context = new Ctor();
  }
  if (context.state === 'suspended') void context.resume();
  return context;
}

interface Tone {
  frequency: number;
  duration: number;
  type?: OscillatorType;
  delay?: number;
  gain?: number;
}

const RECIPES: Record<SoundName, Tone[]> = {
  draw: [{ frequency: 420, duration: 0.09, type: 'triangle' }],
  discard: [{ frequency: 280, duration: 0.11, type: 'triangle' }],
  select: [{ frequency: 660, duration: 0.05, type: 'sine', gain: 0.5 }],
  turn: [
    { frequency: 523.25, duration: 0.1, type: 'sine' },
    { frequency: 783.99, duration: 0.14, type: 'sine', delay: 0.09 },
  ],
  notify: [
    { frequency: 880, duration: 0.08, type: 'sine' },
    { frequency: 1174.66, duration: 0.1, type: 'sine', delay: 0.07 },
  ],
  roundComplete: [
    { frequency: 523.25, duration: 0.12, type: 'sine' },
    { frequency: 659.25, duration: 0.12, type: 'sine', delay: 0.1 },
    { frequency: 783.99, duration: 0.18, type: 'sine', delay: 0.2 },
  ],
  win: [
    { frequency: 523.25, duration: 0.14, type: 'sine' },
    { frequency: 659.25, duration: 0.14, type: 'sine', delay: 0.12 },
    { frequency: 783.99, duration: 0.14, type: 'sine', delay: 0.24 },
    { frequency: 1046.5, duration: 0.3, type: 'sine', delay: 0.36 },
  ],
  error: [{ frequency: 180, duration: 0.16, type: 'sawtooth', gain: 0.35 }],
};

export function configureSound(options: { enabled?: boolean; volume?: number }): void {
  if (typeof options.enabled === 'boolean') enabled = options.enabled;
  if (typeof options.volume === 'number') volume = Math.min(1, Math.max(0, options.volume));
}

export function play(name: SoundName): void {
  if (!enabled) return;
  const ctx = ensureContext();
  if (!ctx) return;
  for (const tone of RECIPES[name]) {
    const start = ctx.currentTime + (tone.delay ?? 0);
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = tone.type ?? 'sine';
    oscillator.frequency.setValueAtTime(tone.frequency, start);
    const peak = volume * (tone.gain ?? 1) * 0.25;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.duration);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + tone.duration + 0.02);
  }
}

export type { SoundName };
