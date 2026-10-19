/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { TennisScene3D } from './game/threeRenderer';
import { TennisMatchEngine } from './game/tennisMatchEngine';
import { mypcBridge } from './services/mypcBridge';
import { sound } from './services/sound';
import { TitleScreen } from './components/TitleScreen';
import { MatchHUD } from './components/MatchHUD';
import { SettingsModal } from './components/SettingsModal';
import { MotionLabView } from './components/MotionLabView';
import { PauseMenu } from './components/PauseMenu';
import { VictoryModal } from './components/VictoryModal';
import { GamepadMappingModal } from './components/GamepadMappingModal';
import {
  ChargingState,
  CourtSurface,
  GameMode,
  GraphicsConfig,
  MatchStats,
  PlayerConfig,
  PowerLevel,
  ScoreState,
  ShotType,
} from './types/game';

type AppScreen = 'title' | 'playing' | 'motion_lab';

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<TennisScene3D | null>(null);
  const engineRef = useRef<TennisMatchEngine | null>(null);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  // UI state
  const [currentScreen, setCurrentScreen] = useState<AppScreen>('title');
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [phoneConnected, setPhoneConnected] = useState<boolean>(false);
  const [courtSurface, setCourtSurface] = useState<CourtSurface>('hard');
  const [graphicsConfig, setGraphicsConfig] = useState<GraphicsConfig>({
    quality: mypcBridge.getQualityTier() === 'low' ? 'low' : 'mid',
    cameraAngle: 'chase',
    cameraZoom: 1.0,
    cameraHeight: 10.0,
    vfxLevel: 'high',
    spectators: mypcBridge.getQualityTier() !== 'low',
    shadows: false,
    pixelRatio: 1.0,
    gaugeSpeed: 'balanced',
    renderResolution: 'auto',
    scalingFilter: 'smooth',
  });

  const [chargingState, setChargingState] = useState<ChargingState | null>(null);

  // Match state
  const [scoreState, setScoreState] = useState<ScoreState>({
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
    announcementText: 'Grand Slam Center Court',
  });

  const [shotToast, setShotToast] = useState<{
    text: string;
    type: ShotType;
    power: PowerLevel;
  } | null>(null);
  const [rallyCount, setRallyCount] = useState<number>(0);
  const [matchWinner, setMatchWinner] = useState<1 | 2 | null>(null);
  const [finalStats, setFinalStats] = useState<MatchStats | null>(null);

  const [isGamepadMapOpen, setIsGamepadMapOpen] = useState<boolean>(false);
  const [isDoublesMatch, setIsDoublesMatch] = useState<boolean>(false);

  const [p1Config, setP1Config] = useState<PlayerConfig>({
    id: 1,
    team: 1,
    name: 'Player 1',
    isAI: false,
    controller: 'motion',
  });

  const [p2Config, setP2Config] = useState<PlayerConfig>({
    id: 2,
    team: 2,
    name: 'Challenger AI',
    isAI: true,
    controller: 'keyboard',
    difficulty: 'pro',
  });

  // Track screen in refs for the loop
  const screenRef = useRef<AppScreen>(currentScreen);
  screenRef.current = currentScreen;
  const isPausedRef = useRef<boolean>(isPaused);
  isPausedRef.current = isPaused;
  const isSettingsOpenRef = useRef<boolean>(isSettingsOpen);
  isSettingsOpenRef.current = isSettingsOpen;

  // 1. Initialize 3D Three.js Viewport & MyPC Bridge
  useEffect(() => {
    if (!mountRef.current) return;

    // Create 3D Scene
    const scene3D = new TennisScene3D(mountRef.current);
    sceneRef.current = scene3D;

    // Initialize My PC SDK handshake
    mypcBridge.initBridge();

    // Loop functions for strict onPause / onResume compliance
    const loop = (time: number) => {
      rafRef.current = requestAnimationFrame(loop);
      if (!lastTimeRef.current) lastTimeRef.current = time;
      const rawDt = (time - lastTimeRef.current) / 1000;
      lastTimeRef.current = time;
      const dt = Math.min(rawDt, 0.05);

      const scene = sceneRef.current;
      if (!scene) return;

      if (screenRef.current === 'title') {
        // Slow cinematic camera orbit around stadium
        const angle = time * 0.0003;
        scene.ballMesh.position.set(0, 0.8 + Math.sin(time * 0.003) * 0.4, 0);
        scene.player1.root.position.set(Math.sin(angle) * 2.5, 0, 11.5);
        scene.player2.root.position.set(-Math.sin(angle) * 2.5, 0, -11.5);
        scene.updatePlayerAnimation(scene.player1, dt);
        scene.updatePlayerAnimation(scene.player2, dt);
        scene.render(dt);
      } else if (screenRef.current === 'playing' && !isPausedRef.current) {
        if (engineRef.current) {
          engineRef.current.update(dt);
        }
        scene.render(dt);
      } else if (screenRef.current === 'motion_lab') {
        scene.render(dt);
      }
    };

    const startLoop = () => {
      if (!rafRef.current) {
        lastTimeRef.current = 0;
        rafRef.current = requestAnimationFrame(loop);
      }
    };

    const stopLoop = () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };

    // Connect MyPC SDK lifecycle hooks
    mypcBridge.onStartEvent(startLoop);
    mypcBridge.onPauseEvent(() => {
      setIsPaused(true);
      stopLoop();
    });
    mypcBridge.onResumeEvent(() => {
      setIsPaused(false);
      startLoop();
    });
    mypcBridge.onDestroyEvent(() => {
      stopLoop();
      if (engineRef.current) engineRef.current.dispose();
      if (sceneRef.current) sceneRef.current.dispose();
    });

    // Start loop immediately
    startLoop();

    // Listen to My PC pause menu options
    mypcBridge.onMenuEvent((menuId) => {
      if (menuId === 'resume') {
        setIsPaused(false);
        startLoop();
      } else if (menuId === 'restart') {
        setIsPaused(false);
        engineRef.current?.restart();
        startLoop();
      } else if (menuId === 'motion') {
        setIsPaused(false);
        setCurrentScreen('motion_lab');
      } else if (menuId === 'settings') {
        setIsSettingsOpen(true);
      } else if (menuId === 'quit') {
        setIsPaused(false);
        setCurrentScreen('title');
      }
    });

    // Handle Input actions (TV remote & keyboard)
    const unsubAction = mypcBridge.addActionListener((action, pressed, _repeat, dev) => {
      if (isSettingsOpenRef.current || isPausedRef.current || screenRef.current !== 'playing') {
        return;
      }

      const engine = engineRef.current;
      if (!engine) return;

      if (action === 'cancel' && pressed) {
        setIsPaused(true);
        stopLoop();
        return;
      }

      // Player 1 input
      if (dev === 'keys' || dev === 'pad0') {
        if (action === 'left') engine.p1Input.x = pressed ? -1 : 0;
        else if (action === 'right') engine.p1Input.x = pressed ? 1 : 0;
        else if (action === 'up') engine.p1Input.z = pressed ? -1 : 0;
        else if (action === 'down') engine.p1Input.z = pressed ? 1 : 0;
        else if (action === 'confirm') {
          if (pressed) engine.startCharging(1, 'FLAT');
          else engine.releaseCharging(1);
        } else if (action === 'run') {
          if (pressed) engine.startCharging(1, 'SLICE');
          else engine.releaseCharging(1);
        } else if (action === 'topspin') {
          if (pressed) engine.startCharging(1, 'TOPSPIN');
          else engine.releaseCharging(1);
        } else if (action === 'smash') {
          if (pressed) engine.startCharging(1, 'SMASH');
          else engine.releaseCharging(1);
        } else if (action === 'drop') {
          if (pressed) engine.startCharging(1, 'DROP');
          else engine.releaseCharging(1);
        }
      }

      // Player 2 input (Local 2P)
      if (dev === 'keys2' || dev === 'pad1') {
        if (action === 'left') engine.p2Input.x = pressed ? -1 : 0;
        else if (action === 'right') engine.p2Input.x = pressed ? 1 : 0;
        else if (action === 'up') engine.p2Input.z = pressed ? -1 : 0;
        else if (action === 'down') engine.p2Input.z = pressed ? 1 : 0;
        else if (action === 'confirm') {
          if (pressed) engine.startCharging(2, 'FLAT');
          else engine.releaseCharging(2);
        } else if (action === 'run') {
          if (pressed) engine.startCharging(2, 'SLICE');
          else engine.releaseCharging(2);
        } else if (action === 'topspin') {
          if (pressed) engine.startCharging(2, 'TOPSPIN');
          else engine.releaseCharging(2);
        } else if (action === 'smash') {
          if (pressed) engine.startCharging(2, 'SMASH');
          else engine.releaseCharging(2);
        } else if (action === 'drop') {
          if (pressed) engine.startCharging(2, 'DROP');
          else engine.releaseCharging(2);
        }
      }
    });

    // Handle Gamepad buttons
    const unsubButton = mypcBridge.addGamepadButtonListener((index, pressed, _val, dev, _name) => {
      if (index === 9 || index === 8) {
        // Start / Select button toggles pause menu
        if (pressed && screenRef.current === 'playing' && !isSettingsOpenRef.current) {
          setIsPaused((p) => {
            const next = !p;
            if (next) stopLoop();
            else startLoop();
            return next;
          });
        }
        return;
      }

      if (isSettingsOpenRef.current || isPausedRef.current || screenRef.current !== 'playing') {
        return;
      }

      const engine = engineRef.current;
      if (!engine) return;

      const playerIdx: 1 | 2 = dev === 'pad1' ? 2 : 1;

      if (pressed) {
        // Button Down: Begin charging shot & windup
        if (index === 0) {
          // A / ✕: Flat Drive (Auto Forehand/Backhand)
          engine.startCharging(playerIdx, 'FLAT');
        } else if (index === 1) {
          // B / ◯: Slice (Underspin)
          engine.startCharging(playerIdx, 'SLICE');
        } else if (index === 2) {
          // X / ▢: Heavy Topspin
          engine.startCharging(playerIdx, 'TOPSPIN');
        } else if (index === 3) {
          // Y / △: Overhead Smash / Tactical Lob
          engine.startCharging(playerIdx, 'SMASH');
        } else if (index === 5) {
          // RB / R1: Drop Shot
          engine.startCharging(playerIdx, 'DROP');
        } else if (index === 7) {
          // RT / R2: Power Smash / Winner
          engine.startCharging(playerIdx, 'SMASH');
        } else if (index === 4 || index === 6) {
          // LB / LT: Defensive Slice
          engine.startCharging(playerIdx, 'SLICE');
        }
      } else {
        // Button Released: Strike ball with captured power meter level!
        if (
          index === 0 ||
          index === 1 ||
          index === 2 ||
          index === 3 ||
          index === 4 ||
          index === 5 ||
          index === 6 ||
          index === 7
        ) {
          engine.releaseCharging(playerIdx);
        }
      }
    });

    // Handle Gamepad analog sticks
    const unsubAxes = mypcBridge.addGamepadAxesListener((axes, dev) => {
      const engine = engineRef.current;
      if (!engine) return;

      const deadzone = 0.15;
      const ax = Math.abs(axes[0]) > deadzone ? axes[0] : 0;
      const az = Math.abs(axes[1]) > deadzone ? axes[1] : 0;

      if (dev === 'pad1') {
        engine.p2Input.x = ax;
        engine.p2Input.z = -az;
      } else {
        engine.p1Input.x = ax;
        engine.p1Input.z = az;
      }
    });

    // Periodic check for phone controller in 'sensor-raw' mode
    const phoneCheckInterval = setInterval(() => {
      setPhoneConnected(mypcBridge.isPhoneMotionActive());
    }, 1000);

    return () => {
      stopLoop();
      clearInterval(phoneCheckInterval);
      unsubAction();
      unsubButton();
      unsubAxes();
      if (engineRef.current) engineRef.current.dispose();
      if (sceneRef.current) sceneRef.current.dispose();
    };
  }, []);

  // Toast timer auto-dismiss
  useEffect(() => {
    if (!shotToast) return;
    const timer = setTimeout(() => {
      setShotToast(null);
    }, 1800);
    return () => clearTimeout(timer);
  }, [shotToast]);

  // Start match
  const startMatch = (mode: GameMode) => {
    sound.init();
    sound.playUIBeep(true);

    const isDoubles = mode === 'doubles_ai' || mode === 'doubles_local';
    const isDoublesLocal = mode === 'doubles_local';
    const is2P = mode === 'local2p';
    const hasMotion = mypcBridge.isPhoneMotionActive();

    setIsDoublesMatch(isDoubles);

    const p1: PlayerConfig = {
      id: 1,
      team: 1,
      name: mypcBridge.getProfileName() || 'Player 1',
      isAI: false,
      controller: hasMotion ? 'motion' : 'gamepad',
    };

    const p2: PlayerConfig = {
      id: 2,
      team: 2,
      name: is2P ? 'Player 2' : (isDoubles ? 'CPU 1' : 'Grand Champion AI'),
      isAI: !is2P,
      controller: 'gamepad',
      difficulty: 'pro',
    };

    let p3: PlayerConfig | undefined;
    let p4: PlayerConfig | undefined;

    if (isDoubles) {
      p3 = {
        id: 3,
        team: 1,
        name: isDoublesLocal ? 'Friend (P2)' : 'Partner (AI)',
        isAI: !isDoublesLocal,
        controller: isDoublesLocal ? 'gamepad' : 'keyboard',
        difficulty: 'pro',
      };

      p4 = {
        id: 4,
        team: 2,
        name: 'CPU 2',
        isAI: true,
        controller: 'keyboard',
        difficulty: 'pro',
      };
    }

    setP1Config(p1);
    setP2Config(p2);
    setMatchWinner(null);
    setFinalStats(null);
    setIsPaused(false);

    if (sceneRef.current) {
      if (engineRef.current) engineRef.current.dispose();

      engineRef.current = new TennisMatchEngine(
        sceneRef.current,
        p1,
        p2,
        courtSurface,
        {
          onScoreUpdate: (newScore) => {
            setScoreState({ ...newScore });
          },
          onShotToast: (text, type, power) => {
            setShotToast({ text, type, power });
          },
          onRallyCount: (count) => {
            setRallyCount(count);
          },
          onMatchComplete: (winner, stats) => {
            setMatchWinner(winner);
            setFinalStats(stats);
          },
          onChargingUpdate: (charging) => {
            setChargingState(charging);
          },
        },
        isDoubles,
        p3,
        p4
      );

      if (engineRef.current) {
        engineRef.current.setGaugeSpeed(graphicsConfig.gaugeSpeed);
      }
    }

    setCurrentScreen('playing');
  };

  const handleChangeCourtSurface = (surface: CourtSurface) => {
    setCourtSurface(surface);
    if (sceneRef.current) {
      sceneRef.current.setCourtSurface(surface);
    }
    if (engineRef.current) {
      engineRef.current.setCourtSurface(surface);
    }
  };

  const handleChangeGraphicsConfig = (cfg: Partial<GraphicsConfig>) => {
    const updated = { ...graphicsConfig, ...cfg };
    setGraphicsConfig(updated);
    if (sceneRef.current) {
      sceneRef.current.setGraphicsConfig(updated);
      if (cfg.cameraAngle) {
        sceneRef.current.setCameraAngle(cfg.cameraAngle);
      }
      if (cfg.cameraZoom !== undefined) {
        sceneRef.current.setCameraZoom(cfg.cameraZoom);
      }
      if (cfg.cameraHeight !== undefined) {
        sceneRef.current.setCameraHeight(cfg.cameraHeight);
      }
      if (cfg.vfxLevel !== undefined) {
        sceneRef.current.setVFXLevel(cfg.vfxLevel);
      }
    }
    if (cfg.gaugeSpeed && engineRef.current) {
      engineRef.current.setGaugeSpeed(cfg.gaugeSpeed);
    }
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 font-sans select-none">
      {/* 3D WebGL Canvas Mount Container */}
      <div ref={mountRef} className="absolute inset-0 w-full h-full" />

      {/* Title Screen View */}
      {currentScreen === 'title' && (
        <TitleScreen
          onSelectMode={(mode) => {
            if (mode === 'motion_lab') {
              setCurrentScreen('motion_lab');
            } else {
              startMatch(mode);
            }
          }}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenGamepadMapping={() => setIsGamepadMapOpen(true)}
          phoneConnected={phoneConnected}
        />
      )}

      {/* In-Game Match HUD */}
      {currentScreen === 'playing' && (
        <MatchHUD
          score={scoreState}
          p1Name={isDoublesMatch ? `${p1Config.name} & Partner` : p1Config.name}
          p2Name={isDoublesMatch ? 'CPU 1 & CPU 2' : p2Config.name}
          p1Controller={phoneConnected ? 'Motion 📱' : 'Gamepad 🎮'}
          p2Controller={p2Config.isAI ? 'AI 🤖' : '2P 🎮'}
          currentShotToast={shotToast}
          rallyCount={rallyCount}
          cameraZoom={graphicsConfig.cameraZoom}
          onCameraZoomChange={(zoom) => {
            handleChangeGraphicsConfig({ cameraZoom: zoom });
          }}
          cameraAngle={graphicsConfig.cameraAngle}
          onCameraAngleChange={(mode) => {
            handleChangeGraphicsConfig({ cameraAngle: mode });
          }}
          cameraHeight={graphicsConfig.cameraHeight || 10.0}
          onCameraHeightChange={(height) => {
            handleChangeGraphicsConfig({ cameraHeight: height });
          }}
          renderResolution={graphicsConfig.renderResolution}
          onRenderResolutionChange={(res) => {
            handleChangeGraphicsConfig({ renderResolution: res });
          }}
          onPauseClick={() => {
            setIsPaused(true);
            if (rafRef.current) {
              cancelAnimationFrame(rafRef.current);
              rafRef.current = 0;
            }
          }}
          onOpenGamepadMapping={() => setIsGamepadMapOpen(true)}
          isDoubles={isDoublesMatch}
          chargingState={chargingState}
        />
      )}

      {/* Motion Lab Practice Screen */}
      {currentScreen === 'motion_lab' && (
        <MotionLabView onBack={() => setCurrentScreen('title')} />
      )}

      {/* In-Game Pause Menu */}
      {isPaused && currentScreen === 'playing' && (
        <PauseMenu
          onResume={() => {
            setIsPaused(false);
            if (!rafRef.current) {
              lastTimeRef.current = 0;
            }
          }}
          onRestart={() => {
            setIsPaused(false);
            engineRef.current?.restart();
          }}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenGamepadMapping={() => setIsGamepadMapOpen(true)}
          onOpenMotionLab={() => setCurrentScreen('motion_lab')}
          onQuitToTitle={() => {
            setIsPaused(false);
            setCurrentScreen('title');
          }}
        />
      )}

      {/* Game Settings Modal */}
      {isSettingsOpen && (
        <SettingsModal
          onClose={() => setIsSettingsOpen(false)}
          courtSurface={courtSurface}
          onChangeCourtSurface={handleChangeCourtSurface}
          graphicsConfig={graphicsConfig}
          onChangeGraphicsConfig={handleChangeGraphicsConfig}
          onOpenMotionLab={() => {
            setIsSettingsOpen(false);
            setCurrentScreen('motion_lab');
          }}
          onOpenGamepadMapping={() => setIsGamepadMapOpen(true)}
        />
      )}

      {/* Interactive Gamepad Buttons Mapping Modal */}
      <GamepadMappingModal
        isOpen={isGamepadMapOpen}
        onClose={() => setIsGamepadMapOpen(false)}
      />

      {/* Match Victory Modal */}
      {matchWinner && finalStats && (
        <VictoryModal
          winner={matchWinner}
          p1Name={p1Config.name}
          p2Name={p2Config.name}
          stats={finalStats}
          onPlayAgain={() => {
            setMatchWinner(null);
            setFinalStats(null);
            engineRef.current?.restart();
          }}
          onQuitToTitle={() => {
            setMatchWinner(null);
            setFinalStats(null);
            setCurrentScreen('title');
          }}
        />
      )}
    </div>
  );
}
