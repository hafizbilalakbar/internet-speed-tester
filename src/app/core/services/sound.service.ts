import { Injectable, inject } from '@angular/core';
import { ThemeService } from './theme.service';

type Cue = 'start' | 'download' | 'upload' | 'complete' | 'error';

/** Short synthesised UI cues. No audio files, disabled by default, respects user setting. */
@Injectable({ providedIn: 'root' })
export class SoundService {
  private theme = inject(ThemeService);
  private ctx: AudioContext | null = null;

  play(cue: Cue): void {
    if (!this.theme.soundEnabled()) return;
    try {
      this.ctx ??= new AudioContext();
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      const notes: Record<Cue, number[]> = {
        start: [420, 620], download: [520, 760], upload: [660, 880],
        complete: [523, 659, 784, 1047], error: [330, 220],
      };
      notes[cue].forEach((freq, i) => this.tone(freq, this.ctx!.currentTime + i * 0.09, cue === 'error' ? 0.18 : 0.12));
    } catch { /* audio unavailable */ }
  }

  private tone(freq: number, start: number, duration: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.075, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start); osc.stop(start + duration + 0.02);
  }
}
