/**
 * What an edit does to the C64 menus (config.c64Menus: a level floor to an
 * ordered list of titled sections, each an ordered list of command keys) - pure.
 * A key is listed once per floor: a second listing would show the same command
 * twice on a 40-column screen.
 */
import { cleanText, SECTION_TITLE_MAX, type C64Menu, type MenuConfig } from '@bbs/screens/menu-config/menu-config';

const upper = (key: string) => key.trim().toUpperCase();
const isFloor = (n: number) => Number.isInteger(n) && n >= 0 && n <= 65535;

function withMenu(c: MenuConfig, floor: number, change: (m: C64Menu) => C64Menu): MenuConfig {
  const menu = c.c64Menus[String(floor)];
  return menu ? { ...c, c64Menus: { ...c.c64Menus, [String(floor)]: change(menu) } } : c;
}
function withSection(c: MenuConfig, floor: number, index: number, change: (s: C64Menu['sections'][number]) => C64Menu['sections'][number]): MenuConfig {
  return withMenu(c, floor, m => (m.sections[index] ? { sections: m.sections.map((s, i) => (i === index ? change(s) : s)) } : m));
}

export function addC64Floor(c: MenuConfig, floor: number): MenuConfig {
  if (!isFloor(floor) || c.c64Menus[String(floor)]) return c;
  return { ...c, c64Menus: { ...c.c64Menus, [String(floor)]: { sections: [] } } };
}
export function removeC64Floor(c: MenuConfig, floor: number): MenuConfig {
  const { [String(floor)]: _gone, ...rest } = c.c64Menus;
  return { ...c, c64Menus: rest };
}

export const addC64Section = (c: MenuConfig, floor: number): MenuConfig =>
  withMenu(c, floor, m => ({ sections: [...m.sections, { title: `Section ${m.sections.length + 1}`, keys: [] }] }));
export const removeC64Section = (c: MenuConfig, floor: number, index: number): MenuConfig =>
  withMenu(c, floor, m => ({ sections: m.sections.filter((_, i) => i !== index) }));
export const renameC64Section = (c: MenuConfig, floor: number, index: number, title: string): MenuConfig =>
  withSection(c, floor, index, s => ({ ...s, title: cleanText(title, SECTION_TITLE_MAX) }));

export function moveC64Section(c: MenuConfig, floor: number, index: number, direction: -1 | 1): MenuConfig {
  return withMenu(c, floor, m => {
    const to = index + direction;
    if (index < 0 || index >= m.sections.length || to < 0 || to >= m.sections.length) return m;
    const sections = m.sections.slice();
    [sections[index], sections[to]] = [sections[to], sections[index]];
    return { sections };
  });
}

const keysOnFloor = (c: MenuConfig, floor: number) => new Set((c.c64Menus[String(floor)]?.sections ?? []).flatMap(s => s.keys));

/** The kind's keys not yet on this floor, in the kind's order. */
export const c64KeyChoices = (c: MenuConfig, floor: number, allKeys: string[]): string[] => {
  const used = keysOnFloor(c, floor);
  return allKeys.filter(k => !used.has(upper(k)));
};

export function addC64Key(c: MenuConfig, floor: number, index: number, key: string): MenuConfig {
  const k = upper(key);
  if (!k || keysOnFloor(c, floor).has(k)) return c;
  return withSection(c, floor, index, s => ({ ...s, keys: [...s.keys, k] }));
}
export const removeC64Key = (c: MenuConfig, floor: number, index: number, key: string): MenuConfig =>
  withSection(c, floor, index, s => ({ ...s, keys: s.keys.filter(k => k !== upper(key)) }));

export function moveC64Key(c: MenuConfig, floor: number, index: number, from: number, direction: -1 | 1): MenuConfig {
  return withSection(c, floor, index, s => {
    const to = from + direction;
    if (from < 0 || from >= s.keys.length || to < 0 || to >= s.keys.length) return s;
    const keys = s.keys.slice();
    [keys[from], keys[to]] = [keys[to], keys[from]];
    return { ...s, keys };
  });
}
