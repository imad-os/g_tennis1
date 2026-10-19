/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { motionDSP } from '../services/motionDSPs';
import { sound } from '../services/sound';
import { mypcBridge } from '../services/mypcBridge';
import { CourtSurface, GraphicsConfig } from '../types/game';
import { t } from '../services/i18n';

interface SettingsModalProps {
  onClose: () => void;
  courtSurface: CourtSurface;
  onChangeCourtSurface: (surface: CourtSurface) => void;
  graphicsConfig: GraphicsConfig;
  onChangeGraphicsConfig: (cfg: Partial<GraphicsConfig>) => void;
  onOpenMotionLab: () => void;
  onOpenGamepadMapping?: () => void;
}

type TabKey = 'motion' | 'graphics' | 'audio' | 'controls';

export const SettingsModal: React.FC<SettingsModalProps> = ({
  onClose,
  courtSurface,
  onChangeCourtSurface,
  graphicsConfig,
  onChangeGraphicsConfig,
  onOpenMotionLab,
  onOpenGamepadMapping,
}) => {
  const strings = t();
  const tabs: TabKey[] = ['motion', 'graphics', 'audio', 'controls'];
  const [activeTab, setActiveTab] = useState<TabKey>('motion');
  // 0: Tab selector header (Left/Right to switch tabs on TV Remote)
  // 1..N: Tab items
  // Last: Close button
  const [focusedIndex, setFocusedIndex] = useState<number>(0);
  const [motionConfig, setMotionConfig] = useState(motionDSP.getConfig());
  const [calibratedMsg, setCalibratedMsg] = useState(false);
  const [isLeftHanded, setIsLeftHanded] = useState(motionDSP.getLeftHanded());
  const [soundMuted, setSoundMuted] = useState(false);

  // Focusable item counts per tab (including index 0 as Tab Bar)
  const getTabItemCount = (tab: TabKey): number => {
    switch (tab) {
      case 'motion': return 7; // 0: Tabs, 1: Calibrate, 2: Motion Lab, 3: Right/Left Hand, 4: Sensitivity, 5: Smoothing, 6: Close
      case 'graphics': return 10; // 0: Tabs, 1: Quality, 2: Camera, 3: Height, 4: Zoom, 5: VFX, 6: Court, 7: Render Resolution, 8: Scaling Filter, 9: Close
      case 'audio': return 3; // 0: Tabs, 1: Mute/Unmute, 2: Close
      case 'controls': return 3; // 0: Tabs, 1: Gauge Speed, 2: Close
    }
  };

  // TV Remote, Keyboard, and Gamepad input listener for menu navigation
  useEffect(() => {
    const unsubAction = mypcBridge.addActionListener((action, pressed) => {
      if (!pressed) return;

      if (action === 'cancel') {
        sound.playUIBeep(false);
        onClose();
        return;
      }

      if (action === 'up') {
        sound.playUIBeep(false);
        setFocusedIndex((prev) => (prev > 0 ? prev - 1 : getTabItemCount(activeTab) - 1));
      } else if (action === 'down') {
        sound.playUIBeep(false);
        setFocusedIndex((prev) => (prev < getTabItemCount(activeTab) - 1 ? prev + 1 : 0));
      } else if (action === 'left' || action === 'right') {
        sound.playUIBeep(false);
        handleHorizontalNav(action === 'right');
      } else if (action === 'confirm') {
        sound.playUIBeep(true);
        handleActivateFocused();
      }
    });

    const unsubGamepad = mypcBridge.addGamepadButtonListener((index, pressed) => {
      if (!pressed) return;
      if (index === 1) {
        // B button: Back
        onClose();
      } else if (index === 4) {
        // LB: Previous tab
        cycleTab(-1);
      } else if (index === 5) {
        // RB: Next tab
        cycleTab(1);
      }
    });

    return () => {
      unsubAction();
      unsubGamepad();
    };
  }, [activeTab, focusedIndex, motionConfig, courtSurface, graphicsConfig, isLeftHanded, soundMuted]);

  const cycleTab = (dir: number) => {
    sound.playUIBeep();
    const currIdx = tabs.indexOf(activeTab);
    const nextIdx = (currIdx + dir + tabs.length) % tabs.length;
    setActiveTab(tabs[nextIdx]);
    setFocusedIndex(0);
  };

  const handleHorizontalNav = (toRight: boolean) => {
    // If focused on Tab Bar (index 0), cycle tabs
    if (focusedIndex === 0) {
      cycleTab(toRight ? 1 : -1);
      return;
    }

    if (activeTab === 'motion') {
      if (focusedIndex === 4) {
        // Sensitivity
        const step = toRight ? 0.1 : -0.1;
        const next = Math.max(0.5, Math.min(2.5, motionConfig.sensitivity + step));
        handleSensitivity(next);
      } else if (focusedIndex === 5) {
        // Smoothing
        const step = toRight ? 0.05 : -0.05;
        const next = Math.max(0.2, Math.min(0.85, motionConfig.smoothing + step));
        handleSmoothing(next);
      } else if (focusedIndex === 3) {
        // Hand toggle
        handleHandToggle(!isLeftHanded);
      }
    } else if (activeTab === 'graphics') {
      if (focusedIndex === 1) {
        // Quality cycle
        const qualities: GraphicsConfig['quality'][] = ['very_low', 'low', 'mid', 'high', 'fancy'];
        const idx = qualities.indexOf(graphicsConfig.quality);
        const next = qualities[(idx + (toRight ? 1 : -1) + qualities.length) % qualities.length];
        onChangeGraphicsConfig({ quality: next });
      } else if (focusedIndex === 2) {
        // Camera cycle
        const cams: GraphicsConfig['cameraAngle'][] = ['chase', 'mount', 'broadcast', 'baseline', 'overhead'];
        const idx = cams.indexOf(graphicsConfig.cameraAngle);
        const next = cams[(idx + (toRight ? 1 : -1) + cams.length) % cams.length];
        onChangeGraphicsConfig({ cameraAngle: next });
      } else if (focusedIndex === 3) {
        // Camera Height slider (1m to 50m, default 10m)
        const step = toRight ? 2 : -2;
        const currentH = graphicsConfig.cameraHeight || 10;
        const nextH = Math.max(1, Math.min(50, currentH + step));
        onChangeGraphicsConfig({ cameraHeight: nextH });
      } else if (focusedIndex === 4) {
        // Camera Zoom slider
        const step = toRight ? 0.05 : -0.05;
        const currentZoom = graphicsConfig.cameraZoom || 1.0;
        const nextZoom = Math.max(0.6, Math.min(1.7, currentZoom + step));
        onChangeGraphicsConfig({ cameraZoom: nextZoom });
      } else if (focusedIndex === 5) {
        // Visual Effects cycle (low, medium, high)
        const vfxList: GraphicsConfig['vfxLevel'][] = ['low', 'medium', 'high'];
        const currentVfx = graphicsConfig.vfxLevel || 'high';
        const idx = vfxList.indexOf(currentVfx);
        const nextVfx = vfxList[(idx + (toRight ? 1 : -1) + vfxList.length) % vfxList.length];
        onChangeGraphicsConfig({ vfxLevel: nextVfx });
      } else if (focusedIndex === 6) {
        // Court surface cycle
        const courts: CourtSurface[] = ['hard', 'clay', 'grass'];
        const idx = courts.indexOf(courtSurface);
        const next = courts[(idx + (toRight ? 1 : -1) + courts.length) % courts.length];
        onChangeCourtSurface(next);
      } else if (focusedIndex === 7) {
        // Render Resolution cycle (480p, 720p, 1080p, auto)
        const resolutions: GraphicsConfig['renderResolution'][] = ['480p', '720p', '1080p', 'auto'];
        const currentRes = graphicsConfig.renderResolution || 'auto';
        const idx = resolutions.indexOf(currentRes);
        const nextRes = resolutions[(idx + (toRight ? 1 : -1) + resolutions.length) % resolutions.length];
        onChangeGraphicsConfig({ renderResolution: nextRes });
      } else if (focusedIndex === 8) {
        // Display Scaling Filter cycle (smooth, pixelated)
        const filters: GraphicsConfig['scalingFilter'][] = ['smooth', 'pixelated'];
        const currentFilter = graphicsConfig.scalingFilter || 'smooth';
        const idx = filters.indexOf(currentFilter);
        const nextFilter = filters[(idx + (toRight ? 1 : -1) + filters.length) % filters.length];
        onChangeGraphicsConfig({ scalingFilter: nextFilter });
      }
    } else if (activeTab === 'controls') {
      if (focusedIndex === 1) {
        const speeds: GraphicsConfig['gaugeSpeed'][] = ['relaxed', 'balanced', 'fast'];
        const current = graphicsConfig.gaugeSpeed || 'balanced';
        const idx = speeds.indexOf(current);
        const next = speeds[(idx + (toRight ? 1 : -1) + speeds.length) % speeds.length];
        onChangeGraphicsConfig({ gaugeSpeed: next });
      }
    }
  };

  const handleActivateFocused = () => {
    const lastIdx = getTabItemCount(activeTab) - 1;
    if (focusedIndex === lastIdx) {
      onClose();
      return;
    }

    if (activeTab === 'motion') {
      if (focusedIndex === 1) handleCalibrate();
      else if (focusedIndex === 2) onOpenMotionLab();
      else if (focusedIndex === 3) handleHandToggle(!isLeftHanded);
    } else if (activeTab === 'graphics') {
      handleHorizontalNav(true);
    } else if (activeTab === 'audio') {
      if (focusedIndex === 1) {
        const next = !soundMuted;
        setSoundMuted(next);
        sound.setMuted(next);
      }
    } else if (activeTab === 'controls') {
      if (focusedIndex === 1) {
        handleHorizontalNav(true);
      }
    }
  };

  const handleCalibrate = () => {
    sound.playUIBeep(true);
    motionDSP.calibrateGrip();
    setMotionConfig(motionDSP.getConfig());
    setCalibratedMsg(true);
    setTimeout(() => setCalibratedMsg(false), 2000);
  };

  const handleSensitivity = (val: number) => {
    motionDSP.setConfig({ sensitivity: val });
    setMotionConfig(motionDSP.getConfig());
  };

  const handleSmoothing = (val: number) => {
    motionDSP.setConfig({ smoothing: val });
    setMotionConfig(motionDSP.getConfig());
  };

  const handleHandToggle = (val: boolean) => {
    setIsLeftHanded(val);
    motionDSP.setLeftHanded(val);
  };

  return (
    <div className="absolute inset-0 bg-[#020617] z-40 flex items-center justify-center p-4 md:p-6 pointer-events-auto">
      <div className="bg-[#0f172a] border-2 border-slate-700 rounded-3xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Top Header */}
        <div className="flex items-center justify-between p-6 bg-[#0f172a] border-b border-slate-800">
          <div>
            <h2 className="font-display text-xl md:text-2xl font-bold text-white flex items-center gap-2">
              <span>⚙️</span> {strings.settings}
            </h2>
            <p className="text-xs text-slate-400">TV Remote / Gamepad / Keyboard Fully Supported</p>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center text-sm font-bold transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Tab Selector (Index 0 on focus: Left/Right to cycle on TV Remote or LB/RB on pad) */}
        <div
          className={`flex items-center gap-1 p-2 bg-[#090d16] border-b border-slate-800 transition-all ${
            focusedIndex === 0 ? 'ring-2 ring-lime-400/80 bg-slate-900' : ''
          }`}
        >
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => {
                sound.playUIBeep();
                setActiveTab(tab);
                setFocusedIndex(0);
              }}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
                activeTab === tab
                  ? 'bg-lime-400 text-slate-950 font-black'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              {tab === 'motion' && strings.motionTab}
              {tab === 'graphics' && strings.graphicsTab}
              {tab === 'audio' && strings.audioTab}
              {tab === 'controls' && strings.controlsTab}
            </button>
          ))}
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-4 text-xs text-slate-300 bg-[#0f172a]">
          {activeTab === 'motion' && (
            <div className="space-y-3">
              {/* Item 1: Grip Calibration */}
              <div
                className={`p-4 rounded-2xl bg-[#090d16] border transition-all ${
                  focusedIndex === 1
                    ? 'border-sky-400 ring-4 ring-sky-400/40 scale-[1.01]'
                    : 'border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-sm">Grip Calibration</span>
                  {calibratedMsg ? (
                    <span className="text-lime-400 font-mono text-[11px]">{strings.calibrated}</span>
                  ) : (
                    <span className="text-slate-500 text-[10px]">Press OK / A to Calibrate</span>
                  )}
                </div>
                <p className="text-slate-400 leading-relaxed mt-1 text-[11px]">
                  {strings.calibrateDesc}
                </p>
                <button
                  onClick={handleCalibrate}
                  className="w-full mt-2.5 py-2.5 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 font-bold transition-colors"
                >
                  {strings.calibrate}
                </button>
              </div>

              {/* Item 2: Open Motion Lab */}
              <div
                className={`p-3.5 rounded-2xl bg-[#090d16] border flex items-center justify-between transition-all ${
                  focusedIndex === 2
                    ? 'border-sky-400 ring-4 ring-sky-400/40 scale-[1.01]'
                    : 'border-slate-800'
                }`}
              >
                <div>
                  <div className="font-bold text-white text-xs">{strings.motionLab}</div>
                  <div className="text-[11px] text-slate-400">Live oscilloscope, swing tests, and diagnostics</div>
                </div>
                <button
                  onClick={onOpenMotionLab}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-300 font-bold border border-sky-500/30 text-xs"
                >
                  Open Lab →
                </button>
              </div>

              {/* Item 3: Dominant Hand */}
              <div
                className={`p-4 rounded-2xl bg-[#090d16] border space-y-2 transition-all ${
                  focusedIndex === 3
                    ? 'border-sky-400 ring-4 ring-sky-400/40 scale-[1.01]'
                    : 'border-slate-800'
                }`}
              >
                <div className="flex justify-between items-center">
                  <span className="font-bold text-white">{strings.dominantHand}</span>
                  <span className="text-lime-400 font-bold">{isLeftHanded ? strings.leftHand : strings.rightHand}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleHandToggle(false)}
                    className={`py-2 rounded-xl font-bold border ${
                      !isLeftHanded
                        ? 'bg-lime-400 text-slate-950 border-lime-400'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    {strings.rightHand}
                  </button>
                  <button
                    onClick={() => handleHandToggle(true)}
                    className={`py-2 rounded-xl font-bold border ${
                      isLeftHanded
                        ? 'bg-lime-400 text-slate-950 border-lime-400'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    {strings.leftHand}
                  </button>
                </div>
              </div>

              {/* Item 4: Sensitivity */}
              <div
                className={`p-4 rounded-2xl bg-[#090d16] border space-y-2 transition-all ${
                  focusedIndex === 4
                    ? 'border-sky-400 ring-4 ring-sky-400/40 scale-[1.01]'
                    : 'border-slate-800'
                }`}
              >
                <div className="flex justify-between">
                  <span className="font-bold text-white">{strings.sensitivity} (← → to adjust)</span>
                  <span className="font-mono text-lime-400 font-bold">{motionConfig.sensitivity.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="2.5"
                  step="0.1"
                  value={motionConfig.sensitivity}
                  onChange={(e) => handleSensitivity(parseFloat(e.target.value))}
                  className="w-full accent-lime-400"
                />
              </div>

              {/* Item 5: Smoothing */}
              <div
                className={`p-4 rounded-2xl bg-[#090d16] border space-y-2 transition-all ${
                  focusedIndex === 5
                    ? 'border-sky-400 ring-4 ring-sky-400/40 scale-[1.01]'
                    : 'border-slate-800'
                }`}
              >
                <div className="flex justify-between">
                  <span className="font-bold text-white">{strings.smoothing} (← → to adjust)</span>
                  <span className="font-mono text-lime-400 font-bold">{(motionConfig.smoothing * 100).toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min="0.2"
                  max="0.85"
                  step="0.05"
                  value={motionConfig.smoothing}
                  onChange={(e) => handleSmoothing(parseFloat(e.target.value))}
                  className="w-full accent-lime-400"
                />
              </div>
            </div>
          )}

          {activeTab === 'graphics' && (
            <div className="space-y-4">
              {/* Item 1: Quality Preset */}
              <div
                className={`p-4 rounded-2xl bg-[#090d16] border space-y-2.5 transition-all ${
                  focusedIndex === 1
                    ? 'border-sky-400 ring-4 ring-sky-400/40 scale-[1.01]'
                    : 'border-slate-800'
                }`}
              >
                <div className="flex justify-between items-center">
                  <span className="font-bold text-white">{strings.quality}</span>
                  <span className="text-lime-400 font-bold uppercase">{graphicsConfig.quality.replace('_', ' ')}</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  {[
                    { id: 'very_low', label: 'Very Low (Fast)' },
                    { id: 'low', label: 'Low (TV 60fps)' },
                    { id: 'mid', label: 'Mid (Balanced)' },
                    { id: 'high', label: 'High (Detail)' },
                    { id: 'fancy', label: 'Fancy (Round & Hi-Poly)' },
                  ].map((q) => (
                    <button
                      key={q.id}
                      onClick={() => onChangeGraphicsConfig({ quality: q.id as GraphicsConfig['quality'] })}
                      className={`py-2 px-1 text-[11px] rounded-xl font-bold border transition-colors ${
                        graphicsConfig.quality === q.id
                          ? 'bg-lime-400 text-slate-950 border-lime-400 shadow-md shadow-lime-400/20'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Item 2: Camera Angle */}
              <div
                className={`p-4 rounded-2xl bg-[#090d16] border space-y-2.5 transition-all ${
                  focusedIndex === 2
                    ? 'border-sky-400 ring-4 ring-sky-400/40 scale-[1.01]'
                    : 'border-slate-800'
                }`}
              >
                <div className="flex justify-between items-center">
                  <span className="font-bold text-white">{strings.camera}</span>
                  <span className="text-lime-400 font-bold uppercase">{graphicsConfig.cameraAngle}</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  {[
                    { id: 'chase', label: 'Follow' },
                    { id: 'mount', label: 'Mount POV' },
                    { id: 'broadcast', label: 'Broadcast' },
                    { id: 'baseline', label: 'Baseline' },
                    { id: 'overhead', label: 'Overhead' },
                  ].map((cam) => (
                    <button
                      key={cam.id}
                      onClick={() => onChangeGraphicsConfig({ cameraAngle: cam.id as GraphicsConfig['cameraAngle'] })}
                      className={`py-2 px-1 text-[11px] rounded-xl font-bold border transition-colors ${
                        graphicsConfig.cameraAngle === cam.id
                          ? 'bg-lime-400 text-slate-950 border-lime-400'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {cam.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Item 3: Mount Camera Height Slider (1m to 50m, default 10m) */}
              <div
                className={`p-4 rounded-2xl bg-[#090d16] border space-y-2.5 transition-all ${
                  focusedIndex === 3
                    ? 'border-sky-400 ring-4 ring-sky-400/40 scale-[1.01]'
                    : 'border-slate-800'
                }`}
              >
                <div className="flex justify-between items-center">
                  <span className="font-bold text-white">
                    📐 Mount Camera Height (1m–50m, Default 10m)
                  </span>
                  <span className="font-mono text-lime-400 font-bold">
                    {(graphicsConfig.cameraHeight || 10).toFixed(0)} meters
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400">1m (Player Level)</span>
                  <input
                    type="range"
                    min="1"
                    max="50"
                    step="1"
                    value={graphicsConfig.cameraHeight || 10}
                    onChange={(e) => onChangeGraphicsConfig({ cameraHeight: parseFloat(e.target.value) })}
                    className="w-full accent-lime-400 cursor-pointer"
                  />
                  <span className="text-xs text-slate-400">50m (High Stadium Stand)</span>
                </div>
              </div>

              {/* Item 4: Camera Zoom Slider */}
              <div
                className={`p-4 rounded-2xl bg-[#090d16] border space-y-2.5 transition-all ${
                  focusedIndex === 4
                    ? 'border-sky-400 ring-4 ring-sky-400/40 scale-[1.01]'
                    : 'border-slate-800'
                }`}
              >
                <div className="flex justify-between items-center">
                  <span className="font-bold text-white">Camera Zoom Distance (← → to adjust)</span>
                  <span className="font-mono text-lime-400 font-bold">
                    {((graphicsConfig.cameraZoom || 1.0) * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400">Close Up</span>
                  <input
                    type="range"
                    min="0.6"
                    max="1.7"
                    step="0.05"
                    value={graphicsConfig.cameraZoom || 1.0}
                    onChange={(e) => onChangeGraphicsConfig({ cameraZoom: parseFloat(e.target.value) })}
                    className="w-full accent-lime-400 cursor-pointer"
                  />
                  <span className="text-xs text-slate-400">Wide View</span>
                </div>
              </div>

              {/* Item 5: Visual Effects (Low: remove all, Medium: keep half, High: keep all) */}
              <div
                className={`p-4 rounded-2xl bg-[#090d16] border space-y-2.5 transition-all ${
                  focusedIndex === 5
                    ? 'border-sky-400 ring-4 ring-sky-400/40 scale-[1.01]'
                    : 'border-slate-800'
                }`}
              >
                <div className="flex justify-between items-center">
                  <span className="font-bold text-white">✨ Visual Effects (Ball Hit Sprinkles &amp; Dust)</span>
                  <span className="text-lime-400 font-bold uppercase">{graphicsConfig.vfxLevel || 'high'}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'low', label: 'Low', sub: 'Remove all sprinkles (0%)' },
                    { id: 'medium', label: 'Medium', sub: 'Keep half sprinkles (50%)' },
                    { id: 'high', label: 'High', sub: 'Keep all visual effects (100%)' },
                  ].map((v) => {
                    const isCur = (graphicsConfig.vfxLevel || 'high') === v.id;
                    return (
                      <button
                        key={v.id}
                        onClick={() => onChangeGraphicsConfig({ vfxLevel: v.id as GraphicsConfig['vfxLevel'] })}
                        className={`py-2 px-2 rounded-xl font-bold border transition-colors text-center ${
                          isCur
                            ? 'bg-lime-400 text-slate-950 border-lime-400 shadow-md shadow-lime-400/20'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        <div className="text-xs">{v.label}</div>
                        <div className={`text-[10px] ${isCur ? 'text-slate-950/80' : 'text-slate-500'}`}>
                          {v.sub}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Item 6: Court Surface */}
              <div
                className={`p-4 rounded-2xl bg-[#090d16] border space-y-2.5 transition-all ${
                  focusedIndex === 6
                    ? 'border-sky-400 ring-4 ring-sky-400/40 scale-[1.01]'
                    : 'border-slate-800'
                }`}
              >
                <div className="flex justify-between items-center">
                  <span className="font-bold text-white">{strings.surface}</span>
                  <span className="text-lime-400 font-bold uppercase">{courtSurface}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => onChangeCourtSurface('hard')}
                    className={`py-2 rounded-xl font-bold border text-xs ${
                      courtSurface === 'hard'
                        ? 'bg-blue-600 text-white border-blue-400'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    Center Hard Court
                  </button>
                  <button
                    onClick={() => onChangeCourtSurface('clay')}
                    className={`py-2 rounded-xl font-bold border text-xs ${
                      courtSurface === 'clay'
                        ? 'bg-orange-600 text-white border-orange-400'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    Roland-Garros Clay
                  </button>
                  <button
                    onClick={() => onChangeCourtSurface('grass')}
                    className={`py-2 rounded-xl font-bold border text-xs ${
                      courtSurface === 'grass'
                        ? 'bg-emerald-600 text-white border-emerald-400'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    Wimbledon Grass
                  </button>
                </div>
              </div>

              {/* Item 7: Render Resolution (480p, 720p, 1080p, Auto) */}
              <div
                className={`p-4 rounded-2xl bg-[#090d16] border space-y-2.5 transition-all ${
                  focusedIndex === 7
                    ? 'border-sky-400 ring-4 ring-sky-400/40 scale-[1.01]'
                    : 'border-slate-800'
                }`}
              >
                <div className="flex justify-between items-center">
                  <div className="flex flex-col">
                    <span className="font-bold text-white">🖥️ Render Resolution (Full-Screen Upscaled)</span>
                    <span className="text-[11px] text-slate-400">Lower resolution renders faster on TV while staying full screen</span>
                  </div>
                  <span className="text-lime-400 font-bold uppercase font-mono">
                    {graphicsConfig.renderResolution || 'auto'}
                  </span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {[
                    { id: '480p', label: '480p SD', desc: 'Max FPS · Lowest GPU load' },
                    { id: '720p', label: '720p HD', desc: 'Balanced · Smooth 60 FPS' },
                    { id: '1080p', label: '1080p FHD', desc: 'Sharp · High fidelity' },
                    { id: 'auto', label: 'Native Auto', desc: 'Matches display 1:1' },
                  ].map((r) => {
                    const isCur = (graphicsConfig.renderResolution || 'auto') === r.id;
                    return (
                      <button
                        key={r.id}
                        onClick={() => onChangeGraphicsConfig({ renderResolution: r.id as any })}
                        className={`py-2 px-2 rounded-xl font-bold border transition-colors text-center cursor-pointer ${
                          isCur
                            ? 'bg-lime-400 text-slate-950 border-lime-400 shadow-md shadow-lime-400/20'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        <div className="text-xs">{r.label}</div>
                        <div className={`text-[10px] ${isCur ? 'text-slate-950/80 font-medium' : 'text-slate-500'}`}>
                          {r.desc}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Item 8: Full-Screen Scaling Filter (Smooth Bilinear vs Crisp Pixelated) */}
              <div
                className={`p-4 rounded-2xl bg-[#090d16] border space-y-2.5 transition-all ${
                  focusedIndex === 8
                    ? 'border-sky-400 ring-4 ring-sky-400/40 scale-[1.01]'
                    : 'border-slate-800'
                }`}
              >
                <div className="flex justify-between items-center">
                  <div className="flex flex-col">
                    <span className="font-bold text-white">📺 Full-Screen Display Scaling Filter</span>
                    <span className="text-[11px] text-slate-400">Controls how your TV and GPU upscale lower render resolutions</span>
                  </div>
                  <span className="text-lime-400 font-bold uppercase font-mono">
                    {graphicsConfig.scalingFilter || 'smooth'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'smooth', label: 'Smooth (Bilinear)', desc: 'Standard TV hardware smoothing filter' },
                    { id: 'pixelated', label: 'Crisp Pixelated', desc: 'Sharp retro integer scaling' },
                  ].map((f) => {
                    const isCur = (graphicsConfig.scalingFilter || 'smooth') === f.id;
                    return (
                      <button
                        key={f.id}
                        onClick={() => onChangeGraphicsConfig({ scalingFilter: f.id as any })}
                        className={`py-2 px-3 rounded-xl font-bold border transition-colors text-center cursor-pointer ${
                          isCur
                            ? 'bg-lime-400 text-slate-950 border-lime-400 shadow-md shadow-lime-400/20'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        <div className="text-xs">{f.label}</div>
                        <div className={`text-[10px] ${isCur ? 'text-slate-950/80 font-medium' : 'text-slate-500'}`}>
                          {f.desc}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'audio' && (
            <div className="space-y-4">
              <div
                className={`p-4 rounded-2xl bg-[#090d16] border flex items-center justify-between transition-all ${
                  focusedIndex === 1
                    ? 'border-sky-400 ring-4 ring-sky-400/40 scale-[1.01]'
                    : 'border-slate-800'
                }`}
              >
                <div>
                  <div className="font-bold text-white">{strings.soundSfx}</div>
                  <div className="text-slate-400 text-[11px]">Racket strike, ball bounce, crowd cheering</div>
                </div>
                <button
                  onClick={() => {
                    const next = !soundMuted;
                    setSoundMuted(next);
                    sound.setMuted(next);
                  }}
                  className={`px-5 py-2.5 rounded-xl font-bold text-xs ${
                    soundMuted ? 'bg-rose-900 text-rose-200' : 'bg-lime-400 text-slate-950'
                  }`}
                >
                  {soundMuted ? strings.muted : strings.enabled}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'controls' && (
            <div className="space-y-3">
              {/* Power Gauge Speed Setting */}
              <div
                className={`p-4 rounded-2xl bg-[#090d16] border space-y-2 transition-all ${
                  focusedIndex === 1 ? 'border-lime-400 ring-2 ring-lime-400/30' : 'border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-lime-400">⚡ Power Gauge Speed (Hold-to-Charge)</span>
                  <span className="text-xs text-sky-400 font-mono font-semibold">
                    {graphicsConfig.gaugeSpeed === 'relaxed'
                      ? 'Relaxed (1.8s sweep)'
                      : graphicsConfig.gaugeSpeed === 'fast'
                      ? 'Competitive (0.8s sweep)'
                      : 'Balanced (1.2s sweep)'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'relaxed', label: 'Relaxed (1.8s)', sub: 'Easy timing' },
                    { id: 'balanced', label: 'Balanced (1.2s)', sub: 'Standard TV' },
                    { id: 'fast', label: 'Fast (0.8s)', sub: 'Quick reflex' },
                  ].map((speed) => {
                    const isCur = (graphicsConfig.gaugeSpeed || 'balanced') === speed.id;
                    return (
                      <button
                        key={speed.id}
                        onClick={() => onChangeGraphicsConfig({ gaugeSpeed: speed.id as any })}
                        className={`p-2.5 rounded-xl border text-center transition-all ${
                          isCur
                            ? 'bg-lime-400 text-slate-950 border-lime-400 font-bold shadow-md shadow-lime-400/20'
                            : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <div className="text-xs font-bold">{speed.label}</div>
                        <div className={`text-[10px] ${isCur ? 'text-slate-900/80 font-medium' : 'text-slate-400'}`}>
                          {speed.sub}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-[#090d16] border border-slate-800 space-y-1">
                <span className="font-bold text-lime-400">📱 Phone Motion Controller (My PC SDK)</span>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  Hold phone in relaxed grip like a tennis racket handle. Player character automatically navigates to incoming ball landing zone. Swing phone physically to strike: Forehand (inward sweep) or Backhand (outward sweep).
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-[#090d16] border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sky-400">🎮 Game Controller / Gamepad</span>
                  {onOpenGamepadMapping && (
                    <button
                      onClick={onOpenGamepadMapping}
                      className="px-3 py-1.5 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
                    >
                      <span>🎮</span> View Controller Mapping &amp; Tester
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-1.5 text-slate-300 font-mono text-[11px]">
                  <div>Left Stick / D-Pad: Move Player</div>
                  <div>Button A (Cross): Drive Hit</div>
                  <div>Button B (Circle): Slice</div>
                  <div>Button X (Square): Topspin</div>
                  <div>Button Y (Triangle): Smash / Lob</div>
                  <div>RB / R1: Drop Shot</div>
                  <div>Start / Select: Menu</div>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-[#090d16] border border-slate-800 space-y-1">
                <span className="font-bold text-slate-200">📺 Samsung TV Remote / Keyboard</span>
                <div className="grid grid-cols-2 gap-1.5 text-slate-300 font-mono text-[11px]">
                  <div>Arrows / WASD: Navigate / Move</div>
                  <div>OK / Enter / Space: Select / Swing</div>
                  <div>Back / Esc: Back / Pause</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer with Focus Save & Close button */}
        <div className="p-4 bg-[#090d16] border-t border-slate-800 flex items-center justify-between">
          <div className="text-[11px] text-slate-400 flex items-center gap-3">
            <span><strong>↑ ↓</strong> {strings.navigateHint}</span>
            <span><strong>← →</strong> {strings.adjustHint}</span>
            <span><strong>OK / A</strong> {strings.selectHint}</span>
            <span><strong>Esc / B</strong> {strings.backHint}</span>
          </div>

          <button
            onClick={onClose}
            className={`px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all ${
              focusedIndex === getTabItemCount(activeTab) - 1
                ? 'bg-lime-400 text-slate-950 ring-4 ring-sky-400 scale-105'
                : 'bg-lime-400 text-slate-950 hover:bg-lime-300'
            }`}
          >
            {strings.saveClose}
          </button>
        </div>
      </div>
    </div>
  );
};
