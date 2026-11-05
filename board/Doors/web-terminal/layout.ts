/** WEBTERM's rows - internal W rows 17-23 - as text. Pure. */
import type { WebTerminalState } from '@amiexpress/bbs-door-sdk/core/types';

export type RowId = 'modem' | 'font' | 'palette' | 'charset' | 'animations' | 'data' | 'erase';

export const ROWS: ReadonlyArray<{ id: RowId; label: string; blurb: string }> = [
  { id: 'modem', label: 'Modem emulation speed', blurb: "Slows the screen to a real modem's speed" },
  { id: 'font', label: 'Terminal font', blurb: 'The typeface your terminal draws in' },
  { id: 'palette', label: 'PETSCII 80 colours', blurb: 'The sixteen colours of an 80-column PETSCII screen' },
  { id: 'charset', label: 'PETSCII character set', blurb: 'Standard, or the Swedish ROM' },
  { id: 'animations', label: 'Animations', blurb: 'Slides, wipes and effects; games keep theirs' },
  { id: 'data', label: 'View my data', blurb: 'Everything this board keeps about you' },
  { id: 'erase', label: 'Delete my account', blurb: 'Erase your data from this board' },
];

export const clip = (text: string, width: number): string => (text.length > width ? text.slice(0, Math.max(0, width)) : text);

export function valueOf(id: RowId, s: WebTerminalState): string {
  switch (id) {
    case 'modem': return s.modemSpeed;
    case 'font': return s.font;
    case 'palette': return s.petsciiPalette;
    case 'charset': return s.petsciiCharset;
    case 'animations': return s.animations;
    default: return '';
  }
}

/** One line at 80 columns and wider, two (label, then value under it) below. */
export function rowLines(id: RowId, s: WebTerminalState, width: number): string[] {
  const row = ROWS.find(r => r.id === id)!;
  const room = width - 1;
  const value = valueOf(id, s);
  if (width < 80) return value ? [clip(` ${row.label}`, room), clip(`   ${value}`, room)] : [clip(` ${row.label}`, room)];
  const base = ` ${row.label.padEnd(24)} ${value}`;
  return [clip(width >= 100 ? `${base.padEnd(52)} ${row.blurb}` : base, room)];
}

export function dataLines(rows: Array<{ label: string; value: string }>, width: number): string[] {
  const room = width - 1;
  if (width < 80) return rows.flatMap(r => [clip(` ${r.label}`, room), clip(`   ${r.value}`, room)]);
  return rows.map(r => clip(` ${r.label.padEnd(17)}: ${r.value}`, room));
}
