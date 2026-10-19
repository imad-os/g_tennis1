/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { CameraAngle, ChargingState, PowerLevel, RenderResolution, ScoreState, ShotType } from '../types/game';
import { FloatingPowerGauge } from './FloatingPowerGauge';

interface MatchHUDProps {
  score: ScoreState;
  p1Name: string;
  p2Name: string;
  p1Controller: string;
  p2Controller: string;
  currentShotToast: { text: string; type: ShotType; power: PowerLevel } | null;
  rallyCount: number;
  cameraZoom: number;
  onCameraZoomChange: (zoom: number) => void;
  cameraHeight: number;
  onCameraHeightChange: (height: number) => void;
  cameraAngle: CameraAngle;
  onCameraAngleChange: (angle: CameraAngle) => void;
  renderResolution?: RenderResolution;
  onRenderResolutionChange?: (res: RenderResolution) => void;
  onPauseClick: () => void;
  onOpenGamepadMapping?: () => void;
  isDoubles?: boolean;
  chargingState?: ChargingState | null;
}

export const MatchHUD: React.FC<MatchHUDProps> = ({
  score,
  p1Name,
  p2Name,
  p1Controller,
  p2Controller,
  currentShotToast,
  rallyCount,
  cameraZoom,
  onCameraZoomChange,
  cameraHeight,
  onCameraHeightChange,
  cameraAngle,
  onCameraAngleChange,
  renderResolution = 'auto',
  onRenderResolutionChange,
  onPauseClick,
  onOpenGamepadMapping,
  isDoubles,
  chargingState,
}) => {
  const formatPoint = (pts: number, playerIndex: 1 | 2) => {
    if (score.advantage === playerIndex) return 'AD';
    if (pts === 0) return '0';
    if (pts === 1) return '15';
    if (pts === 2) return '30';
    if (pts === 3) return '40';
    return '40';
  };

  const cameraAngles: { id: CameraAngle; label: string }[] = [
    { id: 'chase', label: 'Follow' },
    { id: 'mount', label: 'Mount POV' },
    { id: 'broadcast', label: 'Broadcast' },
    { id: 'baseline', label: 'Baseline' },
    { id: 'overhead', label: 'Overhead' },
  ];

  return (
    <div className="absolute inset-0 pointer-events-none z-10 flex flex-col justify-between p-3 md:p-5 select-none">
      {/* Dynamic Player-Anchored Safe-Zone Power Gauge */}
      <FloatingPowerGauge charging={chargingState || null} />

      {/* Top Bar: Official Scoreboard & Controls */}
      <div className="flex flex-wrap items-start justify-between w-full max-w-5xl mx-auto gap-3">
        {/* Score Cluster */}
        <div className="bg-[#0b1220]/95 backdrop-blur-md border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex divide-x divide-slate-800 text-xs md:text-sm">
          {/* Player 1 Row */}
          <div className="px-3.5 py-2 flex items-center gap-2.5">
            <div className="w-2.5 h-2.5 rounded-full bg-sky-400 ring-2 ring-sky-400/30" />
            <div className="font-bold text-white tracking-wide flex items-center gap-1.5">
              <span>{p1Name}</span>
              {score.currentServer === 1 && <span className="text-[11px] animate-pulse">🎾</span>}
            </div>
            <span className="text-[10px] text-slate-400 uppercase font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800">
              {p1Controller}
            </span>
            <div className="flex items-center gap-1.5 font-mono tabular-nums font-bold ml-1.5">
              <span className="text-slate-400 text-xs">G:{score.gamesP1}</span>
              <span className="text-lg md:text-xl text-lime-400 px-2 py-0.5 rounded bg-slate-900 border border-slate-800">
                {formatPoint(score.pointsP1, 1)}
              </span>
            </div>
          </div>

          {/* VS Divider */}
          <div className="px-2 py-2 flex items-center justify-center font-extrabold text-slate-500 text-[10px] tracking-wider">
            VS
          </div>

          {/* Player 2 Row */}
          <div className="px-3.5 py-2 flex items-center gap-2.5">
            <div className="w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-rose-500/30" />
            <div className="font-bold text-white tracking-wide flex items-center gap-1.5">
              <span>{p2Name}</span>
              {score.currentServer === 2 && <span className="text-[11px] animate-pulse">🎾</span>}
            </div>
            <span className="text-[10px] text-slate-400 uppercase font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800">
              {p2Controller}
            </span>
            <div className="flex items-center gap-1.5 font-mono tabular-nums font-bold ml-1.5">
              <span className="text-slate-400 text-xs">G:{score.gamesP2}</span>
              <span className="text-lg md:text-xl text-rose-400 px-2 py-0.5 rounded bg-slate-900 border border-slate-800">
                {formatPoint(score.pointsP2, 2)}
              </span>
            </div>
          </div>
        </div>

        {/* Rally & Top Actions */}
        <div className="flex items-center gap-2">
          {rallyCount > 1 && (
            <div className="bg-[#0b1220]/95 backdrop-blur-md border border-slate-700/80 px-3 py-1.5 rounded-xl text-xs font-mono tabular-nums text-lime-400 flex items-center gap-1.5 shadow-lg">
              <span className="text-slate-400 text-[11px]">RALLY:</span>
              <span className="font-extrabold text-sm">{rallyCount}</span>
            </div>
          )}

          {onOpenGamepadMapping && (
            <button
              onClick={onOpenGamepadMapping}
              className="pointer-events-auto px-3 py-1.5 rounded-xl bg-[#0b1220]/90 hover:bg-slate-800 text-sky-400 hover:text-sky-300 border border-slate-700/80 text-xs font-semibold shadow-lg transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <span>🎮</span> Controls
            </button>
          )}

          <button
            onClick={onPauseClick}
            className="pointer-events-auto px-3 py-1.5 rounded-xl bg-[#0b1220]/90 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/80 text-xs font-semibold shadow-lg transition-colors cursor-pointer"
          >
            Pause ⏸
          </button>
        </div>
      </div>

      {/* Center Dynamic Shot Feedback Toast */}
      {currentShotToast && (
        <div className="self-center my-auto transition-all duration-150 animate-bounce">
          <div className="px-5 py-2.5 rounded-2xl bg-[#0b1220]/95 border-2 border-lime-400 shadow-2xl flex items-center gap-3">
            <span className="text-xl">
              {currentShotToast.type === 'FOREHAND'
                ? '🎾'
                : currentShotToast.type === 'BACKHAND'
                ? '⚡'
                : currentShotToast.type === 'SERVE'
                ? '🎯'
                : '💥'}
            </span>
            <div>
              <div className="text-xs md:text-sm font-extrabold text-white tracking-wider uppercase">
                {currentShotToast.text}
              </div>
              {/* 5-Bar Power Gauge */}
              <div className="flex items-center gap-1 mt-1">
                {[1, 2, 3, 4, 5].map((lvl) => {
                  const active = lvl <= currentShotToast.power;
                  const isSmash = lvl === 5;
                  return (
                    <div
                      key={lvl}
                      className={`h-1.5 w-5 rounded-full transition-colors ${
                        active
                          ? isSmash
                            ? 'bg-rose-500 shadow-sm shadow-rose-500/50'
                            : lvl >= 4
                            ? 'bg-amber-400'
                            : 'bg-lime-400'
                          : 'bg-slate-800'
                      }`}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Floating Bar: Interactive Camera Zoom Slider & Angle Selector */}
      <div className="flex flex-col md:flex-row items-center justify-between w-full max-w-5xl mx-auto gap-2.5">
        {/* Left Status & Match Announcement */}
        <div className="px-3.5 py-1.5 rounded-xl bg-[#0b1220]/90 backdrop-blur-md border border-slate-800 text-xs font-medium text-slate-200 shadow-lg">
          {score.announcementText}
        </div>

        {/* Center: Camera Customization Bar (Zoom Slider + Angle Pills) */}
        <div className="pointer-events-auto flex items-center gap-3 bg-[#0b1220]/95 backdrop-blur-md border border-slate-700/80 px-3.5 py-1.5 rounded-2xl shadow-2xl">
          {/* Camera Angles */}
          <div className="flex items-center gap-1 bg-slate-900/90 p-0.5 rounded-xl border border-slate-800">
            {cameraAngles.map((cam) => {
              const active = cameraAngle === cam.id;
              return (
                <button
                  key={cam.id}
                  onClick={() => onCameraAngleChange(cam.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                    active
                      ? 'bg-sky-500 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  {cam.label}
                </button>
              );
            })}
          </div>

          <div className="h-4 w-px bg-slate-700/60" />

          {/* Interactive Zoom Slider */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-300">🔍 Zoom</span>
            <button
              onClick={() => onCameraZoomChange(Math.max(0.6, cameraZoom - 0.1))}
              className="w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center justify-center border border-slate-700 cursor-pointer"
              title="Zoom In"
            >
              −
            </button>
            <input
              type="range"
              min="0.6"
              max="1.7"
              step="0.05"
              value={cameraZoom}
              onChange={(e) => onCameraZoomChange(parseFloat(e.target.value))}
              className="w-24 md:w-32 accent-sky-400 cursor-pointer"
              title={`Camera Zoom: ${(cameraZoom * 100).toFixed(0)}%`}
            />
            <button
              onClick={() => onCameraZoomChange(Math.min(1.7, cameraZoom + 0.1))}
              className="w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center justify-center border border-slate-700 cursor-pointer"
              title="Zoom Out"
            >
              +
            </button>
            <span className="text-[10px] font-mono text-sky-400 w-8 text-right font-bold">
              {(cameraZoom * 100).toFixed(0)}%
            </span>
          </div>

          <div className="h-4 w-px bg-slate-700/60" />

          {/* Mount Height Slider (1m to 50m, default 10m) */}
          <div className="flex items-center gap-2">
            <span
              className={`text-[11px] font-bold ${
                cameraAngle === 'mount' ? 'text-lime-400' : 'text-slate-400'
              }`}
            >
              📐 Mount H
            </span>
            <button
              onClick={() => onCameraHeightChange(Math.max(1, cameraHeight - 2))}
              className="w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center justify-center border border-slate-700 cursor-pointer"
              title="Lower Mount Height"
            >
              −
            </button>
            <input
              type="range"
              min="1"
              max="50"
              step="1"
              value={cameraHeight}
              onChange={(e) => onCameraHeightChange(parseFloat(e.target.value))}
              className={`w-20 md:w-28 cursor-pointer ${
                cameraAngle === 'mount' ? 'accent-lime-400' : 'accent-slate-500'
              }`}
              title={`Mount Height: ${cameraHeight.toFixed(0)}m (Default 10m)`}
            />
            <button
              onClick={() => onCameraHeightChange(Math.min(50, cameraHeight + 2))}
              className="w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center justify-center border border-slate-700 cursor-pointer"
              title="Raise Mount Height"
            >
              +
            </button>
            <span
              className={`text-[10px] font-mono w-9 text-right font-bold ${
                cameraAngle === 'mount' ? 'text-lime-400' : 'text-slate-400'
              }`}
            >
              {cameraHeight.toFixed(0)}m
            </span>
          </div>

          <div className="h-4 w-px bg-slate-700/60" />

          {/* Render Resolution Quick Toggle */}
          {onRenderResolutionChange && (
            <button
              onClick={() => {
                const list: RenderResolution[] = ['auto', '480p', '720p', '1080p'];
                const curIdx = list.indexOf(renderResolution);
                const next = list[(curIdx + 1) % list.length];
                onRenderResolutionChange(next);
              }}
              className="px-2 py-1 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-800 text-[11px] font-mono font-bold transition-colors cursor-pointer flex items-center gap-1.5"
              title="Click to cycle Render Resolution (480p, 720p, 1080p, Auto)"
            >
              <span className="text-slate-400 font-sans text-[10px]">Res:</span>
              <span className="text-lime-400 uppercase">{renderResolution}</span>
            </button>
          )}
        </div>

        {/* Right Controls Quick-Cheatsheet */}
        <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#0b1220]/90 backdrop-blur-md border border-slate-800 text-[11px] text-slate-300 shadow-lg">
          <span><strong>Move</strong>: Left Stick / Arrows</span>
          <span className="text-slate-600">·</span>
          <span><strong>Hit</strong>: A / Space</span>
          <span className="text-slate-600">·</span>
          <span><strong>Slice</strong>: B / Shift</span>
        </div>
      </div>
    </div>
  );
};
