/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { CameraAngle, CourtSurface, GraphicsConfig, RenderResolution, ScalingFilter, ShotType } from '../types/game';
import { ITF_COURT, COURT_SURFACES } from './tennisPhysics';

// Pre-allocated math objects to avoid garbage collection spikes in 60 FPS TV loop
const _vec3Target = new THREE.Vector3();
const _camDesiredPos = new THREE.Vector3();
const _camLookAt = new THREE.Vector3();

export interface Player3DModel {
  root: THREE.Group;
  pelvis: THREE.Group;
  torso: THREE.Mesh;
  head: THREE.Group;
  headMesh: THREE.Mesh;
  rightShoulder: THREE.Group;
  rightUpperArm: THREE.Mesh;
  rightForearmGroup: THREE.Group;
  rightForearm: THREE.Mesh;
  leftShoulder: THREE.Group;
  leftUpperArm: THREE.Mesh;
  leftForearmGroup: THREE.Group;
  leftForearm: THREE.Mesh;
  rightHip: THREE.Group;
  rightThigh: THREE.Mesh;
  rightKnee: THREE.Group;
  rightShin: THREE.Mesh;
  rightFoot: THREE.Mesh;
  leftHip: THREE.Group;
  leftThigh: THREE.Mesh;
  leftKnee: THREE.Group;
  leftShin: THREE.Mesh;
  leftFoot: THREE.Mesh;
  racket: THREE.Group;
  shadow: THREE.Mesh;
  animState: {
    swingProgress: number; // 0 to 1
    swingType: ShotType | null;
    runCycle: number;
    isRunning: boolean;
    idleTimer: number;
    isCharging: boolean;
    chargingShot: ShotType | null;
    chargeProgress: number;
  };
}

export interface QualityGeometryConfig {
  limbRadialSegments: number;
  headSegmentsW: number;
  headSegmentsH: number;
  torsoSegments: number;
  racketTorusTubular: number;
  racketTorusRadial: number;
  ballSegmentsW: number;
  ballSegmentsH: number;
  postSegments: number;
  shadowSegments: number;
  stadiumCornerSegments: number;
}

export function getQualityGeomConfig(quality: GraphicsConfig['quality']): QualityGeometryConfig {
  switch (quality) {
    case 'fancy':
      // High-polygon round geometry with smooth curved bevels
      return {
        limbRadialSegments: 32,
        headSegmentsW: 32,
        headSegmentsH: 24,
        torsoSegments: 24,
        racketTorusTubular: 16,
        racketTorusRadial: 36,
        ballSegmentsW: 36,
        ballSegmentsH: 32,
        postSegments: 32,
        shadowSegments: 36,
        stadiumCornerSegments: 48,
      };
    case 'high':
      return {
        limbRadialSegments: 18,
        headSegmentsW: 20,
        headSegmentsH: 16,
        torsoSegments: 16,
        racketTorusTubular: 12,
        racketTorusRadial: 24,
        ballSegmentsW: 24,
        ballSegmentsH: 20,
        postSegments: 16,
        shadowSegments: 24,
        stadiumCornerSegments: 24,
      };
    case 'mid':
      return {
        limbRadialSegments: 12,
        headSegmentsW: 14,
        headSegmentsH: 12,
        torsoSegments: 10,
        racketTorusTubular: 8,
        racketTorusRadial: 16,
        ballSegmentsW: 16,
        ballSegmentsH: 12,
        postSegments: 10,
        shadowSegments: 16,
        stadiumCornerSegments: 16,
      };
    case 'low':
      return {
        limbRadialSegments: 7, // visible hexagonal / heptagonal facets
        headSegmentsW: 10,
        headSegmentsH: 8,
        torsoSegments: 7,
        racketTorusTubular: 6,
        racketTorusRadial: 12,
        ballSegmentsW: 10,
        ballSegmentsH: 8,
        postSegments: 6,
        shadowSegments: 12,
        stadiumCornerSegments: 8,
      };
    case 'very_low':
    default:
      return {
        limbRadialSegments: 5, // low-poly angular prism
        headSegmentsW: 6,
        headSegmentsH: 6,
        torsoSegments: 5,
        racketTorusTubular: 4,
        racketTorusRadial: 8,
        ballSegmentsW: 8,
        ballSegmentsH: 6,
        postSegments: 4,
        shadowSegments: 8,
        stadiumCornerSegments: 6,
      };
  }
}

export class TennisScene3D {
  private container: HTMLDivElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private dirLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private courtGroup: THREE.Group = new THREE.Group();
  private courtFloor!: THREE.Mesh;
  private courtLines!: THREE.Group;
  private netGroup!: THREE.Group;
  private stadiumGroup!: THREE.Group;

  // 4 Players supported for 1v1 and 2v2 doubles modes
  public player1!: Player3DModel; // Team 1 Server / Baseline
  public player2!: Player3DModel; // Team 2 Receiver / Baseline
  public player3!: Player3DModel; // Team 1 Partner at net
  public player4!: Player3DModel; // Team 2 Partner at net
  public isDoubles: boolean = false;

  public ballMesh!: THREE.Mesh;
  public ballShadow!: THREE.Mesh;
  public impactParticles: THREE.Points[] = [];

  private isDisposed = false;
  private activeSurface: CourtSurface = 'hard';
  private graphicsConfig: GraphicsConfig = {
    quality: 'mid',
    cameraAngle: 'chase',
    cameraZoom: 1.0,
    cameraHeight: 10.0,
    vfxLevel: 'high',
    spectators: true,
    shadows: false,
    pixelRatio: 1.0,
    gaugeSpeed: 'balanced',
    renderResolution: 'auto',
    scalingFilter: 'smooth',
  };

  constructor(container: HTMLDivElement) {
    this.container = container;

    // 1. Three.js Scene with Atmosphere
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x060c18);
    this.scene.fog = new THREE.FogExp2(0x060c18, 0.012);

    // 2. Camera Setup: 42° FOV gives natural perspective without fisheye distortion
    const aspect = container.clientWidth / container.clientHeight || 16 / 9;
    this.camera = new THREE.PerspectiveCamera(42, aspect, 0.5, 130);
    this.updateCameraInstant();

    // 3. TV-Optimized WebGL Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.setPixelRatio(1.0);
    this.renderer.shadowMap.enabled = false;

    container.appendChild(this.renderer.domElement);
    this.applyResolutionAndScaling();

    // 4. Lighting: Clean 2-point setup with balanced fill
    this.hemiLight = new THREE.HemisphereLight(0xffffff, 0x1e293b, 0.95);
    this.scene.add(this.hemiLight);

    this.dirLight = new THREE.DirectionalLight(0xfffbeb, 1.45);
    this.dirLight.position.set(12, 22, 14);
    this.scene.add(this.dirLight);

    // 5. Build ITF Regulation Court and Stadium
    this.buildCourt('hard');

    // 6. Build 4 Athletic Humanoid Models (Team 1 cyan/navy, Team 2 red/orange)
    this.buildPlayers();

    // 7. Tennis Ball and Shadow
    this.createTennisBall();

    // Resize listener
    window.addEventListener('resize', this.handleResize);
  }

  public setDoublesMode(isDoubles: boolean) {
    this.isDoubles = isDoubles;
    if (this.player3 && this.player4) {
      this.player3.root.visible = isDoubles;
      this.player4.root.visible = isDoubles;
    }
  }

  private buildPlayers() {
    // Remove existing players if rebuilding on quality change
    if (this.player1) this.scene.remove(this.player1.root);
    if (this.player2) this.scene.remove(this.player2.root);
    if (this.player3) this.scene.remove(this.player3.root);
    if (this.player4) this.scene.remove(this.player4.root);

    const geom = getQualityGeomConfig(this.graphicsConfig.quality);

    // Player 1: Team 1 Lead (Cyan Polo, White Shorts, Caucasian skin, Neon racket)
    this.player1 = this.createHumanoidPlayer(0x06b6d4, 0xffffff, 0xfbd0b2, 0x22c55e, geom);
    this.player1.root.position.set(0, 0, ITF_COURT.HALF_LENGTH + 0.4);

    // Player 2: Team 2 Lead (Red Polo, Slate Shorts, Warm Tan skin, Orange racket)
    this.player2 = this.createHumanoidPlayer(0xef4444, 0x1e293b, 0xe0a98b, 0xf97316, geom);
    this.player2.root.position.set(0, 0, -(ITF_COURT.HALF_LENGTH + 0.4));
    this.player2.root.rotation.y = Math.PI;

    // Player 3: Team 1 Partner at Net (Navy/Teal Polo, Cyan details)
    this.player3 = this.createHumanoidPlayer(0x0284c7, 0xf1f5f9, 0xd49b7a, 0x06b6d4, geom);
    this.player3.root.position.set(-2.4, 0, 3.8); // At net service line
    this.player3.root.visible = this.isDoubles;

    // Player 4: Team 2 Partner at Net (Amber/Orange Polo, Dark Shorts)
    this.player4 = this.createHumanoidPlayer(0xf59e0b, 0x0f172a, 0xf0c0a0, 0xec4899, geom);
    this.player4.root.position.set(2.4, 0, -3.8); // Opponent at net
    this.player4.root.rotation.y = Math.PI;
    this.player4.root.visible = this.isDoubles;
  }

  private createTennisBall() {
    if (this.ballMesh) this.scene.remove(this.ballMesh);
    if (this.ballShadow) this.scene.remove(this.ballShadow);

    const geom = getQualityGeomConfig(this.graphicsConfig.quality);

    const ballGeo = new THREE.SphereGeometry(0.14, geom.ballSegmentsW, geom.ballSegmentsH);
    const ballMat = new THREE.MeshLambertMaterial({ color: 0xd9f99d });

    this.ballMesh = new THREE.Mesh(ballGeo, ballMat);
    this.ballMesh.position.set(0, 1.0, 0);
    this.scene.add(this.ballMesh);

    // Ball contact shadow on court floor
    const shadowGeo = new THREE.CircleGeometry(0.24, geom.shadowSegments);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    this.ballShadow = new THREE.Mesh(shadowGeo, shadowMat);
    this.ballShadow.rotation.x = -Math.PI / 2;
    this.ballShadow.position.y = 0.02;
    this.scene.add(this.ballShadow);
  }

  /**
   * Procedural Athletic Humanoid Model in Realistic Human Proportions (~1.85m tall)
   * Polygon count dynamically dictated by QualityGeometryConfig!
   */
  private createHumanoidPlayer(
    shirtColor: number,
    shortsColor: number,
    skinColor: number,
    racketColor: number,
    geom: QualityGeometryConfig
  ): Player3DModel {
    const root = new THREE.Group();

    // 1. Soft Dynamic Contact Shadow
    const shadowGeo = new THREE.CircleGeometry(0.55, geom.shadowSegments);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    root.add(shadow);

    const skinMat = new THREE.MeshLambertMaterial({ color: skinColor });
    const shirtMat = new THREE.MeshLambertMaterial({ color: shirtColor });
    const shortsMat = new THREE.MeshLambertMaterial({ color: shortsColor });
    const shoeMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const sockMat = new THREE.MeshLambertMaterial({ color: 0xe2e8f0 });

    const radialSegs = geom.limbRadialSegments;

    // 2. Pelvis / Hips Root (height ~0.95m from ground)
    const pelvis = new THREE.Group();
    pelvis.position.y = 0.95;
    root.add(pelvis);

    // Tennis Shorts / Pelvis Mesh
    const pelvisMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.17, 0.22, radialSegs), shortsMat);
    pelvisMesh.position.y = 0.02;
    pelvis.add(pelvisMesh);

    // 3. Torso: Athletic V-Taper (Polo shirt, height ~0.48m, shoulder width ~0.44m, waist ~0.30m)
    const torsoGeo = new THREE.CylinderGeometry(0.22, 0.16, 0.46, geom.torsoSegments);
    const torso = new THREE.Mesh(torsoGeo, shirtMat);
    torso.position.y = 0.32;
    pelvis.add(torso);

    // Shirt Collar
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.06, radialSegs), new THREE.MeshLambertMaterial({ color: 0xffffff }));
    collar.position.y = 0.23;
    torso.add(collar);

    // 4. Head & Neck: Anatomically natural (~0.22m head height)
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.35, 0);

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.07, 0.09, radialSegs), skinMat);
    neck.position.y = -0.02;
    headGroup.add(neck);

    // Athletic Cranium
    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.115, geom.headSegmentsW, geom.headSegmentsH), skinMat);
    headMesh.position.y = 0.10;
    headMesh.scale.set(0.95, 1.1, 1.0);
    headGroup.add(headMesh);

    // Tennis Headband / Sweatband
    const headband = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 0.04, radialSegs),
      new THREE.MeshBasicMaterial({ color: racketColor })
    );
    headband.position.y = 0.15;
    headGroup.add(headband);

    // Visor / Cap Brim forward
    const visorGeo = new THREE.BoxGeometry(0.15, 0.02, 0.12);
    const visorMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const visor = new THREE.Mesh(visorGeo, visorMat);
    visor.position.set(0, 0.15, 0.12);
    visor.rotation.x = 0.15;
    headGroup.add(visor);

    torso.add(headGroup);

    // 5. Dual-Joint Legs (Thigh -> Knee -> Shin -> Ankle & Foot)
    const createLeg = (xOffset: number) => {
      const hipJoint = new THREE.Group();
      hipJoint.position.set(xOffset, -0.05, 0);

      // Thigh
      const thighGroup = new THREE.Group();
      const thighShorts = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.085, 0.22, radialSegs), shortsMat);
      thighShorts.position.y = -0.11;
      thighGroup.add(thighShorts);

      const thighSkin = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.20, radialSegs), skinMat);
      thighSkin.position.y = -0.28;
      thighGroup.add(thighSkin);
      hipJoint.add(thighGroup);

      // Knee Joint
      const kneeJoint = new THREE.Group();
      kneeJoint.position.set(0, -0.38, 0);
      thighGroup.add(kneeJoint);

      // Shin / Calf + White Sock
      const shinGroup = new THREE.Group();
      const calf = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.055, 0.22, radialSegs), skinMat);
      calf.position.y = -0.11;
      shinGroup.add(calf);

      const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.055, 0.18, radialSegs), sockMat);
      sock.position.y = -0.26;
      shinGroup.add(sock);
      kneeJoint.add(shinGroup);

      // Tennis Sneaker (Detailed rubber sole & athletic upper)
      const footGroup = new THREE.Group();
      footGroup.position.set(0, -0.38, 0.06);

      const shoeUpper = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.25), shoeMat);
      footGroup.add(shoeUpper);

      const shoeSole = new THREE.Mesh(
        new THREE.BoxGeometry(0.125, 0.03, 0.26),
        new THREE.MeshLambertMaterial({ color: 0x0284c7 })
      );
      shoeSole.position.y = -0.045;
      footGroup.add(shoeSole);

      shinGroup.add(footGroup);

      return {
        hip: hipJoint,
        thigh: thighSkin,
        knee: kneeJoint,
        shin: calf,
        foot: shoeUpper,
      };
    };

    const rightLegData = createLeg(0.12);
    const leftLegData = createLeg(-0.12);
    pelvis.add(rightLegData.hip);
    pelvis.add(leftLegData.hip);

    // 6. Dual-Joint Arms (Shoulder -> Upper Arm -> Elbow -> Forearm -> Wrist & Hand)
    const createArm = (xOffset: number, isRight: boolean) => {
      const shoulderJoint = new THREE.Group();
      shoulderJoint.position.set(xOffset, 0.18, 0);

      // Deltoid Sleeve
      const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.07, 0.12, radialSegs), shirtMat);
      sleeve.position.y = -0.06;
      shoulderJoint.add(sleeve);

      // Upper Arm (Bicep/Tricep)
      const upperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.055, 0.18, radialSegs), skinMat);
      upperArm.position.y = -0.18;
      shoulderJoint.add(upperArm);

      // Elbow Joint
      const elbowJoint = new THREE.Group();
      elbowJoint.position.set(0, -0.26, 0);
      shoulderJoint.add(elbowJoint);

      // Forearm + Wristband + Hand
      const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.045, 0.22, radialSegs), skinMat);
      forearm.position.y = -0.11;
      elbowJoint.add(forearm);

      // Wristband
      const wristband = new THREE.Mesh(
        new THREE.CylinderGeometry(0.052, 0.052, 0.05, radialSegs),
        new THREE.MeshBasicMaterial({ color: racketColor })
      );
      wristband.position.y = -0.20;
      elbowJoint.add(wristband);

      // Hand
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), skinMat);
      hand.position.set(0, -0.25, 0.02);
      elbowJoint.add(hand);

      return {
        shoulder: shoulderJoint,
        upperArm,
        elbow: elbowJoint,
        forearm,
        hand,
      };
    };

    const rightArmData = createArm(0.25, true);
    const leftArmData = createArm(-0.25, false);
    torso.add(rightArmData.shoulder);
    torso.add(leftArmData.shoulder);

    // 7. Tennis Racket with scalable hoop resolution
    const racket = new THREE.Group();

    // Racket Grip Wrap
    const gripGeo = new THREE.CylinderGeometry(0.022, 0.024, 0.32, radialSegs);
    const gripMat = new THREE.MeshLambertMaterial({ color: 0x1e293b });
    const grip = new THREE.Mesh(gripGeo, gripMat);
    grip.position.y = 0.16;
    racket.add(grip);

    // Racket Throat / Shaft V-shape
    const shaftGeo = new THREE.CylinderGeometry(0.016, 0.02, 0.14, radialSegs);
    const shaftMat = new THREE.MeshLambertMaterial({ color: racketColor });
    const shaft = new THREE.Mesh(shaftGeo, shaftMat);
    shaft.position.y = 0.36;
    racket.add(shaft);

    // Aerodynamic Oval Racket Head Rim (Curved Torus)
    const rimMat = new THREE.MeshLambertMaterial({ color: racketColor });
    const rimGeo = new THREE.TorusGeometry(0.18, 0.016, geom.racketTorusTubular, geom.racketTorusRadial);
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.position.set(0, 0.54, 0);
    rim.scale.set(0.85, 1.15, 1.0); // Isometric tennis oval
    racket.add(rim);

    // String Mesh Face (semi-transparent woven nylon strings)
    const stringMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.5,
    });
    const strings = new THREE.Mesh(new THREE.CircleGeometry(0.17, geom.racketTorusRadial), stringMat);
    strings.position.set(0, 0.54, 0);
    strings.scale.set(0.85, 1.15, 1.0);
    racket.add(strings);

    // Stencil Logo in center of strings
    const stencil = new THREE.Mesh(
      new THREE.PlaneGeometry(0.10, 0.10),
      new THREE.MeshBasicMaterial({ color: racketColor, transparent: true, opacity: 0.7 })
    );
    stencil.position.set(0, 0.54, 0.005);
    racket.add(stencil);

    // Mount racket securely in right hand with athletic grip angle
    racket.position.set(0, -0.25, 0.02);
    racket.rotation.x = Math.PI / 3.5;
    racket.rotation.z = -0.2;
    rightArmData.elbow.add(racket);

    this.scene.add(root);

    return {
      root,
      pelvis,
      torso,
      head: headGroup,
      headMesh,
      rightShoulder: rightArmData.shoulder,
      rightUpperArm: rightArmData.upperArm,
      rightForearmGroup: rightArmData.elbow,
      rightForearm: rightArmData.forearm,
      leftShoulder: leftArmData.shoulder,
      leftUpperArm: leftArmData.upperArm,
      leftForearmGroup: leftArmData.elbow,
      leftForearm: leftArmData.forearm,
      rightHip: rightLegData.hip,
      rightThigh: rightLegData.thigh,
      rightKnee: rightLegData.knee,
      rightShin: rightLegData.shin,
      rightFoot: rightLegData.foot,
      leftHip: leftLegData.hip,
      leftThigh: leftLegData.thigh,
      leftKnee: leftLegData.knee,
      leftShin: leftLegData.shin,
      leftFoot: leftLegData.foot,
      racket,
      shadow,
      animState: {
        swingProgress: 0,
        swingType: null,
        runCycle: 0,
        isRunning: false,
        idleTimer: 0,
        isCharging: false,
        chargingShot: null,
        chargeProgress: 0,
      },
    };
  }

  /**
   * Builds the official ITF Regulation Tennis Court & Stadium
   */
  private buildCourt(surface: CourtSurface) {
    if (this.courtGroup) {
      this.scene.remove(this.courtGroup);
      this.courtGroup.clear();
    }

    this.courtGroup = new THREE.Group();
    this.scene.add(this.courtGroup);

    const geom = getQualityGeomConfig(this.graphicsConfig.quality);
    const surf = COURT_SURFACES[surface];

    // 1. Surrounding Runoff Deck
    const surroundGeo = new THREE.PlaneGeometry(ITF_COURT.SURROUND_WIDTH, ITF_COURT.SURROUND_LENGTH);
    const surroundMat = new THREE.MeshLambertMaterial({ color: surf.colorOuter });
    const surroundMesh = new THREE.Mesh(surroundGeo, surroundMat);
    surroundMesh.rotation.x = -Math.PI / 2;
    surroundMesh.position.y = -0.001;
    this.courtGroup.add(surroundMesh);

    // 2. Play Court Infield (Doubles Area 10.97m x 23.77m)
    const infieldGeo = new THREE.PlaneGeometry(ITF_COURT.DOUBLES_WIDTH, ITF_COURT.LENGTH);
    const infieldMat = new THREE.MeshLambertMaterial({ color: surf.colorInner });
    this.courtFloor = new THREE.Mesh(infieldGeo, infieldMat);
    this.courtFloor.rotation.x = -Math.PI / 2;
    this.courtFloor.position.y = 0.0;
    this.courtGroup.add(this.courtFloor);

    // 3. Official ITF White Boundary Lines
    this.courtLines = new THREE.Group();
    this.courtGroup.add(this.courtLines);

    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const yOffset = 0.004;

    const addLine = (w: number, l: number, x: number, z: number) => {
      const lineGeo = new THREE.PlaneGeometry(w, l);
      const mesh = new THREE.Mesh(lineGeo, lineMat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, yOffset, z);
      this.courtLines.add(mesh);
    };

    const courtHalfW = ITF_COURT.HALF_DOUBLES_WIDTH;
    const courtHalfL = ITF_COURT.HALF_LENGTH;
    const singlesHalfW = ITF_COURT.HALF_SINGLES_WIDTH;
    const standardLineWidth = ITF_COURT.LINE_WIDTH_STANDARD;
    const baselineWidth = ITF_COURT.LINE_WIDTH_BASELINE;

    // Baselines (width 10.97m)
    addLine(ITF_COURT.DOUBLES_WIDTH, baselineWidth, 0, courtHalfL);
    addLine(ITF_COURT.DOUBLES_WIDTH, baselineWidth, 0, -courtHalfL);

    // Center Service Marks
    addLine(standardLineWidth, ITF_COURT.CENTER_MARK_LENGTH, 0, courtHalfL - ITF_COURT.CENTER_MARK_LENGTH / 2);
    addLine(standardLineWidth, ITF_COURT.CENTER_MARK_LENGTH, 0, -courtHalfL + ITF_COURT.CENTER_MARK_LENGTH / 2);

    // Doubles Sidelines
    addLine(standardLineWidth, ITF_COURT.LENGTH, courtHalfW, 0);
    addLine(standardLineWidth, ITF_COURT.LENGTH, -courtHalfW, 0);

    // Singles Sidelines
    addLine(standardLineWidth, ITF_COURT.LENGTH, singlesHalfW, 0);
    addLine(standardLineWidth, ITF_COURT.LENGTH, -singlesHalfW, 0);

    // Service Lines (6.40m from net)
    addLine(ITF_COURT.SINGLES_WIDTH, standardLineWidth, 0, ITF_COURT.SERVICE_LINE_DIST);
    addLine(ITF_COURT.SINGLES_WIDTH, standardLineWidth, 0, -ITF_COURT.SERVICE_LINE_DIST);

    // Center Service Line
    addLine(standardLineWidth, ITF_COURT.SERVICE_LINE_DIST * 2, 0, 0);

    // 4. Regulation Tennis Net & Posts
    this.netGroup = new THREE.Group();
    this.courtGroup.add(this.netGroup);

    const postRadSegs = geom.postSegments;
    const postGeo = new THREE.CylinderGeometry(0.045, 0.05, ITF_COURT.NET_HEIGHT_POST, postRadSegs);
    const postMat = new THREE.MeshLambertMaterial({ color: 0x1e293b });

    const post1 = new THREE.Mesh(postGeo, postMat);
    post1.position.set(courtHalfW + ITF_COURT.NET_POST_OFFSET, ITF_COURT.NET_HEIGHT_POST / 2, 0);
    this.netGroup.add(post1);

    const post2 = new THREE.Mesh(postGeo, postMat);
    post2.position.set(-(courtHalfW + ITF_COURT.NET_POST_OFFSET), ITF_COURT.NET_HEIGHT_POST / 2, 0);
    this.netGroup.add(post2);

    // Top White Net Tape
    const netTapeGeo = new THREE.CylinderGeometry(0.025, 0.025, ITF_COURT.NET_WIDTH, geom.limbRadialSegments);
    const netTapeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const netTape = new THREE.Mesh(netTapeGeo, netTapeMat);
    netTape.rotation.z = Math.PI / 2;
    netTape.position.set(0, ITF_COURT.NET_HEIGHT_CENTER + 0.02, 0);
    this.netGroup.add(netTape);

    // Semi-transparent Micro-Mesh Net Fabric
    const netMeshGeo = new THREE.PlaneGeometry(ITF_COURT.NET_WIDTH, ITF_COURT.NET_HEIGHT_CENTER);
    const netMeshMat = new THREE.MeshBasicMaterial({
      color: 0x0f172a,
      wireframe: true,
      transparent: true,
      opacity: 0.6,
    });
    const netMesh = new THREE.Mesh(netMeshGeo, netMeshMat);
    netMesh.position.set(0, ITF_COURT.NET_HEIGHT_CENTER / 2, 0);
    this.netGroup.add(netMesh);

    // Center Net Strap (White canvas)
    const strapGeo = new THREE.BoxGeometry(0.05, ITF_COURT.NET_HEIGHT_CENTER, 0.02);
    const strapMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const strap = new THREE.Mesh(strapGeo, strapMat);
    strap.position.set(0, ITF_COURT.NET_HEIGHT_CENTER / 2, 0);
    this.netGroup.add(strap);

    // 5. Championship Stadium Surround & Seating
    this.buildStadium(geom);
  }

  private buildStadium(geom: QualityGeometryConfig) {
    if (this.stadiumGroup) {
      this.courtGroup.remove(this.stadiumGroup);
      this.stadiumGroup.clear();
    }

    this.stadiumGroup = new THREE.Group();
    this.courtGroup.add(this.stadiumGroup);

    // Perimeter Court Wall
    const wallHeight = 1.1;
    const wallThickness = 0.35;
    const wallMat = new THREE.MeshLambertMaterial({ color: 0x0f172a });

    const backWallGeo = new THREE.BoxGeometry(ITF_COURT.SURROUND_WIDTH, wallHeight, wallThickness);
    const backWall1 = new THREE.Mesh(backWallGeo, wallMat);
    backWall1.position.set(0, wallHeight / 2, ITF_COURT.SURROUND_LENGTH / 2);
    this.stadiumGroup.add(backWall1);

    const backWall2 = new THREE.Mesh(backWallGeo, wallMat);
    backWall2.position.set(0, wallHeight / 2, -ITF_COURT.SURROUND_LENGTH / 2);
    this.stadiumGroup.add(backWall2);

    const sideWallGeo = new THREE.BoxGeometry(wallThickness, wallHeight, ITF_COURT.SURROUND_LENGTH);
    const sideWall1 = new THREE.Mesh(sideWallGeo, wallMat);
    sideWall1.position.set(ITF_COURT.SURROUND_WIDTH / 2, wallHeight / 2, 0);
    this.stadiumGroup.add(sideWall1);

    const sideWall2 = new THREE.Mesh(sideWallGeo, wallMat);
    sideWall2.position.set(-ITF_COURT.SURROUND_WIDTH / 2, wallHeight / 2, 0);
    this.stadiumGroup.add(sideWall2);

    // Spectator Grandstands (Radial tiered seating)
    if (this.graphicsConfig.spectators) {
      const tierMat = new THREE.MeshLambertMaterial({ color: 0x1e293b });
      const tierGeo = new THREE.BoxGeometry(ITF_COURT.SURROUND_WIDTH + 6, 2.5, 5);

      const northTier = new THREE.Mesh(tierGeo, tierMat);
      northTier.position.set(0, 1.25, -(ITF_COURT.SURROUND_LENGTH / 2 + 3.2));
      this.stadiumGroup.add(northTier);

      const southTier = new THREE.Mesh(tierGeo, tierMat);
      southTier.position.set(0, 1.25, ITF_COURT.SURROUND_LENGTH / 2 + 3.2);
      this.stadiumGroup.add(southTier);

      const sideTierGeo = new THREE.BoxGeometry(6, 2.8, ITF_COURT.SURROUND_LENGTH);
      const leftTier = new THREE.Mesh(sideTierGeo, tierMat);
      leftTier.position.set(-(ITF_COURT.SURROUND_WIDTH / 2 + 3.8), 1.4, 0);
      this.stadiumGroup.add(leftTier);

      const rightTier = new THREE.Mesh(sideTierGeo, tierMat);
      rightTier.position.set(ITF_COURT.SURROUND_WIDTH / 2 + 3.8, 1.4, 0);
      this.stadiumGroup.add(rightTier);
    }

    // Umpire High Chair
    const chairGroup = new THREE.Group();
    chairGroup.position.set(ITF_COURT.HALF_DOUBLES_WIDTH + 1.2, 0, 0);
    const chairLadderMat = new THREE.MeshLambertMaterial({ color: 0x475569 });
    const ladderGeo = new THREE.CylinderGeometry(0.04, 0.05, 2.4, geom.postSegments);
    const ladder1 = new THREE.Mesh(ladderGeo, chairLadderMat);
    ladder1.position.set(-0.25, 1.2, 0);
    const ladder2 = ladder1.clone();
    ladder2.position.x = 0.25;
    chairGroup.add(ladder1);
    chairGroup.add(ladder2);

    const seatMesh = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.1, 0.7), new THREE.MeshLambertMaterial({ color: 0x0284c7 }));
    seatMesh.position.set(0, 2.2, 0);
    chairGroup.add(seatMesh);
    this.stadiumGroup.add(chairGroup);
  }

  public setCourtSurface(surface: CourtSurface) {
    this.activeSurface = surface;
    this.buildCourt(surface);
  }

  public setGraphicsConfig(cfg: Partial<GraphicsConfig>) {
    const prevQuality = this.graphicsConfig.quality;
    const prevRes = this.graphicsConfig.renderResolution;
    const prevFilter = this.graphicsConfig.scalingFilter;
    this.graphicsConfig = { ...this.graphicsConfig, ...cfg };

    if (cfg.quality && cfg.quality !== prevQuality) {
      // Rebuild meshes with new polygon resolution!
      this.buildPlayers();
      this.createTennisBall();
      this.buildCourt(this.activeSurface);
    }

    if (
      (cfg.renderResolution && cfg.renderResolution !== prevRes) ||
      (cfg.scalingFilter && cfg.scalingFilter !== prevFilter)
    ) {
      this.applyResolutionAndScaling();
    }
  }

  public setRenderResolution(res: RenderResolution) {
    this.graphicsConfig.renderResolution = res;
    this.applyResolutionAndScaling();
  }

  public setScalingFilter(filter: ScalingFilter) {
    this.graphicsConfig.scalingFilter = filter;
    this.applyResolutionAndScaling();
  }

  public setCameraZoom(zoom: number) {
    this.graphicsConfig.cameraZoom = THREE.MathUtils.clamp(zoom, 0.6, 1.8);
  }

  public setCameraAngle(angle: CameraAngle) {
    this.graphicsConfig.cameraAngle = angle;
  }

  public setCameraHeight(height: number) {
    this.graphicsConfig.cameraHeight = THREE.MathUtils.clamp(height, 1.0, 50.0);
  }

  public setVFXLevel(level: 'low' | 'medium' | 'high') {
    this.graphicsConfig.vfxLevel = level;
  }

  public getGraphicsConfig(): GraphicsConfig {
    return this.graphicsConfig;
  }

  /**
   * Impact puff particle effects on racket hits and court bounces
   * Respects VFX Level: 'low' removes them all, 'medium' keeps half, 'high' keeps all.
   */
  public triggerImpactPuff(pos: THREE.Vector3, color: number = 0xd9f99d) {
    const vfx = this.graphicsConfig.vfxLevel || 'high';
    if (vfx === 'low') {
      return; // Low removes all sprinkle particles
    }

    const baseCount = this.graphicsConfig.quality === 'fancy' ? 24 : 14;
    const count = vfx === 'medium' ? Math.max(4, Math.round(baseCount * 0.5)) : baseCount;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = pos.x;
      positions[i * 3 + 1] = pos.y;
      positions[i * 3 + 2] = pos.z;

      velocities[i * 3] = (Math.random() - 0.5) * 3.4;
      velocities[i * 3 + 1] = Math.random() * 2.8 + 0.9;
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 3.4;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    (geo as unknown as { userData: { velocities: Float32Array; life: number } }).userData = {
      velocities,
      life: 0.75,
    };

    const mat = new THREE.PointsMaterial({
      color,
      size: this.graphicsConfig.quality === 'fancy' ? 0.16 : 0.13,
      transparent: true,
      opacity: 0.88,
    });

    const points = new THREE.Points(geo, mat);
    this.scene.add(points);
    this.impactParticles.push(points);
  }

  /**
   * Multi-Phase Animation State Machine with distinct kinematics for all shot types:
   * Forehand Topspin, Backhand Slice, Overhead Smash, Tactical Lob, Drop Shot, and Serve!
   */
  public updatePlayerAnimation(player: Player3DModel, dt: number) {
    const anim = player.animState;
    anim.idleTimer += dt;

    // 1. Locomotion Layer (Running vs Ready Stance)
    if (anim.isRunning) {
      anim.runCycle += dt * 11.5;
      const stride = Math.sin(anim.runCycle);
      const absStride = Math.abs(stride);

      player.rightHip.rotation.x = stride * 0.75;
      player.rightKnee.rotation.x = Math.max(0, -stride * 0.9);

      player.leftHip.rotation.x = -stride * 0.75;
      player.leftKnee.rotation.x = Math.max(0, stride * 0.9);

      player.pelvis.position.y = 0.95 + absStride * 0.08;
      player.torso.rotation.x = 0.12;
      player.torso.rotation.y = THREE.MathUtils.damp(player.torso.rotation.y, stride * 0.15, 8, dt);

      if (anim.swingProgress === 0) {
        player.leftShoulder.rotation.x = stride * 0.6;
        player.leftForearmGroup.rotation.x = -0.5 - absStride * 0.3;
      }
    } else {
      // Ready Stance Bounce
      const bounce = Math.sin(anim.idleTimer * 4.5) * 0.035;
      player.pelvis.position.y = THREE.MathUtils.damp(player.pelvis.position.y, 0.92 + bounce, 8, dt);
      player.torso.rotation.x = THREE.MathUtils.damp(player.torso.rotation.x, 0.08, 6, dt);
      player.torso.rotation.y = THREE.MathUtils.damp(player.torso.rotation.y, 0, 6, dt);

      player.rightHip.rotation.x = THREE.MathUtils.damp(player.rightHip.rotation.x, 0.15, 8, dt);
      player.rightKnee.rotation.x = THREE.MathUtils.damp(player.rightKnee.rotation.x, 0.22, 8, dt);
      player.leftHip.rotation.x = THREE.MathUtils.damp(player.leftHip.rotation.x, 0.15, 8, dt);
      player.leftKnee.rotation.x = THREE.MathUtils.damp(player.leftKnee.rotation.x, 0.22, 8, dt);

      if (anim.swingProgress === 0) {
        player.leftShoulder.rotation.x = THREE.MathUtils.damp(player.leftShoulder.rotation.x, 0.45, 6, dt);
        player.leftShoulder.rotation.y = THREE.MathUtils.damp(player.leftShoulder.rotation.y, 0.35, 6, dt);
        player.leftForearmGroup.rotation.x = THREE.MathUtils.damp(player.leftForearmGroup.rotation.x, -0.85, 6, dt);
      }
    }

    // 2. Charging Windup Stance (when holding strike button)
    if (anim.isCharging) {
      const shot = anim.chargingShot || 'FOREHAND';
      const coilAmount = 0.85 + Math.sin(anim.chargeProgress * Math.PI) * 0.15;

      if (shot === 'SERVE') {
        player.torso.rotation.x = -0.22 * coilAmount;
        player.rightShoulder.rotation.x = 2.1 * coilAmount;
        player.rightForearmGroup.rotation.x = -1.5;
        player.leftShoulder.rotation.x = 2.2 * coilAmount; // Toss arm high
        player.leftForearmGroup.rotation.x = 0.2;
      } else if (shot === 'BACKHAND') {
        player.torso.rotation.y = -0.65 * coilAmount;
        player.rightShoulder.rotation.x = -0.35 * coilAmount;
        player.rightShoulder.rotation.y = 0.85;
        player.rightForearmGroup.rotation.x = -1.3;
        player.leftShoulder.rotation.x = 0.3;
      } else if (shot === 'SMASH' || shot === 'LOB') {
        player.torso.rotation.x = -0.15;
        player.rightShoulder.rotation.x = 1.9 * coilAmount;
        player.rightForearmGroup.rotation.x = -1.2;
        player.leftShoulder.rotation.x = 1.2;
      } else if (shot === 'DROP') {
        player.torso.rotation.y = 0.3;
        player.rightShoulder.rotation.x = -0.15;
        player.rightForearmGroup.rotation.x = -0.6;
      } else {
        // Forehand deep coil
        player.torso.rotation.y = 0.7 * coilAmount;
        player.rightShoulder.rotation.x = -0.45 * coilAmount;
        player.rightForearmGroup.rotation.x = -1.15;
        player.leftShoulder.rotation.x = 0.4;
      }
      return; // Hold windup stance while charging!
    }

    // 3. Stroke Swing Layer
    if (anim.swingProgress > 0) {
      anim.swingProgress += dt * 4.6; // ~0.22s stroke duration
      const p = anim.swingProgress;

      if (anim.swingType === 'BACKHAND') {
        // Closed-stance slice / topspin backhand
        if (p < 0.35) {
          const coil = p / 0.35;
          player.torso.rotation.y = -0.55 * coil;
          player.rightShoulder.rotation.x = -0.3 * coil;
          player.rightShoulder.rotation.y = 0.8 * coil;
          player.rightForearmGroup.rotation.x = -1.4 * coil;
        } else if (p < 0.7) {
          const drive = (p - 0.35) / 0.35;
          player.torso.rotation.y = THREE.MathUtils.lerp(-0.55, 0.4, drive);
          player.rightShoulder.rotation.x = THREE.MathUtils.lerp(-0.3, 0.85, drive);
          player.rightShoulder.rotation.y = THREE.MathUtils.lerp(0.8, -0.4, drive);
          player.rightForearmGroup.rotation.x = THREE.MathUtils.lerp(-1.4, -0.2, drive);
        } else {
          const recover = (p - 0.7) / 0.3;
          player.torso.rotation.y = THREE.MathUtils.lerp(0.4, 0, recover);
          player.rightShoulder.rotation.x = THREE.MathUtils.lerp(0.85, 0.1, recover);
          player.rightShoulder.rotation.y = THREE.MathUtils.lerp(-0.4, 0, recover);
          player.rightForearmGroup.rotation.x = THREE.MathUtils.lerp(-0.2, -0.8, recover);
        }
      } else if (anim.swingType === 'SMASH') {
        // High overhead vertical leap & explosive snap
        if (p < 0.35) {
          const cock = p / 0.35;
          player.pelvis.position.y = 0.95 + 0.35 * cock; // Airborne leap
          player.torso.rotation.x = -0.35 * cock; // Arch back
          player.rightShoulder.rotation.x = 2.4 * cock; // Reach skyward
          player.rightForearmGroup.rotation.x = -1.7 * cock; // Elbow bent behind head
        } else if (p < 0.65) {
          const snap = (p - 0.35) / 0.3;
          player.pelvis.position.y = 1.3 - 0.35 * snap;
          player.torso.rotation.x = THREE.MathUtils.lerp(-0.35, 0.45, snap);
          player.rightShoulder.rotation.x = THREE.MathUtils.lerp(2.4, 0.6, snap);
          player.rightForearmGroup.rotation.x = THREE.MathUtils.lerp(-1.7, -0.1, snap);
        } else {
          const land = (p - 0.65) / 0.35;
          player.pelvis.position.y = THREE.MathUtils.lerp(0.95, 0.92, land);
          player.torso.rotation.x = THREE.MathUtils.lerp(0.45, 0.08, land);
          player.rightShoulder.rotation.x = THREE.MathUtils.lerp(0.6, 0.1, land);
          player.rightForearmGroup.rotation.x = THREE.MathUtils.lerp(-0.1, -0.8, land);
        }
      } else if (anim.swingType === 'LOB') {
        // Deep scoop upward arc
        if (p < 0.4) {
          const drop = p / 0.4;
          player.pelvis.position.y = 0.95 - 0.12 * drop;
          player.rightShoulder.rotation.x = -0.6 * drop;
          player.rightForearmGroup.rotation.x = -0.4 * drop;
        } else {
          const sweep = (p - 0.4) / 0.6;
          player.pelvis.position.y = THREE.MathUtils.lerp(0.83, 0.95, sweep);
          player.rightShoulder.rotation.x = THREE.MathUtils.lerp(-0.6, 1.8, sweep);
          player.rightForearmGroup.rotation.x = THREE.MathUtils.lerp(-0.4, -0.9, sweep);
        }
      } else if (anim.swingType === 'DROP') {
        // Delicate touch: slight backswing, sudden soft forward push
        if (p < 0.4) {
          const prep = p / 0.4;
          player.rightShoulder.rotation.x = 0.2 * prep;
          player.rightForearmGroup.rotation.x = -0.5 * prep;
        } else {
          const touch = (p - 0.4) / 0.6;
          player.rightShoulder.rotation.x = THREE.MathUtils.lerp(0.2, 0.5, touch);
          player.rightForearmGroup.rotation.x = THREE.MathUtils.lerp(-0.5, -0.3, touch);
        }
      } else if (anim.swingType === 'SERVE') {
        // Windup -> Trophy Pose -> Extension & Pronation
        if (p < 0.45) {
          const windup = p / 0.45;
          player.torso.rotation.x = -0.25 * windup;
          player.rightShoulder.rotation.x = 2.2 * windup;
          player.rightForearmGroup.rotation.x = -1.6 * windup;
          player.leftShoulder.rotation.x = 2.1 * windup; // Toss arm high
        } else if (p < 0.75) {
          const impact = (p - 0.45) / 0.3;
          player.torso.rotation.x = THREE.MathUtils.lerp(-0.25, 0.35, impact);
          player.rightShoulder.rotation.x = THREE.MathUtils.lerp(2.2, 0.4, impact);
          player.rightForearmGroup.rotation.x = THREE.MathUtils.lerp(-1.6, -0.1, impact);
          player.leftShoulder.rotation.x = THREE.MathUtils.lerp(2.1, 0, impact);
        } else {
          const recovery = (p - 0.75) / 0.25;
          player.torso.rotation.x = THREE.MathUtils.lerp(0.35, 0.08, recovery);
          player.rightShoulder.rotation.x = THREE.MathUtils.lerp(0.4, 0.1, recovery);
          player.rightForearmGroup.rotation.x = THREE.MathUtils.lerp(-0.1, -0.8, recovery);
        }
      } else {
        // FOREHAND Heavy Topspin Drive
        if (p < 0.35) {
          const prep = p / 0.35;
          player.torso.rotation.y = 0.65 * prep;
          player.rightShoulder.rotation.x = -0.4 * prep;
          player.rightForearmGroup.rotation.x = -1.1 * prep;
        } else if (p < 0.7) {
          const drive = (p - 0.35) / 0.35;
          player.torso.rotation.y = THREE.MathUtils.lerp(0.65, -0.5, drive);
          player.rightShoulder.rotation.x = THREE.MathUtils.lerp(-0.4, 1.15, drive);
          player.rightForearmGroup.rotation.x = THREE.MathUtils.lerp(-1.1, -0.3, drive);
        } else {
          const finish = (p - 0.7) / 0.3;
          player.torso.rotation.y = THREE.MathUtils.lerp(-0.5, 0, finish);
          player.rightShoulder.rotation.x = THREE.MathUtils.lerp(1.15, 0.1, finish);
          player.rightForearmGroup.rotation.x = THREE.MathUtils.lerp(-0.3, -0.8, finish);
        }
      }

      if (anim.swingProgress >= 1.0) {
        anim.swingProgress = 0;
        anim.swingType = null;
      }
    }
  }

  /**
   * Dynamic Camera Update
   * Respects cameraZoom slider (0.6x close to 1.8x wide) and dynamic follow smoothing.
   */
  private updateCamera(dt: number) {
    const zoom = this.graphicsConfig.cameraZoom;
    const p1 = this.player1.root.position;
    const ball = this.ballMesh.position;

    switch (this.graphicsConfig.cameraAngle) {
      case 'chase': {
        // Behind-the-player dynamic follow camera
        const targetX = p1.x * 0.55;
        const targetY = 3.6 * zoom;
        const targetZ = p1.z + (6.2 * zoom);

        _camDesiredPos.set(targetX, targetY, targetZ);
        this.camera.position.lerp(_camDesiredPos, Math.min(1.0, dt * 7.5));

        _camLookAt.set(p1.x * 0.25 + ball.x * 0.15, 1.25, -2.5);
        this.camera.lookAt(_camLookAt);
        break;
      }

      case 'broadcast': {
        // TV Broadcast angle
        const targetY = 8.5 * zoom;
        const targetZ = 18.0 * zoom;
        _camDesiredPos.set(0, targetY, targetZ);
        this.camera.position.lerp(_camDesiredPos, Math.min(1.0, dt * 6.0));
        _camLookAt.set(0, 1.1, 0);
        this.camera.lookAt(_camLookAt);
        break;
      }

      case 'baseline': {
        // Low baseline angle
        const targetY = 2.4 * zoom;
        const targetZ = p1.z + (4.6 * zoom);
        _camDesiredPos.set(p1.x * 0.3, targetY, targetZ);
        this.camera.position.lerp(_camDesiredPos, Math.min(1.0, dt * 7.5));
        _camLookAt.set(0, 1.4, -4.0);
        this.camera.lookAt(_camLookAt);
        break;
      }

      case 'mount': {
        // High mount stand behind player with 1m–50m adjustable height
        // Shows whole pitch from top from player's perspective and optimal pitch angle
        const height = THREE.MathUtils.clamp(this.graphicsConfig.cameraHeight || 10.0, 1.0, 50.0);
        const distBehind = Math.max(3.5, height * 0.72) * zoom;
        const targetX = p1.x * 0.45;
        const targetY = height * zoom;
        const targetZ = p1.z + distBehind;

        _camDesiredPos.set(targetX, targetY, targetZ);
        this.camera.position.lerp(_camDesiredPos, Math.min(1.0, dt * 7.0));

        const lookTargetZ = THREE.MathUtils.lerp(-1.0, -5.5, Math.min(1.0, height / 30.0));
        _camLookAt.set(p1.x * 0.2 + ball.x * 0.1, 0.9, lookTargetZ);
        this.camera.lookAt(_camLookAt);
        break;
      }

      case 'overhead':
      default: {
        // Tactical overhead view
        const targetY = 19.0 * zoom;
        _camDesiredPos.set(0, targetY, 4.0 * zoom);
        this.camera.position.lerp(_camDesiredPos, Math.min(1.0, dt * 6.0));
        _camLookAt.set(0, 0, 0);
        this.camera.lookAt(_camLookAt);
        break;
      }
    }
  }

  private updateCameraInstant() {
    this.camera.position.set(0, 3.6, 18.0);
    this.camera.lookAt(0, 1.2, -2.5);
  }

  public render(dt: number) {
    if (this.isDisposed) return;

    // Update dynamic follow camera
    this.updateCamera(dt);

    // Sync ball shadow position & size
    this.ballShadow.position.x = this.ballMesh.position.x;
    this.ballShadow.position.z = this.ballMesh.position.z;
    const shadowScale = THREE.MathUtils.clamp(1.0 - (this.ballMesh.position.y / 6.0), 0.3, 1.2);
    this.ballShadow.scale.set(shadowScale, shadowScale, shadowScale);

    // Update impact particles
    for (let i = this.impactParticles.length - 1; i >= 0; i--) {
      const p = this.impactParticles[i];
      const userData = (p.geometry as unknown as { userData: { velocities: Float32Array; life: number } }).userData;
      userData.life -= dt * 1.5;

      const posAttr = p.geometry.getAttribute('position') as THREE.BufferAttribute;
      const count = posAttr.count;
      for (let j = 0; j < count; j++) {
        posAttr.setXYZ(
          j,
          posAttr.getX(j) + userData.velocities[j * 3] * dt,
          posAttr.getY(j) + userData.velocities[j * 3 + 1] * dt,
          posAttr.getZ(j) + userData.velocities[j * 3 + 2] * dt
        );
        userData.velocities[j * 3 + 1] -= 9.8 * dt; // gravity on particles
      }
      posAttr.needsUpdate = true;
      (p.material as THREE.PointsMaterial).opacity = Math.max(0, userData.life);

      if (userData.life <= 0) {
        this.scene.remove(p);
        p.geometry.dispose();
        (p.material as THREE.Material).dispose();
        this.impactParticles.splice(i, 1);
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  public applyResolutionAndScaling() {
    if (!this.container || this.isDisposed) return;
    const clientW = this.container.clientWidth || window.innerWidth;
    const clientH = this.container.clientHeight || window.innerHeight;
    const aspect = clientW / clientH || 16 / 9;

    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();

    let targetW = clientW;
    let targetH = clientH;

    switch (this.graphicsConfig.renderResolution) {
      case '480p':
        targetH = 480;
        targetW = Math.round(480 * aspect);
        break;
      case '720p':
        targetH = 720;
        targetW = Math.round(720 * aspect);
        break;
      case '1080p':
        targetH = 1080;
        targetW = Math.round(1080 * aspect);
        break;
      case 'auto':
      default:
        targetH = clientH;
        targetW = clientW;
        break;
    }

    // Set internal WebGL buffer dimensions without modifying canvas CSS styling
    this.renderer.setSize(targetW, targetH, false);

    const canvas = this.renderer.domElement;
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    canvas.style.imageRendering = this.graphicsConfig.scalingFilter === 'pixelated' ? 'pixelated' : 'auto';
  }

  private handleResize = () => {
    this.applyResolutionAndScaling();
  };

  public projectToScreen(worldPos: THREE.Vector3): { x: number; y: number } {
    const temp = worldPos.clone();
    temp.project(this.camera);
    return {
      x: ((temp.x + 1) / 2) * 100,
      y: ((-temp.y + 1) / 2) * 100,
    };
  }

  public getPlayerScreenPosition(playerId: number = 1): { x: number; y: number } {
    const player = playerId === 2 ? this.player2 : this.player1;
    const targetPos = player.root.position.clone();
    targetPos.y += 1.5;
    targetPos.x += playerId === 1 ? 1.05 : -1.05;
    return this.projectToScreen(targetPos);
  }

  public dispose() {
    this.destroy();
  }

  public destroy() {
    this.isDisposed = true;
    window.removeEventListener('resize', this.handleResize);

    for (const p of this.impactParticles) {
      this.scene.remove(p);
      p.geometry.dispose();
      (p.material as THREE.Material).dispose();
    }
    this.impactParticles = [];

    this.renderer.dispose();
    if (this.renderer.domElement && this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
  }
}
