/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CourtSurface, PowerLevel, ShotType } from '../types/game';

class SoundManager {
  private ctx: AudioContext | null = null;
  private sfxGain: GainNode | null = null;
  private isMuted: boolean = false;
  private volumeMultiplier: number = 0.8;

  public init() {
    if (this.ctx) return;
    try {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtxClass();
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.setValueAtTime(this.volumeMultiplier, this.ctx.currentTime);
      this.sfxGain.connect(this.ctx.destination);
    } catch {
      // AudioContext unavailable or blocked until user interaction
    }
  }

  public resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public pause() {
    if (this.ctx && this.ctx.state === 'running') {
      this.ctx.suspend();
    }
  }

  public destroy() {
    if (this.ctx) {
      try {
        this.ctx.close();
      } catch {
        // ignore
      }
      this.ctx = null;
      this.sfxGain = null;
    }
  }

  public setVolume(sfxVol: number) {
    this.volumeMultiplier = Math.max(0, Math.min(1, sfxVol));
    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.setValueAtTime(this.volumeMultiplier, this.ctx.currentTime);
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.setValueAtTime(this.isMuted ? 0 : this.volumeMultiplier, this.ctx.currentTime);
    }
  }

  /**
   * Synthesize crisp tennis racket strike.
   * High power produces a sharp, crackling string ping and heavy thud.
   */
  public playRacketHit(power: PowerLevel = 3, shotType: ShotType = 'FOREHAND') {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx || !this.sfxGain) return;
    this.resume();

    const t = this.ctx.currentTime;
    const isSmash = power >= 5 || shotType === 'SMASH';

    // 1. Transient String "Ping"
    const pingOsc = this.ctx.createOscillator();
    const pingGain = this.ctx.createGain();
    const pingFreq = isSmash ? 950 : 650 + power * 60;

    pingOsc.type = 'triangle';
    pingOsc.frequency.setValueAtTime(pingFreq, t);
    pingOsc.frequency.exponentialRampToValueAtTime(pingFreq * 0.4, t + 0.08);

    pingGain.gain.setValueAtTime(0.7 * (power / 5), t);
    pingGain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);

    pingOsc.connect(pingGain);
    pingGain.connect(this.sfxGain);

    pingOsc.start(t);
    pingOsc.stop(t + 0.1);

    // 2. Heavy Racket Body / Frame Impact (Sub Thud)
    const thudOsc = this.ctx.createOscillator();
    const thudGain = this.ctx.createGain();

    thudOsc.type = 'sine';
    thudOsc.frequency.setValueAtTime(260 + power * 20, t);
    thudOsc.frequency.exponentialRampToValueAtTime(70, t + 0.12);

    thudGain.gain.setValueAtTime(0.9 * (power / 5), t);
    thudGain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);

    thudOsc.connect(thudGain);
    thudGain.connect(this.sfxGain);

    thudOsc.start(t);
    thudOsc.stop(t + 0.15);

    // 3. Short Noise Burst for Ball-Felt Friction
    this.playNoiseBurst(t, 0.04, 1800, 0.4 * (power / 5));
  }

  /**
   * Synthesize realistic ball bounce on court surface.
   * Hard court = sharp click; Clay = dampened thud; Grass = softer acoustic pop.
   */
  public playBallBounce(surface: CourtSurface = 'hard', speedFactor: number = 1.0) {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx || !this.sfxGain) return;
    this.resume();

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    let startFreq = 420;
    let endFreq = 160;
    let decayTime = 0.07;

    if (surface === 'clay') {
      startFreq = 320;
      endFreq = 110;
      decayTime = 0.09;
    } else if (surface === 'grass') {
      startFreq = 360;
      endFreq = 130;
      decayTime = 0.06;
    }

    osc.type = 'sine';
    osc.frequency.setValueAtTime(startFreq, t);
    osc.frequency.exponentialRampToValueAtTime(endFreq, t + decayTime);

    const amp = Math.min(1.0, 0.4 + speedFactor * 0.4);
    gain.gain.setValueAtTime(amp, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + decayTime);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + decayTime + 0.01);
  }

  /**
   * Fast swoosh sound when phone or racket swings through the air.
   */
  public playSwingSwoosh(power: PowerLevel = 3) {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx || !this.sfxGain) return;
    this.resume();

    const t = this.ctx.currentTime;
    const duration = 0.16;
    const bufferSize = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.5;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(400, t);
    filter.frequency.exponentialRampToValueAtTime(1400 + power * 200, t + duration * 0.6);
    filter.frequency.exponentialRampToValueAtTime(300, t + duration);
    filter.Q.value = 2.5;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.01, t);
    gain.gain.linearRampToValueAtTime(0.35 * (power / 5), t + duration * 0.4);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    noise.start(t);
  }

  /**
   * Stadium crowd applause and cheers on winning rallies or aces.
   */
  public playCrowdCheer(intensity: 'small' | 'big' = 'small') {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx || !this.sfxGain) return;
    this.resume();

    const t = this.ctx.currentTime;
    const duration = intensity === 'big' ? 1.6 : 0.9;
    const bufferSize = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (0.2 + 0.3 * Math.sin(i * 0.05));
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1200, t);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.01, t);
    gain.gain.linearRampToValueAtTime(intensity === 'big' ? 0.45 : 0.25, t + 0.2);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    noise.start(t);
  }

  /**
   * Sound for referee or umpire call (Out, Fault, Point, Game)
   */
  public playRefereeWhistle(type: 'fault' | 'out' | 'ace' | 'point') {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx || !this.sfxGain) return;
    this.resume();

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    if (type === 'ace') {
      // Fanfare two tones
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, t); // D5
      osc.frequency.setValueAtTime(880.0, t + 0.12); // A5
      gain.gain.setValueAtTime(0.4, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.start(t);
      osc.stop(t + 0.36);
    } else if (type === 'out' || type === 'fault') {
      // Low dual buzzer buzz
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, t);
      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc.start(t);
      osc.stop(t + 0.23);
    } else {
      // Clean point chime
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(659.25, t); // E5
      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      osc.start(t);
      osc.stop(t + 0.26);
    }

    osc.connect(gain);
    gain.connect(this.sfxGain);
  }

  /**
   * UI Click / Navigation Blip
   */
  public playUIBeep(confirm: boolean = false) {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx || !this.sfxGain) return;
    this.resume();

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(confirm ? 880 : 540, t);
    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.07);
  }

  private playNoiseBurst(t: number, duration: number, cutoff: number, volume: number) {
    if (!this.ctx || !this.sfxGain) return;
    const bufferSize = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(cutoff, t);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    noise.start(t);
  }
}

export const sound = new SoundManager();
