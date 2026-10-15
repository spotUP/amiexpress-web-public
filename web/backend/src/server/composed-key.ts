/**
 * Did this keystroke COMPOSE a character, or hold a meta key?
 *
 * A door in game mode is sent raw key events, and Alt has always been spelled
 * to a terminal as ESC before the key: without it GRANDMASTER's Alt+Enter
 * arrived as a bare Enter, which in its menu is "select" (2026-09-02).
 *
 * But on a Mac - and under AltGr on a Nordic PC layout - Option IS how you
 * type half the punctuation. `@` on a Nordic Mac layout is Option+2, and the
 * browser reports it as `key: '@', code: 'Digit2', altKey: true`. Prefixing
 * ESC there does not spell meta, it spells ESCAPE: the sysop, typing his email
 * address into the ACHIEVE door on the live board (2026-09-07), lost the
 * dialog on the first press and the whole door on the second, because blessed
 * reads `\x1b@` as an escape keypress followed by an `@`.
 *
 * The two cases are told apart by the PHYSICAL key. `code` names the key on
 * the board - `Digit2`, `KeyG` - and the character it types unmodified is
 * known. When the reported character is NOT that one, the modifier composed
 * something new and the character is what the caller meant. When it IS that
 * one (Alt+G on a US layout reports `g` for `KeyG`), the caller is holding
 * meta and the door should see it.
 */

/** The character a physical key types with no modifier, or null when unknown. */
export function unmodifiedCharFor(code: string | undefined): string | null {
  if (!code) return null;
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1].toLowerCase();
  const digit = /^Digit([0-9])$/.exec(code);
  if (digit) return digit[1];
  return null;
}

/**
 * True when the modifier produced a DIFFERENT character than the bare key
 * types - Option+2 giving `@` - so the character is the caller's intent and
 * no ESC belongs in front of it.
 *
 * Unknown `code`s answer false: a key this cannot place keeps the meta
 * spelling it has always had.
 */
export function altComposedCharacter(key: string, code: string | undefined): boolean {
  if (key.length !== 1) return false; // 'Enter', 'ArrowUp': names, never composed
  const bare = unmodifiedCharFor(code);
  if (bare === null) return false;
  return key.toLowerCase() !== bare;
}

/**
 * The bytes a game-mode door should receive for one key press.
 *
 * `base` is the character or control byte the key already resolved to.
 */
export function keyBytesFor(
  base: string,
  key: string,
  code: string | undefined,
  alt: boolean | undefined,
): string {
  if (!alt) return base;
  return altComposedCharacter(key, code) ? base : `\x1b${base}`;
}
