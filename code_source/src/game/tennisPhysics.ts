/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { CourtSurface, ShotType, PowerLevel } from '../types/game';

/**
 * Official International Tennis Federation (ITF) Court Dimensions (in meters)
 */
export const ITF_COURT = {
  // Court boundaries
  LENGTH: 23.77, // Total length (78 ft)
  HALF_LENGTH: 11.885,
  DOUBLES_WIDTH: 10.97, // Doubles court width (36 ft)
  HALF_DOUBLES_WIDTH: 5.485,
  SINGLES_WIDTH: 8.23, // Singles court width (27 ft)
  HALF_SINGLES_WIDTH: 4.115,

  // Service boxes
  SERVICE_LINE_DIST: 6.40, // 21 ft from net
  SERVICE_BOX_WIDTH: 4.115,

  // Net specifications
  NET_HEIGHT_CENTER: 0.914, // 3 ft at center
  NET_HEIGHT_POST: 1.07, // 3.5 ft at posts
  NET_POST_OFFSET: 0.914, // 3 ft outside doubles line
  NET_WIDTH: 10.97 + 2 * 0.914, // 12.798 m

  // Standard runoff enclosure
  RUNOFF_BASELINE: 6.40, // standard runoff behind baseline
  RUNOFF_SIDE: 3.66, // standard runoff outside doubles line
  SURROUND_LENGTH: 23.77 + 2 * 6.40, // 36.57 m
  SURROUND_WIDTH: 10.97 + 2 * 3.66, // 18.29 m

  // Line dimensions
  LINE_WIDTH_STANDARD: 0.05, // 5 cm
  LINE_WIDTH_BASELINE: 0.08, // up to 10 cm
  CENTER_MARK_LENGTH: 0.10, // 4 in
} as const;

/**
 * Aerodynamic & Ballistic Constants for a standard ITF-approved tennis ball
 * Mass = ~58 grams, Diameter = ~6.7 cm
 */
export const TENNIS_BALL = {
  MASS: 0.0577, // kg (57.7 grams)
  RADIUS: 0.0335, // m (diameter 6.7 cm)
  AREA: Math.PI * 0.0335 * 0.0335, // cross-sectional area
  AIR_DENSITY: 1.225, // kg/m^3 (sea level standard air)
  DRAG_COEFF: 0.55, // Cd for felted tennis ball
  MAGNUS_LIFT_COEFF: 0.28, // Cl coefficient
  SPIN_DECAY_RATE: 0.45, // rad/s decay per second
  GRAVITY: 9.81, // m/s^2
} as const;

/**
 * Surface Restitution and Friction Parameters (Grounded in ITF Court Pace Rating studies)
 */
export interface SurfaceProperties {
  restitutionY: number; // Coefficient of restitution (bounce height)
  frictionXZ: number; // Surface friction (horizontal speed retention)
  spinBite: number; // Grip transforming horizontal speed into spin change
  colorInner: number;
  colorOuter: number;
  name: string;
}

export const COURT_SURFACES: Record<CourtSurface, SurfaceProperties> = {
  hard: {
    restitutionY: 0.74,
    frictionXZ: 0.88,
    spinBite: 0.35,
    colorInner: 0x1d4ed8, // Vibrant blue
    colorOuter: 0x15803d, // Classic tournament green
    name: 'Hard Court',
  },
  clay: {
    restitutionY: 0.71,
    frictionXZ: 0.80, // High slide / decelerates forward velocity
    spinBite: 0.52, // Extreme bite for topspin kicks and drop shots
    colorInner: 0xc2410c, // Roland-Garros terracotta
    colorOuter: 0x9a3412,
    name: 'Clay Court',
  },
  grass: {
    restitutionY: 0.65, // Lower, fast skidding bounce
    frictionXZ: 0.93, // Low friction / ball slides through
    spinBite: 0.22,
    colorInner: 0x166534, // Deep Wimbledon lawn
    colorOuter: 0x14532d,
    name: 'Grass Court',
  },
};

/**
 * Ball Dynamic State for Numerical Integration
 */
export interface BallState {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  spin: THREE.Vector3; // rad/s around (x=top/backspin, y=sidespin, z=rifle)
}

/**
 * Analytical Tennis Ball Aerodynamics & Physics Engine
 * Simulates gravity, aerodynamic drag, Magnus effect, and surface impact restitution
 */
export class TennisBallPhysics {
  public state: BallState;
  private surface: SurfaceProperties;

  constructor(surface: CourtSurface = 'hard') {
    this.surface = COURT_SURFACES[surface];
    this.state = {
      pos: new THREE.Vector3(0, 1.2, 11.5),
      vel: new THREE.Vector3(0, 0, 0),
      spin: new THREE.Vector3(0, 0, 0),
    };
  }

  public setSurface(surface: CourtSurface) {
    this.surface = COURT_SURFACES[surface];
  }

  public getSurface(): SurfaceProperties {
    return this.surface;
  }

  public reset(pos: THREE.Vector3, vel: THREE.Vector3 = new THREE.Vector3(), spin: THREE.Vector3 = new THREE.Vector3()) {
    this.state.pos.copy(pos);
    this.state.vel.copy(vel);
    this.state.spin.copy(spin);
  }

  /**
   * Advances simulation by dt seconds with sub-stepping for extreme ballistic accuracy
   */
  /**
   * Advances simulation by dt seconds with sub-stepping for extreme ballistic accuracy
   */
  public step(
    dt: number,
    onNetCollision?: () => void,
    onCourtBounce?: (impactPos: THREE.Vector3, isCourtIn: boolean) => void,
    isDoubles: boolean = false
  ) {
    // 2 sub-steps per frame to eliminate tunneling through net and floor at speeds > 40 m/s
    const subSteps = 2;
    const subDt = dt / subSteps;

    for (let s = 0; s < subSteps; s++) {
      this.integrateBallistics(subDt);

      // Check net collision at z = 0
      const prevZ = this.state.pos.z - this.state.vel.z * subDt;
      if ((prevZ < 0 && this.state.pos.z >= 0) || (prevZ > 0 && this.state.pos.z <= 0)) {
        // Net height varies parabolically from center (0.914m) to posts (1.07m)
        const netW = ITF_COURT.NET_WIDTH / 2;
        if (Math.abs(this.state.pos.x) <= netW) {
          const lateralRatio = Math.min(1.0, Math.abs(this.state.pos.x) / (ITF_COURT.DOUBLES_WIDTH / 2));
          const currentNetH = THREE.MathUtils.lerp(ITF_COURT.NET_HEIGHT_CENTER, ITF_COURT.NET_HEIGHT_POST, lateralRatio * lateralRatio);

          if (this.state.pos.y <= currentNetH) {
            // Hit the net cord or mesh!
            this.state.vel.z *= -0.22;
            this.state.vel.x *= 0.4;
            this.state.vel.y = Math.max(0.5, this.state.vel.y * 0.3);
            this.state.spin.multiplyScalar(0.2);
            if (onNetCollision) onNetCollision();
            return;
          }
        }
      }

      // Check ground bounce
      const ballRadius = TENNIS_BALL.RADIUS;
      if (this.state.pos.y <= ballRadius) {
        this.state.pos.y = ballRadius;

        // Check if inside court boundary (singles vs doubles alley)
        const courtHalfWidth = isDoubles ? ITF_COURT.HALF_DOUBLES_WIDTH : ITF_COURT.HALF_SINGLES_WIDTH;
        const isWithinCourtX = Math.abs(this.state.pos.x) <= courtHalfWidth;
        const isWithinCourtZ = Math.abs(this.state.pos.z) <= ITF_COURT.HALF_LENGTH;
        const isCourtIn = isWithinCourtX && isWithinCourtZ;

        // Restitution & Spin-to-bounce translation
        // Topspin increases horizontal speed after bounce and kicks upward
        // Backspin bites into court, lowering horizontal speed and shallowing bounce
        const spinX = this.state.spin.x; // rad/s
        const kickFactor = 1.0 + THREE.MathUtils.clamp(spinX * 0.003, -0.2, 0.25);

        this.state.vel.y = Math.abs(this.state.vel.y) * this.surface.restitutionY * kickFactor;
        this.state.vel.x *= this.surface.frictionXZ;
        this.state.vel.z *= this.surface.frictionXZ;

        // Spin decay on bounce
        this.state.spin.x *= (1.0 - this.surface.spinBite);
        this.state.spin.y *= 0.5;

        if (onCourtBounce) {
          onCourtBounce(this.state.pos.clone(), isCourtIn);
        }
      }
    }
  }

  /**
   * Aerodynamic forces: Gravity + Air Drag + Magnus Effect
   */
  private integrateBallistics(dt: number) {
    const v = this.state.vel;
    const speed = v.length();

    // 1. Gravity (downward -y)
    const acc = new THREE.Vector3(0, -TENNIS_BALL.GRAVITY, 0);

    if (speed > 0.05) {
      // 2. Quadratic Drag Force: F_drag = 0.5 * rho * Cd * A * v^2
      // a_drag = F_drag / m
      const dragMag = (0.5 * TENNIS_BALL.AIR_DENSITY * TENNIS_BALL.DRAG_COEFF * TENNIS_BALL.AREA * speed * speed) / TENNIS_BALL.MASS;
      const dragAcc = v.clone().normalize().multiplyScalar(-dragMag);
      acc.add(dragAcc);

      // 3. Magnus Lift Force: F_magnus = 0.5 * rho * Cl * A * v * (omega x v) / |v|
      // Topspin (omega_x > 0 when travelling -z) exerts downward acceleration
      const spinSpeed = this.state.spin.length();
      if (spinSpeed > 1.0) {
        const magnusDir = new THREE.Vector3().crossVectors(this.state.spin, v).normalize();
        const liftMag = (0.5 * TENNIS_BALL.AIR_DENSITY * TENNIS_BALL.MAGNUS_LIFT_COEFF * TENNIS_BALL.AREA * speed * Math.min(speed, 35.0)) / TENNIS_BALL.MASS;
        const liftAcc = magnusDir.multiplyScalar(liftMag * Math.min(1.0, spinSpeed / 40.0));
        acc.add(liftAcc);
      }
    }

    // Semi-implicit Euler integration
    v.x += acc.x * dt;
    v.y += acc.y * dt;
    v.z += acc.z * dt;

    this.state.pos.x += v.x * dt;
    this.state.pos.y += v.y * dt;
    this.state.pos.z += v.z * dt;

    // Gradual air spin decay
    this.state.spin.multiplyScalar(Math.max(0, 1.0 - TENNIS_BALL.SPIN_DECAY_RATE * dt));
  }

  /**
   * Compute realistic launch parameters for distinct tennis shot types
   */
  public static calculateShotVelocity(
    shotType: ShotType,
    power: PowerLevel | number,
    hitter: 1 | 2,
    targetAimX: number, // -1 (far left) to +1 (far right)
    hitterPos: THREE.Vector3,
    isDoubles: boolean = false
  ): { vel: THREE.Vector3; spin: THREE.Vector3 } {
    // Direction along Z: Team 1 (z > 0) shoots towards negative Z; Team 2 (z < 0) shoots towards positive Z
    const dirZ = hitter === 1 ? -1 : 1;

    // Power scaling: power 1 (gentle) to 5 (crushing winner)
    const powerScale = 0.75 + (power / 5) * 0.55; // 0.86 to 1.30

    let baseSpeed = 26.0; // m/s
    let launchAngleDeg = 6.0; // degrees above horizontal
    let spinX = 0; // rad/s topspin (+) or backspin (-)
    let targetDistZ = 10.0; // approx distance past net

    switch (shotType) {
      case 'SERVE':
        baseSpeed = 34.0 * powerScale; // ~120 - 165 km/h
        launchAngleDeg = -2.5; // Driven downward from height
        spinX = 18.0;
        targetDistZ = 5.0; // into service box
        break;

      case 'SMASH':
        baseSpeed = 38.0 * powerScale;
        launchAngleDeg = -5.0; // Angled aggressively into court
        spinX = 25.0;
        targetDistZ = 8.0;
        break;

      case 'LOB':
        baseSpeed = 19.5 * powerScale;
        launchAngleDeg = 44.0; // High arc clearing opponent at net
        spinX = 12.0;
        targetDistZ = 10.8;
        break;

      case 'DROP':
        // Soft touch landing barely over the net with heavy backspin
        baseSpeed = 14.5 * (0.8 + (power / 5) * 0.3);
        launchAngleDeg = 18.0;
        spinX = -52.0; // Extreme backspin to check bounce
        targetDistZ = 2.6;
        break;

      case 'BACKHAND':
        // Elegant driving slice / slice return
        baseSpeed = 23.5 * powerScale;
        launchAngleDeg = 8.5;
        spinX = -32.0; // Backspin floating over net
        targetDistZ = 9.8;
        break;

      case 'FOREHAND':
      default:
        // Modern heavy topspin drive
        baseSpeed = 27.5 * powerScale;
        launchAngleDeg = 9.0;
        spinX = 42.0; // Heavy topspin causing Magnus dive
        targetDistZ = 10.2;
        break;
    }

    // Convert launch angle and lateral aim to 3D velocity vector
    const launchRad = THREE.MathUtils.degToRad(launchAngleDeg);
    const speed = baseSpeed;

    const velY = speed * Math.sin(launchRad);
    const horizSpeed = speed * Math.cos(launchRad);

    // Lateral aiming: wider limits in doubles court
    const maxCourtX = isDoubles ? 4.8 : 3.5;
    const targetX = THREE.MathUtils.clamp(targetAimX * (isDoubles ? 4.5 : 3.3), -maxCourtX, maxCourtX);

    const estimatedDistZ = Math.abs(hitterPos.z) + targetDistZ;
    const estimatedTime = Math.max(0.35, estimatedDistZ / horizSpeed);
    const velX = (targetX - hitterPos.x) / estimatedTime;

    const velZ = dirZ * Math.sqrt(Math.max(10, horizSpeed * horizSpeed - velX * velX));

    return {
      vel: new THREE.Vector3(velX, velY, velZ),
      spin: new THREE.Vector3(dirZ * spinX, targetAimX * 8.0, 0),
    };
  }

  /**
   * Predictive Trajectory AI
   * Fast-forward analytical ballistic simulation predicting where the ball lands
   */
  public static predictTrajectory(
    shotType: ShotType,
    power: PowerLevel | number,
    hitterTeam: 1 | 2,
    targetAimX: number,
    hitterPos: THREE.Vector3,
    isDoubles: boolean = false
  ): {
    landingX: number;
    landingZ: number;
    clearsNet: boolean;
    netClearance: number;
    isCourtIn: boolean;
    flightTime: number;
  } {
    const shot = TennisBallPhysics.calculateShotVelocity(
      shotType,
      power,
      hitterTeam,
      targetAimX,
      hitterPos,
      isDoubles
    );

    let posX = hitterPos.x;
    let posY = hitterPos.y + (shotType === 'SERVE' ? 0.8 : 0.4);
    let posZ = hitterPos.z;

    let velX = shot.vel.x;
    let velY = shot.vel.y;
    let velZ = shot.vel.z;

    const spin = shot.spin.clone();
    const simDt = 0.02; // 50 Hz fast simulation
    let flightTime = 0;
    let clearsNet = true;
    let netClearance = 0.5;

    const netW = ITF_COURT.NET_WIDTH / 2;
    let checkedNet = false;

    // Simulate up to 2.5 seconds of ballistic flight
    for (let i = 0; i < 125; i++) {
      flightTime += simDt;
      const speed = Math.sqrt(velX * velX + velY * velY + velZ * velZ);

      // Gravity
      let accX = 0;
      let accY = -TENNIS_BALL.GRAVITY;
      let accZ = 0;

      if (speed > 0.05) {
        // Drag
        const dragMag =
          (0.5 * TENNIS_BALL.AIR_DENSITY * TENNIS_BALL.DRAG_COEFF * TENNIS_BALL.AREA * speed * speed) /
          TENNIS_BALL.MASS;
        accX -= (velX / speed) * dragMag;
        accY -= (velY / speed) * dragMag;
        accZ -= (velZ / speed) * dragMag;

        // Magnus effect
        const spinSpeed = spin.length();
        if (spinSpeed > 1.0) {
          const cx = spin.y * velZ - spin.z * velY;
          const cy = spin.z * velX - spin.x * velZ;
          const cz = spin.x * velY - spin.y * velX;
          const cLen = Math.sqrt(cx * cx + cy * cy + cz * cz) || 1;
          const magnusMag =
            (0.5 * TENNIS_BALL.AIR_DENSITY * TENNIS_BALL.MAGNUS_LIFT_COEFF * TENNIS_BALL.AREA * speed * spinSpeed) /
            TENNIS_BALL.MASS;
          accX += (cx / cLen) * magnusMag;
          accY += (cy / cLen) * magnusMag;
          accZ += (cz / cLen) * magnusMag;
        }
      }

      velX += accX * simDt;
      velY += accY * simDt;
      velZ += accZ * simDt;

      const prevZ = posZ;
      posX += velX * simDt;
      posY += velY * simDt;
      posZ += velZ * simDt;

      // Net crossing check at z=0
      if (!checkedNet && ((prevZ < 0 && posZ >= 0) || (prevZ > 0 && posZ <= 0))) {
        checkedNet = true;
        if (Math.abs(posX) <= netW) {
          const lateralRatio = Math.min(1.0, Math.abs(posX) / (ITF_COURT.DOUBLES_WIDTH / 2));
          const netH = THREE.MathUtils.lerp(
            ITF_COURT.NET_HEIGHT_CENTER,
            ITF_COURT.NET_HEIGHT_POST,
            lateralRatio * lateralRatio
          );
          netClearance = posY - netH;
          if (netClearance <= 0.02) {
            clearsNet = false;
          }
        }
      }

      // Ground hit at y <= ballRadius
      if (posY <= TENNIS_BALL.RADIUS) {
        break;
      }
    }

    const courtHalfW = isDoubles ? ITF_COURT.HALF_DOUBLES_WIDTH : ITF_COURT.HALF_SINGLES_WIDTH;
    const isOpponentSide = hitterTeam === 1 ? posZ < 0 : posZ > 0;
    const isWithinX = Math.abs(posX) <= courtHalfW + 0.05;

    let isWithinZ = false;
    if (shotType === 'SERVE') {
      isWithinZ = isOpponentSide && Math.abs(posZ) <= ITF_COURT.SERVICE_LINE_DIST + 0.1;
    } else {
      isWithinZ = isOpponentSide && Math.abs(posZ) <= ITF_COURT.HALF_LENGTH + 0.15;
    }

    const isCourtIn = clearsNet && isWithinX && isWithinZ;

    return {
      landingX: posX,
      landingZ: posZ,
      clearsNet,
      netClearance,
      isCourtIn,
      flightTime,
    };
  }

  /**
   * Evaluates the safe power window (Green Zone on the power gauge)
   * Samples power levels to find the exact min and max power bounds that land safely in-court.
   */
  public static calculateSafePowerWindow(
    shotType: ShotType,
    hitterTeam: 1 | 2,
    targetAimX: number,
    hitterPos: THREE.Vector3,
    isDoubles: boolean = false
  ): {
    minSafe: number;
    maxSafe: number;
    sweetSpot: number;
  } {
    let minSafe = 1.0;
    let maxSafe = 0.0;
    let foundSafe = false;

    // Sample discrete points along 0.05 to 1.0
    for (let step = 1; step <= 20; step++) {
      const pFraction = step / 20;
      const powerEquivalent = pFraction * 4.0 + 1.0;
      const pred = TennisBallPhysics.predictTrajectory(
        shotType,
        powerEquivalent,
        hitterTeam,
        targetAimX,
        hitterPos,
        isDoubles
      );

      if (pred.isCourtIn && pred.clearsNet && pred.netClearance > 0.08) {
        if (!foundSafe) {
          minSafe = pFraction;
          foundSafe = true;
        }
        maxSafe = pFraction;
      }
    }

    if (!foundSafe) {
      return { minSafe: 0.35, maxSafe: 0.75, sweetSpot: 0.55 };
    }

    minSafe = Math.max(0.15, minSafe - 0.03);
    maxSafe = Math.min(0.95, maxSafe + 0.03);
    const sweetSpot = (minSafe + maxSafe) / 2;

    return { minSafe, maxSafe, sweetSpot };
  }
}

