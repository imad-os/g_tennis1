/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { motionDSP } from '../services/motionDSPs';
import { sound } from '../services/sound';
import { PowerLevel, ShotType, SwingDetectionEvent } from '../types/game';

interface MotionLabViewProps {
  onBack: () => void;
}

export const MotionLabView: React.FC<MotionLabViewProps> = ({ onBack }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [config, setConfig] = useState(motionDSP.getConfig());
  const [isLeftHanded, setIsLeftHanded] = useState(motionDSP.getLeftHanded());
  const [lastEvent, setLastEvent] = useState<SwingDetectionEvent | null>(null);
  const [calibrationStatus, setCalibrationStatus] = useState<string>('Ready');
  const [swingHistoryLog, setSwingHistoryLog] = useState<SwingDetectionEvent[]>([]);

  // Subscribe to live swing detection events
  useEffect(() => {
    const unsub = motionDSP.subscribe((ev) => {
      setLastEvent(ev);
      setSwingHistoryLog((prev) => [ev, ...prev.slice(0, 7)]);
      sound.playSwingSwoosh(ev.power);
      sound.playRacketHit(ev.power, ev.type);
    });
    return unsub;
  }, []);

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

      // Clear dark graph background
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

      // Zero baseline
      const midY = h * 0.7;
      ctx.strokeStyle = '#334155';
      ctx.beginPath();
      ctx.moveTo(0, midY);
      ctx.lineTo(w, midY);
      ctx.stroke();

      if (history.length > 1) {
        const stepX = w / 100;

        // 1. Raw Acceleration (Gray line)
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

        // 2. Filtered Acceleration (Bright Lime line)
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

        // 3. Angular Rotation Speed (Amber line)
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

        // Trigger threshold line
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
      setCalibrationStatus('Calibrated! Gravity bias zeroed.');
      setTimeout(() => setCalibrationStatus('Ready'), 2500);
    }, 400);
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
    <div className="absolute inset-0 bg-slate-950/95 z-30 flex flex-col p-6 md:p-8 overflow-y-auto text-white pointer-events-auto">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div>
          <h2 className="font-display text-2xl font-black text-white flex items-center gap-2">
            <span>🔬</span> MOTION LAB &amp; DSP CALIBRATION
          </h2>
          <p className="text-xs text-slate-400">
            Real-time sensor signal processing, adaptive tremor filtering, and swing classifier
          </p>
        </div>

        <button
          onClick={onBack}
          className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors"
        >
          Done (Back)
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6 my-auto">
        {/* Left Column: Live Oscilloscope & Signal Telemetry */}
        <div className="lg:col-span-2 space-y-4">
          <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-300">Live Sensor Oscilloscope (30-60Hz)</span>
              <div className="flex items-center gap-4 text-[11px] font-mono">
                <span className="flex items-center gap-1.5 text-lime-400">
                  <span className="w-2.5 h-0.5 bg-lime-400" /> Filtered Accel
                </span>
                <span className="flex items-center gap-1.5 text-amber-400">
                  <span className="w-2.5 h-0.5 bg-amber-400" /> Rot Speed
                </span>
                <span className="flex items-center gap-1.5 text-slate-400">
                  <span className="w-2.5 h-0.5 bg-slate-400" /> Raw
                </span>
                <span className="flex items-center gap-1.5 text-rose-500">
                  <span className="w-2.5 h-0.5 bg-rose-500" /> Trigger Line
                </span>
              </div>
            </div>

            <canvas
              ref={canvasRef}
              width={640}
              height={220}
              className="w-full h-52 rounded-xl bg-slate-950 border border-slate-800"
            />
          </div>

          {/* Test Swing Simulator Buttons (Desktop & TV testing) */}
          <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800">
            <div className="text-xs font-bold text-slate-300 mb-2">
              Instant Swing Simulator (Test Without Phone)
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <button
                onClick={() => simulateTest('FOREHAND', 1)}
                className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-lime-300 text-center border border-lime-500/20"
              >
                Forehand (Lvl 1)
              </button>
              <button
                onClick={() => simulateTest('FOREHAND', 3)}
                className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-lime-400 text-center border border-lime-500/30"
              >
                Forehand (Lvl 3)
              </button>
              <button
                onClick={() => simulateTest('FOREHAND', 5)}
                className="p-2.5 rounded-xl bg-rose-900/40 hover:bg-rose-900/60 text-xs font-semibold text-rose-300 text-center border border-rose-500/30"
              >
                Smash (Lvl 5)
              </button>
              <button
                onClick={() => simulateTest('BACKHAND', 2)}
                className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-sky-300 text-center border border-sky-500/20"
              >
                Backhand (Lvl 2)
              </button>
              <button
                onClick={() => simulateTest('BACKHAND', 4)}
                className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-sky-400 text-center border border-sky-500/30"
              >
                Backhand (Lvl 4)
              </button>
            </div>
          </div>

          {/* Recent Swings Log */}
          <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800">
            <span className="text-xs font-bold text-slate-300">Swing Event Log</span>
            <div className="space-y-1.5 mt-2 max-h-36 overflow-y-auto">
              {swingHistoryLog.length === 0 ? (
                <div className="text-xs text-slate-500 italic">No swings detected yet. Swing phone or click buttons above.</div>
              ) : (
                swingHistoryLog.map((ev, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between text-xs px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800/80 font-mono"
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

        {/* Right Column: Calibration & DSP Tuning Sliders */}
        <div className="space-y-4">
          {/* Calibrate Grip Card */}
          <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-white">Grip Calibration</span>
              <span className="text-xs font-mono text-lime-400">{calibrationStatus}</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Hold the phone like a tennis racket handle in your relaxed stance facing the TV, then press Calibrate.
            </p>
            <button
              onClick={handleCalibrate}
              className="w-full py-3 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 font-bold text-xs uppercase tracking-wider transition-colors shadow-lg shadow-lime-400/20"
            >
              Calibrate Grip (Neutralize Bias)
            </button>
          </div>

          {/* Grip Hand Setting */}
          <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-2">
            <span className="text-xs font-bold text-slate-300">Dominant Hand</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleHandToggle(false)}
                className={`py-2 rounded-xl text-xs font-bold border transition-colors ${
                  !isLeftHanded
                    ? 'bg-lime-400/20 border-lime-400 text-lime-300'
                    : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
              >
                Right Hand
              </button>
              <button
                onClick={() => handleHandToggle(true)}
                className={`py-2 rounded-xl text-xs font-bold border transition-colors ${
                  isLeftHanded
                    ? 'bg-lime-400/20 border-lime-400 text-lime-300'
                    : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
              >
                Left Hand
              </button>
            </div>
          </div>

          {/* DSP Sensitivity Slider */}
          <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="font-bold text-slate-300">Swing Sensitivity</span>
              <span className="font-mono text-lime-400">{config.sensitivity.toFixed(1)}x</span>
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
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>Gentle (0.5x)</span>
              <span>Standard (1.0x)</span>
              <span>Ultra-Responsive (2.5x)</span>
            </div>
          </div>

          {/* Tremor Smoothing Filter Slider */}
          <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="font-bold text-slate-300">Tremor Smoothing Factor</span>
              <span className="font-mono text-lime-400">{(config.smoothing * 100).toFixed(0)}%</span>
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
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>Raw</span>
              <span>Balanced (65%)</span>
              <span>Heavy Filter</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
