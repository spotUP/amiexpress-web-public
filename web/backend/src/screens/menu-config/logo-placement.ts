/**
 * Where an uploaded logo goes (sysop decision 2026-10-17: an upload puts the
 * logo on screen in one step). Pure, shared by the admin's upload dialog
 * (config-app, via @bbs/screens) and the tests that carry its answer through
 * the save route to the menu the caller is sent.
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
