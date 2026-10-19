/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type CourtSurface = 'hard' | 'clay' | 'grass';

export type GameMode = 'ai' | 'local2p' | 'doubles_ai' | 'doubles_local' | 'motion_lab';

export type AIDifficulty = 'amateur' | 'pro' | 'master';

export type ControllerType = 'motion' | 'gamepad' | 'keyboard';

export type ShotType = 'FOREHAND' | 'BACKHAND' | 'SERVE' | 'SMASH' | 'LOB' | 'DROP';

export type PowerLevel = 1 | 2 | 3 | 4 | 5;

export type CameraAngle = 'chase' | 'broadcast' | 'baseline' | 'overhead' | 'mount';

export type VFXLevel = 'low' | 'medium' | 'high';

export type RenderResolution = '480p' | '720p' | '1080p' | 'auto';

export type ScalingFilter = 'smooth' | 'pixelated';

export interface SwingDetectionEvent {
  type: ShotType;
  power: PowerLevel;
  rawMagnitude: number;
  rotSpeed: number;
  timestamp: number;
  confidence: number;
  lateralDirection: 'left' | 'right';
}

export interface RawSensorSample {
  dt: number;
  ax: number | null;
  ay: number | null;
  az: number | null;
  gx: number;
  gy: number;
  gz: number;
  ra: number;
  rb: number;
  rg: number;
}

export interface MotionConfig {
  sensitivity: number; // 0.5 to 2.5 (default 1.0)
  smoothing: number; // 0.1 to 0.9 (default 0.65)
  thresholdMultiplier: number; // 0.6 to 1.8 (default 1.0)
  reboundGuardMs: number; // default 420 ms
  calibratedGravity: { x: number; y: number; z: number };
  isCalibrated: boolean;
}

export type GaugeSpeed = 'relaxed' | 'balanced' | 'fast';

export interface ChargingState {
  playerId: 1 | 2;
  isCharging: boolean;
  progress: number; // 0.0 to 1.0 (oscillates up and down)
  rawPower: number; // 0.0 to 1.0
  powerLevel: PowerLevel; // 1 to 5
  shotType: ShotType;
  safeZoneMin: number; // fraction 0.0 to 1.0
  safeZoneMax: number; // fraction 0.0 to 1.0
  isSafe: boolean;
  predictedLanding?: { x: number; z: number };
  netClearance?: number;
  screenPos?: { x: number; y: number };
}

export interface GraphicsConfig {
  quality: 'very_low' | 'low' | 'mid' | 'high' | 'fancy';
  cameraAngle: CameraAngle;
  cameraZoom: number; // 0.6 (close/immersive) to 1.8 (far/tactical)
  cameraHeight: number; // 1m to 50m (default 10m)
  vfxLevel: VFXLevel; // 'low' (none) | 'medium' (half) | 'high' (all)
  spectators: boolean;
  shadows: boolean;
  pixelRatio: number;
  gaugeSpeed: GaugeSpeed;
  renderResolution: RenderResolution;
  scalingFilter: ScalingFilter;
}

export interface AudioConfig {
  master: number;
  sfx: number;
  music: number;
  referee: boolean;
}

export interface PlayerConfig {
  id: 1 | 2 | 3 | 4;
  team: 1 | 2;
  name: string;
  isAI: boolean;
  controller: ControllerType;
  padIndex?: number; // 0, 1, 2, 3
  difficulty?: AIDifficulty;
}

export interface ScoreState {
  pointsP1: number; // 0=0, 1=15, 2=30, 3=40, 4=Game/Advantage
  pointsP2: number;
  isDeuce: boolean;
  advantage: 1 | 2 | null;
  gamesP1: number;
  gamesP2: number;
  setsP1: number;
  setsP2: number;
  currentServer: 1 | 2;
  servingSide: 'right' | 'left'; // deuce court or ad court
  pointWinner: 1 | 2 | null;
  matchWinner: 1 | 2 | null;
  announcementText: string;
}

export interface MatchStats {
  acesP1: number;
  acesP2: number;
  forehandWinnersP1: number;
  backhandWinnersP1: number;
  maxPowerP1: PowerLevel;
  totalRallies: number;
  longestRally: number;
}
