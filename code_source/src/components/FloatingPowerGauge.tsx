/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ChargingState } from '../types/game';

interface FloatingPowerGaugeProps {
  charging: ChargingState | null;
}

export const FloatingPowerGauge: React.FC<FloatingPowerGaugeProps> = ({ charging }) => {
  if (!charging || !charging.isCharging) return null;

  const { progress, safeZoneMin, safeZoneMax, isSafe, shotType, screenPos } = charging;

  // Clamp screen coordinates so gauge never clips outside viewport edges
  const leftPercent = screenPos ? Math.max(14, Math.min(84, screenPos.x)) : 50;
  const topPercent = screenPos ? Math.max(18, Math.min(82, screenPos.y)) : 68;

  // Dimensions of SVG gauge arc
  const width = 200;
  const height = 90;
  const cx = 100;
  const cy = 80;
  const r = 68;

  // Angles: 180° (left) to 0° (right)
  const powerPercent = Math.round(progress * 100);
  const minPercent = Math.round(safeZoneMin * 100);
  const maxPercent = Math.round(safeZoneMax * 100);

  // Convert 0..1 fraction to angle in radians (from Math.PI to 0)
  const fractionToAngle = (f: number) => Math.PI - f * Math.PI;

  const needleAngle = fractionToAngle(progress);
  const needleX = cx + r * Math.cos(needleAngle);
  const needleY = cy - r * Math.sin(needleAngle);

  // SVG Arc generator
  const createArcPath = (startFrac: number, endFrac: number) => {
    const a1 = fractionToAngle(startFrac);
    const a2 = fractionToAngle(endFrac);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy - r * Math.sin(a1);
    const x2 = cx + r * Math.cos(a2);
    const y2 = cy - r * Math.sin(a2);
    const largeArc = Math.abs(endFrac - startFrac) > 0.5 ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
  };

  const dangerLowPath = createArcPath(0, safeZoneMin);
  const safeZonePath = createArcPath(safeZoneMin, safeZoneMax);
  const dangerHighPath = createArcPath(safeZoneMax, 1.0);

  return (
    <div
      className="pointer-events-none fixed z-40 transform -translate-x-1/2 -translate-y-1/2 transition-all duration-75 select-none"
      style={{ left: `${leftPercent}%`, top: `${topPercent}%` }}
    >
      <div className="flex flex-col items-center bg-[#070d18]/92 backdrop-blur-md px-4 py-3 rounded-2xl border border-slate-700/80 shadow-2xl shadow-sky-950/60 min-w-[220px]">
        {/* Header & Shot Type */}
        <div className="flex items-center justify-between w-full mb-1">
          <span className="text-[11px] font-bold tracking-wider text-sky-400 uppercase">
            {shotType}
          </span>
          <span
            className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md ${
              isSafe
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
            }`}
          >
            {isSafe ? 'SAFE ZONE' : progress > safeZoneMax ? 'RISK (LONG)' : 'NET RISK'}
          </span>
        </div>

        {/* SVG Arc Gauge */}
        <div className="relative w-[200px] h-[90px] flex items-center justify-center">
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
            {/* Background Track */}
            <path
              d={createArcPath(0, 1.0)}
              fill="none"
              stroke="#1e293b"
              strokeWidth="12"
              strokeLinecap="round"
            />

            {/* Unsafe Low Zone (Amber/Red) */}
            <path
              d={dangerLowPath}
              fill="none"
              stroke="#f97316"
              strokeWidth="12"
              opacity="0.8"
            />

            {/* Safe In-Court Zone (Emerald Green) */}
            <path
              d={safeZonePath}
              fill="none"
              stroke="#10b981"
              strokeWidth="14"
              strokeLinecap="round"
              className="drop-shadow-[0_0_8px_rgba(16,185,129,0.8)]"
            />

            {/* Unsafe High Zone (Red) */}
            <path
              d={dangerHighPath}
              fill="none"
              stroke="#ef4444"
              strokeWidth="12"
              opacity="0.8"
            />

            {/* Pivot Point */}
            <circle cx={cx} cy={cy} r="6" fill="#38bdf8" />

            {/* Needle Line */}
            <line
              x1={cx}
              y1={cy}
              x2={needleX}
              y2={needleY}
              stroke="#ffffff"
              strokeWidth="3.5"
              strokeLinecap="round"
              className="drop-shadow-[0_0_6px_rgba(255,255,255,0.9)]"
            />

            {/* Needle Tip Bulb */}
            <circle
              cx={needleX}
              cy={needleY}
              r="4.5"
              fill={isSafe ? '#34d399' : '#f87171'}
              stroke="#ffffff"
              strokeWidth="1.5"
            />
          </svg>

          {/* Central Power Digits */}
          <div className="absolute bottom-1 flex flex-col items-center">
            <span
              className={`text-2xl font-black tabular-nums tracking-tight ${
                isSafe ? 'text-emerald-300' : 'text-slate-100'
              }`}
            >
              {powerPercent}%
            </span>
            <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest">
              Safe: {minPercent}%–{maxPercent}%
            </span>
          </div>
        </div>

        {/* Release prompt */}
        <div className="mt-1 text-[10px] font-medium text-sky-300/90 tracking-wide animate-pulse">
          Release button to strike!
        </div>
      </div>
    </div>
  );
};
