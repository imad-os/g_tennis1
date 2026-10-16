/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { CourtSurface, GraphicsConfig, ShotType } from '../types/game';

// Pre-allocated math helpers to ensure zero GC in animation loop
const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
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
  private standsGroup!: THREE.Group;

  public player1!: Player3DModel;
  public player2!: Player3DModel;
  public ballMesh!: THREE.Mesh;
  public ballShadow!: THREE.Mesh;
  public impactParticles: THREE.Points[] = [];

  private isDisposed = false;
  private activeSurface: CourtSurface = 'hard';
  private graphicsConfig: GraphicsConfig = {
    quality: 'high',
    cameraAngle: 'broadcast',
    spectators: true,
    shadows: true,
    pixelRatio: 1.5,
  };

  // Court dimensions (Standard Tennis Singles: 23.77m long, 8.23m wide)
  public static readonly COURT_LENGTH = 23.77;
  public static readonly COURT_WIDTH = 8.23;
  public static readonly NET_HEIGHT = 0.914;

  constructor(container: HTMLDivElement) {
    this.container = container;

    // 1. Scene & Atmosphere
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0f172a);
    this.scene.fog = new THREE.FogExp2(0x0f172a, 0.012);

    // 2. Camera setup
    const aspect = container.clientWidth / container.clientHeight || 16 / 9;
    this.camera = new THREE.PerspectiveCamera(46, aspect, 0.1, 150);
    this.setCameraPosition('broadcast');

    // 3. Renderer setup
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.appendChild(this.renderer.domElement);

    // 4. Studio Environment Reflection via RoomEnvironment
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    // 5. Lighting Rig (Warm Key + Cool Hemisphere + Rim)
    this.hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0x1e293b, 0.7);
    this.scene.add(this.hemiLight);

    this.dirLight = new THREE.DirectionalLight(0xfff7ed, 1.8);
    this.dirLight.position.set(16, 28, 14);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.width = 2048;
    this.dirLight.shadow.mapSize.height = 2048;
    this.dirLight.shadow.camera.near = 5;
    this.dirLight.shadow.camera.far = 70;
    this.dirLight.shadow.camera.left = -18;
    this.dirLight.shadow.camera.right = 18;
    this.dirLight.shadow.camera.top = 22;
    this.dirLight.shadow.camera.bottom = -22;
    this.dirLight.shadow.bias = -0.0004;
    this.scene.add(this.dirLight);

    // 6. Build 3D Entities
    this.buildCourt('hard');
    this.player1 = this.createPlayerCharacter(0x38bdf8, 0x0284c7, 0xf8fafc); // Cyan / Blue player
    this.player2 = this.createPlayerCharacter(0xf43f5e, 0xbe123c, 0xf8fafc); // Red / Crimson opponent
    this.createTennisBall();

    // Initial player positions
    this.player1.root.position.set(0, 0, 12.5); // South baseline
    this.player2.root.position.set(0, 0, -12.5); // North baseline
    this.player2.root.rotation.y = Math.PI;

    // Window resize handler
    window.addEventListener('resize', this.onResize);
  }

  public setGraphicsConfig(cfg: Partial<GraphicsConfig>) {
    this.graphicsConfig = { ...this.graphicsConfig, ...cfg };
    if (this.graphicsConfig.quality === 'low') {
      this.renderer.shadowMap.enabled = false;
      this.renderer.setPixelRatio(1.0);
      this.standsGroup.visible = false;
    } else {
      this.renderer.shadowMap.enabled = true;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      this.standsGroup.visible = this.graphicsConfig.spectators;
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
      this.camera.position.set(0, 7.8, 20.8);
      this.camera.lookAt(0, 1.1, -1.0);
    } else if (mode === 'chase') {
      this.camera.position.set(0, 4.2, 16.5);
      this.camera.lookAt(0, 1.3, 0);
    } else {
      this.camera.position.set(0, 16.5, 12.0);
      this.camera.lookAt(0, 0, 0);
    }
  }

  /**
   * Procedural low-poly 3D tennis court with beveled rounded edges & Grand Slam surfaces
   */
  private buildCourt(surface: CourtSurface) {
    this.courtLines = new THREE.Group();
    this.standsGroup = new THREE.Group();

    // 1. Court Surface Material
    let innerColor = 0x1d4ed8; // Hard Court Blue
    let outerColor = 0x15803d; // Hard Court Green surround
    let roughness = 0.82;

    if (surface === 'clay') {
      innerColor = 0xc2410c; // Roland-Garros Terracotta Red
      outerColor = 0x9a3412;
      roughness = 0.95;
    } else if (surface === 'grass') {
      innerColor = 0x166534; // Wimbledon Emerald Green
      outerColor = 0x14532d;
      roughness = 0.88;
    }

    // Outer Court Floor (Stadium ground)
    const floorGeo = new THREE.PlaneGeometry(36, 48);
    const floorMat = new THREE.MeshStandardMaterial({
      color: outerColor,
      roughness,
      metalness: 0.05,
    });
    this.courtFloor = new THREE.Mesh(floorGeo, floorMat);
    this.courtFloor.rotation.x = -Math.PI / 2;
    this.courtFloor.receiveShadow = true;
    this.courtGroup.add(this.courtFloor);

    // Inner Playable Court
    const innerGeo = new THREE.PlaneGeometry(TennisScene3D.COURT_WIDTH, TennisScene3D.COURT_LENGTH);
    const innerMat = new THREE.MeshStandardMaterial({
      color: innerColor,
      roughness: roughness * 0.95,
      metalness: 0.05,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const innerCourt = new THREE.Mesh(innerGeo, innerMat);
    innerCourt.rotation.x = -Math.PI / 2;
    innerCourt.position.y = 0.01;
    innerCourt.receiveShadow = true;
    this.courtGroup.add(innerCourt);

    // 2. Crisp White Chalk Lines
    const lineMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const lineWidth = 0.08;

    const addLine = (w: number, l: number, x: number, z: number) => {
      const g = new THREE.PlaneGeometry(w, l);
      const m = new THREE.Mesh(g, lineMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.02, z);
      this.courtLines.add(m);
    };

    const halfL = TennisScene3D.COURT_LENGTH / 2;
    const halfW = TennisScene3D.COURT_WIDTH / 2;

    // Baselines
    addLine(TennisScene3D.COURT_WIDTH, lineWidth, 0, halfL);
    addLine(TennisScene3D.COURT_WIDTH, lineWidth, 0, -halfL);
    // Sidelines
    addLine(lineWidth, TennisScene3D.COURT_LENGTH, -halfW, 0);
    addLine(lineWidth, TennisScene3D.COURT_LENGTH, halfW, 0);
    // Service Lines (6.4m from net)
    const serviceDist = 6.4;
    addLine(TennisScene3D.COURT_WIDTH, lineWidth, 0, serviceDist);
    addLine(TennisScene3D.COURT_WIDTH, lineWidth, 0, -serviceDist);
    // Center Service Line
    addLine(lineWidth, serviceDist * 2, 0, 0);
    // Center Hash Marks on Baselines
    addLine(lineWidth, 0.3, 0, halfL - 0.15);
    addLine(lineWidth, 0.3, 0, -halfL + 0.15);

    this.courtGroup.add(this.courtLines);

    // 3. Tennis Net with rounded posts & white top tape
    this.netGroup = new THREE.Group();
    const netWidth = TennisScene3D.COURT_WIDTH + 1.8;
    const netHeight = TennisScene3D.NET_HEIGHT;

    // Net mesh
    const netGeo = new THREE.PlaneGeometry(netWidth, netHeight, 20, 4);
    const netMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.9,
      wireframe: true,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
    });
    const netMesh = new THREE.Mesh(netGeo, netMat);
    netMesh.position.set(0, netHeight / 2, 0);
    this.netGroup.add(netMesh);

    // White Top Tape
    const tapeGeo = new THREE.BoxGeometry(netWidth, 0.07, 0.04);
    const tapeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
    const tapeMesh = new THREE.Mesh(tapeGeo, tapeMat);
    tapeMesh.position.set(0, netHeight, 0);
    this.netGroup.add(tapeMesh);

    // Center Strap
    const strapGeo = new THREE.BoxGeometry(0.06, netHeight, 0.05);
    const strapMesh = new THREE.Mesh(strapGeo, tapeMat);
    strapMesh.position.set(0, netHeight / 2, 0);
    this.netGroup.add(strapMesh);

    // Rounded Posts
    const postGeo = new THREE.CylinderGeometry(0.07, 0.07, netHeight * 1.15, 16);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.8, roughness: 0.2 });
    const leftPost = new THREE.Mesh(postGeo, postMat);
    leftPost.position.set(-netWidth / 2, (netHeight * 1.15) / 2, 0);
    leftPost.castShadow = true;
    const rightPost = leftPost.clone();
    rightPost.position.x = netWidth / 2;
    this.netGroup.add(leftPost);
    this.netGroup.add(rightPost);

    this.courtGroup.add(this.netGroup);

    // 4. Stadium Stands & Low-Poly Spectators
    this.buildStadiumStands();
    this.courtGroup.add(this.standsGroup);

    this.scene.add(this.courtGroup);
  }

  /**
   * Procedural stadium stands with stylized tiered spectators
   */
  private buildStadiumStands() {
    const standMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7 });
    const rowColors = [0x38bdf8, 0xf43f5e, 0x10b981, 0xfbbf24, 0xa855f7, 0x64748b];

    // Left and Right Stands
    const createStandSide = (sideX: number) => {
      const sideGroup = new THREE.Group();
      for (let tier = 0; tier < 6; tier++) {
        const stepGeo = new THREE.BoxGeometry(3.5, 0.9, 36);
        const step = new THREE.Mesh(stepGeo, standMat);
        step.position.set(sideX + Math.sign(sideX) * tier * 2.8, tier * 0.9 + 0.45, 0);
        step.receiveShadow = true;
        sideGroup.add(step);

        // Low-poly rounded spectators (spheres and capsules)
        for (let p = -14; p <= 14; p += 2.2) {
          const personGroup = new THREE.Group();
          const shirtMat = new THREE.MeshStandardMaterial({
            color: rowColors[(tier + Math.abs(Math.floor(p))) % rowColors.length],
            roughness: 0.8,
          });
          const headMat = new THREE.MeshStandardMaterial({ color: 0xffedd5, roughness: 0.9 });

          const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.6, 8), shirtMat);
          body.position.y = 0.3;
          const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), headMat);
          head.position.y = 0.72;

          personGroup.add(body);
          personGroup.add(head);
          personGroup.position.set(step.position.x, step.position.y + 0.45, p);
          sideGroup.add(personGroup);
        }
      }
      return sideGroup;
    };

    this.standsGroup.add(createStandSide(-12));
    this.standsGroup.add(createStandSide(12));

    // Advertising Boards along baseline perimeter
    const adMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.4 });
    const adGeo = new THREE.BoxGeometry(22, 1.1, 0.4);
    const northAd = new THREE.Mesh(adGeo, adMat);
    northAd.position.set(0, 0.55, -21);
    northAd.castShadow = true;
    northAd.receiveShadow = true;
    this.standsGroup.add(northAd);

    const southAd = northAd.clone();
    southAd.position.z = 21;
    this.standsGroup.add(southAd);
  }

  /**
   * Procedural low-poly rounded humanoid tennis player (composite 3-12 parts)
   */
  private createPlayerCharacter(shirtColor: number, shortsColor: number, skinColor: number): Player3DModel {
    const root = new THREE.Group();

    // 1. Soft Ground Contact Shadow (never floating!)
    const shadowGeo = new THREE.CircleGeometry(0.75, 24);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    root.add(shadow);

    const skinMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.8 });
    const shirtMat = new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.6 });
    const shortsMat = new THREE.MeshStandardMaterial({ color: shortsColor, roughness: 0.7 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });

    // 2. Torso (Polo shirt with rounded chamfer)
    const torsoGeo = new THREE.CylinderGeometry(0.36, 0.32, 0.75, 12);
    const torso = new THREE.Mesh(torsoGeo, shirtMat);
    torso.position.y = 1.35;
    torso.castShadow = true;
    root.add(torso);

    // Collar
    const collarGeo = new THREE.CylinderGeometry(0.24, 0.28, 0.12, 10);
    const collar = new THREE.Mesh(collarGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }));
    collar.position.y = 0.4;
    torso.add(collar);

    // 3. Head & Headband
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.55, 0);

    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.25, 14, 14), skinMat);
    headMesh.castShadow = true;
    headGroup.add(headMesh);

    // Sweatband / Visor
    const bandMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.26, 0.26, 0.09, 14),
      new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.4 })
    );
    bandMesh.position.y = 0.08;
    headGroup.add(bandMesh);

    torso.add(headGroup);

    // 4. Shorts
    const shortsGeo = new THREE.CylinderGeometry(0.33, 0.36, 0.42, 12);
    const shorts = new THREE.Mesh(shortsGeo, shortsMat);
    shorts.position.y = -0.42;
    shorts.castShadow = true;
    torso.add(shorts);

    // 5. Legs (Left & Right)
    const createLeg = (xOffset: number) => {
      const legGroup = new THREE.Group();
      legGroup.position.set(xOffset, 0.95, 0);

      // Thigh & Shin
      const legMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.75, 10), skinMat);
      legMesh.position.y = -0.35;
      legMesh.castShadow = true;
      legGroup.add(legMesh);

      // Tennis Shoe
      const shoeMesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.36), shoeMat);
      shoeMesh.position.set(0, -0.72, 0.06);
      shoeMesh.castShadow = true;
      legGroup.add(shoeMesh);

      return legGroup;
    };

    const rightLeg = createLeg(0.2);
    const leftLeg = createLeg(-0.2);
    root.add(rightLeg);
    root.add(leftLeg);

    // 6. Arms & Tennis Racket
    const createArm = (xOffset: number) => {
      const armGroup = new THREE.Group();
      armGroup.position.set(xOffset, 1.6, 0);

      const upperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.45, 10), skinMat);
      upperArm.position.y = -0.22;
      upperArm.castShadow = true;
      armGroup.add(upperArm);

      // Wristband
      const wristband = new THREE.Mesh(
        new THREE.CylinderGeometry(0.11, 0.11, 0.08, 10),
        new THREE.MeshStandardMaterial({ color: shirtColor })
      );
      wristband.position.y = -0.38;
      armGroup.add(wristband);

      return armGroup;
    };

    const rightArm = createArm(0.42);
    const leftArm = createArm(-0.42);
    root.add(rightArm);
    root.add(leftArm);

    // Stylized Tennis Racket attached to right hand
    const racket = new THREE.Group();
    // Grip
    const gripGeo = new THREE.CylinderGeometry(0.035, 0.038, 0.48, 10);
    const gripMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9 });
    const grip = new THREE.Mesh(gripGeo, gripMat);
    grip.position.y = -0.24;
    grip.castShadow = true;
    racket.add(grip);

    // Racket Throat & Head
    const rimMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, metalness: 0.7, roughness: 0.25 });
    const rimGeo = new THREE.TorusGeometry(0.24, 0.032, 10, 24);
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.position.set(0, 0.28, 0);
    rim.castShadow = true;
    racket.add(rim);

    // Strings
    const stringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 });
    const stringGrid = new THREE.Mesh(new THREE.CircleGeometry(0.22, 16), stringMat);
    stringGrid.position.set(0, 0.28, 0);
    racket.add(stringGrid);

    // Attach racket to right arm hand
    racket.position.set(0, -0.42, 0.1);
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
   * Procedural tennis ball with optic yellow felt and curved white seams
   */
  private createTennisBall() {
    const ballCanvas = document.createElement('canvas');
    ballCanvas.width = 256;
    ballCanvas.height = 128;
    const ctx = ballCanvas.getContext('2d')!;

    // Fluorescent optic yellow base
    ctx.fillStyle = '#ccff00';
    ctx.fillRect(0, 0, 256, 128);

    // Curved white tennis ball seams
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(64, 64, 42, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(192, 64, 42, Math.PI / 2, (3 * Math.PI) / 2);
    ctx.stroke();

    const ballTexture = new THREE.CanvasTexture(ballCanvas);
    ballTexture.colorSpace = THREE.SRGBColorSpace;

    const ballGeo = new THREE.SphereGeometry(0.18, 18, 18);
    const ballMat = new THREE.MeshStandardMaterial({
      map: ballTexture,
      roughness: 0.7,
      metalness: 0.05,
    });

    this.ballMesh = new THREE.Mesh(ballGeo, ballMat);
    this.ballMesh.castShadow = true;
    this.ballMesh.position.set(0, 1.0, 0);
    this.scene.add(this.ballMesh);

    // Soft ball contact shadow on court floor
    const shadowGeo = new THREE.CircleGeometry(0.3, 16);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });
    this.ballShadow = new THREE.Mesh(shadowGeo, shadowMat);
    this.ballShadow.rotation.x = -Math.PI / 2;
    this.ballShadow.position.y = 0.02;
    this.scene.add(this.ballShadow);
  }

  /**
   * Spawn low-poly impact particle puff on ball bounce or racket hit
   */
  public triggerImpactPuff(pos: THREE.Vector3, color: number = 0xccff00) {
    const count = 16;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = pos.x;
      positions[i * 3 + 1] = pos.y;
      positions[i * 3 + 2] = pos.z;

      velocities[i * 3] = (Math.random() - 0.5) * 4.0;
      velocities[i * 3 + 1] = Math.random() * 3.5 + 1.0;
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 4.0;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    (geo as unknown as { userData: { velocities: Float32Array; life: number } }).userData = {
      velocities,
      life: 1.0,
    };

    const mat = new THREE.PointsMaterial({
      color,
      size: 0.14,
      transparent: true,
      opacity: 0.9,
    });

    const points = new THREE.Points(geo, mat);
    this.scene.add(points);
    this.impactParticles.push(points);
  }

  /**
   * Update character animations: run cycles, forehand/backhand swings
   */
  public updatePlayerAnimation(player: Player3DModel, dt: number) {
    // 1. Run cycle animation
    if (player.animState.isRunning) {
      player.animState.runCycle += dt * 10;
      const legAngle = Math.sin(player.animState.runCycle) * 0.6;
      player.rightLeg.rotation.x = legAngle;
      player.leftLeg.rotation.x = -legAngle;
      player.torso.position.y = 1.35 + Math.abs(Math.sin(player.animState.runCycle * 2)) * 0.08;
    } else {
      // Idle bounce
      player.rightLeg.rotation.x = THREE.MathUtils.damp(player.rightLeg.rotation.x, 0, 8, dt);
      player.leftLeg.rotation.x = THREE.MathUtils.damp(player.leftLeg.rotation.x, 0, 8, dt);
      player.torso.position.y = 1.35 + Math.sin(Date.now() * 0.005) * 0.03;
    }

    // 2. Racket swing animation
    if (player.animState.swingProgress > 0) {
      player.animState.swingProgress += dt * 4.5; // swing speed
      const p = player.animState.swingProgress;

      if (player.animState.swingType === 'BACKHAND') {
        // Backhand: arm winds across chest, then snaps forward
        player.rightArm.rotation.y = Math.sin(p * Math.PI) * 1.5 - 0.3;
        player.rightArm.rotation.x = -Math.sin(p * Math.PI) * 1.2;
        player.racket.rotation.z = Math.sin(p * Math.PI) * 1.8;
      } else if (player.animState.swingType === 'SMASH' || player.animState.swingType === 'SERVE') {
        // Overhead Serve / Smash
        player.rightArm.rotation.x = -Math.PI / 2 + Math.sin(p * Math.PI) * 2.2;
        player.racket.rotation.x = Math.sin(p * Math.PI) * 1.4;
      } else {
        // Forehand: arm sweeps forward in a fluid arc
        player.rightArm.rotation.y = -Math.sin(p * Math.PI) * 1.6 + 0.3;
        player.rightArm.rotation.x = -Math.sin(p * Math.PI) * 1.1;
        player.racket.rotation.z = -Math.sin(p * Math.PI) * 1.6;
      }

      if (player.animState.swingProgress >= 1.0) {
        player.animState.swingProgress = 0;
        player.animState.swingType = null;
      }
    } else {
      // Return arm and racket to athletic ready stance
      player.rightArm.rotation.x = THREE.MathUtils.damp(player.rightArm.rotation.x, 0.4, 6, dt);
      player.rightArm.rotation.y = THREE.MathUtils.damp(player.rightArm.rotation.y, -0.3, 6, dt);
      player.racket.rotation.x = THREE.MathUtils.damp(player.racket.rotation.x, Math.PI / 4, 6, dt);
      player.racket.rotation.z = THREE.MathUtils.damp(player.racket.rotation.z, 0, 6, dt);
    }
  }

  /**
   * Main per-frame render tick
   */
  public render(dt: number) {
    if (this.isDisposed) return;

    // Update particles
    for (let i = this.impactParticles.length - 1; i >= 0; i--) {
      const p = this.impactParticles[i];
      const uData = (p.geometry as unknown as { userData: { velocities: Float32Array; life: number } }).userData;
      uData.life -= dt * 2.5;

      const pos = p.geometry.attributes.position.array as Float32Array;
      const v = uData.velocities;
      for (let j = 0; j < pos.length / 3; j++) {
        pos[j * 3] += v[j * 3] * dt;
        pos[j * 3 + 1] += v[j * 3 + 1] * dt;
        pos[j * 3 + 2] += v[j * 3 + 2] * dt;
        v[j * 3 + 1] -= 9.8 * dt; // gravity on particles
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

    // Update ball shadow
    this.ballShadow.position.x = this.ballMesh.position.x;
    this.ballShadow.position.z = this.ballMesh.position.z;
    const heightFactor = Math.max(0.2, 1.0 - this.ballMesh.position.y * 0.12);
    this.ballShadow.scale.set(heightFactor, heightFactor, 1);
    (this.ballShadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.15, 0.55 - this.ballMesh.position.y * 0.08);

    // Smooth dynamic camera tracking ball trajectory in Broadcast mode
    if (this.graphicsConfig.cameraAngle === 'broadcast') {
      const targetCamX = THREE.MathUtils.clamp(this.ballMesh.position.x * 0.35, -4.5, 4.5);
      const targetCamY = 7.8 + Math.max(0, this.ballMesh.position.y * 0.2);
      this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, targetCamX, 4, dt);
      this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, targetCamY, 4, dt);

      _vec3Target.set(this.ballMesh.position.x * 0.25, 1.2, this.ballMesh.position.z * 0.2);
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
