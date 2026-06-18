// ─────────────────────────────────────────────────────────────────────────────
// Chrono Duel – Audio Engine
// Uses the Web Audio API lookahead-scheduler pattern for rock-solid timing.
// Three generative music tracks + sound effects.
// ─────────────────────────────────────────────────────────────────────────────

export type MusicTrack = 'lobby' | 'queue' | 'match';

interface Step {
  /** Hz — 0 = rest */
  freq: number;
  /** seconds */
  dur: number;
  vol: number;
  type?: OscillatorType;
  /** optional second layer (harmony / bass) */
  freq2?: number;
  vol2?: number;
  type2?: OscillatorType;
}

// ── Patterns ──────────────────────────────────────────────────────────────────

// Lobby – C major dreamy arpeggio, 90 BPM, sine
const LOBBY: Step[] = [
  { freq: 261.63, dur: 0.33, vol: 0.07, freq2: 130.81, vol2: 0.05, type2: 'sine' }, // C4
  { freq: 329.63, dur: 0.33, vol: 0.06 },                                            // E4
  { freq: 392.00, dur: 0.33, vol: 0.06, freq2: 196.00, vol2: 0.04, type2: 'sine' }, // G4
  { freq: 523.25, dur: 0.40, vol: 0.08 },                                            // C5
  { freq: 392.00, dur: 0.33, vol: 0.05 },                                            // G4
  { freq: 329.63, dur: 0.33, vol: 0.06 },                                            // E4
  { freq: 261.63, dur: 0.33, vol: 0.07, freq2: 130.81, vol2: 0.04, type2: 'sine' }, // C4
  { freq: 0,      dur: 0.28, vol: 0    },                                            // rest
  { freq: 293.66, dur: 0.33, vol: 0.06 },                                            // D4
  { freq: 369.99, dur: 0.33, vol: 0.05 },                                            // F#4
  { freq: 440.00, dur: 0.33, vol: 0.07, freq2: 220.00, vol2: 0.04, type2: 'sine' }, // A4
  { freq: 523.25, dur: 0.40, vol: 0.07 },                                            // C5
  { freq: 440.00, dur: 0.33, vol: 0.05 },                                            // A4
  { freq: 369.99, dur: 0.33, vol: 0.05 },                                            // F#4
  { freq: 293.66, dur: 0.33, vol: 0.06 },                                            // D4
  { freq: 0,      dur: 0.40, vol: 0    },                                            // rest
];

// Queue – A minor rising tension, triangle wave, 110 BPM
const QUEUE: Step[] = [
  { freq: 220.00, dur: 0.18, vol: 0.10, type: 'triangle', freq2: 110.00, vol2: 0.06, type2: 'sine' }, // A3
  { freq: 0,      dur: 0.05, vol: 0    },
  { freq: 261.63, dur: 0.18, vol: 0.08, type: 'triangle' },  // C4
  { freq: 0,      dur: 0.05, vol: 0    },
  { freq: 329.63, dur: 0.18, vol: 0.09, type: 'triangle' },  // E4
  { freq: 0,      dur: 0.05, vol: 0    },
  { freq: 440.00, dur: 0.24, vol: 0.11, type: 'triangle', freq2: 220.00, vol2: 0.05, type2: 'sine' }, // A4
  { freq: 0,      dur: 0.08, vol: 0    },
  { freq: 392.00, dur: 0.18, vol: 0.08, type: 'triangle' },  // G4
  { freq: 0,      dur: 0.05, vol: 0    },
  { freq: 329.63, dur: 0.18, vol: 0.09, type: 'triangle' },  // E4
  { freq: 0,      dur: 0.05, vol: 0    },
  { freq: 293.66, dur: 0.18, vol: 0.08, type: 'triangle' },  // D4
  { freq: 0,      dur: 0.05, vol: 0    },
  { freq: 220.00, dur: 0.26, vol: 0.10, type: 'triangle', freq2: 110.00, vol2: 0.06, type2: 'sine' }, // A3
  { freq: 0,      dur: 0.14, vol: 0    },
];

// Match – E minor driving, sawtooth + sine bass, 138 BPM
const MATCH: Step[] = [
  { freq: 329.63, dur: 0.13, vol: 0.10, type: 'sawtooth', freq2: 82.41,  vol2: 0.06, type2: 'sine' }, // E4
  { freq: 0,      dur: 0.04, vol: 0    },
  { freq: 392.00, dur: 0.13, vol: 0.09, type: 'sawtooth' },  // G4
  { freq: 0,      dur: 0.04, vol: 0    },
  { freq: 493.88, dur: 0.13, vol: 0.09, type: 'sawtooth', freq2: 164.81, vol2: 0.05, type2: 'sine' }, // B4
  { freq: 0,      dur: 0.04, vol: 0    },
  { freq: 659.25, dur: 0.20, vol: 0.11, type: 'sawtooth', freq2: 82.41,  vol2: 0.07, type2: 'sine' }, // E5
  { freq: 0,      dur: 0.06, vol: 0    },
  { freq: 587.33, dur: 0.13, vol: 0.09, type: 'sawtooth' },  // D5
  { freq: 0,      dur: 0.04, vol: 0    },
  { freq: 493.88, dur: 0.13, vol: 0.09, type: 'sawtooth', freq2: 164.81, vol2: 0.05, type2: 'sine' }, // B4
  { freq: 0,      dur: 0.04, vol: 0    },
  { freq: 440.00, dur: 0.13, vol: 0.09, type: 'sawtooth' },  // A4
  { freq: 0,      dur: 0.04, vol: 0    },
  { freq: 392.00, dur: 0.20, vol: 0.10, type: 'sawtooth', freq2: 98.00,  vol2: 0.07, type2: 'sine' }, // G4
  { freq: 0,      dur: 0.06, vol: 0    },
  { freq: 349.23, dur: 0.13, vol: 0.09, type: 'sawtooth' },  // F4
  { freq: 0,      dur: 0.04, vol: 0    },
  { freq: 329.63, dur: 0.13, vol: 0.10, type: 'sawtooth', freq2: 82.41,  vol2: 0.06, type2: 'sine' }, // E4
  { freq: 0,      dur: 0.04, vol: 0    },
  { freq: 293.66, dur: 0.20, vol: 0.09, type: 'sawtooth' },  // D4
  { freq: 0,      dur: 0.10, vol: 0    },
];

const PATTERNS: Record<MusicTrack, Step[]> = { lobby: LOBBY, queue: QUEUE, match: MATCH };

// ── Music Engine ──────────────────────────────────────────────────────────────

class MusicEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;

  private running = false;
  private currentTrack: MusicTrack | null = null;
  private noteIndex = 0;
  private nextNoteAt = 0; // AudioContext.currentTime seconds

  private schedulerTimer: ReturnType<typeof setInterval> | null = null;
  private readonly LOOKAHEAD = 0.15;   // schedule this far ahead (s)
  private readonly TICK_MS  = 40;      // scheduler runs every N ms

  private fadeTimer: ReturnType<typeof setTimeout> | null = null;

  // ── internal ────────────────────────────────────────────────────────────────

  private ensureCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 1;
      this.master.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  private scheduleStep(step: Step, at: number): void {
    if (!this.ctx || !this.master || step.vol === 0 || step.freq === 0) return;

    const attack = 0.012;
    const release = Math.min(step.dur * 0.35, 0.08);

    const play = (
      freq: number,
      vol: number,
      type: OscillatorType,
      dur: number
    ) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(vol, at + attack);
      gain.gain.setValueAtTime(vol, at + dur - release);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      osc.connect(gain);
      gain.connect(this.master!);
      osc.start(at);
      osc.stop(at + dur + 0.02);
    };

    play(step.freq, step.vol, step.type ?? 'sine', step.dur);
    if (step.freq2 && step.vol2) {
      play(step.freq2, step.vol2, step.type2 ?? 'sine', step.dur);
    }
  }

  private scheduler(): void {
    if (!this.ctx || !this.running || !this.currentTrack) return;
    const pattern = PATTERNS[this.currentTrack];
    const horizon = this.ctx.currentTime + this.LOOKAHEAD;

    while (this.nextNoteAt < horizon) {
      const step = pattern[this.noteIndex % pattern.length];
      this.scheduleStep(step, this.nextNoteAt);
      this.nextNoteAt += step.dur;
      this.noteIndex++;
    }
  }

  private startScheduler(): void {
    this.stopScheduler();
    this.schedulerTimer = setInterval(() => this.scheduler(), this.TICK_MS);
  }

  private stopScheduler(): void {
    if (this.schedulerTimer !== null) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
  }

  // ── public API ───────────────────────────────────────────────────────────────

  async play(track: MusicTrack): Promise<void> {
    if (this.currentTrack === track && this.running) return;

    const ctx = this.ensureCtx();
    if (ctx.state === 'suspended') await ctx.resume();

    // Cancel any pending fade
    if (this.fadeTimer) { clearTimeout(this.fadeTimer); this.fadeTimer = null; }

    this.stop();

    this.currentTrack = track;
    this.running = true;
    this.noteIndex = 0;
    this.nextNoteAt = ctx.currentTime + 0.05;

    // Fade master in
    this.master!.gain.cancelScheduledValues(ctx.currentTime);
    this.master!.gain.setValueAtTime(0, ctx.currentTime);
    this.master!.gain.linearRampToValueAtTime(1, ctx.currentTime + 1.5);

    this.startScheduler();
  }

  stop(fadeMs = 800): void {
    this.running = false;
    this.stopScheduler();

    if (this.ctx && this.master) {
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(this.master.gain.value, now);
      this.master.gain.linearRampToValueAtTime(0, now + fadeMs / 1000);
    }

    this.currentTrack = null;
  }

  async resume(): Promise<void> {
    const ctx = this.ensureCtx();
    if (ctx.state === 'suspended') await ctx.resume();
  }
}

// ── SFX Engine ────────────────────────────────────────────────────────────────

class SfxEngine {
  private ctx: AudioContext | null = null;

  private ensureCtx(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext();
    return this.ctx;
  }

  async resume(): Promise<void> {
    const ctx = this.ensureCtx();
    if (ctx.state === 'suspended') await ctx.resume();
  }

  private tone(freq: number, vol: number, dur: number, type: OscillatorType = 'sine', at?: number): void {
    const ctx = this.ensureCtx();
    const t = at ?? ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.01);
  }

  playWin(): void {
    const ctx = this.ensureCtx();
    const now = ctx.currentTime;

    // Happy fanfare — C major ascending arpeggio into a bright chord ~1.5s
    // Quick ascending run
    this.tone(523.25, 0.20, 0.10, 'sine',     now + 0.00); // C5
    this.tone(659.25, 0.18, 0.10, 'sine',     now + 0.12); // E5
    this.tone(783.99, 0.18, 0.10, 'sine',     now + 0.24); // G5
    // Big chord hit
    this.tone(1046.5, 0.22, 0.60, 'sine',     now + 0.38); // C6 melody
    this.tone(783.99, 0.16, 0.60, 'sine',     now + 0.38); // G5 harmony
    this.tone(659.25, 0.14, 0.60, 'triangle', now + 0.38); // E5 harmony
    this.tone(523.25, 0.12, 0.60, 'sine',     now + 0.38); // C5 bass
    // Sparkle tails
    this.tone(1046.5, 0.14, 0.30, 'sine',     now + 1.05); // C6 echo
    this.tone(1318.5, 0.12, 0.45, 'sine',     now + 1.15); // E6 sparkle
  }

  playLose(): void {
    const ctx = this.ensureCtx();
    const now = ctx.currentTime;

    // Sad descending melody — A minor, slow and mournful ~1.5s
    this.tone(440.00, 0.18, 0.28, 'sine', now + 0.00); // A4
    this.tone(415.30, 0.16, 0.28, 'sine', now + 0.00); // Ab4 slight dissonance
    this.tone(392.00, 0.18, 0.30, 'sine', now + 0.30); // G4
    this.tone(329.63, 0.17, 0.35, 'sine', now + 0.62); // E4
    // Long mournful low note
    this.tone(220.00, 0.20, 0.75, 'sine',     now + 0.95); // A3
    this.tone(246.94, 0.10, 0.75, 'triangle', now + 0.95); // B3 minor second
  }
}

// ── Exports ────────────────────────────────────────────────────────────────────

export const music = new MusicEngine();
export const sfx = new SfxEngine();

/** Convenience wrapper kept for backwards-compat with existing App.tsx calls */
export const audioEngine = {
  resume: () => Promise.all([music.resume(), sfx.resume()]).then(() => {}),
  playWin: () => sfx.playWin(),
  playLose: () => sfx.playLose(),
};
