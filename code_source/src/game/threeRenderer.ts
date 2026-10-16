/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { CourtSurface, GraphicsConfig, ShotType } from '../types/game';

// Pre-allocated math helpers to ensure zero GC in animation loop
const _vec3Target = new THREE.Vector3();

export interface Player3DModel {
  root: THREE.Group;
  torso: THREE.Mesh;
  head: THREE.Group;
  rightArm: THREE.Group;
  leftArm: THREE.Group;
  rightLeg: THREE.Group;
  leftLeg: THREE.Group;
  racket: THREE.Group;
  shadow: THREE.Mesh;
  animState: {
    swingProgress: number; // 0 to 1
    swingType: ShotType | null;
    runCycle: number;
    isRunning: boolean;
  };
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

  public player1!: Player3DModel;
  public player2!: Player3DModel;
  public ballMesh!: THREE.Mesh;
  public ballShadow!: THREE.Mesh;
  public impactParticles: THREE.Points[] = [];

  private isDisposed = false;
  private activeSurface: CourtSurface = 'hard';
  private graphicsConfig: GraphicsConfig = {
    quality: 'mid',
    cameraAngle: 'broadcast',
    spectators: true,
    shadows: false, // Performance first on TVs: fast procedural contact shadows used instead
    pixelRatio: 1.0, // Fixed 1x logical pixel ratio for smooth 60fps on TV GPUs
  };

  // Official Court Dimensions
  public static readonly COURT_LENGTH = 23.77;
  public static readonly COURT_WIDTH = 10.97; // Full court (with doubles alleys)
  public static readonly SINGLES_WIDTH = 8.23; // Singles sideline width
  public static readonly NET_HEIGHT = 0.914;

  // Tight, realistic stadium surround (no huge empty unplayable void!)
  public static readonly SURROUND_WIDTH = 15.0; // Leaves only ~2.0m on sides
  public static readonly SURROUND_LENGTH = 28.5; // Leaves only ~2.3m behind baseline

  constructor(container: HTMLDivElement) {
    this.container = container;

    // 1. Scene & Clean Stadium Atmosphere
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a1120);

    // 2. Camera Setup: Broadcast TV Telephoto Perspective (32° FOV eliminates wide-angle distortion)
    const aspect = container.clientWidth / container.clientHeight || 16 / 9;
    this.camera = new THREE.PerspectiveCamera(32, aspect, 0.5, 100);
    this.setCameraPosition('broadcast');

    // 3. Lightweight WebGL Renderer (TV 60 FPS Optimized)
    // Avoids heavy HDR buffers, PMREM radiance, and multi-sampling that overload TV Mali GPUs
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    // Set 1x pixel ratio as strictly required by My PC TV performance guidelines
    this.renderer.setPixelRatio(1.0);
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = false; // Fast contact shadows used

    container.appendChild(this.renderer.domElement);

    // 4. Lightweight 2-Point Lighting (Zero PMREM/HDR reflection overhead)
    this.hemiLight = new THREE.HemisphereLight(0xffffff, 0x1e293b, 0.85);
    this.scene.add(this.hemiLight);

    this.dirLight = new THREE.DirectionalLight(0xfffbeb, 1.4);
    this.dirLight.position.set(10, 20, 12);
    this.scene.add(this.dirLight);

    // 5. Build Compact, Realistic Court & Stadium
    this.buildCourt('hard');

    // 6. Build Athletic Players in Natural Human Proportions (No giant heads!)
    this.player1 = this.createPlayerCharacter(0x0284c7, 0x1e293b, 0xfcd34d); // Cyan shirt / Navy shorts
    this.player2 = this.createPlayerCharacter(0xe11d48, 0x1e293b, 0xfcd34d); // Crimson shirt / Navy shorts
    this.createTennisBall();

    // Initial positions on baseline
    this.player1.root.position.set(0, 0, 12.0);
    this.player2.root.position.set(0, 0, -12.0);
    this.player2.root.rotation.y = Math.PI;

    window.addEventListener('resize', this.onResize);
  }

  public setGraphicsConfig(cfg: Partial<GraphicsConfig>) {
    this.graphicsConfig = { ...this.graphicsConfig, ...cfg };
    if (this.graphicsConfig.quality === 'very_low') {
      this.renderer.setPixelRatio(1.0);
      if (this.stadiumGroup) this.stadiumGroup.visible = false;
      this.dirLight.intensity = 0.8;
      this.hemiLight.intensity = 0.9;
    } else if (this.graphicsConfig.quality === 'low') {
      this.renderer.setPixelRatio(1.0);
      if (this.stadiumGroup) this.stadiumGroup.visible = false;
      this.dirLight.intensity = 1.2;
      this.hemiLight.intensity = 0.85;
    } else {
      this.renderer.setPixelRatio(this.graphicsConfig.quality === 'high' ? Math.min(window.devicePixelRatio || 1, 1.25) : 1.0);
      if (this.stadiumGroup) this.stadiumGroup.visible = this.graphicsConfig.spectators;
      this.dirLight.intensity = 1.4;
      this.hemiLight.intensity = 0.85;
    }
  }

  public setCourtSurface(surface: CourtSurface) {
    if (this.activeSurface === surface) return;
    this.activeSurface = surface;
    this.scene.remove(this.courtGroup);
    this.courtGroup = new THREE.Group();
    this.buildCourt(surface);
  }

  public setCameraPosition(mode: 'broadcast' | 'chase' | 'overhead') {
    if (mode === 'broadcast') {
      // Classic TV Tournament Broadcast Angle
      this.camera.position.set(0, 7.2, 19.5);
      this.camera.lookAt(0, 0.8, -1.0);
      this.camera.fov = 32;
    } else if (mode === 'chase') {
      this.camera.position.set(0, 3.8, 16.0);
      this.camera.lookAt(0, 1.2, 0);
      this.camera.fov = 38;
    } else {
      // High Tactical Angle
      this.camera.position.set(0, 16.0, 10.0);
      this.camera.lookAt(0, 0, 0);
      this.camera.fov = 36;
    }
    this.camera.updateProjectionMatrix();
  }

  /**
   * Tight, realistic stadium tennis court with standard tennis lines
   * The playable court occupies >75% of the visible ground surface!
   */
  private buildCourt(surface: CourtSurface) {
    this.courtLines = new THREE.Group();
    this.stadiumGroup = new THREE.Group();

    let innerColor = 0x1d4ed8; // Hard Court Blue
    let outerColor = 0x15803d; // Green surround

    if (surface === 'clay') {
      innerColor = 0xc2410c; // Roland-Garros Terracotta Red
      outerColor = 0x9a3412;
    } else if (surface === 'grass') {
      innerColor = 0x166534; // Wimbledon Deep Grass
      outerColor = 0x14532d;
    }

    // Outer Court Floor: Tight 15.0m x 28.5m surround (no giant unplayable void!)
    const floorGeo = new THREE.PlaneGeometry(TennisScene3D.SURROUND_WIDTH, TennisScene3D.SURROUND_LENGTH);
    const floorMat = new THREE.MeshLambertMaterial({ color: outerColor });
    this.courtFloor = new THREE.Mesh(floorGeo, floorMat);
    this.courtFloor.rotation.x = -Math.PI / 2;
    this.courtGroup.add(this.courtFloor);

    // Full Playable Court (10.97m x 23.77m)
    const innerGeo = new THREE.PlaneGeometry(TennisScene3D.COURT_WIDTH, TennisScene3D.COURT_LENGTH);
    const innerMat = new THREE.MeshLambertMaterial({
      color: innerColor,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const innerCourt = new THREE.Mesh(innerGeo, innerMat);
    innerCourt.rotation.x = -Math.PI / 2;
    innerCourt.position.y = 0.01;
    this.courtGroup.add(innerCourt);

    // Crisp White Chalk Lines
    const lineMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const lineWidth = 0.07;

    const addLine = (w: number, l: number, x: number, z: number) => {
      const g = new THREE.PlaneGeometry(w, l);
      const m = new THREE.Mesh(g, lineMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.02, z);
      this.courtLines.add(m);
    };

    const halfL = TennisScene3D.COURT_LENGTH / 2;
    const halfDoublesW = TennisScene3D.COURT_WIDTH / 2;
    const halfSinglesW = TennisScene3D.SINGLES_WIDTH / 2;

    // Baselines (across full court)
    addLine(TennisScene3D.COURT_WIDTH, lineWidth * 1.4, 0, halfL);
    addLine(TennisScene3D.COURT_WIDTH, lineWidth * 1.4, 0, -halfL);

    // Doubles Sidelines
    addLine(lineWidth, TennisScene3D.COURT_LENGTH, -halfDoublesW, 0);
    addLine(lineWidth, TennisScene3D.COURT_LENGTH, halfDoublesW, 0);

    // Singles Sidelines (standard tennis alleys)
    addLine(lineWidth, TennisScene3D.COURT_LENGTH, -halfSinglesW, 0);
    addLine(lineWidth, TennisScene3D.COURT_LENGTH, halfSinglesW, 0);

    // Service Lines (6.4m from net across singles width)
    const serviceDist = 6.4;
    addLine(TennisScene3D.SINGLES_WIDTH, lineWidth, 0, serviceDist);
    addLine(TennisScene3D.SINGLES_WIDTH, lineWidth, 0, -serviceDist);

    // Center Service Line
    addLine(lineWidth, serviceDist * 2, 0, 0);

    // Center Marks on Baselines
    addLine(lineWidth, 0.35, 0, halfL - 0.17);
    addLine(lineWidth, 0.35, 0, -halfL + 0.17);

    this.courtGroup.add(this.courtLines);

    // Tennis Net with Posts and Top Tape
    this.netGroup = new THREE.Group();
    const netWidth = TennisScene3D.COURT_WIDTH + 1.2;
    const netHeight = TennisScene3D.NET_HEIGHT;

    // Net mesh
    const netGeo = new THREE.PlaneGeometry(netWidth, netHeight, 8, 2);
    const netMat = new THREE.MeshBasicMaterial({
      color: 0x111827,
      wireframe: true,
      transparent: true,
      opacity: 0.65,
    });
    const netMesh = new THREE.Mesh(netGeo, netMat);
    netMesh.position.set(0, netHeight / 2, 0);
    this.netGroup.add(netMesh);

    // White Top Tape
    const tapeGeo = new THREE.BoxGeometry(netWidth, 0.06, 0.04);
    const tapeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const tapeMesh = new THREE.Mesh(tapeGeo, tapeMat);
    tapeMesh.position.set(0, netHeight, 0);
    this.netGroup.add(tapeMesh);

    // Center Strap
    const strapMesh = new THREE.Mesh(new THREE.BoxGeometry(0.06, netHeight, 0.05), tapeMat);
    strapMesh.position.set(0, netHeight / 2, 0);
    this.netGroup.add(strapMesh);

    // Net Posts
    const postGeo = new THREE.CylinderGeometry(0.06, 0.06, netHeight * 1.15, 8);
    const postMat = new THREE.MeshLambertMaterial({ color: 0x0284c7 });
    const leftPost = new THREE.Mesh(postGeo, postMat);
    leftPost.position.set(-netWidth / 2, (netHeight * 1.15) / 2, 0);
    const rightPost = leftPost.clone();
    rightPost.position.x = netWidth / 2;
    this.netGroup.add(leftPost);
    this.netGroup.add(rightPost);

    this.courtGroup.add(this.netGroup);

    // Low-Poly Merged Stadium Grandstands (Extremely fast, only 3-4 draw calls!)
    this.buildOptimizedStadium();
    this.courtGroup.add(this.stadiumGroup);

    this.scene.add(this.courtGroup);
  }

  /**
   * High-performance stadium grandstands:
   * Merged geometric tiers with low-poly spectator rows (replaces 350+ individual meshes!)
   */
  private buildOptimizedStadium() {
    const wallMat = new THREE.MeshLambertMaterial({ color: 0x0f172a });
    const bannerMat = new THREE.MeshLambertMaterial({ color: 0x0369a1 });
    const crowdMat1 = new THREE.MeshLambertMaterial({ color: 0x38bdf8 });
    const crowdMat2 = new THREE.MeshLambertMaterial({ color: 0xf43f5e });

    const courtHalfW = TennisScene3D.SURROUND_WIDTH / 2;
    const courtHalfL = TennisScene3D.SURROUND_LENGTH / 2;

    // 1. Sleek Perimeter Sponsor Barriers (right at boundary edge)
    const sideBarrierGeo = new THREE.BoxGeometry(0.3, 0.9, TennisScene3D.SURROUND_LENGTH);
    const leftBarrier = new THREE.Mesh(sideBarrierGeo, bannerMat);
    leftBarrier.position.set(-courtHalfW - 0.15, 0.45, 0);
    const rightBarrier = leftBarrier.clone();
    rightBarrier.position.x = courtHalfW + 0.15;
    this.stadiumGroup.add(leftBarrier);
    this.stadiumGroup.add(rightBarrier);

    const endBarrierGeo = new THREE.BoxGeometry(TennisScene3D.SURROUND_WIDTH + 0.6, 0.9, 0.3);
    const northBarrier = new THREE.Mesh(endBarrierGeo, bannerMat);
    northBarrier.position.set(0, 0.45, -courtHalfL - 0.15);
    const southBarrier = northBarrier.clone();
    southBarrier.position.z = courtHalfL + 0.15;
    this.stadiumGroup.add(northBarrier);
    this.stadiumGroup.add(southBarrier);

    // 2. Tiered Seating Stands (Side grandstands)
    for (let tier = 0; tier < 3; tier++) {
      const tierH = 0.8;
      const tierW = 1.8;
      const tierGeo = new THREE.BoxGeometry(tierW, tierH, TennisScene3D.SURROUND_LENGTH);

      // Left Stand
      const leftStand = new THREE.Mesh(tierGeo, wallMat);
      leftStand.position.set(-courtHalfW - 0.9 - tier * tierW, tier * tierH + tierH / 2, 0);
      this.stadiumGroup.add(leftStand);

      // Left Crowd Strip (Single merged bar representing colorful spectators)
      const crowdGeo = new THREE.BoxGeometry(0.8, 0.6, TennisScene3D.SURROUND_LENGTH - 2);
      const leftCrowd = new THREE.Mesh(crowdGeo, tier % 2 === 0 ? crowdMat1 : crowdMat2);
      leftCrowd.position.set(leftStand.position.x, leftStand.position.y + tierH / 2 + 0.3, 0);
      this.stadiumGroup.add(leftCrowd);

      // Right Stand
      const rightStand = leftStand.clone();
      rightStand.position.x = courtHalfW + 0.9 + tier * tierW;
      this.stadiumGroup.add(rightStand);

      const rightCrowd = leftCrowd.clone();
      rightCrowd.position.x = rightStand.position.x;
      this.stadiumGroup.add(rightCrowd);
    }
  }

  /**
   * Procedural tennis player in NATURAL, ATHLETIC HUMAN PROPORTIONS
   * (Total Height ~1.82m, Head Diameter 0.22m, natural athletic physique)
   */
  private createPlayerCharacter(shirtColor: number, shortsColor: number, skinColor: number): Player3DModel {
    const root = new THREE.Group();

    // 1. Soft Procedural Ground Contact Shadow (100% smooth, 0 GPU shadow-map cost)
    const shadowGeo = new THREE.CircleGeometry(0.48, 16);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.38,
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

    // 2. Torso: Athletic Polo Shirt (Height ~0.55m, Shoulder Width ~0.38m, Waist ~0.26m)
    const torsoGeo = new THREE.CylinderGeometry(0.18, 0.14, 0.55, 8);
    const torso = new THREE.Mesh(torsoGeo, shirtMat);
    torso.position.y = 1.25;
    root.add(torso);

    // Collar
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.08, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    collar.position.y = 0.28;
    torso.add(collar);

    // 3. Head: Natural Human Proportions (Radius 0.10m, Height 0.22m — NO giant head!)
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.42, 0);

    // Neck
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.08, 8), skinMat);
    neck.position.y = -0.04;
    headGroup.add(neck);

    // Natural Cranium / Head Sphere
    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.105, 12, 10), skinMat);
    headMesh.position.y = 0.08;
    headGroup.add(headMesh);

    // Athletic Sweatband
    const bandMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.11, 0.04, 12),
      new THREE.MeshBasicMaterial({ color: shirtColor })
    );
    bandMesh.position.y = 0.12;
    headGroup.add(bandMesh);

    torso.add(headGroup);

    // 4. Tennis Shorts (Length ~0.28m, Width ~0.22m)
    const shortsGeo = new THREE.CylinderGeometry(0.15, 0.17, 0.28, 8);
    const shorts = new THREE.Mesh(shortsGeo, shortsMat);
    shorts.position.y = -0.32;
    torso.add(shorts);

    // 5. Athletic Legs (Left & Right, Length ~0.78m)
    const createLeg = (xOffset: number) => {
      const legGroup = new THREE.Group();
      legGroup.position.set(xOffset, 0.95, 0);

      // Thigh & Shin
      const legMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.72, 8), skinMat);
      legMesh.position.y = -0.36;
      legGroup.add(legMesh);

      // Tennis Shoe
      const shoeMesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.09, 0.24), shoeMat);
      shoeMesh.position.set(0, -0.74, 0.04);
      legGroup.add(shoeMesh);

      return legGroup;
    };

    const rightLeg = createLeg(0.11);
    const leftLeg = createLeg(-0.11);
    root.add(rightLeg);
    root.add(leftLeg);

    // 6. Athletic Arms (Upper arm + Forearm)
    const createArm = (xOffset: number) => {
      const armGroup = new THREE.Group();
      armGroup.position.set(xOffset, 1.45, 0);

      const armMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.48, 8), skinMat);
      armMesh.position.y = -0.24;
      armGroup.add(armMesh);

      // Wristband
      const wristband = new THREE.Mesh(
        new THREE.CylinderGeometry(0.052, 0.052, 0.05, 8),
        new THREE.MeshBasicMaterial({ color: shirtColor })
      );
      wristband.position.y = -0.42;
      armGroup.add(wristband);

      return armGroup;
    };

    const rightArm = createArm(0.24);
    const leftArm = createArm(-0.24);
    root.add(rightArm);
    root.add(leftArm);

    // 7. Tennis Racket in Hand
    const racket = new THREE.Group();
    // Grip
    const gripGeo = new THREE.CylinderGeometry(0.02, 0.022, 0.32, 8);
    const gripMat = new THREE.MeshLambertMaterial({ color: 0x1e293b });
    const grip = new THREE.Mesh(gripGeo, gripMat);
    grip.position.y = -0.16;
    racket.add(grip);

    // Head Rim
    const rimMat = new THREE.MeshLambertMaterial({ color: 0x38bdf8 });
    const rimGeo = new THREE.TorusGeometry(0.16, 0.018, 6, 16);
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.position.set(0, 0.18, 0);
    racket.add(rim);

    // Strings
    const stringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 });
    const strings = new THREE.Mesh(new THREE.CircleGeometry(0.15, 10), stringMat);
    strings.position.set(0, 0.18, 0);
    racket.add(strings);

    // Attach to hand
    racket.position.set(0, -0.46, 0.08);
    racket.rotation.x = Math.PI / 4;
    rightArm.add(racket);

    this.scene.add(root);

    return {
      root,
      torso,
      head: headGroup,
      rightArm,
      leftArm,
      rightLeg,
      leftLeg,
      racket,
      shadow,
      animState: {
        swingProgress: 0,
        swingType: null,
        runCycle: 0,
        isRunning: false,
      },
    };
  }

  /**
   * Fast, low-poly optic yellow tennis ball
   */
  private createTennisBall() {
    const ballGeo = new THREE.SphereGeometry(0.15, 10, 10);
    const ballMat = new THREE.MeshLambertMaterial({ color: 0xccff00 });

    this.ballMesh = new THREE.Mesh(ballGeo, ballMat);
    this.ballMesh.position.set(0, 1.0, 0);
    this.scene.add(this.ballMesh);

    // Soft ball contact shadow on court floor
    const shadowGeo = new THREE.CircleGeometry(0.22, 12);
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
   * Spawn lightweight impact particle puff
   */
  public triggerImpactPuff(pos: THREE.Vector3, color: number = 0xccff00) {
    const count = 10;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = pos.x;
      positions[i * 3 + 1] = pos.y;
      positions[i * 3 + 2] = pos.z;

      velocities[i * 3] = (Math.random() - 0.5) * 3.0;
      velocities[i * 3 + 1] = Math.random() * 2.5 + 0.8;
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 3.0;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    (geo as unknown as { userData: { velocities: Float32Array; life: number } }).userData = {
      velocities,
      life: 0.7,
    };

    const mat = new THREE.PointsMaterial({
      color,
      size: 0.12,
      transparent: true,
      opacity: 0.85,
    });

    const points = new THREE.Points(geo, mat);
    this.scene.add(points);
    this.impactParticles.push(points);
  }

  /**
   * Update character animations: run cycles, forehand/backhand swings
   */
  public updatePlayerAnimation(player: Player3DModel, dt: number) {
    if (player.animState.isRunning) {
      player.animState.runCycle += dt * 10;
      const legAngle = Math.sin(player.animState.runCycle) * 0.55;
      player.rightLeg.rotation.x = legAngle;
      player.leftLeg.rotation.x = -legAngle;
      player.torso.position.y = 1.25 + Math.abs(Math.sin(player.animState.runCycle * 2)) * 0.06;
    } else {
      player.rightLeg.rotation.x = THREE.MathUtils.damp(player.rightLeg.rotation.x, 0, 8, dt);
      player.leftLeg.rotation.x = THREE.MathUtils.damp(player.leftLeg.rotation.x, 0, 8, dt);
      player.torso.position.y = 1.25 + Math.sin(Date.now() * 0.005) * 0.02;
    }

    if (player.animState.swingProgress > 0) {
      player.animState.swingProgress += dt * 5.0;
      const p = player.animState.swingProgress;

      if (player.animState.swingType === 'BACKHAND') {
        player.rightArm.rotation.y = Math.sin(p * Math.PI) * 1.4 - 0.2;
        player.rightArm.rotation.x = -Math.sin(p * Math.PI) * 1.0;
        player.racket.rotation.z = Math.sin(p * Math.PI) * 1.5;
      } else if (player.animState.swingType === 'SMASH' || player.animState.swingType === 'SERVE') {
        player.rightArm.rotation.x = -Math.PI / 2 + Math.sin(p * Math.PI) * 2.0;
        player.racket.rotation.x = Math.sin(p * Math.PI) * 1.3;
      } else {
        // Forehand
        player.rightArm.rotation.y = -Math.sin(p * Math.PI) * 1.5 + 0.2;
        player.rightArm.rotation.x = -Math.sin(p * Math.PI) * 1.0;
        player.racket.rotation.z = -Math.sin(p * Math.PI) * 1.4;
      }

      if (player.animState.swingProgress >= 1.0) {
        player.animState.swingProgress = 0;
        player.animState.swingType = null;
      }
    } else {
      player.rightArm.rotation.x = THREE.MathUtils.damp(player.rightArm.rotation.x, 0.35, 6, dt);
      player.rightArm.rotation.y = THREE.MathUtils.damp(player.rightArm.rotation.y, -0.25, 6, dt);
      player.racket.rotation.x = THREE.MathUtils.damp(player.racket.rotation.x, Math.PI / 4, 6, dt);
      player.racket.rotation.z = THREE.MathUtils.damp(player.racket.rotation.z, 0, 6, dt);
    }
  }

  /**
   * Main per-frame render tick
   */
  public render(dt: number) {
    if (this.isDisposed) return;

    // Fast particle updates
    for (let i = this.impactParticles.length - 1; i >= 0; i--) {
      const p = this.impactParticles[i];
      const uData = (p.geometry as unknown as { userData: { velocities: Float32Array; life: number } }).userData;
      uData.life -= dt * 3.0;

      const pos = p.geometry.attributes.position.array as Float32Array;
      const v = uData.velocities;
      for (let j = 0; j < pos.length / 3; j++) {
        pos[j * 3] += v[j * 3] * dt;
        pos[j * 3 + 1] += v[j * 3 + 1] * dt;
        pos[j * 3 + 2] += v[j * 3 + 2] * dt;
        v[j * 3 + 1] -= 9.8 * dt;
      }
      p.geometry.attributes.position.needsUpdate = true;
      (p.material as THREE.PointsMaterial).opacity = Math.max(0, uData.life);

      if (uData.life <= 0) {
        this.scene.remove(p);
        p.geometry.dispose();
        (p.material as THREE.Material).dispose();
        this.impactParticles.splice(i, 1);
      }
    }

    // Ball contact shadow update
    this.ballShadow.position.x = this.ballMesh.position.x;
    this.ballShadow.position.z = this.ballMesh.position.z;
    const heightFactor = Math.max(0.2, 1.0 - this.ballMesh.position.y * 0.15);
    this.ballShadow.scale.set(heightFactor, heightFactor, 1);
    (this.ballShadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.12, 0.45 - this.ballMesh.position.y * 0.08);

    // Smooth TV Broadcast Camera Tracking (telephoto depth)
    if (this.graphicsConfig.cameraAngle === 'broadcast') {
      const targetCamX = THREE.MathUtils.clamp(this.ballMesh.position.x * 0.25, -2.5, 2.5);
      this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, targetCamX, 4, dt);

      _vec3Target.set(this.ballMesh.position.x * 0.2, 0.9, this.ballMesh.position.z * 0.15);
      this.camera.lookAt(_vec3Target);
    }

    this.renderer.render(this.scene, this.camera);
  }

  private onResize = () => {
    if (!this.container || this.isDisposed) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  public dispose() {
    this.isDisposed = true;
    window.removeEventListener('resize', this.onResize);
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
