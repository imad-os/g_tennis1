/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { motionDSP } from '../services/motionDSPs';
import { sound } from '../services/sound';
import { mypcBridge } from '../services/mypcBridge';
import { PowerLevel, ShotType, SwingDetectionEvent } from '../types/game';
import { t } from '../services/i18n';

interface MotionLabViewProps {
  onBack: () => void;
}

export const MotionLabView: React.FC<MotionLabViewProps> = ({ onBack }) => {
  const strings = t();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [config, setConfig] = useState(motionDSP.getConfig());
  const [isLeftHanded, setIsLeftHanded] = useState(motionDSP.getLeftHanded());
  const [lastEvent, setLastEvent] = useState<SwingDetectionEvent | null>(null);
  const [calibrationStatus, setCalibrationStatus] = useState<string>('Ready');
  const [swingHistoryLog, setSwingHistoryLog] = useState<SwingDetectionEvent[]>([]);
  const [focusedIndex, setFocusedIndex] = useState<number>(0);

  // Focusable Items:
  // 0: Calibrate Grip
  // 1: Dominant Hand (Right/Left)
  // 2: Sensitivity Slider
  // 3: Smoothing Slider
  // 4: Test Forehand L1
  // 5: Test Forehand L3
  // 6: Test Smash L5
  // 7: Test Backhand L2
  // 8: Test Backhand L4
  // 9: Done (Back) Button
  const totalFocusable = 10;

  // Subscribe to live swing detection events
  useEffect(() => {
    const unsub = motionDSP.subscribe((ev) => {
      setLastEvent(ev);
      setSwingHistoryLog((prev) => [ev, ...prev.slice(0, 6)]);
      sound.playSwingSwoosh(ev.power);
      sound.playRacketHit(ev.power, ev.type);
    });
    return unsub;
  }, []);

  // TV Remote, Keyboard, and Gamepad navigation
  useEffect(() => {
    const unsubAction = mypcBridge.addActionListener((action, pressed) => {
      if (!pressed) return;
      if (action === 'cancel') {
        sound.playUIBeep(false);
        onBack();
        return;
      }

      if (action === 'up') {
        sound.playUIBeep(false);
        setFocusedIndex((prev) => (prev > 0 ? prev - 1 : totalFocusable - 1));
      } else if (action === 'down') {
        sound.playUIBeep(false);
        setFocusedIndex((prev) => (prev < totalFocusable - 1 ? prev + 1 : 0));
      } else if (action === 'left' || action === 'right') {
        const toRight = action === 'right';
        if (focusedIndex === 2) {
          // Sensitivity
          const step = toRight ? 0.1 : -0.1;
          handleSensitivity(Math.max(0.5, Math.min(2.5, config.sensitivity + step)));
        } else if (focusedIndex === 3) {
          // Smoothing
          const step = toRight ? 0.05 : -0.05;
          handleSmoothing(Math.max(0.2, Math.min(0.85, config.smoothing + step)));
        } else if (focusedIndex === 1) {
          handleHandToggle(!isLeftHanded);
        } else if (focusedIndex >= 4 && focusedIndex <= 8) {
          const next = toRight ? Math.min(8, focusedIndex + 1) : Math.max(4, focusedIndex - 1);
          setFocusedIndex(next);
        }
      } else if (action === 'confirm') {
        sound.playUIBeep(true);
        triggerFocused();
      }
    });

    const unsubGamepad = mypcBridge.addGamepadButtonListener((index, pressed) => {
      if (!pressed) return;
      if (index === 1) {
        // B Button (Back)
        sound.playUIBeep(false);
        onBack();
      }
    });

    return () => {
      unsubAction();
      unsubGamepad();
    };
  }, [focusedIndex, config, isLeftHanded]);

  const triggerFocused = () => {
    if (focusedIndex === 0) handleCalibrate();
    else if (focusedIndex === 1) handleHandToggle(!isLeftHanded);
    else if (focusedIndex === 4) simulateTest('FOREHAND', 1);
    else if (focusedIndex === 5) simulateTest('FOREHAND', 3);
    else if (focusedIndex === 6) simulateTest('SMASH', 5);
    else if (focusedIndex === 7) simulateTest('BACKHAND', 2);
    else if (focusedIndex === 8) simulateTest('BACKHAND', 4);
    else if (focusedIndex === 9) onBack();
  };

  // Real-time Oscilloscope render loop
  useEffect(() => {
    let animId = 0;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const renderOscilloscope = () => {
      const w = canvas.width;
      const h = canvas.height;
      const history = motionDSP.getHistory();

      ctx.fillStyle = '#090d16';
      ctx.fillRect(0, 0, w, h);

      // Grid lines
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
      for (let y = 0; y < h; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      const midY = h * 0.7;
      ctx.strokeStyle = '#334155';
      ctx.beginPath();
      ctx.moveTo(0, midY);
      ctx.lineTo(w, midY);
      ctx.stroke();

      if (history.length > 1) {
        const stepX = w / 100;

        // Raw Acceleration
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        history.forEach((pt, i) => {
          const x = i * stepX;
          const y = midY - Math.min(midY - 10, pt.rawMag * 2.2);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();

        // Filtered Acceleration
        ctx.strokeStyle = '#a3e635';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        history.forEach((pt, i) => {
          const x = i * stepX;
          const y = midY - Math.min(midY - 10, pt.filteredMag * 2.2);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();

        // Rot Speed
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        history.forEach((pt, i) => {
          const x = i * stepX;
          const y = midY - Math.min(midY - 10, (pt.rotSpeed / 12) * 2.2);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();

        const triggerThresh = 14.0 * config.thresholdMultiplier / config.sensitivity;
        const threshY = midY - triggerThresh * 2.2;
        ctx.strokeStyle = '#ef4444';
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(0, threshY);
        ctx.lineTo(w, threshY);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      animId = requestAnimationFrame(renderOscilloscope);
    };

    animId = requestAnimationFrame(renderOscilloscope);
    return () => cancelAnimationFrame(animId);
  }, [config]);

  const handleCalibrate = () => {
    setCalibrationStatus('Calibrating...');
    sound.playUIBeep(true);
    setTimeout(() => {
      motionDSP.calibrateGrip();
      setConfig(motionDSP.getConfig());
      setCalibrationStatus(strings.calibrated);
      setTimeout(() => setCalibrationStatus('Ready'), 2500);
    }, 350);
  };

  const handleSensitivity = (val: number) => {
    motionDSP.setConfig({ sensitivity: val });
    setConfig(motionDSP.getConfig());
  };

  const handleSmoothing = (val: number) => {
    motionDSP.setConfig({ smoothing: val });
    setConfig(motionDSP.getConfig());
  };

  const handleHandToggle = (left: boolean) => {
    setIsLeftHanded(left);
    motionDSP.setLeftHanded(left);
  };

  const simulateTest = (type: ShotType, power: PowerLevel) => {
    motionDSP.simulateSwing(type, power);
  };

  return (
    <div className="absolute inset-0 bg-[#020617] z-30 flex flex-col p-6 md:p-8 overflow-y-auto text-white pointer-events-auto">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div>
          <h2 className="font-display text-2xl font-black text-white flex items-center gap-2">
            <span>🔬</span> {strings.motionLab}
          </h2>
          <p className="text-xs text-slate-400">
            TV Remote &amp; Gamepad: ↑ ↓ to navigate · ← → to adjust · OK / A to activate
          </p>
        </div>

        <button
          onClick={onBack}
          className={`px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all border ${
            focusedIndex === 9
              ? 'bg-lime-400 text-slate-950 border-lime-400 ring-4 ring-sky-400 scale-105'
              : 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700'
          }`}
        >
          {strings.backHint}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6 my-auto">
        {/* Left Column: Live Oscilloscope & Signal Telemetry */}
        <div className="lg:col-span-2 space-y-4">
          <div className="p-4 rounded-2xl bg-[#0f172a] border border-slate-800 shadow-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-200">Real-time Signal Graph</span>
              <div className="flex items-center gap-4 text-[11px] font-mono">
                <span className="flex items-center gap-1.5 text-lime-400">
                  <span className="w-2.5 h-0.5 bg-lime-400" /> Filtered Accel
                </span>
                <span className="flex items-center gap-1.5 text-amber-400">
                  <span className="w-2.5 h-0.5 bg-amber-400" /> Rotation
                </span>
                <span className="flex items-center gap-1.5 text-slate-400">
                  <span className="w-2.5 h-0.5 bg-slate-400" /> Raw
                </span>
                <span className="flex items-center gap-1.5 text-rose-500">
                  <span className="w-2.5 h-0.5 bg-rose-500" /> Trigger
                </span>
              </div>
            </div>

            <canvas
              ref={canvasRef}
              width={640}
              height={200}
              className="w-full h-48 rounded-xl bg-[#090d16] border border-slate-800"
            />
          </div>

          {/* Test Swing Simulator Buttons */}
          <div className="p-4 rounded-2xl bg-[#0f172a] border border-slate-800">
            <div className="text-xs font-bold text-slate-200 mb-2">
              Instant Swing Simulator (Test Without Phone)
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {[
                { idx: 4, label: 'Forehand L1', type: 'FOREHAND' as const, pwr: 1 as const, color: 'text-lime-300' },
                { idx: 5, label: 'Forehand L3', type: 'FOREHAND' as const, pwr: 3 as const, color: 'text-lime-400' },
                { idx: 6, label: 'Smash L5', type: 'SMASH' as const, pwr: 5 as const, color: 'text-rose-400' },
                { idx: 7, label: 'Backhand L2', type: 'BACKHAND' as const, pwr: 2 as const, color: 'text-sky-300' },
                { idx: 8, label: 'Backhand L4', type: 'BACKHAND' as const, pwr: 4 as const, color: 'text-sky-400' },
              ].map((btn) => (
                <button
                  key={btn.idx}
                  onClick={() => simulateTest(btn.type, btn.pwr)}
                  className={`p-2.5 rounded-xl font-bold text-xs text-center border transition-all ${
                    focusedIndex === btn.idx
                      ? 'border-sky-400 ring-4 ring-sky-400/50 bg-slate-800 text-white scale-105'
                      : `bg-[#090d16] border-slate-800 hover:bg-slate-800 ${btn.color}`
                  }`}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          </div>

          {/* Recent Swings Log */}
          <div className="p-4 rounded-2xl bg-[#0f172a] border border-slate-800">
            <span className="text-xs font-bold text-slate-200">Swing Event Log</span>
            <div className="space-y-1 mt-2 max-h-32 overflow-y-auto">
              {swingHistoryLog.length === 0 ? (
                <div className="text-xs text-slate-500 italic">No swings detected yet. Swing phone or click buttons above.</div>
              ) : (
                swingHistoryLog.map((ev, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between text-xs px-3 py-1.5 rounded-lg bg-[#090d16] border border-slate-800 font-mono"
                  >
                    <span className="font-bold text-white flex items-center gap-2">
                      <span className={ev.type === 'FOREHAND' ? 'text-lime-400' : 'text-sky-400'}>
                        {ev.type}
                      </span>
                      <span>Power: {ev.power}/5</span>
                    </span>
                    <span className="text-slate-400">
                      Peak: {Math.round(ev.rawMagnitude)} m/s² · Rot: {Math.round(ev.rotSpeed)}°/s
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Calibration & DSP Tuning */}
        <div className="space-y-4">
          {/* Calibrate Grip Card (Item 0) */}
          <div
            className={`p-5 rounded-2xl bg-[#0f172a] border transition-all ${
              focusedIndex === 0
                ? 'border-sky-400 ring-4 ring-sky-400/40 scale-[1.01]'
                : 'border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-white">Grip Calibration</span>
              <span className="text-xs font-mono text-lime-400">{calibrationStatus}</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed mt-1">
              {strings.calibrateDesc}
            </p>
            <button
              onClick={handleCalibrate}
              className="w-full mt-3 py-3 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 font-black text-xs uppercase tracking-wider transition-colors shadow-lg shadow-lime-400/20"
            >
              {strings.calibrate}
            </button>
          </div>

          {/* Grip Hand Setting (Item 1) */}
          <div
            className={`p-4 rounded-2xl bg-[#0f172a] border space-y-2 transition-all ${
              focusedIndex === 1
                ? 'border-sky-400 ring-4 ring-sky-400/40 scale-[1.01]'
                : 'border-slate-800'
            }`}
          >
            <span className="text-xs font-bold text-slate-300">{strings.dominantHand} (OK to switch)</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleHandToggle(false)}
                className={`py-2 rounded-xl text-xs font-bold border transition-colors ${
                  !isLeftHanded
                    ? 'bg-lime-400 text-slate-950 border-lime-400'
                    : 'bg-[#090d16] border-slate-800 text-slate-400'
                }`}
              >
                {strings.rightHand}
              </button>
              <button
                onClick={() => handleHandToggle(true)}
                className={`py-2 rounded-xl text-xs font-bold border transition-colors ${
                  isLeftHanded
                    ? 'bg-lime-400 text-slate-950 border-lime-400'
                    : 'bg-[#090d16] border-slate-800 text-slate-400'
                }`}
              >
                {strings.leftHand}
              </button>
            </div>
          </div>

          {/* DSP Sensitivity Slider (Item 2) */}
          <div
            className={`p-4 rounded-2xl bg-[#0f172a] border space-y-2 transition-all ${
              focusedIndex === 2
                ? 'border-sky-400 ring-4 ring-sky-400/40 scale-[1.01]'
                : 'border-slate-800'
            }`}
          >
            <div className="flex justify-between text-xs">
              <span className="font-bold text-slate-300">{strings.sensitivity} (← → to adjust)</span>
              <span className="font-mono text-lime-400 font-bold">{config.sensitivity.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="2.5"
              step="0.1"
              value={config.sensitivity}
              onChange={(e) => handleSensitivity(parseFloat(e.target.value))}
              className="w-full accent-lime-400"
            />
          </div>

          {/* Tremor Smoothing Filter Slider (Item 3) */}
          <div
            className={`p-4 rounded-2xl bg-[#0f172a] border space-y-2 transition-all ${
              focusedIndex === 3
                ? 'border-sky-400 ring-4 ring-sky-400/40 scale-[1.01]'
                : 'border-slate-800'
            }`}
          >
            <div className="flex justify-between text-xs">
              <span className="font-bold text-slate-300">{strings.smoothing} (← → to adjust)</span>
              <span className="font-mono text-lime-400 font-bold">{(config.smoothing * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min="0.2"
              max="0.85"
              step="0.05"
              value={config.smoothing}
              onChange={(e) => handleSmoothing(parseFloat(e.target.value))}
              className="w-full accent-lime-400"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
