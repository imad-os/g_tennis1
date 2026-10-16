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
}

type TabKey = 'motion' | 'graphics' | 'audio' | 'controls';

export const SettingsModal: React.FC<SettingsModalProps> = ({
  onClose,
  courtSurface,
  onChangeCourtSurface,
  graphicsConfig,
  onChangeGraphicsConfig,
  onOpenMotionLab,
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
      case 'graphics': return 5; // 0: Tabs, 1: Quality, 2: Camera, 3: Court, 4: Close
      case 'audio': return 3; // 0: Tabs, 1: Mute/Unmute, 2: Close
      case 'controls': return 2; // 0: Tabs, 1: Close
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
        const qualities: GraphicsConfig['quality'][] = ['very_low', 'low', 'mid', 'high'];
        const idx = qualities.indexOf(graphicsConfig.quality);
        const next = qualities[(idx + (toRight ? 1 : -1) + qualities.length) % qualities.length];
        onChangeGraphicsConfig({ quality: next });
      } else if (focusedIndex === 2) {
        // Camera cycle
        const cams: GraphicsConfig['cameraAngle'][] = ['broadcast', 'chase', 'overhead'];
        const idx = cams.indexOf(graphicsConfig.cameraAngle);
        const next = cams[(idx + (toRight ? 1 : -1) + cams.length) % cams.length];
        onChangeGraphicsConfig({ cameraAngle: next });
      } else if (focusedIndex === 3) {
        // Court surface cycle
        const courts: CourtSurface[] = ['hard', 'clay', 'grass'];
        const idx = courts.indexOf(courtSurface);
        const next = courts[(idx + (toRight ? 1 : -1) + courts.length) % courts.length];
        onChangeCourtSurface(next);
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
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {[
                    { id: 'very_low', label: 'Very Low (Ultra-Fast)' },
                    { id: 'low', label: 'Low (TV 60fps)' },
                    { id: 'mid', label: 'Mid (Balanced)' },
                    { id: 'high', label: 'High (Detail)' },
                  ].map((q) => (
                    <button
                      key={q.id}
                      onClick={() => onChangeGraphicsConfig({ quality: q.id as GraphicsConfig['quality'] })}
                      className={`py-2 px-1 text-[11px] rounded-xl font-bold border transition-colors ${
                        graphicsConfig.quality === q.id
                          ? 'bg-lime-400 text-slate-950 border-lime-400'
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
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'broadcast', label: 'TV Broadcast' },
                    { id: 'chase', label: 'Chase Cam' },
                    { id: 'overhead', label: 'Overhead' },
                  ].map((cam) => (
                    <button
                      key={cam.id}
                      onClick={() => onChangeGraphicsConfig({ cameraAngle: cam.id as GraphicsConfig['cameraAngle'] })}
                      className={`py-2 rounded-xl font-bold border text-xs ${
                        graphicsConfig.cameraAngle === cam.id
                          ? 'bg-lime-400 text-slate-950 border-lime-400'
                          : 'bg-slate-900 border-slate-800 text-slate-400'
                      }`}
                    >
                      {cam.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Item 3: Court Surface */}
              <div
                className={`p-4 rounded-2xl bg-[#090d16] border space-y-2.5 transition-all ${
                  focusedIndex === 3
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
              <div className="p-4 rounded-2xl bg-[#090d16] border border-slate-800 space-y-1">
                <span className="font-bold text-lime-400">📱 Phone Motion Controller (My PC SDK)</span>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  Hold phone in relaxed grip like a tennis racket handle. Player character automatically navigates to incoming ball landing zone. Swing phone physically to strike: Forehand (inward sweep) or Backhand (outward sweep).
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-[#090d16] border border-slate-800 space-y-1">
                <span className="font-bold text-sky-400">🎮 Game Controller / Gamepad</span>
                <div className="grid grid-cols-2 gap-1.5 text-slate-300 font-mono text-[11px]">
                  <div>Left Stick / D-Pad: Move Player</div>
                  <div>Button A (Cross): Drive Hit</div>
                  <div>Button B (Circle): Slice</div>
                  <div>Button Y (Triangle): Smash</div>
                  <div>LB / RB: Switch Tabs</div>
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
