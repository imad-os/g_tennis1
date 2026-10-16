/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { PowerLevel, ScoreState, ShotType } from '../types/game';

interface MatchHUDProps {
  score: ScoreState;
  p1Name: string;
  p2Name: string;
  p1Controller: string;
  p2Controller: string;
  currentShotToast: { text: string; type: ShotType; power: PowerLevel } | null;
  rallyCount: number;
  onPauseClick: () => void;
}

export const MatchHUD: React.FC<MatchHUDProps> = ({
  score,
  p1Name,
  p2Name,
  p1Controller,
  p2Controller,
  currentShotToast,
  rallyCount,
  onPauseClick,
}) => {
  const formatPoint = (pts: number, playerIndex: 1 | 2) => {
    if (score.advantage === playerIndex) return 'AD';
    if (pts === 0) return '0';
    if (pts === 1) return '15';
    if (pts === 2) return '30';
    if (pts === 3) return '40';
    return '40';
  };

  return (
    <div className="absolute inset-0 pointer-events-none z-10 flex flex-col justify-between p-4 md:p-6 select-none">
      {/* Top Bar: Official Grand Slam Scoreboard */}
      <div className="flex items-start justify-between w-full max-w-4xl mx-auto">
        {/* Modern Broadcast Score Cluster */}
        <div className="bg-slate-950/85 border border-slate-800/80 rounded-2xl shadow-2xl backdrop-blur-md overflow-hidden flex divide-x divide-slate-800 text-xs md:text-sm">
          {/* Player 1 Row */}
          <div className="px-4 py-2.5 flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-sky-400" />
            <div className="font-bold text-white tracking-wide flex items-center gap-1.5">
              <span>{p1Name}</span>
              {score.currentServer === 1 && (
                <span className="text-[10px] text-lime-400">🎾</span>
              )}
            </div>
            <span className="text-[10px] text-slate-400 uppercase font-mono px-1.5 py-0.5 rounded bg-slate-900">
              {p1Controller}
            </span>
            <div className="flex items-center gap-2 font-mono tabular-nums font-bold ml-2">
              <span className="text-slate-400">G:{score.gamesP1}</span>
              <span className="text-xl md:text-2xl text-lime-400 px-2 py-0.5 rounded bg-slate-900 border border-slate-800">
                {formatPoint(score.pointsP1, 1)}
              </span>
            </div>
          </div>

          {/* VS Divider */}
          <div className="px-2 py-2.5 flex items-center justify-center font-display font-extrabold text-slate-500 text-xs">
            VS
          </div>

          {/* Player 2 Row */}
          <div className="px-4 py-2.5 flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-rose-500" />
            <div className="font-bold text-white tracking-wide flex items-center gap-1.5">
              <span>{p2Name}</span>
              {score.currentServer === 2 && (
                <span className="text-[10px] text-lime-400">🎾</span>
              )}
            </div>
            <span className="text-[10px] text-slate-400 uppercase font-mono px-1.5 py-0.5 rounded bg-slate-900">
              {p2Controller}
            </span>
            <div className="flex items-center gap-2 font-mono tabular-nums font-bold ml-2">
              <span className="text-slate-400">G:{score.gamesP2}</span>
              <span className="text-xl md:text-2xl text-rose-400 px-2 py-0.5 rounded bg-slate-900 border border-slate-800">
                {formatPoint(score.pointsP2, 2)}
              </span>
            </div>
          </div>
        </div>

        {/* Rally & Pause Button */}
        <div className="flex items-center gap-3">
          {rallyCount > 1 && (
            <div className="bg-slate-950/80 border border-slate-800/80 px-3 py-1.5 rounded-xl text-xs font-mono tabular-nums text-lime-400 flex items-center gap-1.5 shadow-lg">
              <span className="text-slate-400">RALLY:</span>
              <span className="font-bold text-base">{rallyCount}</span>
            </div>
          )}

          <button
            onClick={onPauseClick}
            className="pointer-events-auto px-3.5 py-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/60 text-xs font-semibold backdrop-blur-md transition-colors"
          >
            Pause (Esc)
          </button>
        </div>
      </div>

      {/* Center Dynamic Shot Feedback Toast */}
      {currentShotToast && (
        <div className="self-center my-auto transition-all duration-150 animate-bounce">
          <div className="px-6 py-3 rounded-2xl bg-slate-950/90 border-2 border-lime-400 shadow-2xl shadow-lime-400/20 backdrop-blur-md flex items-center gap-3">
            <span className="text-xl">
              {currentShotToast.type === 'FOREHAND'
                ? '🎾'
                : currentShotToast.type === 'BACKHAND'
                ? '⚡'
                : '💥'}
            </span>
            <div>
              <div className="text-sm md:text-base font-extrabold text-white tracking-wide uppercase font-display">
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
                      className={`h-2 w-6 rounded-full transition-colors ${
                        active
                          ? isSmash
                            ? 'bg-rose-500 shadow-md shadow-rose-500/50'
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

      {/* Bottom Status & Control Guide */}
      <div className="flex items-end justify-between w-full max-w-4xl mx-auto">
        {/* Left Announcement ticker */}
        <div className="px-4 py-2 rounded-xl bg-slate-950/80 border border-slate-800 text-xs font-medium text-slate-300">
          {score.announcementText}
        </div>

        {/* Right Instructions */}
        <div className="px-4 py-2 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-400 flex items-center gap-3">
          {p1Controller === 'motion' ? (
            <span>Hold phone like racket &amp; <strong>Swing physically!</strong></span>
          ) : (
            <span><strong>Left Stick</strong> Move · <strong>A / Space</strong> Swing</span>
          )}
        </div>
      </div>
    </div>
  );
};
