/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { sound } from '../services/sound';

interface GamepadMappingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ActiveGamepadState {
  id: string;
  index: number;
  buttons: boolean[];
  axes: number[];
}

export const GamepadMappingModal: React.FC<GamepadMappingModalProps> = ({ isOpen, onClose }) => {
  const [activePads, setActivePads] = useState<ActiveGamepadState[]>([]);
  const [lastPressedButton, setLastPressedButton] = useState<string | null>(null);

  // Poll gamepads at 60fps when modal is open
  useEffect(() => {
    if (!isOpen) return;

    let animId: number;
    const pollGamepads = () => {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const connected: ActiveGamepadState[] = [];

      for (let i = 0; i < pads.length; i++) {
        const pad = pads[i];
        if (pad && pad.connected) {
          const btnStates = pad.buttons.map((b) => b.pressed || b.value > 0.5);
          connected.push({
            id: pad.id,
            index: pad.index,
            buttons: btnStates,
            axes: [...pad.axes],
          });

          // Check if any button was pressed to show live feedback
          btnStates.forEach((pressed, btnIdx) => {
            if (pressed) {
              const label = getButtonName(btnIdx);
              setLastPressedButton(`Pad ${pad.index + 1}: ${label} (Button ${btnIdx})`);
            }
          });
        }
      }

      setActivePads(connected);
      animId = requestAnimationFrame(pollGamepads);
    };

    animId = requestAnimationFrame(pollGamepads);
    return () => cancelAnimationFrame(animId);
  }, [isOpen]);

  if (!isOpen) return null;

  const topMappings = [
    {
      btn: 'Button 0 · A / ✕ (South)',
      action: 'Flat Drive / Hard Stroke',
      desc: 'Standard crisp drive. Auto-switches between Forehand and Backhand based on ball lateral position.',
      badge: 'FLAT DRIVE',
      color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      idx: 0,
    },
    {
      btn: 'Button 1 · B / ◯ (East)',
      action: 'Slice / Underspin',
      desc: 'Low skidding slice with heavy backspin. Auto-switches between Forehand and Backhand.',
      badge: 'SLICE',
      color: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      idx: 1,
    },
    {
      btn: 'Button 2 · X / ▢ (West)',
      action: 'Heavy Topspin',
      desc: 'High-RPM dipping topspin that kicks aggressively after court bounce. Auto Forehand/Backhand.',
      badge: 'TOPSPIN',
      color: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
      idx: 2,
    },
    {
      btn: 'Button 3 · Y / △ (North)',
      action: 'Lob / Overhead Smash',
      desc: 'Contextual: Triggers explosive Overhead Smash on high balls/near net, or tactical Lob when opponent guards the net.',
      badge: 'SMASH / LOB',
      color: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
      idx: 3,
    },
    {
      btn: 'Button 5 · RB / R1 (Right Bumper)',
      action: 'Drop Shot (Net Touch)',
      desc: 'Delicate feather touch landing softly just over the net with backward spin.',
      badge: 'DROP SHOT',
      color: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
      idx: 5,
    },
    {
      btn: 'Left Stick / D-Pad',
      action: 'Movement & Shot Direction Aiming',
      desc: 'Control player court locomotion, approach the net, and aim shot placement toward corners.',
      badge: 'MOVE & AIM',
      color: 'bg-lime-500/20 text-lime-300 border-lime-500/40',
      idx: -1,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="w-full max-w-4xl max-h-[92vh] overflow-y-auto bg-[#0a0f1d] border border-slate-800 rounded-3xl p-6 md:p-8 shadow-2xl flex flex-col gap-6 text-white">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-lime-400 to-emerald-500 text-slate-950 flex items-center justify-center text-2xl font-black shadow-lg shadow-lime-500/20">
              🎮
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-black tracking-tight">
                Controller Buttons Mapping
              </h2>
              <p className="text-xs text-slate-400">
                Official 4-button tennis mapping with auto Forehand &amp; Backhand detection
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              sound.playUIBeep(false);
              onClose();
            }}
            className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Live Controller Connection & Test Indicator */}
        <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-slate-400">Connected Controllers:</div>
            <div className="flex flex-wrap gap-2 mt-1">
              {activePads.length > 0 ? (
                activePads.map((pad) => (
                  <span
                    key={pad.index}
                    className="px-3 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-1.5"
                  >
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    Pad {pad.index + 1}: {pad.id.slice(0, 30)}
                  </span>
                ))
              ) : (
                <span className="text-xs text-amber-400 font-medium flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  No physical gamepad detected. Connect any USB/Bluetooth controller or use Keyboard!
                </span>
              )}
            </div>
          </div>

          {lastPressedButton && (
            <div className="px-3 py-1.5 rounded-xl bg-lime-400/20 border border-lime-400/50 text-lime-300 text-xs font-mono font-bold">
              Detected: {lastPressedButton}
            </div>
          )}
        </div>

        {/* Top 4 Tennis Shot Mappings */}
        <div className="space-y-3">
          <h3 className="text-xs font-black tracking-widest text-lime-400 uppercase">
            Top 4 Tennis Hit Types &amp; Standard Controls
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {topMappings.map((m, idx) => {
              const isPressed =
                m.idx >= 0 &&
                activePads.some((p) => p.buttons[m.idx]);

              return (
                <div
                  key={idx}
                  className={`p-4 rounded-2xl border transition-all ${
                    isPressed
                      ? 'bg-lime-500/15 border-lime-400 ring-2 ring-lime-400 shadow-lg shadow-lime-500/10 scale-[1.01]'
                      : 'bg-[#0e1424] border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-sm text-white flex items-center gap-2">
                      <span className={`w-3 h-3 rounded-full ${isPressed ? 'bg-lime-400 animate-ping' : 'bg-slate-700'}`} />
                      {m.btn}
                    </span>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-md border ${m.color}`}>
                      {m.badge}
                    </span>
                  </div>
                  <div className="text-xs font-bold text-slate-200 mt-2">{m.action}</div>
                  <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{m.desc}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Contextual Forehand vs Backhand Explanation */}
        <div className="p-4 rounded-2xl bg-gradient-to-r from-sky-950/40 to-slate-900 border border-sky-800/40 space-y-2">
          <div className="text-xs font-black text-sky-400 uppercase tracking-wider flex items-center gap-1.5">
            <span>ℹ️</span> Smart Ball Position Contextual Logic
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            In modern tennis championships, you don't need a separate button for Forehand and Backhand.
            When you hit <strong>Flat Drive (A)</strong>, <strong>Slice (B)</strong>, or <strong>Topspin (X)</strong>,
            the physics engine analyzes whether the incoming ball is to your right or left side.
            Ball on your racket side executes an authentic <strong>Forehand</strong> stroke; ball on your off side executes a <strong>Backhand</strong> stroke!
          </p>
        </div>

        {/* Keyboard & TV Remote Reference */}
        <div className="p-4 rounded-2xl bg-[#0e1424] border border-slate-800 space-y-2">
          <div className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            Keyboard &amp; Standalone PC Controls
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-slate-400">
            <div><strong className="text-white">Space / Enter:</strong> Flat Drive</div>
            <div><strong className="text-white">Shift / Z:</strong> Slice Stroke</div>
            <div><strong className="text-white">X Key:</strong> Topspin Drive</div>
            <div><strong className="text-white">C Key:</strong> Smash / Lob</div>
            <div><strong className="text-white">V Key:</strong> Drop Shot</div>
            <div><strong className="text-white">WASD / Arrows:</strong> Movement &amp; Aim</div>
            <div><strong className="text-white">Esc Key:</strong> Pause Match</div>
            <div><strong className="text-white">Tab Key:</strong> Change Camera</div>
          </div>
        </div>

        {/* Hold-to-Charge Safe-Zone Pro Tip */}
        <div className="p-3.5 rounded-2xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2.5">
          <span className="text-xl">⚡</span>
          <div>
            <strong className="text-emerald-300">Hold-to-Charge Stroke Mechanic:</strong> Press and hold any shot button to wind up and oscillate the power gauge. Release the button when the needle is inside the <span className="text-emerald-400 font-bold underline">Green Safe Zone</span> for guaranteed legal court placement!
          </div>
        </div>

        {/* Close Button */}
        <button
          onClick={() => {
            sound.playUIBeep(true);
            onClose();
          }}
          className="w-full py-3.5 rounded-2xl bg-lime-400 hover:bg-lime-300 text-slate-950 font-black text-sm tracking-wide transition-colors shadow-lg shadow-lime-400/20"
        >
          Close &amp; Resume Play
        </button>
      </div>
    </div>
  );
};

function getButtonName(idx: number): string {
  switch (idx) {
    case 0: return 'A / ✕ (South)';
    case 1: return 'B / ◯ (East)';
    case 2: return 'X / ▢ (West)';
    case 3: return 'Y / △ (North)';
    case 4: return 'LB / L1';
    case 5: return 'RB / R1';
    case 6: return 'LT / L2';
    case 7: return 'RT / R2';
    case 8: return 'Select / Back';
    case 9: return 'Start / Menu';
    case 10: return 'L3 (Stick Click)';
    case 11: return 'R3 (Stick Click)';
    case 12: return 'D-Pad Up';
    case 13: return 'D-Pad Down';
    case 14: return 'D-Pad Left';
    case 15: return 'D-Pad Right';
    default: return `Button ${idx}`;
  }
}
