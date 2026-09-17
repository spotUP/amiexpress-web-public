/**
 * What "Preview as a caller" should open on, and when there is nothing to see.
 *
 * Reported by the sysop, 2026-09-17: "preview as a caller is just black in
 * ansi studio". It was, and the renderer was innocent. The picker opened on
 * the FIRST screen the catalogue lists, which is `AWAITSCREEN` - twenty bytes
 * of codes that expand to seven characters and draw nothing. `LOGOFF` is the
 * same. So the panel faithfully drew a screen with no art in it and said
 * nothing about why, which reads as a broken preview.
 *
 * Two rules, both here so the three mounts of the panel cannot disagree:
 * open on a screen that HAS art, and when a screen draws nothing, say so.
 */

import { isCommandsOnly, isNotArt, type ScreenFileShape } from './screen-index-view';

/** Just enough of the index for this decision. */
export interface PreviewScreenShape {
  screen: string;
  resolutions: { file: string | null }[];
}

/**
 * The screens to offer, the ones worth looking at first.
 *
 * A screen is worth opening on when the file it resolves to is ART rather
 * than a program - which the board already decides for every file it
 * indexes. Everything else stays in the list, after them: a sysop previewing
 * `AWAITSCREEN` to check what it expands to is a real thing to want, it is
 * just not where the panel should start.
 */
export function previewScreenOrder(
  screens: PreviewScreenShape[],
  files: Record<string, ScreenFileShape> | undefined,
): string[] {
  const art: string[] = [];
  const rest: string[] = [];

  for (const entry of screens) {
    const resolved = entry.resolutions.find(resolution => resolution.file)?.file ?? null;
    const facts = resolved ? files?.[resolved] : undefined;
    // The board's own answer, the one the gallery and the tabs already use.
    if (facts && !isCommandsOnly(facts) && !isNotArt(facts)) art.push(entry.screen);
    else rest.push(entry.screen);
  }

  return [...art, ...rest];
}

/**
 * Whether anything would actually be SEEN, once the codes are gone.
 *
 * The preview is handed what the board's own parser produced, so what is left
 * after the escape sequences is exactly what a caller looks at. Two ways for
 * that to be something:
 *
 *   - a character that is not whitespace, or
 *   - a BACKGROUND colour, because half the art on this board is coloured
 *     blocks and spaces. Counting only letters would call a logo drawn in
 *     `ESC[44m   ` nothing at all.
 *
 * `AWAITSCREEN` on the live board parses to `ESC[2J ESC[H` - clear and home,
 * no character and no background. That is a black rectangle, and a black
 * rectangle needs a sentence rather than a shrug.
 */
export function hasVisibleContent(text: string): boolean {
  return visibleLength(text) > 0 || paintsABackground(text);
}

/** The non-blank characters a caller would see, with the codes stripped. */
export function visibleLength(text: string): number {
  return stripCodes(text).replace(/\s/g, '').length;
}

/** An SGR that sets a background: 40-47, 100-107, or the 48;5/48;2 forms. */
export function paintsABackground(text: string): boolean {
  for (const match of text.matchAll(/\x1b\[([0-9;]*)m/g)) {
    for (const part of match[1].split(';')) {
      const value = Number(part);
      if (!Number.isFinite(value)) continue;
      if (value === 48) return true;
      if (value >= 40 && value <= 47) return true;
      if (value >= 100 && value <= 107) return true;
    }
  }
  return false;
}

function stripCodes(text: string): string {
  return text
    // CSI sequences, and the two-character escapes the board also emits.
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[@-Z\\-_]/g, '')
    // A form feed clears the screen; it draws nothing itself.
    .replace(/\f/g, '');
}
