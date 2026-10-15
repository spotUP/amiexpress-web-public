/**
 * GamepadActionMapper - maps gamepad inputs to named game actions
 *
 * Generic over action name type T so any door can use its own action set.
 * Handles DAS/ARR for held directional inputs (buttons and dpad).
 * Axis inputs fire continuously at poll rate (natural analog feel).
 *
 * Usage:
 *   const mapper = new GamepadActionMapper<GameAction>({
 *     bbsSession: ctx.session,
 *     mapping: { left: [{ type: 'dpad', direction: 'left' }], ... },
 *     repeatActions: ['left', 'right', 'soft_drop'],
 *   });
 *   mapper.on('left', () => move(-1));
 *   // on exit:
 *   mapper.destroy();
 */

import EventEmitter from 'events';
import { GamepadInputManager } from './gamepad-input-manager';
import { GamepadButton, GamepadAxis } from '../types/gamepad';

// --- trigger types -------------------------------------------------------

export type ButtonTrigger = { type: 'button'; button: GamepadButton };
export type DpadTrigger = { type: 'dpad'; direction: 'up' | 'down' | 'left' | 'right' };
export type AxisTrigger = {
  type: 'axis';
  axis: GamepadAxis;
  direction: 'positive' | 'negative';
  /** Override the mapper-level axisThreshold for this specific trigger */
  threshold?: number;
};

export type GamepadTrigger = ButtonTrigger | DpadTrigger | AxisTrigger;

// --- config --------------------------------------------------------------

export interface GamepadActionMapperOptions<T extends string> {
  bbsSession: any;
  /** Map each action name to one or more triggers that activate it */
  mapping: Partial<Record<T, GamepadTrigger[]>>;
  /** Actions that auto-repeat when held (DAS then ARR) */
  repeatActions?: T[];
  dasDelay?: number;      // ms before auto-repeat starts (default 133)
  arrRate?: number;       // ms between auto-repeats (default 10)
  axisThreshold?: number; // |value| that activates an axis trigger (default 0.5)
}

// --- button name table ---------------------------------------------------

const BUTTON_NAMES: Partial<Record<GamepadButton, string>> = {
  [GamepadButton.A]: 'a',
  [GamepadButton.B]: 'b',
  [GamepadButton.X]: 'x',
  [GamepadButton.Y]: 'y',
  [GamepadButton.L1]: 'l1',
  [GamepadButton.R1]: 'r1',
  [GamepadButton.L2]: 'l2',
  [GamepadButton.R2]: 'r2',
  [GamepadButton.SELECT]: 'select',
  [GamepadButton.START]: 'start',
  [GamepadButton.L3]: 'l3',
  [GamepadButton.R3]: 'r3',
  [GamepadButton.HOME]: 'home',
};

// --- mapper --------------------------------------------------------------

export class GamepadActionMapper<T extends string> extends EventEmitter {
  private bbsSession: any;
  private mapping: Partial<Record<T, GamepadTrigger[]>>;
  private repeatActions: Set<T>;
  private dasDelay: number;
  private arrRate: number;
  private axisThreshold: number;
  private gim: GamepadInputManager;

  // Per-action set of active trigger keys (pressing multiple triggers for the
  // same action is fine; DAS only starts on the first and stops on the last).
  private active = new Map<T, Set<string>>();
  private dasTimers = new Map<T, ReturnType<typeof setTimeout>>();
  private arrIntervals = new Map<T, ReturnType<typeof setInterval>>();

  constructor(opts: GamepadActionMapperOptions<T>) {
    super();
    this.bbsSession = opts.bbsSession;
    this.mapping = opts.mapping;
    this.repeatActions = new Set(opts.repeatActions ?? []);
    this.dasDelay = opts.dasDelay ?? 133;
    this.arrRate = opts.arrRate ?? 10;
    this.axisThreshold = opts.axisThreshold ?? 0.5;
    this.gim = new GamepadInputManager(this.bbsSession);
    this.wire();
  }

  // --- wiring -------------------------------------------------------------

  private wire() {
    for (const [rawAction, triggers] of Object.entries(this.mapping) as [T, GamepadTrigger[]][]) {
      if (!triggers?.length) continue;
      const action = rawAction as T;
      const isRepeat = this.repeatActions.has(action);
      for (const trigger of triggers) {
        this.wireTrigger(action, trigger, isRepeat);
      }
    }
  }

  private wireTrigger(action: T, trigger: GamepadTrigger, isRepeat: boolean) {
    const key = triggerKey(trigger);

    if (trigger.type === 'button') {
      const name = BUTTON_NAMES[trigger.button];
      if (!name) return;
      this.gim.on(`button:${name}`, (pressed: boolean) => {
        if (pressed) this.press(action, key, isRepeat);
        else this.release(action, key);
      });

    } else if (trigger.type === 'dpad') {
      // Generic 'dpad' event fires on every direction change (including 'none').
      this.gim.on('dpad', (direction: string) => {
        if (direction === trigger.direction) {
          this.press(action, key, isRepeat);
        } else if (this.isActive(action, key)) {
          this.release(action, key);
        }
      });

    } else if (trigger.type === 'axis') {
      const threshold = trigger.threshold ?? this.axisThreshold;
      this.gim.on('axis', (axis: GamepadAxis, value: number) => {
        if (axis !== trigger.axis) return;
        const active = trigger.direction === 'positive' ? value >= threshold : value <= -threshold;
        if (active) {
          this.press(action, key, isRepeat);
        } else if (this.isActive(action, key)) {
          this.release(action, key);
        }
      });
    }
  }

  // --- press / release / DAS/ARR -----------------------------------------

  private isActive(action: T, key: string): boolean {
    return this.active.get(action)?.has(key) ?? false;
  }

  private press(action: T, key: string, repeat: boolean) {
    if (!this.active.has(action)) this.active.set(action, new Set());
    const keys = this.active.get(action)!;
    const firstPress = keys.size === 0;
    keys.add(key);

    if (firstPress) {
      this.emit(action);
      if (repeat) this.startDAS(action);
    }
  }

  private release(action: T, key: string) {
    const keys = this.active.get(action);
    if (!keys) return;
    keys.delete(key);
    if (keys.size === 0) this.stopRepeat(action);
  }

  private startDAS(action: T) {
    if (this.dasTimers.has(action)) return;
    const t = setTimeout(() => {
      this.dasTimers.delete(action);
      const i = setInterval(() => {
        if ((this.active.get(action)?.size ?? 0) > 0) {
          this.emit(action);
        } else {
          clearInterval(i);
          this.arrIntervals.delete(action);
        }
      }, this.arrRate);
      this.arrIntervals.set(action, i);
    }, this.dasDelay);
    this.dasTimers.set(action, t);
  }

  private stopRepeat(action: T) {
    const das = this.dasTimers.get(action);
    if (das !== undefined) { clearTimeout(das); this.dasTimers.delete(action); }
    const arr = this.arrIntervals.get(action);
    if (arr !== undefined) { clearInterval(arr); this.arrIntervals.delete(action); }
  }

  // --- public API ---------------------------------------------------------

  /** Replace the current mapping and re-wire all listeners */
  updateMapping(mapping: Partial<Record<T, GamepadTrigger[]>>) {
    this.gim.destroy();
    this.stopAll();
    this.mapping = mapping;
    this.gim = new GamepadInputManager(this.bbsSession);
    this.wire();
  }

  /** Update DAS/ARR timing (takes effect on next key press) */
  updateTiming(dasDelay: number, arrRate: number) {
    this.dasDelay = dasDelay;
    this.arrRate = arrRate;
  }

  destroy() {
    this.stopAll();
    this.gim.destroy();
    this.removeAllListeners();
  }

  private stopAll() {
    for (const action of [...this.dasTimers.keys()]) this.stopRepeat(action);
    this.active.clear();
  }
}

function triggerKey(t: GamepadTrigger): string {
  if (t.type === 'button') return `btn:${t.button}`;
  if (t.type === 'dpad') return `dpad:${t.direction}`;
  return `axis:${t.axis}:${t.direction}`;
}
