/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { RawSensorSample } from '../types/game';
import { motionDSP } from './motionDSPs';
import { sound } from './sound';
import { setLanguage } from './i18n';

// MyPC SDK Type Declarations conforming to MyPC SDK v1
export interface MyPCInfo {
  standalone: boolean;
  lang: string;
  rtl: boolean;
  volume: { music: number; sfx: number };
  profile: { id: string; name: string };
  quality: { tier: 'low' | 'mid' | 'high' };
  app: { id: string };
}

export interface MyPCGlobal {
  apiLevel: number;
  app_config: Record<string, unknown>;
  info(): MyPCInfo;
  ready(): void;
  fail(reason: string): void;
  progress(p: number): void;
  pause(): void;
  exit(): void;
  save(key: string, value: unknown): boolean;
  load<T>(key: string, defaultValue: T): T;
  submitScore(score: number, opts?: { player?: number; players?: number }): void;
  announce(text: string): void;
  setMenu(items: Array<{ id: string; label: string }>): void;
  isDown(action: string): boolean;
  init(handlers: {
    onInit: (info: MyPCInfo) => void;
    onStart: () => void;
    onPause: () => void;
    onResume: () => void;
    onDestroy: () => void;
    onInput?: (action: string, pressed: boolean, repeat: boolean, dev?: string) => void;
    onMenu?: (id: string) => void;
    onVolume?: (v: { music: number; sfx: number }) => void;
    ownMenu?: boolean;
    pad?: unknown;
  }): void;
  gamepad: {
    on(event: 'button', cb: (i: number, pressed: boolean, value: number, dev: string, name: string) => void): void;
    on(event: 'axes', cb: (axes: number[], dev: string) => void): void;
    on(event: 'pads', cb: (list: unknown[]) => void): void;
    pressed(i: number, dev?: string): boolean;
    value(i: number, dev?: string): number;
    axis(i: number, dev?: string): number;
    name(i: number): string;
    pads(): unknown[];
  };
  sensors: {
    setup(cfg: {
      moves?: string[];
      raw?: { hz: number };
      metrics?: { hz: number };
      profile?: unknown;
      define?: unknown;
    }): void;
    on(event: 'raw', cb: (r: { hz: number; s: number[][] }, player: number) => void): void;
    on(event: 'action', cb: (ev: { type: string; action: string; confidence: number }, player: number) => void): void;
    on(event: 'players', cb: (modes: Record<number, string | null>) => void): void;
    on(event: 'metrics', cb: (m: unknown, player: number) => void): void;
    on(event: 'config', cb: (cfg: unknown) => void): void;
    stop(): void;
    available(): boolean;
    players(): Record<number, string | null>;
  };
}

declare global {
  interface Window {
    MyPC?: MyPCGlobal;
  }
}

export type InputActionListener = (action: string, pressed: boolean, repeat: boolean, dev: string) => void;
export type GamepadButtonListener = (index: number, pressed: boolean, value: number, dev: string, name: string) => void;
export type GamepadAxesListener = (axes: number[], dev: string) => void;

class MyPCBridgeService {
  private isInitialized = false;
  private isPaused = false;
  private actionListeners: Set<InputActionListener> = new Set();
  private buttonListeners: Set<GamepadButtonListener> = new Set();
  private axesListeners: Set<GamepadAxesListener> = new Set();
  private connectedPhoneModes: Record<number, string | null> = {};
  private activeProfileName: string = 'Player 1';
  private qualityTier: 'low' | 'mid' | 'high' = 'mid';
  private startCallbacks: Array<() => void> = [];
  private pauseCallbacks: Array<() => void> = [];
  private resumeCallbacks: Array<() => void> = [];
  private destroyCallbacks: Array<() => void> = [];
  private menuCallbacks: Array<(id: string) => void> = [];

  public initBridge(onReadyToShowUI?: () => void) {
    if (this.isInitialized) {
      if (onReadyToShowUI) onReadyToShowUI();
      return;
    }
    this.isInitialized = true;

    if (typeof window !== 'undefined' && window.MyPC) {
      window.MyPC.init({
        ownMenu: true,
        pad: true, // Show touch pad on phones/tablets in standalone mode
        onInit: (info: MyPCInfo) => {
          if (info.lang) {
            setLanguage(info.lang);
          }
          if (info.profile?.name) {
            this.activeProfileName = info.profile.name;
          }
          if (info.quality?.tier) {
            this.qualityTier = info.quality.tier;
          }
          if (info.volume) {
            sound.setVolume(info.volume.sfx);
          }

          // Register pause menu items with My PC TV shell
          try {
            window.MyPC?.setMenu([
              { id: 'resume', label: 'Resume Match' },
              { id: 'restart', label: 'Restart Match' },
              { id: 'motion', label: 'Motion Lab' },
              { id: 'settings', label: 'Settings' },
              { id: 'quit', label: 'Quit to Title' },
            ]);
          } catch {
            // older SDKs
          }

          // Configure Phone Motion controller (API level 8)
          if (window.MyPC?.sensors) {
            try {
              window.MyPC.sensors.setup({
                raw: { hz: 50 },
                moves: ['LEFT', 'RIGHT', 'JUMP', 'DUCK'],
                profile: { phone_position: 'right hand' },
              });

              window.MyPC.sensors.on('raw', (r, _player) => {
                if (r && Array.isArray(r.s)) {
                  for (let i = 0; i < r.s.length; i++) {
                    const row = r.s[i];
                    const sample: RawSensorSample = {
                      dt: row[0],
                      ax: row[1],
                      ay: row[2],
                      az: row[3],
                      gx: row[4],
                      gy: row[5],
                      gz: row[6],
                      ra: row[7],
                      rb: row[8],
                      rg: row[9],
                    };
                    motionDSP.processSample(sample);
                  }
                }
              });

              window.MyPC.sensors.on('players', (modes) => {
                this.connectedPhoneModes = modes || {};
              });
            } catch {
              // ignore
            }
          }

          // Configure Gamepads (API level 9)
          if (window.MyPC?.gamepad) {
            try {
              window.MyPC.gamepad.on('button', (i, pressed, val, dev, name) => {
                for (const l of this.buttonListeners) {
                  l(i, pressed, val, dev, name);
                }
              });

              window.MyPC.gamepad.on('axes', (axes, dev) => {
                for (const l of this.axesListeners) {
                  l(axes, dev);
                }
              });
            } catch {
              // ignore
            }
          }

          // Report 100% progress and notify My PC that loading is complete
          window.MyPC?.progress(1);
          window.MyPC?.ready();

          if (onReadyToShowUI) {
            onReadyToShowUI();
          }
        },
        onStart: () => {
          this.isPaused = false;
          sound.init();
          sound.resume();
          for (const cb of this.startCallbacks) cb();
        },
        onPause: () => {
          this.isPaused = true;
          sound.pause();
          for (const cb of this.pauseCallbacks) cb();
        },
        onResume: () => {
          this.isPaused = false;
          sound.resume();
          for (const cb of this.resumeCallbacks) cb();
        },
        onDestroy: () => {
          this.isPaused = true;
          sound.destroy();
          try {
            window.MyPC?.sensors?.stop();
          } catch {
            // ignore
          }
          for (const cb of this.destroyCallbacks) cb();
        },
        onInput: (action, pressed, repeat, dev = 'keys') => {
          for (const l of this.actionListeners) {
            l(action, pressed, repeat, dev);
          }
        },
        onMenu: (id) => {
          for (const cb of this.menuCallbacks) cb(id);
        },
        onVolume: (v) => {
          if (v) sound.setVolume(v.sfx);
        },
      });
    } else {
      // Standalone execution outside My PC iframe
      if (onReadyToShowUI) {
        onReadyToShowUI();
      }
    }
  }

  public onStartEvent(cb: () => void) {
    this.startCallbacks.push(cb);
  }

  public onPauseEvent(cb: () => void) {
    this.pauseCallbacks.push(cb);
  }

  public onResumeEvent(cb: () => void) {
    this.resumeCallbacks.push(cb);
  }

  public onDestroyEvent(cb: () => void) {
    this.destroyCallbacks.push(cb);
  }

  public onMenuEvent(cb: (id: string) => void) {
    this.menuCallbacks.push(cb);
  }

  public addActionListener(fn: InputActionListener): () => void {
    this.actionListeners.add(fn);
    return () => this.actionListeners.delete(fn);
  }

  public addGamepadButtonListener(fn: GamepadButtonListener): () => void {
    this.buttonListeners.add(fn);
    return () => this.buttonListeners.delete(fn);
  }

  public addGamepadAxesListener(fn: GamepadAxesListener): () => void {
    this.axesListeners.add(fn);
    return () => this.axesListeners.delete(fn);
  }

  public isPhoneMotionActive(): boolean {
    if (!window.MyPC?.sensors) return false;
    try {
      const players = window.MyPC.sensors.players ? window.MyPC.sensors.players() : this.connectedPhoneModes;
      for (const p in players) {
        if (players[p] === 'sensor-raw') {
          return true;
        }
      }
    } catch {
      // fallback
    }
    return false;
  }

  public getConnectedModes() {
    return this.connectedPhoneModes;
  }

  public getProfileName(): string {
    return this.activeProfileName;
  }

  public getQualityTier(): 'low' | 'mid' | 'high' {
    return this.qualityTier;
  }

  public saveScore(score: number, players: number = 1) {
    if (window.MyPC?.submitScore) {
      window.MyPC.submitScore(score, { players });
    }
  }

  public announceVoice(text: string) {
    if (window.MyPC?.announce) {
      window.MyPC.announce(text);
    }
  }

  public saveSetting<T>(key: string, value: T) {
    if (window.MyPC?.save) {
      window.MyPC.save(key, value);
    } else {
      try {
        localStorage.setItem(`mypc_app_${key}`, JSON.stringify(value));
      } catch {
        // ignore
      }
    }
  }

  public loadSetting<T>(key: string, defaultValue: T): T {
    if (window.MyPC?.load) {
      return window.MyPC.load<T>(key, defaultValue);
    }
    try {
      const stored = localStorage.getItem(`mypc_app_${key}`);
      return stored ? JSON.parse(stored) : defaultValue;
    } catch {
      return defaultValue;
    }
  }

  public exitApp() {
    if (window.MyPC?.exit) {
      window.MyPC.exit();
    }
  }
}

export const mypcBridge = new MyPCBridgeService();
