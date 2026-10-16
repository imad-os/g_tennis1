/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { GameMode } from '../types/game';
import { sound } from '../services/sound';
import { mypcBridge } from '../services/mypcBridge';
import { t } from '../services/i18n';

interface TitleScreenProps {
  onSelectMode: (mode: GameMode) => void;
  onOpenSettings: () => void;
  phoneConnected: boolean;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  onSelectMode,
  onOpenSettings,
  phoneConnected,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const strings = t();

  const menuItems = [
    { id: 'ai', label: strings.quickMatch, desc: strings.quickMatchDesc },
    { id: 'local2p', label: strings.local2p, desc: strings.local2pDesc },
    { id: 'motion_lab', label: strings.motionLab, desc: strings.motionLabDesc },
    { id: 'settings', label: strings.settings, desc: strings.settingsDesc },
  ];

  // TV Remote, Keyboard & Gamepad navigation
  useEffect(() => {
    const unsubInput = mypcBridge.addActionListener((action, pressed) => {
      if (!pressed) return;
      if (action === 'up') {
        sound.playUIBeep(false);
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : menuItems.length - 1));
      } else if (action === 'down') {
        sound.playUIBeep(false);
        setSelectedIndex((prev) => (prev < menuItems.length - 1 ? prev + 1 : 0));
      } else if (action === 'confirm') {
        sound.playUIBeep(true);
        triggerSelection(selectedIndex);
      }
    });

    return unsubInput;
  }, [selectedIndex]);

  const triggerSelection = (idx: number) => {
    const item = menuItems[idx];
    if (item.id === 'settings') {
      onOpenSettings();
    } else {
      onSelectMode(item.id as GameMode);
    }
  };

  return (
    <div className="absolute inset-0 flex flex-col justify-between p-8 md:p-12 z-20 pointer-events-auto">
      {/* Top Header & Brand */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 bg-[#0f172a] p-3 rounded-2xl border border-slate-800">
          <div className="w-10 h-10 rounded-xl bg-lime-400 text-slate-950 flex items-center justify-center font-black text-xl shadow-lg shadow-lime-400/20">
            🎾
          </div>
          <div>
            <h1 className="font-display text-2xl md:text-3xl font-extrabold tracking-tight text-white">
              {strings.title}
            </h1>
            <p className="text-xs font-medium text-slate-400 tracking-wider">
              {strings.subtitle}
            </p>
          </div>
        </div>

        {/* Controller Status Indicator */}
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0f172a] border border-slate-700">
          <span className="text-xs font-semibold text-slate-300">Controller:</span>
          {phoneConnected ? (
            <span className="text-xs font-bold text-lime-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-lime-400" />
              {strings.phoneActive}
            </span>
          ) : (
            <span className="text-xs font-medium text-sky-400">
              {strings.gamepadReady}
            </span>
          )}
        </div>
      </div>

      {/* Main Menu Choices */}
      <div className="max-w-xl my-auto space-y-3">
        <p className="text-xs font-semibold text-lime-400 tracking-widest uppercase">
          {strings.selectHint}
        </p>

        <div className="space-y-2.5">
          {menuItems.map((item, idx) => {
            const isSelected = selectedIndex === idx;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setSelectedIndex(idx);
                  triggerSelection(idx);
                }}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={`w-full text-left p-4 rounded-2xl transition-all duration-150 flex items-center justify-between border ${
                  isSelected
                    ? 'bg-slate-900 border-lime-400 text-white shadow-xl shadow-lime-500/10 scale-[1.02] ring-2 ring-lime-400/40'
                    : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:bg-slate-900/90'
                }`}
              >
                <div>
                  <div className="text-base md:text-lg font-bold flex items-center gap-2">
                    {item.label}
                    {item.id === 'motion_lab' && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30 font-semibold">
                        DSP &amp; Calibration
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">{item.desc}</div>
                </div>

                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                    isSelected ? 'bg-lime-400 text-slate-950 font-bold' : 'text-slate-600'
                  }`}
                >
                  {isSelected ? '→' : '›'}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom TV Control Hints */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-800/80 text-xs text-slate-400">
        <div className="flex items-center gap-4">
          <span><strong className="text-white">↑ ↓</strong> {strings.navigateHint}</span>
          <span><strong className="text-white">OK / A</strong> {strings.selectHint}</span>
          <span><strong className="text-white">Esc / B</strong> {strings.backHint}</span>
        </div>
        <div className="flex items-center gap-2 text-slate-500">
          <span>My PC SDK v1</span>
          <span>·</span>
          <span>Samsung Smart TV &amp; Web</span>
        </div>
      </div>
    </div>
  );
};
