/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { sound } from '../services/sound';

interface PauseMenuProps {
  onResume: () => void;
  onRestart: () => void;
  onOpenSettings: () => void;
  onOpenMotionLab: () => void;
  onQuitToTitle: () => void;
}

export const PauseMenu: React.FC<PauseMenuProps> = ({
  onResume,
  onRestart,
  onOpenSettings,
  onOpenMotionLab,
  onQuitToTitle,
}) => {
  return (
    <div className="absolute inset-0 bg-slate-950/85 z-40 flex items-center justify-center p-6 pointer-events-auto backdrop-blur-md">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-sm p-6 shadow-2xl text-center space-y-4">
        <div className="space-y-1">
          <h2 className="font-display text-2xl font-black text-white tracking-wide">
            MATCH PAUSED
          </h2>
          <p className="text-xs text-slate-400">Grand Slam 3D Tennis</p>
        </div>

        <div className="space-y-2 pt-2">
          <button
            onClick={() => {
              sound.playUIBeep(true);
              onResume();
            }}
            className="w-full py-3 rounded-2xl bg-lime-400 hover:bg-lime-300 text-slate-950 font-bold text-sm transition-all shadow-lg shadow-lime-400/20"
          >
            Resume Match
          </button>

          <button
            onClick={() => {
              sound.playUIBeep();
              onRestart();
            }}
            className="w-full py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs border border-slate-700 transition-colors"
          >
            Restart Match
          </button>

          <button
            onClick={() => {
              sound.playUIBeep();
              onOpenMotionLab();
            }}
            className="w-full py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-sky-300 font-bold text-xs border border-sky-500/30 transition-colors"
          >
            Motion Lab &amp; Calibration
          </button>

          <button
            onClick={() => {
              sound.playUIBeep();
              onOpenSettings();
            }}
            className="w-full py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs border border-slate-700 transition-colors"
          >
            Game Settings
          </button>

          <button
            onClick={() => {
              sound.playUIBeep();
              onQuitToTitle();
            }}
            className="w-full py-2.5 rounded-2xl bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 font-bold text-xs border border-rose-800/40 transition-colors"
          >
            Quit to Title Screen
          </button>
        </div>
      </div>
    </div>
  );
};
