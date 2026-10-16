/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MotionConfig, PowerLevel, RawSensorSample, ShotType, SwingDetectionEvent } from '../types/game';

export interface SignalHistoryPoint {
  time: number;
  rawMag: number;
  filteredMag: number;
  rotSpeed: number;
  lateral: number;
  state: 'idle' | 'swinging' | 'cooldown';
}

type SwingListener = (event: SwingDetectionEvent) => void;

class MotionDSPEngine {
  private config: MotionConfig = {
    sensitivity: 1.0,
    smoothing: 0.65,
    thresholdMultiplier: 1.0,
    reboundGuardMs: 440,
    calibratedGravity: { x: 0, y: 9.81, z: 0 },
    isCalibrated: false,
  };

  private isLeftHanded: boolean = false;

  // Filter state
  private filteredAx: number = 0;
  private filteredAy: number = 0;
  private filteredAz: number = 0;
  private filteredRa: number = 0;
  private filteredRb: number = 0;
  private filteredRg: number = 0;

  // Swing detection state
  private currentState: 'idle' | 'windup' | 'swing' | 'cooldown' = 'idle';
  private swingStartTime: number = 0;
  private lastSwingTime: number = 0;
  private peakMagnitude: number = 0;
  private peakRotSpeed: number = 0;
  private lateralSum: number = 0;
  private sampleCountInSwing: number = 0;

  // Live telemetry buffer for Oscilloscope (last 100 samples)
  private history: SignalHistoryPoint[] = [];
  private readonly maxHistoryLength = 100;

  // Registered swing listeners
  private listeners: Set<SwingListener> = new Set();

  constructor() {
    this.resetFilter();
  }

  public subscribe(fn: SwingListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  public setConfig(partial: Partial<MotionConfig>) {
    this.config = { ...this.config, ...partial };
  }

  public getConfig(): MotionConfig {
    return { ...this.config };
  }

  public setLeftHanded(val: boolean) {
    this.isLeftHanded = val;
  }

  public getLeftHanded(): boolean {
    return this.isLeftHanded;
  }

  public resetFilter() {
    this.filteredAx = 0;
    this.filteredAy = 0;
    this.filteredAz = 0;
    this.filteredRa = 0;
    this.filteredRb = 0;
    this.filteredRg = 0;
    this.currentState = 'idle';
    this.peakMagnitude = 0;
    this.peakRotSpeed = 0;
    this.lateralSum = 0;
    this.sampleCountInSwing = 0;
  }

  /**
   * Calibrate the phone resting grip:
   * Captures the baseline orientation & gravity vector so zero-bias is achieved.
   */
  public calibrateGrip(sample?: RawSensorSample) {
    if (sample) {
      this.config.calibratedGravity = {
        x: sample.gx,
        y: sample.gy,
        z: sample.gz,
      };
    } else {
      // Default upright phone in right hand
      this.config.calibratedGravity = { x: 0.2, y: 9.7, z: 1.1 };
    }
    this.config.isCalibrated = true;
    this.resetFilter();
  }

  /**
   * Process a single raw sample from MyPC.sensors 'raw' event:
   * [dt, ax, ay, az, gx, gy, gz, ra, rb, rg]
   */
  public processSample(sample: RawSensorSample, now: number = Date.now()) {
    // 1. Resolve linear acceleration without gravity
    let ax = sample.ax;
    let ay = sample.ay;
    let az = sample.az;

    if (ax === null || ay === null || az === null) {
      // Approximate linear acceleration by subtracting calibrated gravity
      ax = sample.gx - this.config.calibratedGravity.x;
      ay = sample.gy - this.config.calibratedGravity.y;
      az = sample.gz - this.config.calibratedGravity.z;
    }

    const ra = sample.ra || 0;
    const rb = sample.rb || 0;
    const rg = sample.rg || 0;

    // 2. Exponential Moving Average Low-Pass Filtering
    // Alpha adjusts between 0.1 (heavy smoothing) and 0.9 (raw responsiveness)
    const alpha = Math.max(0.1, Math.min(0.9, 1 - this.config.smoothing));

    this.filteredAx += alpha * (ax - this.filteredAx);
    this.filteredAy += alpha * (ay - this.filteredAy);
    this.filteredAz += alpha * (az - this.filteredAz);
    this.filteredRa += alpha * (ra - this.filteredRa);
    this.filteredRb += alpha * (rb - this.filteredRb);
    this.filteredRg += alpha * (rg - this.filteredRg);

    // 3. Magnitudes & Steady Zone Deadband
    const rawMag = Math.sqrt(ax * ax + ay * ay + az * az);
    let filteredMag = Math.sqrt(
      this.filteredAx * this.filteredAx +
      this.filteredAy * this.filteredAy +
      this.filteredAz * this.filteredAz
    );

    const rotSpeed = Math.sqrt(
      this.filteredRa * this.filteredRa +
      this.filteredRb * this.filteredRb +
      this.filteredRg * this.filteredRg
    );

    // Tremor cancellation: ignore very slow resting jitters
    if (filteredMag < 2.2 && rotSpeed < 18) {
      filteredMag = 0;
    }

    // 4. Update live history buffer for visualization
    const histPoint: SignalHistoryPoint = {
      time: now,
      rawMag: Math.round(rawMag * 10) / 10,
      filteredMag: Math.round(filteredMag * 10) / 10,
      rotSpeed: Math.round(rotSpeed),
      lateral: Math.round(this.filteredAx * 10) / 10,
      state: this.currentState === 'cooldown' ? 'cooldown' : this.currentState === 'swing' ? 'swinging' : 'idle',
    };
    this.history.push(histPoint);
    if (this.history.length > this.maxHistoryLength) {
      this.history.shift();
    }

    // 5. Swing Detection State Machine
    this.evaluateStateMachine(filteredMag, rotSpeed, this.filteredAx, now);
  }

  /**
   * Core State Machine for Tennis Swing Trigger & Classification
   */
  private evaluateStateMachine(filteredMag: number, rotSpeed: number, lateralAcc: number, now: number) {
    const triggerAccelThreshold = 14.0 * this.config.thresholdMultiplier / this.config.sensitivity;
    const triggerRotThreshold = 180.0 * this.config.thresholdMultiplier / this.config.sensitivity;

    // In cooldown state: ignore swings until guard window elapses
    if (this.currentState === 'cooldown') {
      if (now - this.lastSwingTime > this.config.reboundGuardMs) {
        this.currentState = 'idle';
        this.peakMagnitude = 0;
        this.peakRotSpeed = 0;
        this.lateralSum = 0;
        this.sampleCountInSwing = 0;
      }
      return;
    }

    if (this.currentState === 'idle') {
      // Check if swing is starting
      if (filteredMag >= triggerAccelThreshold || rotSpeed >= triggerRotThreshold) {
        this.currentState = 'swing';
        this.swingStartTime = now;
        this.peakMagnitude = filteredMag;
        this.peakRotSpeed = rotSpeed;
        this.lateralSum = lateralAcc;
        this.sampleCountInSwing = 1;
      }
    } else if (this.currentState === 'swing') {
      this.sampleCountInSwing++;
      this.lateralSum += lateralAcc;

      if (filteredMag > this.peakMagnitude) this.peakMagnitude = filteredMag;
      if (rotSpeed > this.peakRotSpeed) this.peakRotSpeed = rotSpeed;

      const durationMs = now - this.swingStartTime;

      // Swing has passed its peak and starts deceleration, or duration reached 120-220ms (strike impact zone)
      const hasDecelerated = filteredMag < this.peakMagnitude * 0.7 && durationMs >= 60;
      const reachedMaxSwingWindow = durationMs >= 240;

      if (hasDecelerated || reachedMaxSwingWindow) {
        // Fire confirmed swing event!
        this.fireSwing(now);
      }
    }
  }

  private fireSwing(now: number) {
    // 1. Calculate kinetic power level (1 to 5)
    // Combines peak linear acceleration + angular rotational momentum
    const totalImpulse = (this.peakMagnitude * 0.7) + (this.peakRotSpeed / 25 * 0.3);
    const scaledImpulse = totalImpulse * this.config.sensitivity;

    let power: PowerLevel = 1;
    if (scaledImpulse >= 48) {
      power = 5;
    } else if (scaledImpulse >= 36) {
      power = 4;
    } else if (scaledImpulse >= 27) {
      power = 3;
    } else if (scaledImpulse >= 18) {
      power = 2;
    } else {
      power = 1;
    }

    // 2. Classify Forehand vs Backhand
    // For right-handed grip:
    // Forehand swings drive laterally toward the left (negative or positive depending on orientation).
    // Backhand swings drive laterally in the opposite direction.
    const averageLateral = this.sampleCountInSwing > 0 ? this.lateralSum / this.sampleCountInSwing : 0;
    const isMovingLeft = averageLateral < 0;

    let shotType: ShotType;
    let lateralDirection: 'left' | 'right';

    if (this.isLeftHanded) {
      // Left-handed player: swing to right is Forehand, swing to left is Backhand
      shotType = isMovingLeft ? 'BACKHAND' : 'FOREHAND';
      lateralDirection = isMovingLeft ? 'left' : 'right';
    } else {
      // Right-handed player: swing to left is Forehand, swing to right is Backhand
      shotType = isMovingLeft ? 'FOREHAND' : 'BACKHAND';
      lateralDirection = isMovingLeft ? 'left' : 'right';
    }

    // High upward pitch can classify as smash or serve if overhead
    if (this.filteredAy > 28 && power >= 4) {
      shotType = 'SMASH';
    }

    const confidence = Math.min(1.0, Math.max(0.4, scaledImpulse / 40));

    const event: SwingDetectionEvent = {
      type: shotType,
      power,
      rawMagnitude: this.peakMagnitude,
      rotSpeed: this.peakRotSpeed,
      timestamp: now,
      confidence,
      lateralDirection,
    };

    // Transition to cooldown to reject rebound follow-through
    this.currentState = 'cooldown';
    this.lastSwingTime = now;

    // Dispatch to all subscribers
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  /**
   * Simulate a physical phone swing (for testing, desktop play, and Motion Lab)
   */
  public simulateSwing(type: ShotType = 'FOREHAND', power: PowerLevel = 3) {
    const now = Date.now();
    const impulse = 15 + power * 8;
    const rot = 160 + power * 70;
    const lateralDir = (type === 'FOREHAND' && !this.isLeftHanded) || (type === 'BACKHAND' && this.isLeftHanded) ? 'left' : 'right';

    const event: SwingDetectionEvent = {
      type,
      power,
      rawMagnitude: impulse,
      rotSpeed: rot,
      timestamp: now,
      confidence: 0.95,
      lateralDirection: lateralDir,
    };

    // Push into history so charts show the spike
    this.history.push({
      time: now,
      rawMag: impulse * 1.2,
      filteredMag: impulse,
      rotSpeed: rot,
      lateral: lateralDir === 'left' ? -impulse * 0.8 : impulse * 0.8,
      state: 'swinging',
    });

    this.currentState = 'cooldown';
    this.lastSwingTime = now;

    for (const listener of this.listeners) {
      listener(event);
    }
  }

  public getHistory(): SignalHistoryPoint[] {
    return this.history;
  }

  public getCurrentState(): 'idle' | 'windup' | 'swing' | 'cooldown' {
    return this.currentState;
  }

  public getLiveRotations() {
    return {
      ra: this.filteredRa,
      rb: this.filteredRb,
      rg: this.filteredRg,
    };
  }
}

export const motionDSP = new MotionDSPEngine();
