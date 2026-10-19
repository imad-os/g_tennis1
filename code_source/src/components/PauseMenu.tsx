/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { sound } from '../services/sound';
import { mypcBridge } from '../services/mypcBridge';
import { t } from '../services/i18n';

interface PauseMenuProps {
  onResume: () => void;
  onRestart: () => void;
  onOpenSettings: () => void;
  onOpenMotionLab: () => void;
  onOpenGamepadMapping?: () => void;
  onQuitToTitle: () => void;
}

export const PauseMenu: React.FC<PauseMenuProps> = ({
  onResume,
  onRestart,
  onOpenSettings,
  onOpenMotionLab,
  onOpenGamepadMapping,
  onQuitToTitle,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const strings = t();

  const menuOptions = [
    { label: strings.resume, action: onResume, primary: true },
    { label: strings.restart, action: onRestart },
    ...(onOpenGamepadMapping ? [{ label: '🎮 Controller Mapping', action: onOpenGamepadMapping }] : []),
    { label: strings.motionLab, action: onOpenMotionLab },
    { label: strings.settings, action: onOpenSettings },
    { label: strings.quit, action: onQuitToTitle, danger: true },
  ];

  // TV Remote, Keyboard, and Gamepad navigation
  useEffect(() => {
    const unsubAction = mypcBridge.addActionListener((action, pressed) => {
      if (!pressed) return;
      if (action === 'up') {
        sound.playUIBeep(false);
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : menuOptions.length - 1));
      } else if (action === 'down') {
        sound.playUIBeep(false);
        setSelectedIndex((prev) => (prev < menuOptions.length - 1 ? prev + 1 : 0));
      } else if (action === 'confirm') {
        sound.playUIBeep(true);
        menuOptions[selectedIndex].action();
      } else if (action === 'cancel') {
        sound.playUIBeep(false);
        onResume();
      }
    });

    const unsubGamepad = mypcBridge.addGamepadButtonListener((index, pressed) => {
      if (!pressed) return;
      if (index === 1) {
        // B Button (Back / Resume)
        sound.playUIBeep(false);
        onResume();
      }
    });

    return () => {
      unsubAction();
      unsubGamepad();
    };
  }, [selectedIndex]);

  return (
    <div className="absolute inset-0 bg-[#020617] z-40 flex items-center justify-center p-6 pointer-events-auto">
      <div className="bg-[#0f172a] border-2 border-slate-700 rounded-3xl w-full max-w-sm p-6 shadow-2xl text-center space-y-4">
        <div className="space-y-1">
          <h2 className="font-display text-2xl font-black text-white tracking-wide">
            {strings.paused}
          </h2>
          <p className="text-xs text-slate-400">{strings.title}</p>
        </div>

        <div className="space-y-2 pt-2">
          {menuOptions.map((opt, idx) => {
            const isSelected = selectedIndex === idx;
            return (
              <button
                key={opt.label}
                onClick={() => {
                  sound.playUIBeep();
                  opt.action();
                }}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={`w-full py-3 rounded-2xl font-bold text-xs uppercase tracking-wide transition-all border ${
                  isSelected
                    ? 'border-sky-400 ring-4 ring-sky-400/50 scale-105 bg-lime-400 text-slate-950 shadow-xl'
                    : opt.primary
                    ? 'bg-lime-400/20 text-lime-300 border-lime-500/30 hover:bg-lime-400/30'
                    : opt.danger
                    ? 'bg-rose-950/40 text-rose-300 border-rose-800/40 hover:bg-rose-900/60'
                    : 'bg-[#090d16] text-slate-300 border-slate-800 hover:bg-slate-800'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <div className="pt-2 text-[11px] text-slate-400 flex items-center justify-center gap-3">
          <span><strong>↑ ↓</strong> {strings.navigateHint}</span>
          <span><strong>OK / A</strong> {strings.selectHint}</span>
          <span><strong>Esc / B</strong> {strings.backHint}</span>
        </div>
      </div>
    </div>
  );
};
