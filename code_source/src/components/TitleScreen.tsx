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
  onOpenGamepadMapping: () => void;
  phoneConnected: boolean;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  onSelectMode,
  onOpenSettings,
  onOpenGamepadMapping,
  phoneConnected,
}) => {
  const [inSubMenu, setInSubMenu] = useState<boolean>(false);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const strings = t();

  const mainMenuItems = [
    {
      id: 'play',
      label: '🎾 Play Match',
      desc: 'Select match format: 1 vs AI, 2 vs AI Doubles, Local 1v1 or 2v2',
      isPrimary: true,
    },
    {
      id: 'gamepad_map',
      label: '🎮 Controller Buttons Mapping',
      desc: 'Detect connected gamepads and view mapped tennis strokes',
      isPrimary: false,
    },
    {
      id: 'motion_lab',
      label: strings.motionLab,
      desc: strings.motionLabDesc,
      isPrimary: false,
    },
    {
      id: 'settings',
      label: strings.settings,
      desc: 'Graphics quality, gauge speed, camera, and sound options',
      isPrimary: false,
    },
  ];

  const playSubMenuItems: { id: GameMode | 'back'; label: string; desc: string; players: string }[] = [
    {
      id: 'ai',
      label: '1 vs AI (Singles Championship)',
      desc: 'Singles match against professional challenger AI on regulation court',
      players: '1 Player',
    },
    {
      id: 'doubles_ai',
      label: '2 vs AI Doubles (Co-op vs AI Team)',
      desc: 'Team up with an AI partner against 2 opposing CPU players on ITF doubles court',
      players: '2 vs 2',
    },
    {
      id: 'local2p',
      label: '1 vs 1 Local (Two Players)',
      desc: 'Head-to-head local multiplayer with gamepads or keyboard on one screen',
      players: '2 Players',
    },
    {
      id: 'doubles_local',
      label: '2 vs 2 Doubles (Play with Friend Locally)',
      desc: 'Play doubles with a friend beside you against an opposing AI team',
      players: '2–4 Players',
    },
    {
      id: 'back',
      label: '← Back to Main Menu',
      desc: 'Return to title options',
      players: '',
    },
  ];

  const activeItems = inSubMenu ? playSubMenuItems : mainMenuItems;

  // TV Remote, Keyboard & Gamepad navigation
  useEffect(() => {
    const unsubInput = mypcBridge.addActionListener((action, pressed) => {
      if (!pressed) return;
      if (action === 'up') {
        sound.playUIBeep(false);
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : activeItems.length - 1));
      } else if (action === 'down') {
        sound.playUIBeep(false);
        setSelectedIndex((prev) => (prev < activeItems.length - 1 ? prev + 1 : 0));
      } else if (action === 'confirm') {
        sound.playUIBeep(true);
        triggerSelection(selectedIndex);
      } else if (action === 'back') {
        if (inSubMenu) {
          sound.playUIBeep(false);
          setInSubMenu(false);
          setSelectedIndex(0);
        }
      }
    });

    return unsubInput;
  }, [selectedIndex, inSubMenu, activeItems.length]);

  const triggerSelection = (idx: number) => {
    if (!inSubMenu) {
      const item = mainMenuItems[idx];
      if (item.id === 'play') {
        setInSubMenu(true);
        setSelectedIndex(0);
      } else if (item.id === 'gamepad_map') {
        onOpenGamepadMapping();
      } else if (item.id === 'motion_lab') {
        onSelectMode('motion_lab');
      } else if (item.id === 'settings') {
        onOpenSettings();
      }
    } else {
      const item = playSubMenuItems[idx];
      if (item.id === 'back') {
        setInSubMenu(false);
        setSelectedIndex(0);
      } else {
        onSelectMode(item.id as GameMode);
      }
    }
  };

  return (
    <div className="absolute inset-0 flex flex-col justify-between p-8 md:p-12 z-20 pointer-events-auto">
      {/* Top Header & Brand */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 bg-[#0a1120]/90 backdrop-blur-md p-3.5 rounded-2xl border border-slate-800 shadow-xl">
          <div className="w-10 h-10 rounded-xl bg-lime-400 text-slate-950 flex items-center justify-center font-black text-xl shadow-lg shadow-lime-400/20">
            🎾
          </div>
          <div>
            <h1 className="font-display text-2xl md:text-3xl font-extrabold tracking-tight text-white">
              {strings.title}
            </h1>
            <p className="text-xs font-medium text-slate-400 tracking-wider">
              {inSubMenu ? 'Select Match Format' : strings.subtitle}
            </p>
          </div>
        </div>

        {/* Controller Status */}
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0a1120]/90 border border-slate-800 shadow-xl">
          <span className="text-xs font-semibold text-slate-300">Controller:</span>
          {phoneConnected ? (
            <span className="text-xs font-bold text-lime-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-lime-400 animate-pulse" />
              {strings.phoneActive}
            </span>
          ) : (
            <span className="text-xs font-medium text-sky-400">
              {strings.gamepadReady}
            </span>
          )}
        </div>
      </div>

      {/* Main Menu / Sub-Menu Panel */}
      <div className="max-w-2xl my-auto space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-lime-400 tracking-widest uppercase">
            {inSubMenu ? 'GAME MODES SUB-MENU' : strings.selectHint}
          </p>
          {inSubMenu && (
            <button
              onClick={() => {
                setInSubMenu(false);
                setSelectedIndex(0);
              }}
              className="text-xs text-sky-400 hover:text-sky-300 font-medium underline"
            >
              ← Back to Main Menu
            </button>
          )}
        </div>

        <div className="space-y-2.5">
          {activeItems.map((item, idx) => {
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
                    ? 'bg-slate-900 border-lime-400 text-white shadow-xl shadow-lime-500/10 scale-[1.01] ring-2 ring-lime-400/40'
                    : 'bg-[#0a1120]/80 border-slate-800/80 text-slate-300 hover:bg-slate-900/90'
                }`}
              >
                <div>
                  <div className="text-base md:text-lg font-bold flex items-center gap-2.5">
                    {item.label}
                    {'players' in item && item.players && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30 font-semibold">
                        {item.players}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">{item.desc}</div>
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

      {/* Bottom TV & Keyboard Control Hints */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-800/80 text-xs text-slate-400">
        <div className="flex items-center gap-4">
          <span><strong className="text-white">↑ ↓</strong> {strings.navigateHint}</span>
          <span><strong className="text-white">OK / A / Space</strong> {strings.selectHint}</span>
          <span><strong className="text-white">Esc / B</strong> {inSubMenu ? 'Back to Main' : strings.backHint}</span>
        </div>
        <div className="flex items-center gap-2 text-slate-500">
          <span>ITF Tournament Spec</span>
          <span>·</span>
          <span>Samsung Smart TV &amp; Web</span>
        </div>
      </div>
    </div>
  );
};
