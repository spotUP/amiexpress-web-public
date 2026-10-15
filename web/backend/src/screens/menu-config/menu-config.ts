/**
 * A menu door's configuration, per kind - the sysop's exceptions on top of the
 * menu the board derives (research doc, "Sysop answers"). Pure, and imports
 * only from `screens/`: the admin compiles it through `@bbs/screens`.
 *
 * An absent file is the derived menu (defaultMenuConfig); a bad one is
 * repaired field by field and every repair is reported, never thrown - the
 * board must show a menu even when the file is wrong.
 */
import { DEFAULT_SECTIONS } from './internal-commands';
import { WIPE_CODES } from '../wipe-codes';

export type MenuKind = 'MAIN' | 'BULLETINS';
export const MENU_KINDS: readonly MenuKind[] = ['MAIN', 'BULLETINS'];
export const MENU_KIND_COMMAND: Record<MenuKind, string> = { MAIN: 'MENU', BULLETINS: 'B' };
export type OverflowMode = 'scroll' | 'pages';
export type WidthClass = 'c64' | 'standard' | 'wide';
export type LogoPosition = 'header' | 'footer' | 'side' | 'between';
export type LogoRule = 'fixed' | 'rotate' | 'random';
export type LevelMap<T> = Record<string, T>;
export interface LevelException { hide: string[]; rename: Record<string, string>; order: string[] }
export interface C64Menu { sections: Array<{ title: string; keys: string[] }> }
export interface LogoSet { position: LogoPosition; widthClass: WidthClass; levelFloor: number; rule: LogoRule; files: string[]; afterSection: number }
export interface MenuConfig {
  version: 1;
  sections: Array<{ id: string; title: string }>;
  placement: Record<string, string>;
  labels: Record<string, string>;
  descriptions: Record<string, string>;
  levels: LevelMap<LevelException>;
  c64Menus: LevelMap<C64Menu>;
  overflow: Record<WidthClass, LevelMap<OverflowMode>>;
  wipes: { open: string; leave: string; page: string; at40: boolean };
  logos: LogoSet[];
}

export const LABEL_MAX = 26;
export const DESCRIPTION_MAX = 76;
export const SECTION_TITLE_MAX = 30;
const KEY_RE = /^[A-Z0-9<>^?_.-]{1,16}$/i;
const LOGO_FILE_RE = /^[A-Za-z0-9_-]{1,40}\.(txt|seq)$/;   // a bare name in the kind's logo dir, never a path
const POSITIONS: LogoPosition[] = ['header', 'footer', 'side', 'between'];
const CLASSES: WidthClass[] = ['c64', 'standard', 'wide'];
const RULES: LogoRule[] = ['fixed', 'rotate', 'random'];

export function widthClassOf(columns: number): WidthClass {
  if (columns <= 40) return 'c64';
  return columns >= 120 ? 'wide' : 'standard';
}

export function levelEntry<T>(map: LevelMap<T>, level: number): T | undefined {
  let best = -1;
  for (const k of Object.keys(map)) {
    const floor = Number(k);
    if (Number.isInteger(floor) && floor <= level && floor > best) best = floor;
  }
  return best < 0 ? undefined : map[String(best)];
}

/** No C0, no DEL, no escape sequence: a description reaches the door's screen. */
export function cleanText(raw: string, max: number): string {
  return String(raw).replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '').replace(/[\x00-\x1f\x7f]/g, '').slice(0, max);
}

export function defaultMenuConfig(kind: MenuKind): MenuConfig {
  return {
    version: 1,
    sections: kind === 'MAIN' ? DEFAULT_SECTIONS.map(s => ({ id: s.id, title: s.title })) : [{ id: 'bulletins', title: 'Bulletins' }],
    placement: {}, labels: {}, descriptions: {}, levels: {}, c64Menus: {},
    overflow: { c64: { '0': 'pages' }, standard: { '0': 'scroll' }, wide: { '0': 'scroll' } },
    wipes: { open: 'X', leave: '', page: 'H', at40: true },
    logos: [],
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isFloor = (k: string) => /^\d{1,5}$/.test(k) && Number(k) <= 65535;

function textMap(raw: unknown, max: number, what: string, problems: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  if (raw === undefined) return out;
  if (!isObj(raw)) { problems.push(`${what}: not a map`); return out; }
  for (const [k, v] of Object.entries(raw)) {
    if (!KEY_RE.test(k)) { problems.push(`${what} ${k}: not a command key`); continue; }
    if (typeof v !== 'string') { problems.push(`${what} ${k}: not text`); continue; }
    const t = cleanText(v, max);
    if (t !== v) problems.push(`${what} ${k}: cleaned`);
    if (t) out[k.toUpperCase()] = t;
  }
  return out;
}

function keyList(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.some(k => typeof k !== 'string' || !KEY_RE.test(k))) return null;
  return (raw as string[]).map(k => k.toUpperCase());
}

export function validateMenuConfig(kind: MenuKind, raw: unknown): { config: MenuConfig; problems: string[] } {
  const problems: string[] = [];
  const config = defaultMenuConfig(kind);
  if (raw === undefined || raw === null) return { config, problems };
  if (!isObj(raw)) return { config, problems: ['not a JSON object'] };

  if (Array.isArray(raw.sections)) {
    const sections = raw.sections
      .filter((s): s is { id: string; title: string } => isObj(s) && typeof s.id === 'string' && /^[a-z0-9-]{1,24}$/.test(s.id) && typeof s.title === 'string')
      .map(s => ({ id: s.id, title: cleanText(s.title, SECTION_TITLE_MAX) }))
      .filter(s => s.title);
    if (sections.length !== raw.sections.length) problems.push('sections: some sections were dropped');
    if (sections.length) config.sections = sections;
  }
  const ids = new Set(config.sections.map(s => s.id));
  if (isObj(raw.placement)) {
    for (const [k, v] of Object.entries(raw.placement)) {
      if (!KEY_RE.test(k) || typeof v !== 'string') { problems.push(`placement ${k}: dropped`); continue; }
      if (!ids.has(v)) { problems.push(`placement ${k}: no section "${v}"`); continue; }
      config.placement[k.toUpperCase()] = v;
    }
  }
  config.labels = textMap(raw.labels, 26, 'labels', problems);
  config.descriptions = textMap(raw.descriptions, DESCRIPTION_MAX, 'descriptions', problems);

  if (isObj(raw.levels)) {
    for (const [k, v] of Object.entries(raw.levels)) {
      if (!isFloor(k) || !isObj(v)) { problems.push(`levels ${k}: dropped`); continue; }
      const hide = v.hide === undefined ? [] : keyList(v.hide);
      const order = v.order === undefined ? [] : keyList(v.order);
      if (!hide || !order) { problems.push(`levels ${k}: hide/order must be lists of command keys`); continue; }
      config.levels[k] = { hide, order, rename: textMap(v.rename, LABEL_MAX, `levels ${k} rename`, problems) };
    }
  }
  if (isObj(raw.c64Menus)) {
    for (const [k, v] of Object.entries(raw.c64Menus)) {
      const sections = isObj(v) && Array.isArray(v.sections) ? v.sections : null;
      const ok = sections && sections.every(s => isObj(s) && typeof s.title === 'string' && keyList(s.keys));
      if (!isFloor(k) || !ok) { problems.push(`c64Menus ${k}: dropped`); continue; }
      config.c64Menus[k] = { sections: sections!.map(s => ({ title: cleanText((s as any).title, SECTION_TITLE_MAX), keys: keyList((s as any).keys)! })) };
    }
  }
  if (isObj(raw.overflow)) {
    for (const cls of CLASSES) {
      const m = raw.overflow[cls];
      if (m === undefined) continue;
      const good: LevelMap<OverflowMode> = {};
      if (isObj(m)) for (const [k, v] of Object.entries(m)) {
        if (isFloor(k) && (v === 'scroll' || v === 'pages')) good[k] = v; else problems.push(`overflow ${cls} ${k}: dropped`);
      }
      if (Object.keys(good).length) config.overflow[cls] = good;
    }
  }
  if (isObj(raw.wipes)) {
    for (const ev of ['open', 'leave', 'page'] as const) {
      const v = raw.wipes[ev];
      if (v === '' || (typeof v === 'string' && v.length === 1 && WIPE_CODES[v.toUpperCase()])) config.wipes[ev] = (v as string).toUpperCase();
      else if (v !== undefined) problems.push(`wipes ${ev}: "${String(v)}" is not a wipe`);
    }
    if (typeof raw.wipes.at40 === 'boolean') config.wipes.at40 = raw.wipes.at40;
    else if (raw.wipes.at40 !== undefined) problems.push('wipes at40: not true/false');
  }
  if (Array.isArray(raw.logos)) {
    for (const l of raw.logos) {
      const ok = isObj(l) && POSITIONS.includes(l.position as LogoPosition) && CLASSES.includes(l.widthClass as WidthClass)
        && RULES.includes(l.rule as LogoRule) && Number.isInteger(l.levelFloor) && (l.levelFloor as number) >= 0
        && Array.isArray(l.files) && l.files.length > 0 && l.files.every(f => typeof f === 'string' && LOGO_FILE_RE.test(f));
      if (!ok) { problems.push('logos: a logo set was dropped'); continue; }
      if (l.widthClass === 'c64' && (l.files as string[]).some(f => !f.endsWith('.seq'))) { problems.push('logos: a C64 logo must be a .seq'); continue; }
      if (l.widthClass !== 'c64' && (l.files as string[]).some(f => !f.endsWith('.txt'))) { problems.push('logos: an ANSI logo must be a .txt'); continue; }
      if (l.position === 'side' && l.widthClass !== 'wide') { problems.push('logos: a side logo is for wide screens only'); continue; }
      config.logos.push({ position: l.position as LogoPosition, widthClass: l.widthClass as WidthClass, levelFloor: l.levelFloor as number,
        rule: l.rule as LogoRule, files: l.files as string[], afterSection: Number.isInteger(l.afterSection) ? (l.afterSection as number) : 0 });
    }
  }
  return { config, problems };
}
