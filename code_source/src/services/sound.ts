/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CourtSurface, PowerLevel, ShotType } from '../types/game';

class SoundManager {
  private ctx: AudioContext | null = null;
  private sfxGain: GainNode | null = null;
  private isMuted: boolean = false;
  private volumeMultiplier: number = 0.85;
  private lastSqueakTime: number = 0;
  private lastGruntTime: number = 0;

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
   * Synthesize crisp, realistic tennis racket strikes differentiated by shot type.
   * High power produces explosive frame resonance, top spin produces string friction, etc.
   */
  public playRacketHit(power: PowerLevel = 3, shotType: ShotType = 'FOREHAND') {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx || !this.sfxGain) return;
    this.resume();

    const t = this.ctx.currentTime;
    const isSmash = power >= 5 || shotType === 'SMASH';
    const isDrop = shotType === 'DROP';
    const isSlice = shotType === 'BACKHAND' || shotType === 'DROP';
    const isTopspin = shotType === 'FOREHAND' || shotType === 'SERVE';

    // Drop shot: soft, muffled feather touch
    if (isDrop) {
      const dropOsc = this.ctx.createOscillator();
      const dropGain = this.ctx.createGain();
      dropOsc.type = 'sine';
      dropOsc.frequency.setValueAtTime(320, t);
      dropOsc.frequency.exponentialRampToValueAtTime(140, t + 0.05);

      dropGain.gain.setValueAtTime(0.28, t);
      dropGain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);

      dropOsc.connect(dropGain);
      dropGain.connect(this.sfxGain);
      dropOsc.start(t);
      dropOsc.stop(t + 0.07);

      this.playNoiseBurst(t, 0.03, 900, 0.15);
      return;
    }

    // 1. Transient String "Ping"
    const pingOsc = this.ctx.createOscillator();
    const pingGain = this.ctx.createGain();
    let pingFreq = 640 + power * 70;
    let decayTime = 0.08;

    if (isSmash) {
      pingFreq = 1050;
      decayTime = 0.12;
    } else if (isSlice) {
      pingFreq = 540;
      decayTime = 0.06;
    }

    pingOsc.type = isSlice ? 'sine' : 'triangle';
    pingOsc.frequency.setValueAtTime(pingFreq, t);
    pingOsc.frequency.exponentialRampToValueAtTime(pingFreq * 0.35, t + decayTime);

    const pingAmp = isSmash ? 0.95 : (0.45 + (power / 5) * 0.4);
    pingGain.gain.setValueAtTime(pingAmp, t);
    pingGain.gain.exponentialRampToValueAtTime(0.001, t + decayTime + 0.01);

    pingOsc.connect(pingGain);
    pingGain.connect(this.sfxGain);

    pingOsc.start(t);
    pingOsc.stop(t + decayTime + 0.02);

    // 2. Heavy Racket Graphite Body / Frame Impact (Sub Thud)
    const thudOsc = this.ctx.createOscillator();
    const thudGain = this.ctx.createGain();

    thudOsc.type = 'sine';
    const thudFreq = isSmash ? 320 : (240 + power * 20);
    thudOsc.frequency.setValueAtTime(thudFreq, t);
    thudOsc.frequency.exponentialRampToValueAtTime(60, t + (isSmash ? 0.16 : 0.11));

    thudGain.gain.setValueAtTime(isSmash ? 1.0 : (0.6 * (power / 5) + 0.2), t);
    thudGain.gain.exponentialRampToValueAtTime(0.001, t + (isSmash ? 0.17 : 0.12));

    thudOsc.connect(thudGain);
    thudGain.connect(this.sfxGain);

    thudOsc.start(t);
    thudOsc.stop(t + (isSmash ? 0.18 : 0.13));

    // 3. Short Noise Burst for Ball-Felt Friction (Topspin raspy brush or Slice whisper)
    const noiseCutoff = isSlice ? 1200 : (isTopspin ? 2400 : 1800);
    const noiseVol = isSmash ? 0.55 : (0.35 * (power / 5));
    this.playNoiseBurst(t, isSlice ? 0.06 : 0.04, noiseCutoff, noiseVol);

    // 4. Trigger realistic vocal grunt on powerful shots
    if (power >= 4 || isSmash) {
      this.playPlayerGrunt(power);
    }
  }

  /**
   * Realistic tennis ball bounce tuned per court surface:
   * Hard court = crisp acoustic snap with bright slap
   * Clay court = dampened crunch/slide thud
   * Grass court = soft organic grass cushion pop
   */
  public playBallBounce(surface: CourtSurface = 'hard', speedFactor: number = 1.0) {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx || !this.sfxGain) return;
    this.resume();

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    let startFreq = 440;
    let endFreq = 160;
    let decayTime = 0.07;
    let noiseFilter = 2200;
    let noiseAmp = 0.35;

    if (surface === 'clay') {
      startFreq = 300;
      endFreq = 95;
      decayTime = 0.10;
      noiseFilter = 900;
      noiseAmp = 0.45;
    } else if (surface === 'grass') {
      startFreq = 340;
      endFreq = 120;
      decayTime = 0.055;
      noiseFilter = 1400;
      noiseAmp = 0.22;
    }

    osc.type = 'sine';
    osc.frequency.setValueAtTime(startFreq, t);
    osc.frequency.exponentialRampToValueAtTime(endFreq, t + decayTime);

    const amp = Math.min(1.0, 0.35 + speedFactor * 0.45);
    gain.gain.setValueAtTime(amp, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + decayTime);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + decayTime + 0.01);

    // Surface texture contact noise
    this.playNoiseBurst(t, decayTime * 0.7, noiseFilter, noiseAmp * Math.min(1, speedFactor));
  }

  /**
   * Authentic Sneaker Court Squeaks & Footwork Scuffs
   * Realistic rubber-on-hardcourt squeak or clay slide crunch
   */
  public playFootstepSqueak(surface: CourtSurface = 'hard') {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    const now = performance.now();
    // Guard against squeak flood: minimum 240ms between squeaks
    if (now - this.lastSqueakTime < 240) return;
    this.lastSqueakTime = now;

    this.resume();
    const t = this.ctx.currentTime;

    if (surface === 'hard') {
      // Characteristic high-pitch rubber sole friction squeak
      const squeakOsc = this.ctx.createOscillator();
      const squeakGain = this.ctx.createGain();

      squeakOsc.type = 'sawtooth';
      const f0 = 1700 + Math.random() * 400;
      const f1 = 2300 + Math.random() * 400;
      squeakOsc.frequency.setValueAtTime(f0, t);
      squeakOsc.frequency.exponentialRampToValueAtTime(f1, t + 0.04);
      squeakOsc.frequency.exponentialRampToValueAtTime(f0 * 0.8, t + 0.08);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(2000, t);
      filter.Q.value = 4.0;

      squeakGain.gain.setValueAtTime(0.01, t);
      squeakGain.gain.linearRampToValueAtTime(0.18, t + 0.02);
      squeakGain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);

      squeakOsc.connect(filter);
      filter.connect(squeakGain);
      squeakGain.connect(this.sfxGain);

      squeakOsc.start(t);
      squeakOsc.stop(t + 0.10);
    } else if (surface === 'clay') {
      // Clay sliding scuff (sand friction)
      this.playNoiseBurst(t, 0.14, 1100, 0.22);
    } else {
      // Grass turf muffled brush
      this.playNoiseBurst(t, 0.08, 1400, 0.15);
    }
  }

  /**
   * Realistic synthesized vocal grunt on high-effort tennis shots
   */
  public playPlayerGrunt(power: PowerLevel = 4) {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    const now = performance.now();
    if (now - this.lastGruntTime < 700) return;
    this.lastGruntTime = now;

    this.resume();
    const t = this.ctx.currentTime + 0.03; // slight delay after racket hit

    // Synthesize vocal tract formant resonance (short human exertion grunt)
    const gruntOsc = this.ctx.createOscillator();
    const gruntGain = this.ctx.createGain();
    const formantFilter = this.ctx.createBiquadFilter();

    gruntOsc.type = 'sawtooth';
    const fundamental = 125 + Math.random() * 30; // ~130 Hz masculine / athletic chest pitch
    gruntOsc.frequency.setValueAtTime(fundamental, t);
    gruntOsc.frequency.linearRampToValueAtTime(fundamental * 1.25, t + 0.06);
    gruntOsc.frequency.exponentialRampToValueAtTime(fundamental * 0.7, t + 0.18);

    formantFilter.type = 'bandpass';
    formantFilter.frequency.setValueAtTime(650, t); // Throat formant
    formantFilter.Q.value = 2.8;

    const gruntVol = Math.min(0.35, 0.15 + (power / 5) * 0.2);
    gruntGain.gain.setValueAtTime(0.01, t);
    gruntGain.gain.linearRampToValueAtTime(gruntVol, t + 0.04);
    gruntGain.gain.exponentialRampToValueAtTime(0.001, t + 0.20);

    gruntOsc.connect(formantFilter);
    formantFilter.connect(gruntGain);
    gruntGain.connect(this.sfxGain);

    gruntOsc.start(t);
    gruntOsc.stop(t + 0.22);
  }

  /**
   * Sharp metallic/cord tick when tennis ball clips the top of the net
   */
  public playNetCordTick() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx || !this.sfxGain) return;
    this.resume();

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1400, t);
    osc.frequency.exponentialRampToValueAtTime(450, t + 0.05);

    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.055);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.06);
    this.playNoiseBurst(t, 0.03, 3000, 0.3);
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
    const duration = intensity === 'big' ? 1.7 : 0.95;
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
   * Speak official umpire call using browser speech synthesis
   */
  public speakUmpire(phrase: string) {
    if (this.isMuted) return;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(phrase);
        utter.rate = 1.05;
        utter.pitch = 0.95; // Authoritative umpire tone
        utter.volume = Math.min(1.0, this.volumeMultiplier * 0.9);
        window.speechSynthesis.speak(utter);
      } catch {
        // Fallback to whistle chime
        this.playRefereeWhistle('point');
      }
    }
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
