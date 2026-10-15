/**
 * What an edit does to a menu's logo sets - pure, like menu-edit.ts. The rules
 * are the ones validateMenuConfig applies on the board (a C64 set is .seq, every
 * other set .txt, a side logo is for wide screens only), plus the one the board
 * cannot check at save time: a file wider than the narrowest screen of its width
 * class is never drawn, so it cannot be added.
 */
import type { LogoPosition, LogoRule, MenuConfig, WidthClass } from '@bbs/screens/menu-config/menu-config';
import type { MenuLogoFile } from '../../api/client';

export const NARROWEST_COLUMNS: Record<WidthClass, number> = { c64: 40, standard: 80, wide: 120 };
export const WIDER_NOTE = 'Wider than this screen - never drawn';

export interface LogoOffer { file: string; rows: number; cols: number; fits: boolean; note: string }

const extensionOf = (cls: WidthClass) => (cls === 'c64' ? '.seq' : '.txt');

/** The files a set of this width class can use, in file order, each marked drawable or not. */
export function logoOffers(files: MenuLogoFile[], cls: WidthClass): LogoOffer[] {
  return files
    .filter(f => f.file.toLowerCase().endsWith(extensionOf(cls)))
    .map(f => {
      const fits = f.cols <= NARROWEST_COLUMNS[cls];
      return { file: f.file, rows: f.rows, cols: f.cols, fits, note: fits ? '' : WIDER_NOTE };
    });
}

export function positionWidths(position: LogoPosition): WidthClass[] {
  return position === 'side' ? ['wide'] : ['c64', 'standard', 'wide'];
}

const usable = (files: MenuLogoFile[], cls: WidthClass, file: string) =>
  logoOffers(files, cls).some(o => o.file === file && o.fits);

export function addLogoSet(c: MenuConfig, files: MenuLogoFile[], position: LogoPosition, cls: WidthClass, file: string): MenuConfig {
  if (!positionWidths(position).includes(cls) || !usable(files, cls, file)) return c;
  return { ...c, logos: [...c.logos, { position, widthClass: cls, levelFloor: 0, rule: 'fixed', files: [file], afterSection: 0 }] };
}

function withSet(c: MenuConfig, index: number, change: (s: MenuConfig['logos'][number]) => MenuConfig['logos'][number]): MenuConfig {
  const set = c.logos[index];
  return set ? { ...c, logos: c.logos.map((s, i) => (i === index ? change(s) : s)) } : c;
}

export const removeLogoSet = (c: MenuConfig, index: number): MenuConfig => ({ ...c, logos: c.logos.filter((_, i) => i !== index) });
export const setLogoRule = (c: MenuConfig, index: number, rule: LogoRule): MenuConfig => withSet(c, index, s => ({ ...s, rule }));
export const setLogoFloor = (c: MenuConfig, index: number, floor: number): MenuConfig =>
  Number.isInteger(floor) && floor >= 0 && floor <= 65535 ? withSet(c, index, s => ({ ...s, levelFloor: floor })) : c;
export const setLogoAfterSection = (c: MenuConfig, index: number, after: number): MenuConfig =>
  Number.isInteger(after) && after >= 0 ? withSet(c, index, s => ({ ...s, afterSection: after })) : c;

export function addLogoFile(c: MenuConfig, files: MenuLogoFile[], index: number, file: string): MenuConfig {
  const set = c.logos[index];
  if (!set || set.files.includes(file) || !usable(files, set.widthClass, file)) return c;
  return withSet(c, index, s => ({ ...s, files: [...s.files, file] }));
}

/** A set keeps at least one file: the board drops an empty set, so the last file leaves with its set. */
export function removeLogoFile(c: MenuConfig, index: number, file: string): MenuConfig {
  const set = c.logos[index];
  if (!set || set.files.length < 2) return c;
  return withSet(c, index, s => ({ ...s, files: s.files.filter(f => f !== file) }));
}

export function moveLogoFile(c: MenuConfig, index: number, from: number, direction: -1 | 1): MenuConfig {
  const set = c.logos[index];
  const to = from + direction;
  if (!set || from < 0 || from >= set.files.length || to < 0 || to >= set.files.length) return c;
  const next = set.files.slice();
  [next[from], next[to]] = [next[to], next[from]];
  return withSet(c, index, s => ({ ...s, files: next }));
}

/** What the sysop may read back when a delete is refused: the positions the menu still shows the file in. */
export function usedByText(usedBy: unknown): string {
  const names = Array.isArray(usedBy) ? usedBy.filter((u): u is string => typeof u === 'string') : [];
  return names.length ? `Used by: ${names.join(', ')}` : 'The menu still shows this logo';
}
