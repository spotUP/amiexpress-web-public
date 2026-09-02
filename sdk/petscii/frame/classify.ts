/**
 * Row classification for the C64 adapter's rule ladder.
 *
 * `looksLikeAsciiArt` and `positionsCursorAbsolutely` are VERBATIM ports of
 * web/backend/src/utils/ascii-art.util.ts (the backend cannot be imported
 * from the SDK). web/backend/tests/petscii-frame/classify-parity.test.ts
 * pins the two copies equal; when the frame module gains a package export
 * (Phase 3) the backend file becomes a re-export of this one.
 *
 * Pure TypeScript: no DOM, no Node imports.
 */
import { Cell, isBlank } from './types';

export type RowClass = 'blank' | 'art' | 'table' | 'prose';

/** CUP/HVP, cursor up/down/forward/back, column and line positioning, bare home. SGR deliberately not matched. */
export function positionsCursorAbsolutely(line: string): boolean {
  return /\x1b\[[0-9;]*[HfABCDGdEF]/.test(line);
}

export function looksLikeAsciiArt(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return true;
  }

  const letters = (trimmed.match(/[A-Za-z]/g) || []).length;
  const digits = (trimmed.match(/[0-9]/g) || []).length;
  const nonAlphanumeric = trimmed.length - letters - digits;
  const punctuationRatio = nonAlphanumeric / trimmed.length;
  const symbolMatch = trimmed.match(/[:\-_/\\|=+*~`@#%^&\[\]\(\)<>]/g);
  const symbolCount = symbolMatch ? symbolMatch.length : 0;
  const leadingIndent = line.match(/^\s+/)?.[0].length || 0;

  if (leadingIndent >= 33) {
    return true;
  }

  if (letters + digits === 0 && nonAlphanumeric > 0) {
    return true;
  }

  if (punctuationRatio >= 0.6 && trimmed.length >= 4) {
    return true;
  }

  if (symbolCount >= 3 && (letters + digits) / trimmed.length < 0.4) {
    return true;
  }

  if (leadingIndent >= 4 && symbolCount >= 2) {
    return true;
  }

  const longSpaceRuns = (line.match(/\s{4,}/g) || []).length;
  if (longSpaceRuns >= 2 && symbolCount >= 3) {
    return true;
  }

  const artChars = (line.match(/[|_\/\\\-()]/g) || []).length;
  if (artChars >= 8 && letters + digits < trimmed.length * 0.8) {
    return true;
  }

  const borderArt = /^[|:][\s\S]*[:|]$/.test(trimmed);
  if (borderArt && symbolCount >= 2) {
    return true;
  }

  const borderedLine =
    trimmed.length >= 20 &&
    trimmed.startsWith('|') &&
    trimmed.endsWith('|') &&
    trimmed.split('|').length >= 3 &&
    symbolCount >= 4;
  if (borderedLine) {
    return true;
  }

  return false;
}

/** Characters of a row, trailing blanks trimmed. A reverse-video space is content and is kept. */
export function rowText(cells: ReadonlyArray<Readonly<Cell>>): string {
  return cells.slice(0, contentWidth(cells)).map((c) => c.ch).join('');
}

/** 1 + index of the last non-blank cell; 0 for an empty row. */
export function contentWidth(cells: ReadonlyArray<Readonly<Cell>>): number {
  for (let x = cells.length - 1; x >= 0; x--) if (!isBlank(cells[x])) return x + 1;
  return 0;
}

/** Two or more runs of two-plus spaces INSIDE the text: columns separated by gutters. */
export function hasTabularGutters(text: string): boolean {
  return (text.trim().match(/ {2,}/g) || []).length >= 2;
}

export function classifyRow(cells: ReadonlyArray<Readonly<Cell>>): RowClass {
  if (contentWidth(cells) === 0) return 'blank';
  const text = rowText(cells);
  if (looksLikeAsciiArt(text)) return 'art';
  if (hasTabularGutters(text)) return 'table';
  return 'prose';
}
