// src/utils/sound.ts
// Short UI cues, synthesised with the Web Audio API.
//
// Why synth instead of audio files: three tiny tones shipped as WAV/MP3 would
// add a few hundred KB and an asset pipeline for what is a dozen lines of
// maths, and synthesised tones can be tuned by rank (a first-place finish
// genuinely sounds different from a fourth-place one) without recording
// variants. Nothing here is a jingle — these are keycap-length clicks.
//
// Every entry point is defensive: audio is a nicety, and a browser that
// refuses to start an AudioContext (autoplay policy, headless, no device)
// must never break a benchmark run.

export type Cue = 'runStart' | 'runFinish' | 'suiteFinish' | 'error';

/** Notes per cue, as [frequency in Hz, start offset in beats]. */
const CUES: Record<Cue, [number, number][]> = {
  // Rising two-step: "off we go". Short and quiet on purpose — this one fires
  // most often and must not become annoying over a session.
  runStart: [
    [660, 0],
    [880, 0.5],
  ],
  // Settling fifth: "done". Deliberately different in shape from runStart so
  // the two are never confused when the user is looking elsewhere.
  runFinish: [
    [880, 0],
    [660, 1],
  ],
  // Three-note resolve for a whole suite — the longest cue, because it marks
  // the longest operation.
  suiteFinish: [
    [523.25, 0],
    [659.25, 1],
    [783.99, 2],
  ],
  // Falling minor third: something went wrong. Not harsh — the red UI already
  // says so.
  error: [
    [440, 0],
    [349.23, 0.6],
  ],
};

const DEFAULT_VOLUME = 0.5;
/** Beat length in seconds; the cue table's offsets are in these units. */
const BEAT = 0.09;

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;

/** Lazily create the context — constructing one at import time is what gets
 *  browsers to block audio, and most sessions never play a cue. */
function context(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) {
    try {
      ctx = new Ctor();
    } catch {
      return null;
    }
  }
  return ctx;
}

/**
 * Plays a cue. Fire-and-forget by design: callers are inside run callbacks and
 * must not await or handle failures.
 */
export function playCue(cue: Cue, volume = DEFAULT_VOLUME, enabled = true): void {
  if (!enabled || volume <= 0) return;
  const audio = context();
  if (!audio) return;

  // A context created before any user gesture starts 'suspended'; resume() is
  // a no-op when it is already running. Failures are silent by design.
  if (audio.state === 'suspended') {
    void audio.resume().catch(() => undefined);
  }

  try {
    if (!masterGain) {
      masterGain = audio.createGain();
      masterGain.connect(audio.destination);
    }
    const now = audio.currentTime;
    masterGain.gain.setValueAtTime(volume, now);

    for (const [freq, beat] of CUES[cue]) {
      const osc = audio.createOscillator();
      const env = audio.createGain();
      const start = now + beat * BEAT;
      const peak = 0.18; // well under clipping; the master gain scales it

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);

      // Fast attack, exponential decay — a percussive blip rather than a beep
      // that clicks on and off. Exponential ramps cannot reach 0, so the tail
      // lands on a tiny value and the node stops.
      env.gain.setValueAtTime(0.0001, start);
      env.gain.exponentialRampToValueAtTime(peak, start + 0.008);
      env.gain.exponentialRampToValueAtTime(0.0001, start + 0.26);

      osc.connect(env);
      env.connect(masterGain);
      osc.start(start);
      osc.stop(start + 0.3);
    }
  } catch {
    // Audio is best-effort; never surface a failure into a run.
  }
}

/** Test seam: drops the cached context (also used when the user mutes). */
export function resetAudioContext(): void {
  try {
    void ctx?.close();
  } catch {
    // ignore
  }
  ctx = null;
  masterGain = null;
}
