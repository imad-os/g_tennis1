/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { motionDSP } from '../services/motionDSPs';
import { sound } from '../services/sound';
import {
  AIDifficulty,
  CourtSurface,
  MatchStats,
  PlayerConfig,
  PowerLevel,
  ScoreState,
  ShotType,
  SwingDetectionEvent,
} from '../types/game';
import { TennisScene3D } from './threeRenderer';

export type GamePhase = 'serve_ready' | 'in_rally' | 'point_ended' | 'match_ended';

export interface TennisMatchCallbacks {
  onScoreUpdate: (score: ScoreState) => void;
  onShotToast: (text: string, type: ShotType, power: PowerLevel) => void;
  onRallyCount: (count: number) => void;
  onMatchComplete: (winner: 1 | 2, stats: MatchStats) => void;
}

export class TennisMatchEngine {
  private scene3D: TennisScene3D;
  private p1Config: PlayerConfig;
  private p2Config: PlayerConfig;
  private courtSurface: CourtSurface;
  private callbacks: TennisMatchCallbacks;

  // Physics state
  public ballPos = new THREE.Vector3(0, 1.2, 11.5);
  public ballVel = new THREE.Vector3(0, 0, 0);
  public p1Pos = new THREE.Vector3(0, 0, 12.0);
  public p2Pos = new THREE.Vector3(0, 0, -12.0);
  private p1MoveTarget = new THREE.Vector3(0, 0, 12.0);
  private p2MoveTarget = new THREE.Vector3(0, 0, -12.0);

  // Match State
  public phase: GamePhase = 'serve_ready';
  public currentServer: 1 | 2 = 1;
  public servingSide: 'right' | 'left' = 'right';
  public lastHitter: 1 | 2 | null = null;
  public bounceCountThisSide: number = 0;
  public bouncePosOnCourt: THREE.Vector3 | null = null;
  public rallyCount: number = 0;

  // Serve state
  public serveTossed: boolean = false;
  public serveTossTime: number = 0;
  public isSecondServe: boolean = false;

  // Manual input state (Gamepad / Keys)
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

  constructor(
    scene3D: TennisScene3D,
    p1Config: PlayerConfig,
    p2Config: PlayerConfig,
    surface: CourtSurface,
    callbacks: TennisMatchCallbacks
  ) {
    this.scene3D = scene3D;
    this.p1Config = p1Config;
    this.p2Config = p2Config;
    this.courtSurface = surface;
    this.callbacks = callbacks;

    // Listen to physical phone motion swings
    this.motionUnsubscribe = motionDSP.subscribe((ev) => {
      this.handleMotionSwing(ev);
    });

    this.prepareServe();
  }

  public setCourtSurface(surface: CourtSurface) {
    this.courtSurface = surface;
    this.scene3D.setCourtSurface(surface);
  }

  /**
   * Called when player physically swings phone in Motion mode
   */
  private handleMotionSwing(ev: SwingDetectionEvent) {
    if (this.phase === 'serve_ready') {
      if (this.currentServer === 1) {
        this.tossAndHitServe(1, ev.type, ev.power);
      }
      return;
    }

    if (this.phase !== 'in_rally') return;

    // Check distance between ball and Player 1
    const distToBall = this.p1Pos.distanceTo(this.ballPos);
    // Generous strike zone: ~2.8m radius
    if (distToBall < 3.2 && this.ballVel.z > 0) {
      this.executeHit(1, ev.type, ev.power, this.p1Input.x);
    }
  }

  /**
   * Called when gamepad button / keyboard hit action is triggered
   */
  public handleButtonHit(playerIndex: 1 | 2, shotType: ShotType = 'FOREHAND', power: PowerLevel = 3) {
    if (this.phase === 'serve_ready') {
      if (this.currentServer === playerIndex) {
        this.tossAndHitServe(playerIndex, shotType, power);
      }
      return;
    }

    if (this.phase !== 'in_rally') return;

    const playerPos = playerIndex === 1 ? this.p1Pos : this.p2Pos;
    const isBallApproaching = playerIndex === 1 ? this.ballVel.z > 0 : this.ballVel.z < 0;

    if (playerPos.distanceTo(this.ballPos) < 3.4 && isBallApproaching) {
      const aimDirection = playerIndex === 1 ? this.p1Input.x : this.p2Input.x;
      this.executeHit(playerIndex, shotType, power, aimDirection);
    }
  }

  /**
   * Initiate service
   */
  private tossAndHitServe(player: 1 | 2, shotType: ShotType, power: PowerLevel) {
    this.phase = 'in_rally';
    this.lastHitter = player;
    this.bounceCountThisSide = 0;
    this.bouncePosOnCourt = null;
    this.rallyCount = 1;
    this.callbacks.onRallyCount(this.rallyCount);

    const isP1 = player === 1;
    const playerModel = isP1 ? this.scene3D.player1 : this.scene3D.player2;
    playerModel.animState.swingProgress = 0.01;
    playerModel.animState.swingType = 'SERVE';

    sound.playSwingSwoosh(power);
    sound.playRacketHit(power, 'SERVE');
    this.scene3D.triggerImpactPuff(this.ballPos, 0xccff00);

    // Aim toward diagonal service box
    const targetZ = isP1 ? -4.5 : 4.5;
    const targetX = this.servingSide === 'right' ? (isP1 ? -2.2 : 2.2) : (isP1 ? 2.2 : -2.2);

    const speed = 16.0 + power * 3.5;
    const dx = targetX - this.ballPos.x;
    const dz = targetZ - this.ballPos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const flightTime = dist / speed;

    this.ballVel.set((dx / flightTime), 3.2 + power * 0.5, (dz / flightTime));

    this.callbacks.onShotToast(`SERVE · POWER ${power}/5`, 'SERVE', power);
  }

  /**
   * Execute tennis strike with full physics calculations
   */
  private executeHit(player: 1 | 2, shotType: ShotType, power: PowerLevel, aimHorizontal: number = 0) {
    this.lastHitter = player;
    this.bounceCountThisSide = 0;
    this.bouncePosOnCourt = null;
    this.rallyCount++;
    this.callbacks.onRallyCount(this.rallyCount);

    if (this.rallyCount > this.stats.longestRally) {
      this.stats.longestRally = this.rallyCount;
    }

    if (player === 1 && power > this.stats.maxPowerP1) {
      this.stats.maxPowerP1 = power;
    }

    const isP1 = player === 1;
    const playerModel = isP1 ? this.scene3D.player1 : this.scene3D.player2;
    playerModel.animState.swingProgress = 0.01;
    playerModel.animState.swingType = shotType;

    sound.playSwingSwoosh(power);
    sound.playRacketHit(power, shotType);
    this.scene3D.triggerImpactPuff(this.ballPos, 0xccff00);

    // Aim calculations:
    // Deep shot landing around opponent's baseline (-9m to -11m for P1, 9m to 11m for P2)
    const targetZ = isP1 ? -(8.5 + Math.random() * 2.2) : (8.5 + Math.random() * 2.2);
    // Horizontal aiming: influenced by manual stick or swing lateral angle (-3.2m to +3.2m)
    let targetX = (aimHorizontal * 3.0) + (Math.random() - 0.5) * 1.0;
    if (shotType === 'FOREHAND') targetX -= (isP1 ? 0.8 : -0.8);
    if (shotType === 'BACKHAND') targetX += (isP1 ? 0.8 : -0.8);
    targetX = THREE.MathUtils.clamp(targetX, -3.6, 3.6);

    const speed = 14.0 + power * 3.8;
    const dx = targetX - this.ballPos.x;
    const dz = targetZ - this.ballPos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const flightTime = Math.max(0.4, dist / speed);

    const arcHeight = 3.2 + (5 - power) * 0.4;
    this.ballVel.set(dx / flightTime, arcHeight, dz / flightTime);

    const toastLabel = `${shotType} · PWR ${power}/5`;
    this.callbacks.onShotToast(toastLabel, shotType, power);
  }

  /**
   * Fixed 60Hz physics & game update step
   */
  public update(dt: number) {
    if (this.phase === 'point_ended' || this.phase === 'match_ended') return;

    // 1. Update Player 1 (Bottom, z > 0)
    if (this.p1Config.controller === 'motion') {
      // Auto-run toward incoming ball landing point so user can focus on motion swing
      if (this.ballVel.z > 0 && this.phase === 'in_rally') {
        const estLandingX = THREE.MathUtils.clamp(this.ballPos.x + this.ballVel.x * 0.35, -3.8, 3.8);
        const estLandingZ = THREE.MathUtils.clamp(this.ballPos.z + this.ballVel.z * 0.35, 8.0, 13.0);
        this.p1MoveTarget.set(estLandingX + 0.6, 0, estLandingZ);
      } else {
        // Return to neutral baseline center
        this.p1MoveTarget.set(0, 0, 12.0);
      }
      this.smoothMovePlayer(this.p1Pos, this.p1MoveTarget, 6.5, dt);
    } else {
      // Manual Gamepad / Keyboard movement
      const moveSpeed = 7.5;
      this.p1Pos.x = THREE.MathUtils.clamp(this.p1Pos.x + this.p1Input.x * moveSpeed * dt, -4.2, 4.2);
      this.p1Pos.z = THREE.MathUtils.clamp(this.p1Pos.z + this.p1Input.z * moveSpeed * dt, 4.5, 13.5);
    }

    // 2. Update Player 2 (Top, z < 0)
    if (this.p2Config.isAI) {
      this.updateAI(dt);
    } else {
      // Local 2P manual movement
      const moveSpeed = 7.5;
      this.p2Pos.x = THREE.MathUtils.clamp(this.p2Pos.x + this.p2Input.x * moveSpeed * dt, -4.2, 4.2);
      this.p2Pos.z = THREE.MathUtils.clamp(this.p2Pos.z + this.p2Input.z * moveSpeed * dt, -13.5, -4.5);
    }

    // Update 3D Character models
    this.scene3D.player1.root.position.copy(this.p1Pos);
    this.scene3D.player2.root.position.copy(this.p2Pos);

    this.scene3D.player1.animState.isRunning =
      Math.abs(this.p1Input.x) > 0.1 || Math.abs(this.p1Input.z) > 0.1 || this.p1Pos.distanceTo(this.p1MoveTarget) > 0.4;
    this.scene3D.player2.animState.isRunning =
      Math.abs(this.p2Input.x) > 0.1 || Math.abs(this.p2Input.z) > 0.1 || this.p2Pos.distanceTo(this.p2MoveTarget) > 0.4;

    this.scene3D.updatePlayerAnimation(this.scene3D.player1, dt);
    this.scene3D.updatePlayerAnimation(this.scene3D.player2, dt);

    // 3. Tennis Ball Kinematics
    if (this.phase === 'in_rally') {
      const gravity = 14.5;
      this.ballVel.y -= gravity * dt;

      this.ballPos.x += this.ballVel.x * dt;
      this.ballPos.y += this.ballVel.y * dt;
      this.ballPos.z += this.ballVel.z * dt;

      // Net Collision check at z = 0
      const prevZ = this.ballPos.z - this.ballVel.z * dt;
      if ((prevZ < 0 && this.ballPos.z >= 0) || (prevZ > 0 && this.ballPos.z <= 0)) {
        if (this.ballPos.y < TennisScene3D.NET_HEIGHT && Math.abs(this.ballPos.x) < 4.8) {
          // Ball hit the net!
          sound.playBallBounce(this.courtSurface, 0.4);
          this.ballVel.z *= -0.2;
          this.ballVel.y *= 0.5;
          this.concludePoint(this.lastHitter === 1 ? 2 : 1, 'In the Net');
          return;
        }
      }

      // Court Floor Bounce check
      if (this.ballPos.y <= 0.18) {
        this.ballPos.y = 0.18;
        this.bounceCountThisSide++;
        sound.playBallBounce(this.courtSurface, Math.abs(this.ballVel.y) / 8);
        this.scene3D.triggerImpactPuff(this.ballPos, 0xffffff);

        // Check if inside court boundary
        const isWithinCourtX = Math.abs(this.ballPos.x) <= TennisScene3D.COURT_WIDTH / 2;
        const isWithinCourtZ = Math.abs(this.ballPos.z) <= TennisScene3D.COURT_LENGTH / 2;

        if (!isWithinCourtX || !isWithinCourtZ) {
          // Out of bounds on first bounce
          sound.playRefereeWhistle('out');
          this.concludePoint(this.lastHitter === 1 ? 2 : 1, 'Out of Bounds');
          return;
        }

        // Second bounce = winner
        if (this.bounceCountThisSide >= 2) {
          this.concludePoint(this.lastHitter || 1, 'Winner');
          return;
        }

        // Restitution bounce
        this.ballVel.y = Math.abs(this.ballVel.y) * 0.72;
        this.ballVel.x *= 0.94;
        this.ballVel.z *= 0.94;
      }
    } else if (this.phase === 'serve_ready') {
      // Hold ball at server's hand
      if (this.currentServer === 1) {
        this.ballPos.set(this.p1Pos.x + 0.35, 1.3, this.p1Pos.z - 0.4);
      } else {
        this.ballPos.set(this.p2Pos.x - 0.35, 1.3, this.p2Pos.z + 0.4);
      }
    }

    this.scene3D.ballMesh.position.copy(this.ballPos);
  }

  /**
   * AI logic for opponent
   */
  private updateAI(dt: number) {
    const diff = this.p2Config.difficulty || 'pro';
    const reactionDelay = diff === 'master' ? 0.08 : diff === 'pro' ? 0.16 : 0.28;
    const aiSpeed = diff === 'master' ? 7.2 : diff === 'pro' ? 5.8 : 4.5;

    if (this.phase === 'serve_ready' && this.currentServer === 2) {
      // AI serves automatically after 1.2s delay
      this.p2MoveTarget.set(this.servingSide === 'right' ? 2.0 : -2.0, 0, -12.0);
      this.p2Pos.copy(this.p2MoveTarget);

      if (Math.random() < 0.02) {
        const power: PowerLevel = diff === 'master' ? 4 : 3;
        this.tossAndHitServe(2, 'FOREHAND', power);
      }
      return;
    }

    if (this.ballVel.z < 0 && this.phase === 'in_rally') {
      // Anticipate landing point
      const timeToReach = Math.abs((this.ballPos.z - this.p2Pos.z) / this.ballVel.z);
      const predictedX = THREE.MathUtils.clamp(
        this.ballPos.x + this.ballVel.x * timeToReach + (diff === 'amateur' ? (Math.random() - 0.5) * 1.5 : 0),
        -3.8,
        3.8
      );
      this.p2MoveTarget.set(predictedX - 0.4, 0, -11.5);

      // AI executes shot when in range
      if (this.p2Pos.distanceTo(this.ballPos) < 2.6) {
        const power: PowerLevel = diff === 'master' ? (Math.random() > 0.4 ? 4 : 5) : 3;
        const shotType: ShotType = this.ballPos.x < this.p2Pos.x ? 'FOREHAND' : 'BACKHAND';
        const aim = (Math.random() - 0.5) * 1.8;
        this.executeHit(2, shotType, power, aim);
      }
    } else {
      // Return to center baseline
      this.p2MoveTarget.set(0, 0, -12.0);
    }

    this.smoothMovePlayer(this.p2Pos, this.p2MoveTarget, aiSpeed, dt);
  }

  private smoothMovePlayer(pos: THREE.Vector3, target: THREE.Vector3, speed: number, dt: number) {
    const dirX = target.x - pos.x;
    const dirZ = target.z - pos.z;
    const dist = Math.sqrt(dirX * dirX + dirZ * dirZ);

    if (dist > 0.05) {
      const step = Math.min(dist, speed * dt);
      pos.x += (dirX / dist) * step;
      pos.z += (dirZ / dist) * step;
    }
  }

  /**
   * Conclude rally point and evaluate game/set scores
   */
  private concludePoint(winner: 1 | 2, reason: string) {
    this.phase = 'point_ended';
    this.score.pointWinner = winner;

    if (winner === 1) {
      if (this.lastHitter === 1) {
        sound.playCrowdCheer('big');
        sound.playRefereeWhistle('point');
      }
    } else {
      sound.playRefereeWhistle('point');
    }

    // Tennis Scoring Calculation
    let wonGame = false;
    if (winner === 1) {
      if (this.score.pointsP1 === 3 && this.score.pointsP2 === 3) {
        // Deuce
        if (this.score.advantage === 1) {
          wonGame = true;
        } else if (this.score.advantage === 2) {
          this.score.advantage = null;
        } else {
          this.score.advantage = 1;
        }
      } else if (this.score.pointsP1 === 3 && this.score.pointsP2 < 3) {
        wonGame = true;
      } else {
        this.score.pointsP1++;
        if (this.score.pointsP1 === 3 && this.score.pointsP2 === 3) {
          this.score.isDeuce = true;
        }
      }
    } else {
      if (this.score.pointsP1 === 3 && this.score.pointsP2 === 3) {
        if (this.score.advantage === 2) {
          wonGame = true;
        } else if (this.score.advantage === 1) {
          this.score.advantage = null;
        } else {
          this.score.advantage = 2;
        }
      } else if (this.score.pointsP2 === 3 && this.score.pointsP1 < 3) {
        wonGame = true;
      } else {
        this.score.pointsP2++;
        if (this.score.pointsP1 === 3 && this.score.pointsP2 === 3) {
          this.score.isDeuce = true;
        }
      }
    }

    // Game won check
    if (wonGame) {
      sound.playCrowdCheer('big');
      if (winner === 1) this.score.gamesP1++;
      else this.score.gamesP2++;

      this.score.pointsP1 = 0;
      this.score.pointsP2 = 0;
      this.score.isDeuce = false;
      this.score.advantage = null;

      // Switch server on game win
      this.currentServer = this.currentServer === 1 ? 2 : 1;
      this.score.currentServer = this.currentServer;

      // Set won check (first to 3 games in quick match)
      if (this.score.gamesP1 >= 3 && this.score.gamesP1 - this.score.gamesP2 >= 1) {
        this.score.setsP1++;
        this.endMatch(1);
        return;
      } else if (this.score.gamesP2 >= 3 && this.score.gamesP2 - this.score.gamesP1 >= 1) {
        this.score.setsP2++;
        this.endMatch(2);
        return;
      }
    }

    // Switch serving side between points
    this.servingSide = this.servingSide === 'right' ? 'left' : 'right';
    this.score.servingSide = this.servingSide;

    const pointNameP1 = this.getPointLabel(this.score.pointsP1, 1);
    const pointNameP2 = this.getPointLabel(this.score.pointsP2, 2);
    this.score.announcementText = `${reason} · ${pointNameP1} - ${pointNameP2}`;

    this.callbacks.onScoreUpdate({ ...this.score });

    // Prepare next serve after short delay
    setTimeout(() => {
      if (this.phase !== 'match_ended') {
        this.prepareServe();
      }
    }, 1800);
  }

  private getPointLabel(p: number, playerIndex: 1 | 2): string {
    if (this.score.advantage === playerIndex) return 'AD';
    if (p === 0) return '0';
    if (p === 1) return '15';
    if (p === 2) return '30';
    if (p === 3) return '40';
    return '40';
  }

  private prepareServe() {
    this.phase = 'serve_ready';
    this.bounceCountThisSide = 0;
    this.lastHitter = null;
    this.serveTossed = false;

    // Server position on baseline
    const serverX = this.servingSide === 'right' ? 2.2 : -2.2;
    if (this.currentServer === 1) {
      this.p1Pos.set(serverX, 0, 12.2);
      this.p2Pos.set(-serverX, 0, -12.2);
    } else {
      this.p2Pos.set(serverX, 0, -12.2);
      this.p1Pos.set(-serverX, 0, 12.2);
    }

    this.score.announcementText = `Serve: ${this.currentServer === 1 ? this.p1Config.name : this.p2Config.name}`;
    this.callbacks.onScoreUpdate({ ...this.score });
  }

  private endMatch(winner: 1 | 2) {
    this.phase = 'match_ended';
    this.score.matchWinner = winner;
    this.callbacks.onScoreUpdate({ ...this.score });
    this.callbacks.onMatchComplete(winner, this.stats);
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
      announcementText: 'New Match',
    };
    this.currentServer = 1;
    this.servingSide = 'right';
    this.rallyCount = 0;
    this.prepareServe();
  }

  public dispose() {
    if (this.motionUnsubscribe) {
      this.motionUnsubscribe();
      this.motionUnsubscribe = null;
    }
  }
}
