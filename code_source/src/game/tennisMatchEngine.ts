/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { motionDSP } from '../services/motionDSPs';
import { sound } from '../services/sound';
import {
  ChargingState,
  CourtSurface,
  GaugeSpeed,
  MatchStats,
  PlayerConfig,
  PowerLevel,
  ScoreState,
  ShotType,
  SwingDetectionEvent,
} from '../types/game';
import { TennisScene3D } from './threeRenderer';
import { ITF_COURT, TennisBallPhysics } from './tennisPhysics';

export type GamePhase = 'serve_ready' | 'serve_toss' | 'in_rally' | 'point_ended' | 'match_ended';

export interface TennisMatchCallbacks {
  onScoreUpdate: (score: ScoreState) => void;
  onShotToast: (text: string, type: ShotType, power: PowerLevel) => void;
  onRallyCount: (count: number) => void;
  onMatchComplete: (winner: 1 | 2, stats: MatchStats) => void;
  onChargingUpdate?: (state: ChargingState | null) => void;
}

export class TennisMatchEngine {
  private scene3D: TennisScene3D;
  private p1Config: PlayerConfig;
  private p2Config: PlayerConfig;
  private p3Config: PlayerConfig | null = null;
  private p4Config: PlayerConfig | null = null;
  public isDoubles: boolean = false;
  private courtSurface: CourtSurface;
  private callbacks: TennisMatchCallbacks;

  // Analytical Ballistics Simulator
  public ballPhysics: TennisBallPhysics;

  // Player positions (ITF scale)
  // Team 1: P1 (Baseline) and P3 (Net)
  public p1Pos = new THREE.Vector3(0, 0, ITF_COURT.HALF_LENGTH + 0.4);
  public p3Pos = new THREE.Vector3(-2.2, 0, 3.8);
  // Team 2: P2 (Baseline) and P4 (Net)
  public p2Pos = new THREE.Vector3(0, 0, -(ITF_COURT.HALF_LENGTH + 0.4));
  public p4Pos = new THREE.Vector3(2.2, 0, -3.8);

  private p1MoveTarget = new THREE.Vector3(0, 0, ITF_COURT.HALF_LENGTH + 0.4);
  private p2MoveTarget = new THREE.Vector3(0, 0, -(ITF_COURT.HALF_LENGTH + 0.4));
  private p3MoveTarget = new THREE.Vector3(-2.2, 0, 3.8);
  private p4MoveTarget = new THREE.Vector3(2.2, 0, -3.8);

  // Match & Rally State
  public phase: GamePhase = 'serve_ready';
  public currentServerTeam: 1 | 2 = 1;
  public servingSide: 'right' | 'left' = 'right'; // Deuce court (right) or Ad court (left)
  public lastHitterTeam: 1 | 2 | null = null;
  public lastHitterPlayerId: 1 | 2 | 3 | 4 | null = null;
  public bounceCountThisSide: number = 0;
  public lastBounceSide: 1 | 2 | null = null;
  public isFirstBounceInCourt: boolean = false;
  public rallyCount: number = 0;
  public isSecondServe: boolean = false;

  // Manual inputs for human-controlled players
  public p1Input = { x: 0, z: 0, hitPressed: false };
  public p2Input = { x: 0, z: 0, hitPressed: false };

  // Tennis Scoring State
  public score: ScoreState = {
    pointsP1: 0,
    pointsP2: 0,
    isDeuce: false,
    advantage: null,
    gamesP1: 0,
    gamesP2: 0,
    setsP1: 0,
    setsP2: 0,
    currentServer: 1,
    servingSide: 'right',
    pointWinner: null,
    matchWinner: null,
    announcementText: 'Ready to Serve',
  };

  public stats: MatchStats = {
    acesP1: 0,
    acesP2: 0,
    forehandWinnersP1: 0,
    backhandWinnersP1: 0,
    maxPowerP1: 1,
    totalRallies: 0,
    longestRally: 0,
  };

  private motionUnsubscribe: (() => void) | null = null;
  private footstepTimer: number = 0;

  constructor(
    scene3D: TennisScene3D,
    p1Config: PlayerConfig,
    p2Config: PlayerConfig,
    surface: CourtSurface,
    callbacks: TennisMatchCallbacks,
    isDoubles: boolean = false,
    p3Config?: PlayerConfig,
    p4Config?: PlayerConfig
  ) {
    this.scene3D = scene3D;
    this.p1Config = p1Config;
    this.p2Config = p2Config;
    this.isDoubles = isDoubles;
    this.courtSurface = surface;
    this.callbacks = callbacks;

    if (isDoubles) {
      this.p3Config = p3Config || {
        id: 3,
        team: 1,
        name: 'Partner',
        isAI: true,
        controller: 'keyboard',
        difficulty: 'pro',
      };
      this.p4Config = p4Config || {
        id: 4,
        team: 2,
        name: 'CPU 2',
        isAI: true,
        controller: 'keyboard',
        difficulty: 'pro',
      };
    }

    this.scene3D.setDoublesMode(isDoubles);
    this.ballPhysics = new TennisBallPhysics(surface);

    // Physical phone motion swing subscriber
    this.motionUnsubscribe = motionDSP.subscribe((ev) => {
      this.handleMotionSwing(ev);
    });

    this.prepareServe();
  }

  public setCourtSurface(surface: CourtSurface) {
    this.courtSurface = surface;
    this.ballPhysics.setSurface(surface);
    this.scene3D.setCourtSurface(surface);
  }

  // Hold-to-Charge Power Gauge State
  private chargingPlayer: 1 | 2 | null = null;
  private chargingShotType: ShotType = 'FOREHAND';
  private chargeElapsed: number = 0;
  private gaugeSpeed: GaugeSpeed = 'balanced';
  private safeZoneMin: number = 0.32;
  private safeZoneMax: number = 0.72;
  private cpuServeTimer: number = 0;

  public setGaugeSpeed(speed: GaugeSpeed) {
    this.gaugeSpeed = speed;
  }

  public getGaugeCycleTime(): number {
    switch (this.gaugeSpeed) {
      case 'fast':
        return 0.8;
      case 'relaxed':
        return 1.8;
      case 'balanced':
      default:
        return 1.2;
    }
  }

  /**
   * Begin holding strike button: coils player into windup and starts oscillating power gauge
   */
  public startCharging(
    playerIndex: 1 | 2,
    baseShot: 'FLAT' | 'SLICE' | 'TOPSPIN' | 'LOB' | 'SMASH' | 'DROP' | ShotType = 'FLAT'
  ) {
    if (this.phase === 'point_ended' || this.phase === 'match_ended') return;

    if (this.phase === 'serve_ready') {
      const isServer = this.currentServerTeam === playerIndex;
      if (!isServer) return;

      this.chargingPlayer = playerIndex;
      this.chargingShotType = 'SERVE';
      this.chargeElapsed = 0;

      // Realistic 2-step toss: ball leaves server's hand and arcs smoothly upwards
      this.phase = 'serve_toss';
      const isTeam1 = playerIndex === 1;
      this.ballPhysics.state.vel.set(0, 5.2, isTeam1 ? -0.32 : 0.32);

      const aimX = isTeam1 ? this.p1Input.x : this.p2Input.x;
      const playerPos = isTeam1 ? this.p1Pos : this.p2Pos;
      const safeWindow = TennisBallPhysics.calculateSafePowerWindow(
        'SERVE',
        playerIndex,
        aimX,
        playerPos,
        this.isDoubles
      );
      this.safeZoneMin = safeWindow.minSafe;
      this.safeZoneMax = safeWindow.maxSafe;

      sound.playSwingSwoosh(1);
      return;
    }

    if (this.phase === 'in_rally') {
      const playerPos = playerIndex === 1 ? this.p1Pos : this.p2Pos;
      const resolvedShot = this.resolveContextualHit(playerIndex, baseShot, playerPos);
      const aimX = playerIndex === 1 ? this.p1Input.x : this.p2Input.x;

      this.chargingPlayer = playerIndex;
      this.chargingShotType = resolvedShot;
      this.chargeElapsed = 0;

      const safeWindow = TennisBallPhysics.calculateSafePowerWindow(
        resolvedShot,
        playerIndex,
        aimX,
        playerPos,
        this.isDoubles
      );
      this.safeZoneMin = safeWindow.minSafe;
      this.safeZoneMax = safeWindow.maxSafe;
    }
  }

  /**
   * Button released: fires stroke with the exact power captured from the oscillating gauge
   */
  public releaseCharging(playerIndex: 1 | 2) {
    if (this.chargingPlayer !== playerIndex) return;

    const cycle = this.getGaugeCycleTime();
    const phase = (this.chargeElapsed % cycle) / cycle;
    let rawPower = phase <= 0.5 ? phase * 2.0 : (1.0 - phase) * 2.0;
    rawPower = Math.max(0.04, Math.min(1.0, rawPower));

    const powerLevel = Math.min(5, Math.max(1, Math.round(rawPower * 4) + 1)) as PowerLevel;
    const shotType = this.chargingShotType;

    // Reset charging animation
    const pModel = playerIndex === 1 ? this.scene3D.player1 : this.scene3D.player2;
    pModel.animState.isCharging = false;
    pModel.animState.chargeProgress = 0;

    this.chargingPlayer = null;
    this.chargeElapsed = 0;

    if (this.callbacks.onChargingUpdate) {
      this.callbacks.onChargingUpdate(null);
    }

    if (this.phase === 'serve_toss') {
      this.tossAndHitServe(playerIndex, 'SERVE', powerLevel);
      return;
    }

    if (this.phase === 'in_rally') {
      const playerPos = playerIndex === 1 ? this.p1Pos : this.p2Pos;
      const isBallApproaching = playerIndex === 1 ? this.ballPhysics.state.vel.z > 0 : this.ballPhysics.state.vel.z < 0;
      const dist = playerPos.distanceTo(this.ballPhysics.state.pos);

      if (dist < 4.2 && isBallApproaching) {
        const aimDirection = playerIndex === 1 ? this.p1Input.x : this.p2Input.x;
        this.executeHit(playerIndex, shotType, powerLevel, aimDirection);
      }
    }
  }

  /**
   * Cancel active charging if interrupted
   */
  public cancelCharging(playerIndex?: 1 | 2) {
    if (playerIndex && this.chargingPlayer !== playerIndex) return;
    if (this.chargingPlayer !== null) {
      const pModel = this.chargingPlayer === 1 ? this.scene3D.player1 : this.scene3D.player2;
      pModel.animState.isCharging = false;
      pModel.animState.chargeProgress = 0;
      pModel.animState.chargingShot = null;
    }
    this.chargingPlayer = null;
    this.chargeElapsed = 0;
    if (this.callbacks.onChargingUpdate) {
      this.callbacks.onChargingUpdate(null);
    }
  }

  /**
   * Phone motion controller swing detection
   */
  private handleMotionSwing(ev: SwingDetectionEvent) {
    if (this.phase === 'serve_ready') {
      if (this.currentServerTeam === 1) {
        this.tossAndHitServe(1, ev.type, ev.power);
      }
      return;
    }

    if (this.phase !== 'in_rally') return;

    // Check distance between ball and Player 1
    const distToBall = this.p1Pos.distanceTo(this.ballPhysics.state.pos);
    if (distToBall < 3.4 && this.ballPhysics.state.vel.z > 0) {
      const contextualShot = this.resolveContextualHit(1, ev.type, this.p1Pos);
      this.executeHit(1, contextualShot, ev.power, this.p1Input.x);
    }
  }

  /**
   * Determine whether a shot is FOREHAND or BACKHAND based on the ball's position relative to the player!
   * Requirement: "making sure forhand and backhand are same but depend on ball positions for player"
   */
  public resolveContextualHit(
    playerId: 1 | 2 | 3 | 4,
    baseShot: 'FLAT' | 'SLICE' | 'TOPSPIN' | 'LOB' | 'SMASH' | 'DROP' | ShotType,
    playerPos: THREE.Vector3
  ): ShotType {
    const ballPos = this.ballPhysics.state.pos;
    const isTeam1 = playerId === 1 || playerId === 3;
    const opponentAtNet = isTeam1
      ? Math.abs(this.p2Pos.z) < 4.5 || (this.isDoubles && Math.abs(this.p4Pos.z) < 4.5)
      : Math.abs(this.p1Pos.z) < 4.5 || (this.isDoubles && Math.abs(this.p3Pos.z) < 4.5);

    // Overhead Smash detection: ball is high or player is positioned near net
    if (baseShot === 'SMASH' || baseShot === 'LOB') {
      if (ballPos.y >= 1.65 || Math.abs(playerPos.z) < 4.8) {
        return 'SMASH';
      }
      if (opponentAtNet) {
        return 'LOB'; // Tactical lob over opponent at the net!
      }
      return 'LOB';
    }

    if (baseShot === 'DROP') {
      return 'DROP';
    }

    // Lateral position of ball relative to player
    // Team 1 faces -z. Right-handed forehand is to the right (+x), backhand is to the left (-x)
    // Team 2 faces +z. Right-handed forehand is to the left (-x), backhand is to the right (+x)
    const deltaX = isTeam1 ? (ballPos.x - playerPos.x) : (playerPos.x - ballPos.x);
    const isForehandSide = deltaX >= -0.25; // slight tolerance for body shots

    if (baseShot === 'BACKHAND' || baseShot === 'SLICE') {
      return isForehandSide ? 'FOREHAND' : 'BACKHAND';
    }

    return isForehandSide ? 'FOREHAND' : 'BACKHAND';
  }

  /**
   * Keyboard / Gamepad button hit action
   * Maps 4 top standard tennis button types:
   * Button 0 (A / Space): Flat Drive (Forehand / Backhand depending on ball position)
   * Button 1 (B / Shift): Slice (Low skidding underspin, Forehand / Backhand depending on ball position)
   * Button 2 (X): Topspin (Heavy topspin, Forehand / Backhand depending on ball position)
   * Button 3 (Y / C): Smash or Lob (Overhead Smash if high ball/near net, Lob if opponent is at net)
   * Button 5 (RB / V): Drop Shot (Soft touch feathering just over the net)
   */
  public handleButtonHit(
    playerIndex: 1 | 2,
    baseShot: 'FLAT' | 'SLICE' | 'TOPSPIN' | 'LOB' | 'SMASH' | 'DROP' | ShotType = 'FLAT',
    power: PowerLevel = 3
  ) {
    if (this.phase === 'serve_ready') {
      const isServer = this.currentServerTeam === playerIndex;
      if (isServer) {
        this.tossAndHitServe(playerIndex, 'SERVE', power);
      }
      return;
    }

    if (this.phase !== 'in_rally') return;

    // Check which player on this team is closer to the ball
    const playerPos = playerIndex === 1 ? this.p1Pos : this.p2Pos;
    const isBallApproaching = playerIndex === 1 ? this.ballPhysics.state.vel.z > 0 : this.ballPhysics.state.vel.z < 0;

    // Generous strike zone (~3.5m radius) to ensure responsive, satisfying rallies
    if (playerPos.distanceTo(this.ballPhysics.state.pos) < 3.5 && isBallApproaching) {
      const resolvedShot = this.resolveContextualHit(playerIndex, baseShot, playerPos);
      const aimDirection = playerIndex === 1 ? this.p1Input.x : this.p2Input.x;
      this.executeHit(playerIndex, resolvedShot, power, aimDirection);
    }
  }

  /**
   * Position players for serve according to ITF singles / doubles rules
   */
  public prepareServe() {
    this.phase = 'serve_ready';
    this.bounceCountThisSide = 0;
    this.lastBounceSide = null;
    this.isFirstBounceInCourt = false;

    const isTeam1Serving = this.currentServerTeam === 1;
    const serverX = this.servingSide === 'right' ? 2.0 : -2.0;
    const receiverX = this.servingSide === 'right' ? -2.2 : 2.2;

    if (isTeam1Serving) {
      this.p1Pos.set(serverX, 0, ITF_COURT.HALF_LENGTH + 0.3);
      this.p2Pos.set(receiverX, 0, -(ITF_COURT.HALF_LENGTH + 0.8));
      // Partners positioned at opposite net sides
      if (this.isDoubles) {
        this.p3Pos.set(this.servingSide === 'right' ? -2.6 : 2.6, 0, 3.8);
        this.p4Pos.set(this.servingSide === 'right' ? 2.6 : -2.6, 0, -3.8);
      }
    } else {
      this.p2Pos.set(serverX, 0, -(ITF_COURT.HALF_LENGTH + 0.3));
      this.p1Pos.set(receiverX, 0, ITF_COURT.HALF_LENGTH + 0.8);
      if (this.isDoubles) {
        this.p4Pos.set(this.servingSide === 'right' ? -2.6 : 2.6, 0, -3.8);
        this.p3Pos.set(this.servingSide === 'right' ? 2.6 : -2.6, 0, 3.8);
      }
    }

    this.p1MoveTarget.copy(this.p1Pos);
    this.p2MoveTarget.copy(this.p2Pos);
    this.p3MoveTarget.copy(this.p3Pos);
    this.p4MoveTarget.copy(this.p4Pos);

    this.scene3D.player1.root.position.copy(this.p1Pos);
    this.scene3D.player2.root.position.copy(this.p2Pos);
    if (this.isDoubles) {
      this.scene3D.player3.root.position.copy(this.p3Pos);
      this.scene3D.player4.root.position.copy(this.p4Pos);
    }

    // Ball held at server's hand
    const serverPos = isTeam1Serving ? this.p1Pos : this.p2Pos;
    const ballOffsetZ = isTeam1Serving ? -0.4 : 0.4;
    this.ballPhysics.reset(
      new THREE.Vector3(serverPos.x + 0.35, 1.25, serverPos.z + ballOffsetZ),
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, 0)
    );
    this.scene3D.ballMesh.position.copy(this.ballPhysics.state.pos);

    const serveNotice = this.isSecondServe ? '2nd Serve' : '1st Serve';
    const serverName = isTeam1Serving
      ? (this.isDoubles ? 'Team 1' : this.p1Config.name)
      : (this.isDoubles ? 'Team 2' : this.p2Config.name);

    this.score.announcementText = `${serverName} to serve (${serveNotice})`;
    this.callbacks.onScoreUpdate(this.score);
  }

  /**
   * Toss & Drive Service
   */
  private tossAndHitServe(player: 1 | 2, shotType: ShotType, power: PowerLevel) {
    this.phase = 'in_rally';
    this.lastHitterTeam = player;
    this.lastHitterPlayerId = player;
    this.bounceCountThisSide = 0;
    this.lastBounceSide = null;
    this.isFirstBounceInCourt = false;
    this.rallyCount = 1;
    this.callbacks.onRallyCount(this.rallyCount);

    const isP1 = player === 1;
    const playerModel = isP1 ? this.scene3D.player1 : this.scene3D.player2;
    playerModel.animState.swingProgress = 0.01;
    playerModel.animState.swingType = 'SERVE';

    sound.playSwingSwoosh(power);
    sound.playRacketHit(power, 'SERVE');
    this.scene3D.triggerImpactPuff(this.ballPhysics.state.pos, 0xd9f99d);

    const targetX = this.servingSide === 'right' ? (isP1 ? -2.0 : 2.0) : (isP1 ? 2.0 : -2.0);
    const shot = TennisBallPhysics.calculateShotVelocity('SERVE', power, player, targetX / 3.3, this.ballPhysics.state.pos, this.isDoubles);
    this.ballPhysics.reset(this.ballPhysics.state.pos, shot.vel, shot.spin);

    this.callbacks.onShotToast(`ACE SERVE · PWR ${power}/5`, 'SERVE', power);
  }

  /**
   * Execute tennis strike with full analytical ballistics
   */
  public executeHit(
    playerId: 1 | 2 | 3 | 4,
    shotType: ShotType,
    power: PowerLevel,
    aimHorizontal: number = 0
  ) {
    const hitterTeam: 1 | 2 = (playerId === 1 || playerId === 3) ? 1 : 2;
    this.lastHitterTeam = hitterTeam;
    this.lastHitterPlayerId = playerId;
    this.bounceCountThisSide = 0;
    this.lastBounceSide = null;
    this.rallyCount++;
    this.callbacks.onRallyCount(this.rallyCount);

    if (this.rallyCount > this.stats.longestRally) {
      this.stats.longestRally = this.rallyCount;
    }

    if (playerId === 1 && power > this.stats.maxPowerP1) {
      this.stats.maxPowerP1 = power;
    }

    let playerModel = this.scene3D.player1;
    if (playerId === 2) playerModel = this.scene3D.player2;
    else if (playerId === 3) playerModel = this.scene3D.player3;
    else if (playerId === 4) playerModel = this.scene3D.player4;

    playerModel.animState.swingProgress = 0.01;
    playerModel.animState.swingType = shotType;

    sound.playSwingSwoosh(power);
    sound.playRacketHit(power, shotType);
    this.scene3D.triggerImpactPuff(this.ballPhysics.state.pos, 0xd9f99d);

    // Calculate aim and apply realistic spin physics
    const shot = TennisBallPhysics.calculateShotVelocity(
      shotType,
      power,
      hitterTeam,
      aimHorizontal,
      this.ballPhysics.state.pos,
      this.isDoubles
    );
    this.ballPhysics.reset(this.ballPhysics.state.pos, shot.vel, shot.spin);

    const toastLabel = `${shotType} · PWR ${power}/5`;
    this.callbacks.onShotToast(toastLabel, shotType, power);
  }

  /**
   * Fixed physics & AI update tick
   */
  public update(dt: number) {
    if (this.phase === 'point_ended' || this.phase === 'match_ended') return;

    const moveSpeed = 7.8;
    this.footstepTimer += dt;

    // 1. Update Player 1 Locomotion
    if (this.p1Config.controller === 'motion') {
      if (this.ballPhysics.state.vel.z > 0 && this.phase === 'in_rally') {
        const estLandingX = THREE.MathUtils.clamp(
          this.ballPhysics.state.pos.x + this.ballPhysics.state.vel.x * 0.35,
          -ITF_COURT.HALF_DOUBLES_WIDTH + 0.3,
          ITF_COURT.HALF_DOUBLES_WIDTH - 0.3
        );
        const estLandingZ = THREE.MathUtils.clamp(
          this.ballPhysics.state.pos.z + this.ballPhysics.state.vel.z * 0.35,
          8.5,
          ITF_COURT.HALF_LENGTH + 1.2
        );
        this.p1MoveTarget.set(estLandingX + 0.5, 0, estLandingZ);
      } else {
        this.p1MoveTarget.set(0, 0, ITF_COURT.HALF_LENGTH + 0.4);
      }
      this.smoothMovePlayer(this.p1Pos, this.p1MoveTarget, moveSpeed, dt);
    } else {
      // Manual Responsive Movement for Gamepad / Keyboard
      const boundX = this.isDoubles ? ITF_COURT.HALF_DOUBLES_WIDTH : ITF_COURT.HALF_SINGLES_WIDTH;
      this.p1Pos.x = THREE.MathUtils.clamp(
        this.p1Pos.x + this.p1Input.x * moveSpeed * dt,
        -boundX,
        boundX
      );
      this.p1Pos.z = THREE.MathUtils.clamp(
        this.p1Pos.z + this.p1Input.z * moveSpeed * dt,
        1.0,
        ITF_COURT.HALF_LENGTH + 2.5
      );
    }

    // 2. Update Player 2 Locomotion
    if (this.p2Config.isAI) {
      this.updateBaselineAI(this.p2Pos, this.p2MoveTarget, 2, dt);
    } else {
      const boundX = this.isDoubles ? ITF_COURT.HALF_DOUBLES_WIDTH : ITF_COURT.HALF_SINGLES_WIDTH;
      this.p2Pos.x = THREE.MathUtils.clamp(
        this.p2Pos.x + this.p2Input.x * moveSpeed * dt,
        -boundX,
        boundX
      );
      this.p2Pos.z = THREE.MathUtils.clamp(
        this.p2Pos.z + this.p2Input.z * moveSpeed * dt,
        -(ITF_COURT.HALF_LENGTH + 2.5),
        -1.0
      );
    }

    // 3. Update Doubles Partner AI (P3 and P4)
    if (this.isDoubles) {
      // P3 (Team 1 Net Player)
      this.updateNetPlayerAI(this.p3Pos, this.p3MoveTarget, 3, 1, dt);
      // P4 (Team 2 Net Player)
      this.updateNetPlayerAI(this.p4Pos, this.p4MoveTarget, 4, 2, dt);
    }

    // Footstep squeak audio when running
    const isP1Running = Math.abs(this.p1Input.x) > 0.3 || Math.abs(this.p1Input.z) > 0.3;
    if (isP1Running && this.footstepTimer > 0.32) {
      this.footstepTimer = 0;
      sound.playFootstepSqueak(this.courtSurface);
    }

    // Sync 3D player positions
    this.scene3D.player1.root.position.copy(this.p1Pos);
    this.scene3D.player2.root.position.copy(this.p2Pos);
    if (this.isDoubles) {
      this.scene3D.player3.root.position.copy(this.p3Pos);
      this.scene3D.player4.root.position.copy(this.p4Pos);
    }

    // Stride animation triggers
    this.scene3D.player1.animState.isRunning =
      Math.abs(this.p1Input.x) > 0.1 || Math.abs(this.p1Input.z) > 0.1 || this.p1Pos.distanceTo(this.p1MoveTarget) > 0.4;
    this.scene3D.player2.animState.isRunning =
      Math.abs(this.p2Input.x) > 0.1 || Math.abs(this.p2Input.z) > 0.1 || this.p2Pos.distanceTo(this.p2MoveTarget) > 0.4;

    this.scene3D.updatePlayerAnimation(this.scene3D.player1, dt);
    this.scene3D.updatePlayerAnimation(this.scene3D.player2, dt);
    if (this.isDoubles) {
      this.scene3D.player3.animState.isRunning = this.p3Pos.distanceTo(this.p3MoveTarget) > 0.3;
      this.scene3D.player4.animState.isRunning = this.p4Pos.distanceTo(this.p4MoveTarget) > 0.3;
      this.scene3D.updatePlayerAnimation(this.scene3D.player3, dt);
      this.scene3D.updatePlayerAnimation(this.scene3D.player4, dt);
    }

    // 4. Pre-Serve Hand-Attachment & Ball Physics
    if (this.phase === 'serve_ready') {
      const isTeam1 = this.currentServerTeam === 1;
      const serverPos = isTeam1 ? this.p1Pos : this.p2Pos;
      // Ball is physically resting in server's left hand!
      const handOffsetX = isTeam1 ? -0.32 : 0.32;
      const handOffsetZ = isTeam1 ? -0.28 : 0.28;
      const handOffsetY = 1.15;

      this.ballPhysics.reset(
        new THREE.Vector3(serverPos.x + handOffsetX, handOffsetY, serverPos.z + handOffsetZ),
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, 0)
      );
      this.scene3D.ballMesh.position.copy(this.ballPhysics.state.pos);
      this.scene3D.ballShadow.position.set(this.ballPhysics.state.pos.x, 0.02, this.ballPhysics.state.pos.z);

      // AI Server automatic serve after realistic setup pause
      if (this.currentServerTeam === 2 && this.p2Config.isAI) {
        this.cpuServeTimer += dt;
        if (this.cpuServeTimer > 1.25) {
          this.cpuServeTimer = 0;
          this.tossAndHitServe(2, 'SERVE', 3);
        }
      }
    } else if (this.phase === 'serve_toss') {
      // 2-step service toss: ball ascends into the hitting zone under natural ballistics
      this.ballPhysics.step(dt, undefined, undefined, this.isDoubles);
      this.scene3D.ballMesh.position.copy(this.ballPhysics.state.pos);
      this.scene3D.ballShadow.position.set(this.ballPhysics.state.pos.x, 0.02, this.ballPhysics.state.pos.z);

      // If ball falls back down without being struck, return ball to hand
      if (this.ballPhysics.state.pos.y <= 0.6 && this.ballPhysics.state.vel.y < 0) {
        this.phase = 'serve_ready';
        this.cancelCharging();
      }
    } else if (this.phase === 'in_rally') {
      this.ballPhysics.step(
        dt,
        () => {
          sound.playNetCordTick();
          this.scene3D.triggerImpactPuff(this.ballPhysics.state.pos, 0xffffff);
        },
        (impactPos, isCourtIn) => {
          this.handleBallBounce(impactPos, isCourtIn);
        },
        this.isDoubles
      );

      this.scene3D.ballMesh.position.copy(this.ballPhysics.state.pos);
      this.checkRallyRules();
    }

    // 5. Active Hold-to-Charge Power Meter Oscillation (0% -> 100% -> 0%)
    if (this.chargingPlayer !== null) {
      this.chargeElapsed += dt;
      const cycle = this.getGaugeCycleTime();
      const phase = (this.chargeElapsed % cycle) / cycle;
      let rawPower = phase <= 0.5 ? phase * 2.0 : (1.0 - phase) * 2.0;
      rawPower = Math.max(0.04, Math.min(1.0, rawPower));

      const powerLevel = Math.min(5, Math.max(1, Math.round(rawPower * 4) + 1)) as PowerLevel;
      const isSafe = rawPower >= this.safeZoneMin && rawPower <= this.safeZoneMax;

      const pModel = this.chargingPlayer === 1 ? this.scene3D.player1 : this.scene3D.player2;
      pModel.animState.isCharging = true;
      pModel.animState.chargingShot = this.chargingShotType;
      pModel.animState.chargeProgress = rawPower;

      const screenPos = this.scene3D.getPlayerScreenPosition(this.chargingPlayer);

      if (this.callbacks.onChargingUpdate) {
        this.callbacks.onChargingUpdate({
          playerId: this.chargingPlayer,
          isCharging: true,
          progress: rawPower,
          rawPower,
          powerLevel,
          shotType: this.chargingShotType,
          safeZoneMin: this.safeZoneMin,
          safeZoneMax: this.safeZoneMax,
          isSafe,
          screenPos,
        });
      }
    }
  }

  /**
   * AI logic for Baseline players
   */
  private updateBaselineAI(
    pos: THREE.Vector3,
    target: THREE.Vector3,
    playerId: 2,
    dt: number
  ) {
    const isBallApproaching = this.ballPhysics.state.vel.z < 0;

    if (this.phase === 'in_rally' && isBallApproaching) {
      // Predict bounce and position for ideal strike
      const timeToReach = Math.max(0.1, (pos.z - this.ballPhysics.state.pos.z) / this.ballPhysics.state.vel.z);
      const predictedX = this.ballPhysics.state.pos.x + this.ballPhysics.state.vel.x * timeToReach;
      const boundX = this.isDoubles ? ITF_COURT.HALF_DOUBLES_WIDTH - 0.4 : ITF_COURT.HALF_SINGLES_WIDTH - 0.4;

      target.x = THREE.MathUtils.clamp(predictedX, -boundX, boundX);
      target.z = -(ITF_COURT.HALF_LENGTH + 0.6);

      // AI Stroke Execution
      const distToBall = pos.distanceTo(this.ballPhysics.state.pos);
      if (distToBall < 3.2 && this.ballPhysics.state.pos.z < -4.0 && this.lastHitterTeam !== 2) {
        // AI chooses optimal contextual shot: Topspin drive, Slice corner, or Lob
        const rand = Math.random();
        let shotType: ShotType = 'FOREHAND';
        if (rand < 0.3) shotType = 'BACKHAND';
        else if (rand < 0.45 && Math.abs(this.p1Pos.z) < 4.0) shotType = 'LOB';

        const contextualShot = this.resolveContextualHit(2, shotType, pos);
        const aimX = (Math.random() - 0.5) * 1.8;
        const power = (Math.floor(Math.random() * 2) + 3) as PowerLevel;

        this.executeHit(2, contextualShot, power, aimX);
      }
    } else {
      // Return to baseline center ready position
      target.x = 0;
      target.z = -(ITF_COURT.HALF_LENGTH + 0.4);
    }

    this.smoothMovePlayer(pos, target, 7.4, dt);
  }

  /**
   * AI logic for Net Players in 2v2 Doubles
   */
  private updateNetPlayerAI(
    pos: THREE.Vector3,
    target: THREE.Vector3,
    playerId: 3 | 4,
    team: 1 | 2,
    dt: number
  ) {
    const isTeam1 = team === 1;
    const isApproaching = isTeam1 ? this.ballPhysics.state.vel.z > 0 : this.ballPhysics.state.vel.z < 0;
    const baseZ = isTeam1 ? 3.8 : -3.8;

    if (this.phase === 'in_rally' && isApproaching) {
      // Poach if ball is close to net player's side
      const ballNearNet = Math.abs(this.ballPhysics.state.pos.z) < 5.5;
      if (ballNearNet) {
        target.x = THREE.MathUtils.clamp(this.ballPhysics.state.pos.x, -3.2, 3.2);
        target.z = baseZ;

        const distToBall = pos.distanceTo(this.ballPhysics.state.pos);
        if (distToBall < 3.0 && this.lastHitterTeam !== team) {
          // Smash or volley!
          const shotType: ShotType = this.ballPhysics.state.pos.y > 1.5 ? 'SMASH' : 'FOREHAND';
          const aimX = (Math.random() - 0.5) * 1.6;
          this.executeHit(playerId, shotType, 4, aimX);
        }
      }
    } else {
      // Guard the net service area
      target.x = isTeam1 ? -2.2 : 2.2;
      target.z = baseZ;
    }

    this.smoothMovePlayer(pos, target, 6.8, dt);
  }

  private smoothMovePlayer(current: THREE.Vector3, target: THREE.Vector3, speed: number, dt: number) {
    const dir = new THREE.Vector3().subVectors(target, current);
    const dist = dir.length();
    if (dist > 0.05) {
      dir.normalize();
      const step = Math.min(dist, speed * dt);
      current.addScaledVector(dir, step);
    }
  }

  /**
   * Ball Ground Bounce Detection & In/Out Assessment
   */
  private handleBallBounce(impactPos: THREE.Vector3, isCourtIn: boolean) {
    const bounceSide: 1 | 2 = impactPos.z > 0 ? 1 : 2;
    sound.playBallBounce(this.courtSurface, this.ballPhysics.state.vel.length() / 25.0);
    this.scene3D.triggerImpactPuff(impactPos, isCourtIn ? 0xd9f99d : 0xf87171);

    if (this.bounceCountThisSide === 0) {
      // First bounce on this side
      this.lastBounceSide = bounceSide;
      this.bounceCountThisSide = 1;
      this.isFirstBounceInCourt = isCourtIn;

      // Check if service bounce is legal
      if (this.rallyCount === 1) {
        const isServerP1 = this.currentServerTeam === 1;
        const validSide = isServerP1 ? 2 : 1;

        if (bounceSide !== validSide) {
          this.awardPoint(isServerP1 ? 2 : 1, 'Fault: Ball landed on server side');
          return;
        }

        // Must land inside service box (within 6.4m of net and within half singles width)
        const inServiceBoxZ = Math.abs(impactPos.z) <= ITF_COURT.SERVICE_LINE_DIST;
        const inServiceBoxX = Math.abs(impactPos.x) <= ITF_COURT.SERVICE_BOX_WIDTH;
        const isCorrectDiagonal = this.servingSide === 'right'
          ? (isServerP1 ? impactPos.x < 0 : impactPos.x > 0)
          : (isServerP1 ? impactPos.x > 0 : impactPos.x < 0);

        if (!inServiceBoxZ || !inServiceBoxX || !isCorrectDiagonal) {
          this.handleServeFault();
          return;
        }
      }

      // In regular rally, if first bounce is OUT, hitter committed an error!
      if (!isCourtIn && this.lastHitterTeam !== null) {
        const winner: 1 | 2 = this.lastHitterTeam === 1 ? 2 : 1;
        this.awardPoint(winner, 'OUT!');
      }
    } else {
      // Second bounce on same side! Point is over!
      this.bounceCountThisSide = 2;
      const winner: 1 | 2 = bounceSide === 1 ? 2 : 1;
      this.awardPoint(winner, 'Winner: Double Bounce');
    }
  }

  /**
   * Handle Service Fault (1st Serve vs 2nd Serve Double Fault)
   */
  private handleServeFault() {
    sound.playRefereeWhistle('fault');
    sound.speakUmpire('Fault');

    if (!this.isSecondServe) {
      this.isSecondServe = true;
      this.score.announcementText = '1st Serve Fault · 2nd Serve';
      this.callbacks.onScoreUpdate(this.score);
      this.prepareServe();
    } else {
      // Double Fault
      this.isSecondServe = false;
      const pointWinner: 1 | 2 = this.currentServerTeam === 1 ? 2 : 1;
      this.awardPoint(pointWinner, 'Double Fault!');
    }
  }

  private checkRallyRules() {
    // Ball stopped or rolled off screen
    if (this.ballPhysics.state.pos.y < 0.05 && this.ballPhysics.state.vel.length() < 0.2) {
      if (this.lastBounceSide) {
        this.awardPoint(this.lastBounceSide === 1 ? 2 : 1, 'Point');
      }
    }
  }

  /**
   * Award tennis point and update score state according to ITF tennis rules
   */
  public awardPoint(winner: 1 | 2, reason: string) {
    if (this.phase === 'point_ended' || this.phase === 'match_ended') return;
    this.phase = 'point_ended';
    this.isSecondServe = false;

    sound.playCrowdCheer(this.rallyCount > 4 ? 'big' : 'small');
    sound.playRefereeWhistle(reason.includes('OUT') ? 'out' : 'point');

    if (winner === 1) {
      this.applyPointWin(1);
    } else {
      this.applyPointWin(2);
    }

    // Toggle serving side for next point (deuce court <-> ad court)
    this.servingSide = this.servingSide === 'right' ? 'left' : 'right';
    this.score.servingSide = this.servingSide;
    this.score.pointWinner = winner;

    this.callbacks.onScoreUpdate(this.score);

    // Speak umpire score call
    sound.speakUmpire(this.formatUmpireCall());

    // Schedule next serve after 2.2 seconds
    setTimeout(() => {
      if (this.phase !== 'match_ended') {
        this.prepareServe();
      }
    }, 2200);
  }

  private applyPointWin(winner: 1 | 2) {
    const isP1 = winner === 1;

    // Standard Tennis Scoring: 0 -> 15 -> 30 -> 40 -> Game
    if (this.score.isDeuce) {
      if (this.score.advantage === winner) {
        // Won from Advantage -> Win Game
        this.winGame(winner);
      } else if (this.score.advantage === null) {
        // First advantage
        this.score.advantage = winner;
        this.score.announcementText = `Advantage ${winner === 1 ? 'Player 1' : 'Player 2'}`;
      } else {
        // Back to Deuce
        this.score.advantage = null;
        this.score.announcementText = 'Deuce';
      }
      return;
    }

    if (isP1) {
      this.score.pointsP1++;
    } else {
      this.score.pointsP2++;
    }

    // Check Deuce (40-40, i.e. 3-3)
    if (this.score.pointsP1 === 3 && this.score.pointsP2 === 3) {
      this.score.isDeuce = true;
      this.score.advantage = null;
      this.score.announcementText = 'Deuce';
      return;
    }

    // Check Game Win
    if (this.score.pointsP1 >= 4 && this.score.pointsP1 - this.score.pointsP2 >= 2) {
      this.winGame(1);
    } else if (this.score.pointsP2 >= 4 && this.score.pointsP2 - this.score.pointsP1 >= 2) {
      this.winGame(2);
    } else {
      const p1Str = ['0', '15', '30', '40'][this.score.pointsP1] || '40';
      const p2Str = ['0', '15', '30', '40'][this.score.pointsP2] || '40';
      this.score.announcementText = `${p1Str} - ${p2Str}`;
    }
  }

  private winGame(winner: 1 | 2) {
    if (winner === 1) {
      this.score.gamesP1++;
    } else {
      this.score.gamesP2++;
    }

    this.score.pointsP1 = 0;
    this.score.pointsP2 = 0;
    this.score.isDeuce = false;
    this.score.advantage = null;

    // Switch server on game win
    this.currentServerTeam = this.currentServerTeam === 1 ? 2 : 1;
    this.score.currentServer = this.currentServerTeam;
    this.servingSide = 'right';
    this.score.servingSide = 'right';

    // Check Set Win (First to 6 games, lead by 2)
    if (this.score.gamesP1 >= 6 && this.score.gamesP1 - this.score.gamesP2 >= 2) {
      this.winSet(1);
    } else if (this.score.gamesP2 >= 6 && this.score.gamesP2 - this.score.gamesP1 >= 2) {
      this.winSet(2);
    } else {
      const winnerName = winner === 1 ? 'Player 1' : 'Player 2';
      this.score.announcementText = `Game ${winnerName} (${this.score.gamesP1} - ${this.score.gamesP2})`;
    }
  }

  private winSet(winner: 1 | 2) {
    if (winner === 1) {
      this.score.setsP1++;
    } else {
      this.score.setsP2++;
    }

    this.score.gamesP1 = 0;
    this.score.gamesP2 = 0;

    if (this.score.setsP1 >= 2 || this.score.setsP2 >= 2) {
      // Match Won!
      this.phase = 'match_ended';
      this.score.matchWinner = winner;
      this.score.announcementText = `CHAMPIONSHIP MATCH WON BY ${winner === 1 ? 'PLAYER 1' : 'PLAYER 2'}!`;
      this.callbacks.onMatchComplete(winner, this.stats);
    } else {
      this.score.announcementText = `Set won by ${winner === 1 ? 'Player 1' : 'Player 2'}!`;
    }
  }

  private formatUmpireCall(): string {
    if (this.score.matchWinner) return 'Game, Set, Match!';
    if (this.score.isDeuce) {
      if (this.score.advantage === 1) return 'Advantage Player 1';
      if (this.score.advantage === 2) return 'Advantage Player 2';
      return 'Deuce';
    }
    const p1 = ['Love', '15', '30', '40'][this.score.pointsP1] || '40';
    const p2 = ['Love', '15', '30', '40'][this.score.pointsP2] || '40';
    if (p1 === p2) return `${p1} All`;
    return `${p1} - ${p2}`;
  }

  public restart() {
    this.score = {
      pointsP1: 0,
      pointsP2: 0,
      isDeuce: false,
      advantage: null,
      gamesP1: 0,
      gamesP2: 0,
      setsP1: 0,
      setsP2: 0,
      currentServer: 1,
      servingSide: 'right',
      pointWinner: null,
      matchWinner: null,
      announcementText: 'Ready to Serve',
    };
    this.phase = 'serve_ready';
    this.rallyCount = 0;
    this.isSecondServe = false;
    this.prepareServe();
  }

  public dispose() {
    this.destroy();
  }

  public destroy() {
    if (this.motionUnsubscribe) {
      this.motionUnsubscribe();
      this.motionUnsubscribe = null;
    }
  }
}
