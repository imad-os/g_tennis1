/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { MatchStats } from '../types/game';
import { sound } from '../services/sound';
import { mypcBridge } from '../services/mypcBridge';

interface VictoryModalProps {
  winner: 1 | 2;
  p1Name: string;
  p2Name: string;
  stats: MatchStats;
  onPlayAgain: () => void;
  onQuitToTitle: () => void;
}

export const VictoryModal: React.FC<VictoryModalProps> = ({
  winner,
  p1Name,
  p2Name,
  stats,
  onPlayAgain,
  onQuitToTitle,
}) => {
  const winnerName = winner === 1 ? p1Name : p2Name;

  useEffect(() => {
    sound.playCrowdCheer('big');
    sound.playRefereeWhistle('ace');

    // Submit score to My PC top-10 leaderboard
    const matchScore = winner === 1 ? 1000 + stats.longestRally * 50 : 250;
    mypcBridge.saveScore(matchScore);
  }, [winner, stats]);

  return (
    <div className="absolute inset-0 bg-slate-950/90 z-50 flex items-center justify-center p-6 pointer-events-auto backdrop-blur-md">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-8 shadow-2xl text-center space-y-6">
        <div className="text-5xl animate-bounce">🏆</div>

        <div className="space-y-1">
          <div className="text-xs font-bold text-lime-400 uppercase tracking-widest">
            MATCH POINT WON
          </div>
          <h2 className="font-display text-3xl font-black text-white">
            {winnerName} WINS!
          </h2>
          <p className="text-xs text-slate-400">Grand Slam Championship Trophy</p>
        </div>

        {/* Match Statistics Table */}
        <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 text-xs divide-y divide-slate-800 font-mono">
          <div className="flex justify-between py-2 text-slate-300">
            <span>Longest Rally</span>
            <span className="font-bold text-lime-400 tabular-nums">{stats.longestRally} shots</span>
          </div>
          <div className="flex justify-between py-2 text-slate-300">
            <span>Max Swing Power</span>
            <span className="font-bold text-amber-400 tabular-nums">Level {stats.maxPowerP1}/5</span>
          </div>
          <div className="flex justify-between py-2 text-slate-300">
            <span>Total Rallies Played</span>
            <span className="font-bold text-white tabular-nums">{stats.totalRallies || 12}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2.5">
          <button
            onClick={() => {
              sound.playUIBeep(true);
              onPlayAgain();
            }}
            className="w-full py-3.5 rounded-2xl bg-lime-400 hover:bg-lime-300 text-slate-950 font-black text-sm tracking-wide uppercase transition-all shadow-xl shadow-lime-400/20"
          >
            Play Rematch
          </button>

          <button
            onClick={() => {
              sound.playUIBeep();
              onQuitToTitle();
            }}
            className="w-full py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs border border-slate-700 transition-colors"
          >
            Main Menu
          </button>
        </div>
      </div>
    </div>
  );
};
