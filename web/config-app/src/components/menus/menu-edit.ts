/**
 * What an edit does to a menu config - pure, so the page only wires controls to
 * these. Every function returns a new config (or the same one when the edit
 * would change nothing) and applies the limits the server's validateMenuConfig
 * applies, so the sysop sees the cut text rather than learning of it after the save.
 */
import {
  cleanText, DESCRIPTION_MAX, LABEL_MAX, SECTION_TITLE_MAX,
  type MenuConfig, type OverflowMode, type WidthClass,
} from '@bbs/screens/menu-config/menu-config';
import { WIPE_CODES, type WipeType } from '@bbs/screens/wipe-codes';

export type WipeEvent = 'open' | 'leave' | 'page';

const upper = (key: string) => key.trim().toUpperCase();
const isFloor = (n: number) => Number.isInteger(n) && n >= 0 && n <= 65535;

function withoutKey<T>(map: Record<string, T>, key: string): Record<string, T> {
  const { [key]: _gone, ...rest } = map;
  return rest;
}

function setText(map: Record<string, string>, key: string, text: string, max: number): Record<string, string> {
  const k = upper(key);
  const clean = cleanText(text, max);
  return clean ? { ...map, [k]: clean } : withoutKey(map, k);
}

export const setDescription = (c: MenuConfig, key: string, text: string): MenuConfig =>
  ({ ...c, descriptions: setText(c.descriptions, key, text, DESCRIPTION_MAX) });

export const setLabel = (c: MenuConfig, key: string, text: string): MenuConfig =>
  ({ ...c, labels: setText(c.labels, key, text, LABEL_MAX) });

/** An empty section id puts the command back where the board would put it. */
export function setPlacement(c: MenuConfig, key: string, sectionId: string): MenuConfig {
  const k = upper(key);
  return { ...c, placement: sectionId ? { ...c.placement, [k]: sectionId } : withoutKey(c.placement, k) };
}

export function moveSection(c: MenuConfig, index: number, direction: -1 | 1): MenuConfig {
  const to = index + direction;
  if (index < 0 || index >= c.sections.length || to < 0 || to >= c.sections.length) return c;
  const sections = c.sections.slice();
  [sections[index], sections[to]] = [sections[to], sections[index]];
  return { ...c, sections };
}

/** A section needs a title: an empty or blank one is refused and the old title stays. */
export function renameSection(c: MenuConfig, id: string, title: string): MenuConfig {
  if (!cleanText(title, SECTION_TITLE_MAX).trim()) return c;
  return { ...c, sections: c.sections.map(s => (s.id === id ? { ...s, title: cleanText(title, SECTION_TITLE_MAX).trim() } : s)) };
}

export function addSection(c: MenuConfig): MenuConfig {
  const taken = new Set(c.sections.map(s => s.id));
  let n = c.sections.length + 1;
  while (taken.has(`section-${n}`)) n++;
  return { ...c, sections: [...c.sections, { id: `section-${n}`, title: `Section ${n}` }] };
}

export interface EntryPlacementRow { key: string; section: string }

/** Where a command shows: the sysop's placement, else the board's own choice. */
const sectionOf = (c: MenuConfig, row: EntryPlacementRow) => c.placement[upper(row.key)] ?? row.section;

/**
 * Empty as the widest caller (level 255) sees it - the rows are that caller's list.
 * Before the rows have loaded (or when loading failed) nothing is known, so nothing is empty.
 */
export const sectionIsEmpty = (c: MenuConfig, rows: EntryPlacementRow[], id: string, loaded: boolean): boolean =>
  loaded && !rows.some(r => sectionOf(c, r) === id);

/** Only an empty section goes; the placements that pointed into it go with it. */
export function removeSection(c: MenuConfig, rows: EntryPlacementRow[], id: string, loaded: boolean): MenuConfig {
  if (!sectionIsEmpty(c, rows, id, loaded)) return c;
  const placement = Object.fromEntries(Object.entries(c.placement).filter(([, section]) => section !== id));
  return { ...c, sections: c.sections.filter(s => s.id !== id), placement };
}

function withLevel(c: MenuConfig, floor: number, change: (l: MenuConfig['levels'][string]) => MenuConfig['levels'][string]): MenuConfig {
  const level = c.levels[String(floor)];
  return level ? { ...c, levels: { ...c.levels, [String(floor)]: change(level) } } : c;
}

export function addLevel(c: MenuConfig, floor: number): MenuConfig {
  if (!isFloor(floor) || c.levels[String(floor)]) return c;
  return { ...c, levels: { ...c.levels, [String(floor)]: { hide: [], rename: {}, order: [] } } };
}
export const removeLevel = (c: MenuConfig, floor: number): MenuConfig => ({ ...c, levels: withoutKey(c.levels, String(floor)) });

export const toggleHidden = (c: MenuConfig, floor: number, key: string): MenuConfig =>
  withLevel(c, floor, l => ({ ...l, hide: l.hide.includes(upper(key)) ? l.hide.filter(k => k !== upper(key)) : [...l.hide, upper(key)] }));

export const setRename = (c: MenuConfig, floor: number, key: string, label: string): MenuConfig =>
  withLevel(c, floor, l => ({ ...l, rename: { ...l.rename, [upper(key)]: cleanText(label, LABEL_MAX) } }));
export const removeRename = (c: MenuConfig, floor: number, key: string): MenuConfig =>
  withLevel(c, floor, l => ({ ...l, rename: withoutKey(l.rename, upper(key)) }));

export function moveKey(keys: string[], index: number, direction: -1 | 1): string[] {
  const to = index + direction;
  if (index < 0 || index >= keys.length || to < 0 || to >= keys.length) return keys;
  const next = keys.slice();
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}
export const reorderKeys = (c: MenuConfig, floor: number, index: number, direction: -1 | 1): MenuConfig =>
  withLevel(c, floor, l => ({ ...l, order: moveKey(l.order, index, direction) }));
export const addOrderKey = (c: MenuConfig, floor: number, key: string): MenuConfig =>
  withLevel(c, floor, l => (l.order.includes(upper(key)) ? l : { ...l, order: [...l.order, upper(key)] }));
export const removeOrderKey = (c: MenuConfig, floor: number, key: string): MenuConfig =>
  withLevel(c, floor, l => ({ ...l, order: l.order.filter(k => k !== upper(key)) }));

export const setWipe = (c: MenuConfig, event: WipeEvent, code: string): MenuConfig => ({ ...c, wipes: { ...c.wipes, [event]: code } });
export const setWipeAt40 = (c: MenuConfig, on: boolean): MenuConfig => ({ ...c, wipes: { ...c.wipes, at40: on } });
export const setDrillEnabled = (c: MenuConfig, on: boolean): MenuConfig => ({ ...c, drill: { ...c.drill, enabled: on } });
export const setDrillSlide = (c: MenuConfig, on: boolean): MenuConfig => ({ ...c, drill: { ...c.drill, slide: on } });

/**
 * The sysop-facing name of each wipe. Keyed by WipeType, so a new wipe fails to
 * compile here until it is named. (screen-wipe.util.ts's header words are the
 * MCI wording; these are the same wipes in plain sentence case.)
 */
const WIPE_NAMES: Record<Exclude<WipeType, 'random'>, string> = {
  matrix: 'Matrix rain', hblinds: 'Horizontal blinds', vblinds: 'Vertical blinds', spiral: 'Spiral', checker: 'Checkerboard',
  radial: 'Radar sweep', blocks: 'Random blocks', noise: 'Noise fade', typewriter: 'Typewriter', explode: 'Explode',
};

/** None, Random, then the rest by name. */
export function wipeOptions(): Array<{ code: string; name: string }> {
  const named = Object.entries(WIPE_CODES)
    .filter((entry): entry is [string, Exclude<WipeType, 'random'>] => entry[1] !== 'random')
    .map(([code, type]) => ({ code, name: WIPE_NAMES[type] }));
  return [{ code: '', name: 'None' }, { code: 'X', name: 'Random' }, ...named];
}

/** The command keys whose text contains the query (case-insensitive); a blank query keeps all. */
export function filterKeys(keys: string[], query: string): string[] {
  const q = query.trim().toUpperCase();
  return q ? keys.filter(k => k.toUpperCase().includes(q)) : keys;
}

export const setOverflowMode = (c: MenuConfig, cls: WidthClass, floor: number, mode: OverflowMode): MenuConfig =>
  ({ ...c, overflow: { ...c.overflow, [cls]: { ...c.overflow[cls], [String(floor)]: mode } } });

export function addOverflowFloor(c: MenuConfig, cls: WidthClass, floor: number): MenuConfig {
  if (!isFloor(floor) || c.overflow[cls][String(floor)]) return c;
  return setOverflowMode(c, cls, floor, 'scroll');
}

/** The 0 floor is what every caller falls back to; it stays. */
export function removeOverflowFloor(c: MenuConfig, cls: WidthClass, floor: number): MenuConfig {
  if (floor === 0) return c;
  return { ...c, overflow: { ...c.overflow, [cls]: withoutKey(c.overflow[cls], String(floor)) } };
}

export const PREVIEW_WIDTHS = [40, 80, 132] as const;
export function previewDefaults(columns: number): { columns: number; mode: 'ansi' | 'petscii' } {
  return { columns, mode: columns <= 40 ? 'petscii' : 'ansi' };
}
