/**
 * Where an uploaded logo goes (sysop decision 2026-10-17: an upload puts the
 * logo on screen in one step). Pure, shared by the board's logo routes
 * (placeMenuLogo, the one writer of a placement) and the admin's upload dialog
 * (config-app, via @bbs/screens), which offers only the widths drawableWidths
 * allows.
 *
 * Before this an upload only stored the file; the logo sets were edited
 * separately, so on live (no Menus/MAIN.json at all) the sysop's upload never
 * showed.
 */
import { NARROWEST_COLUMNS, logoAlphabet, type LogoPosition, type MenuConfig, type WidthClass } from './menu-config';

/**
 * The width class an uploaded logo is drawn for, from its name and the size
 * the board measured on upload (writeMenuLogo): PETSCII (.seq) is the C64's
 * alphabet, Amiga ANSI that fits 80 columns is Standard, wider is Wide. An
 * ANSI logo 40 columns wide is still Standard: a C64 set draws only .seq.
 */
export function uploadWidthClass(file: string, cols: number): WidthClass {
  if (logoAlphabet(file) === 'petscii') return 'c64';
  return cols <= NARROWEST_COLUMNS.standard ? 'standard' : 'wide';
}

export function positionWidths(position: LogoPosition): WidthClass[] {
  return position === 'side' ? ['wide'] : ['c64', 'standard', 'wide'];
}

/**
 * The widths a logo of this name and measured width can show at in this
 * position: its alphabet's (a C64 set draws only .seq), and only where it fits
 * the narrowest screen of the class - a wider logo is never drawn.
 */
export function drawableWidths(position: LogoPosition, file: string, cols: number): WidthClass[] {
  const alphabet = logoAlphabet(file);
  return positionWidths(position).filter(w => (w === 'c64') === (alphabet === 'petscii') && cols <= NARROWEST_COLUMNS[w]);
}

/**
 * The config with `file` as the logo of the base set (level 0) for this
 * position and width: that set's files are replaced, its rule and placement
 * kept; with no such set (a board with no Menus/<KIND>.json, the live case) a
 * new fixed set is added. Higher-level sets for the same slot are left alone.
 */
export function placeLogo(c: MenuConfig, position: LogoPosition, cls: WidthClass, file: string): MenuConfig {
  const at = c.logos.findIndex(s => s.position === position && s.widthClass === cls && s.levelFloor === 0);
  if (at >= 0) return { ...c, logos: c.logos.map((s, i) => (i === at ? { ...s, files: [file] } : s)) };
  return { ...c, logos: [...c.logos, { position, widthClass: cls, levelFloor: 0, rule: 'fixed', files: [file], afterSection: 0 }] };
}
