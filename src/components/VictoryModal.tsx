/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
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
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    sound.playCrowdCheer('big');
    sound.playRefereeWhistle('ace');

    // Submit score to My PC top-10 leaderboard
    const matchScore = winner === 1 ? 1000 + stats.longestRally * 50 : 250;
    mypcBridge.saveScore(matchScore);
  }, [winner, stats]);

  // TV Remote, Keyboard, and Gamepad navigation
  useEffect(() => {
    const unsubAction = mypcBridge.addActionListener((action, pressed) => {
      if (!pressed) return;
      if (action === 'up' || action === 'down') {
        sound.playUIBeep(false);
        setSelectedIndex((p) => (p === 0 ? 1 : 0));
      } else if (action === 'confirm') {
        sound.playUIBeep(true);
        if (selectedIndex === 0) onPlayAgain();
        else onQuitToTitle();
      } else if (action === 'cancel') {
        sound.playUIBeep(false);
        onQuitToTitle();
      }
    });

    const unsubGamepad = mypcBridge.addGamepadButtonListener((index, pressed) => {
      if (!pressed) return;
      if (index === 12 || index === 13) {
        setSelectedIndex((p) => (p === 0 ? 1 : 0));
      } else if (index === 0) {
        if (selectedIndex === 0) onPlayAgain();
        else onQuitToTitle();
      } else if (index === 1) {
        onQuitToTitle();
      }
    });

    return () => {
      unsubAction();
      unsubGamepad();
    };
  }, [selectedIndex]);

  return (
    /* Solid opaque background without any GPU-lagging backdrop-filter blur */
    <div className="absolute inset-0 bg-[#020617] z-50 flex items-center justify-center p-6 pointer-events-auto">
      <div className="bg-[#0f172a] border-2 border-slate-700 rounded-3xl w-full max-w-md p-8 shadow-2xl text-center space-y-6">
        <div className="text-5xl">🏆</div>

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
        <div className="p-4 rounded-2xl bg-[#090d16] border border-slate-800 text-xs divide-y divide-slate-800 font-mono">
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
            onMouseEnter={() => setSelectedIndex(0)}
            className={`w-full py-3.5 rounded-2xl font-black text-xs uppercase tracking-wider transition-all border ${
              selectedIndex === 0
                ? 'bg-lime-400 text-slate-950 border-lime-400 ring-4 ring-sky-400/50 scale-105 shadow-xl'
                : 'bg-lime-400/20 text-lime-300 border-lime-500/30'
            }`}
          >
            Play Rematch
          </button>

          <button
            onClick={() => {
              sound.playUIBeep();
              onQuitToTitle();
            }}
            onMouseEnter={() => setSelectedIndex(1)}
            className={`w-full py-2.5 rounded-2xl font-bold text-xs uppercase tracking-wider border transition-all ${
              selectedIndex === 1
                ? 'bg-slate-800 text-white border-sky-400 ring-4 ring-sky-400/50 scale-105'
                : 'bg-[#090d16] text-slate-300 border-slate-800 hover:bg-slate-800'
            }`}
          >
            Main Menu
          </button>
        </div>

        <div className="text-[11px] text-slate-400 flex items-center justify-center gap-3 pt-1">
          <span><strong>↑ ↓</strong> Select</span>
          <span><strong>OK / A</strong> Confirm</span>
        </div>
      </div>
    </div>
  );
};
