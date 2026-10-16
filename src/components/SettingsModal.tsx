/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motionDSP } from '../services/motionDSPs';
import { sound } from '../services/sound';
import { CourtSurface, GraphicsConfig } from '../types/game';

interface SettingsModalProps {
  onClose: () => void;
  courtSurface: CourtSurface;
  onChangeCourtSurface: (surface: CourtSurface) => void;
  graphicsConfig: GraphicsConfig;
  onChangeGraphicsConfig: (cfg: Partial<GraphicsConfig>) => void;
  onOpenMotionLab: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  onClose,
  courtSurface,
  onChangeCourtSurface,
  graphicsConfig,
  onChangeGraphicsConfig,
  onOpenMotionLab,
}) => {
  const [activeTab, setActiveTab] = useState<'motion' | 'graphics' | 'audio' | 'controls'>('motion');
  const [motionConfig, setMotionConfig] = useState(motionDSP.getConfig());
  const [calibratedMsg, setCalibratedMsg] = useState(false);
  const [isLeftHanded, setIsLeftHanded] = useState(motionDSP.getLeftHanded());
  const [soundMuted, setSoundMuted] = useState(false);

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

  return (
    <div className="absolute inset-0 bg-slate-950/90 z-40 flex items-center justify-center p-4 md:p-6 pointer-events-auto backdrop-blur-md">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Top Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-800">
          <div>
            <h2 className="font-display text-xl font-bold text-white flex items-center gap-2">
              <span>⚙️</span> GAME SETTINGS
            </h2>
            <p className="text-xs text-slate-400">Configure motion detection, graphics &amp; rendering</p>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center text-sm font-bold transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex items-center gap-1 p-2 bg-slate-950/70 border-b border-slate-800">
          {[
            { id: 'motion', label: '🎾 Motion' },
            { id: 'graphics', label: '🎨 Graphics' },
            { id: 'audio', label: '🔊 Audio' },
            { id: 'controls', label: '🎮 Controls' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                sound.playUIBeep();
                setActiveTab(tab.id as typeof activeTab);
              }}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
                activeTab === tab.id
                  ? 'bg-lime-400 text-slate-950 shadow-md shadow-lime-400/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs text-slate-300">
          {activeTab === 'motion' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-sm">Grip Calibration</span>
                  {calibratedMsg && (
                    <span className="text-lime-400 font-mono text-[11px]">✓ Grip Calibrated</span>
                  )}
                </div>
                <p className="text-slate-400 leading-relaxed">
                  Hold your phone like a tennis racket handle in your natural relaxed posture facing the TV screen, then click Calibrate.
                </p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleCalibrate}
                    className="flex-1 py-2.5 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 font-bold transition-colors shadow-lg shadow-lime-400/10"
                  >
                    Calibrate Grip
                  </button>
                  <button
                    onClick={onOpenMotionLab}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold border border-slate-700 transition-colors"
                  >
                    Open Motion Lab (Live Graph) →
                  </button>
                </div>
              </div>

              {/* Dominant Hand */}
              <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2">
                <span className="font-bold text-white">Dominant Hand</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      setIsLeftHanded(false);
                      motionDSP.setLeftHanded(false);
                    }}
                    className={`py-2 rounded-xl font-bold border transition-colors ${
                      !isLeftHanded
                        ? 'bg-lime-400/20 border-lime-400 text-lime-300'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    Right-Handed Grip
                  </button>
                  <button
                    onClick={() => {
                      setIsLeftHanded(true);
                      motionDSP.setLeftHanded(true);
                    }}
                    className={`py-2 rounded-xl font-bold border transition-colors ${
                      isLeftHanded
                        ? 'bg-lime-400/20 border-lime-400 text-lime-300'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    Left-Handed Grip
                  </button>
                </div>
              </div>

              {/* Sensitivity */}
              <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2">
                <div className="flex justify-between">
                  <span className="font-bold text-white">Motion Sensitivity</span>
                  <span className="font-mono text-lime-400">{motionConfig.sensitivity.toFixed(1)}x</span>
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

              {/* Smoothing */}
              <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2">
                <div className="flex justify-between">
                  <span className="font-bold text-white">Noise Smoothing Filter (DSP Alpha)</span>
                  <span className="font-mono text-lime-400">{(motionConfig.smoothing * 100).toFixed(0)}%</span>
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
              {/* Quality Preset */}
              <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2">
                <span className="font-bold text-white">Graphics Quality Preset</span>
                <div className="grid grid-cols-3 gap-2">
                  {(['low', 'mid', 'high'] as const).map((q) => (
                    <button
                      key={q}
                      onClick={() => onChangeGraphicsConfig({ quality: q })}
                      className={`py-2 rounded-xl font-bold uppercase border transition-colors ${
                        graphicsConfig.quality === q
                          ? 'bg-lime-400/20 border-lime-400 text-lime-300'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {q === 'low' ? 'Low (TV 60fps)' : q === 'mid' ? 'Balanced' : 'High PBR'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Camera Angle */}
              <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2">
                <span className="font-bold text-white">Broadcast Camera Angle</span>
                <div className="grid grid-cols-3 gap-2">
                  {(['broadcast', 'chase', 'overhead'] as const).map((cam) => (
                    <button
                      key={cam}
                      onClick={() => onChangeGraphicsConfig({ cameraAngle: cam })}
                      className={`py-2 rounded-xl font-bold uppercase border transition-colors ${
                        graphicsConfig.cameraAngle === cam
                          ? 'bg-lime-400/20 border-lime-400 text-lime-300'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {cam}
                    </button>
                  ))}
                </div>
              </div>

              {/* Court Surface */}
              <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2">
                <span className="font-bold text-white">Grand Slam Court Surface</span>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => onChangeCourtSurface('hard')}
                    className={`py-2.5 rounded-xl font-bold border transition-colors ${
                      courtSurface === 'hard'
                        ? 'bg-blue-600/30 border-blue-400 text-blue-300'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    Hard Court (Center)
                  </button>
                  <button
                    onClick={() => onChangeCourtSurface('clay')}
                    className={`py-2.5 rounded-xl font-bold border transition-colors ${
                      courtSurface === 'clay'
                        ? 'bg-orange-600/30 border-orange-400 text-orange-300'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    Clay (Roland-Garros)
                  </button>
                  <button
                    onClick={() => onChangeCourtSurface('grass')}
                    className={`py-2.5 rounded-xl font-bold border transition-colors ${
                      courtSurface === 'grass'
                        ? 'bg-emerald-600/30 border-emerald-400 text-emerald-300'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    Grass (Wimbledon)
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'audio' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 flex items-center justify-between">
                <div>
                  <div className="font-bold text-white">Synthesizer Sound Effects</div>
                  <div className="text-slate-400 text-[11px]">Racket hit, court bounce, crowd applause</div>
                </div>
                <button
                  onClick={() => {
                    const next = !soundMuted;
                    setSoundMuted(next);
                    sound.setMuted(next);
                  }}
                  className={`px-4 py-2 rounded-xl font-bold text-xs ${
                    soundMuted ? 'bg-rose-900/50 text-rose-300' : 'bg-lime-400 text-slate-950'
                  }`}
                >
                  {soundMuted ? 'Muted' : 'Enabled'}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'controls' && (
            <div className="space-y-3">
              <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2">
                <span className="font-bold text-lime-400">📱 Phone Controller (Motion Data Mode)</span>
                <p className="text-slate-400">
                  Hold phone like a racket handle. Player automatically moves toward the incoming ball landing zone. Swing physically to strike: Forehand (inward swing) or Backhand (outward swing).
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2">
                <span className="font-bold text-sky-400">🎮 Game Controller / Gamepad</span>
                <div className="grid grid-cols-2 gap-2 text-slate-400 font-mono text-[11px]">
                  <div>Left Stick / D-Pad: Move Player</div>
                  <div>Button A (Cross): Hit Swing</div>
                  <div>Button B (Circle): Slice Shot</div>
                  <div>Button Y (Triangle): Smash</div>
                  <div>Start / Select: Game Menu</div>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2">
                <span className="font-bold text-slate-300">📺 TV Remote / Desktop Keyboard</span>
                <div className="grid grid-cols-2 gap-2 text-slate-400 font-mono text-[11px]">
                  <div>Arrow Keys / WASD: Move</div>
                  <div>OK / Space / Enter: Swing</div>
                  <div>Back / Escape: Pause Menu</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 font-bold text-xs uppercase tracking-wider transition-colors shadow-lg shadow-lime-400/20"
          >
            Save &amp; Close
          </button>
        </div>
      </div>
    </div>
  );
};
