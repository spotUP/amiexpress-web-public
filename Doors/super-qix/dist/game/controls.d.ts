/**
 * The door's keyboard layer: what a raw key means, which direction it moves,
 * and what the help screen says about it.
 *
 * This lives beside the game rather than in index.ts so it can be tested
 * without standing up blessed and a door context. index.ts imports it and
 * keeps no key names of its own - which is the point of Q-5a: the help
 * screen is GENERATED from the same map the game dispatches on, so it cannot
 * drift out of date. It had: the help still advertised "Z - Slow Draw (2x
 * points)" and "X - Fast Draw" long after FAQ 2.5.3 was honoured and Super
 * Qix was given the single draw button it actually has.
 */
import { InputKey, Direction, KeyMap } from './types';
/**
 * Ctrl-D, as the terminal sends it.
 *
 * QUIX has a redraw for the same reason a BBS door needs one: a line that
 * drops a few bytes leaves the board looking wrong, and the player has no
 * other way to ask for it again (quix.c:308-335).
 */
export declare const REDRAW_KEY = "\u0004";
/**
 * Keys the player may not bind a direction to, because the game already
 * needs them and a player who bound "up" to Q could not leave the door.
 */
export declare const RESERVED_KEYS: InputKey[];
/**
 * Turn a raw key from the terminal into the token the game handles.
 *
 * The arrow escape sequences and WASD both arrive as direction tokens, so
 * the default bindings need no entry in the key map at all.
 */
export declare function normalizeKey(key: string): InputKey;
/**
 * Which direction a key moves the marker, or null if it moves it nowhere.
 *
 * The four direction TOKENS always answer for themselves, whatever the map
 * says, so the arrow keys and WASD keep working after any remap (Q-5d). A
 * remapped key is consulted on top of them, never instead of them.
 */
export declare function directionForKey(key: InputKey, keyMap?: KeyMap): Direction | null;
/**
 * Whether a key may be bound to a direction, and why not if it may not.
 *
 * Binding "up" to A would silently move the marker LEFT, because A is
 * already a direction token - so a key that already means a DIFFERENT
 * direction is refused rather than quietly shadowed.
 */
export declare function canBindKey(key: InputKey, direction: Direction): {
    ok: boolean;
    reason?: string;
};
/** How a key is written on the help screen. */
export declare function keyLabel(key: string): string;
/**
 * Every binding the game answers to, in the order QUIX lists them.
 *
 * The four movement rows come from the LIVE map, so a remap shows up on the
 * help screen without anyone remembering to edit it.
 */
export declare function controlBindings(keyMap?: KeyMap): Array<{
    keys: string;
    action: string;
}>;
/** The CONTROLS block of the help screen, one line per binding. */
export declare function helpControlLines(keyMap?: KeyMap): string[];
/**
 * The default bindings: the arrow keys, as direction tokens.
 *
 * Declared here rather than in constants.ts because it is the key layer's
 * own default and nothing else needs it - constants.ts re-exports it for the
 * door, which imports its constants from one place.
 */
export declare const DEFAULT_KEY_MAP: KeyMap;
//# sourceMappingURL=controls.d.ts.map