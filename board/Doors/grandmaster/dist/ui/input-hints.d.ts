/**
 * In-game control hints, built from what the player ACTUALLY bound.
 *
 * The hint bar used to be a hardcoded string - "1-6 special on player 0 self
 * TAB random BS discard P pause" - so it lied to anyone who rebound a key
 * and lied to everyone playing on a joypad, where none of those labels mean
 * anything (reported 2026-08-26). It now reads the live bindings and the
 * device in use.
 *
 * Pure: bindings in, text out, so the wording can be tested without a game.
 */
import type { KeyConfig } from '../input/config';
import type { GameAction } from '../core/types';
/** Which device the player is using right now. */
export type InputSource = 'keyboard' | 'gamepad';
/** One thing worth telling the player about. */
export interface HintEntry {
    action: GameAction | string;
    label: string;
}
/** Human-readable name for a key as the door names it internally. */
export declare function formatKeyName(key: string): string;
/** Human-readable name for a gamepad trigger string, e.g. "button:a". */
export declare function formatTriggerName(trigger: string): string;
/** The key bound to an action, or null when the player has none. */
export declare function keyFor(action: string, keys: Partial<KeyConfig>): string | null;
/** The pad control bound to an action, or null when there is none. */
export declare function padFor(action: string, bindings: Partial<Record<string, string[]>>): string | null;
/**
 * The hint line for a set of actions.
 *
 * Actions the player has not bound are LEFT OUT rather than shown with a
 * blank - a hint for a control that does nothing is worse than no hint.
 */
export declare function buildHintLine(entries: HintEntry[], source: InputSource, keys: Partial<KeyConfig>, padBindings: Partial<Record<string, string[]>>): string;
/**
 * The TetriNET hint line.
 *
 * The number keys that target opponent slots are fixed in the reference
 * client and have no pad equivalent, so they are described only when playing
 * on the keyboard.
 */
export declare function tetrinetHints(source: InputSource, keys: Partial<KeyConfig>, padBindings: Partial<Record<string, string[]>>): string;
//# sourceMappingURL=input-hints.d.ts.map