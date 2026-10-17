/**
 * The menu editor's decisions, as pure functions: what a click does to the
 * config is tested here, not by clicking through the page.
 */
import { describe, expect, it } from 'vitest';
import { defaultMenuConfig } from '@bbs/screens/menu-config/menu-config';
import { WIPE_CODES } from '@bbs/screens/wipe-codes';
import {
  setDescription, setLabel, setPlacement, moveSection, addSection, removeSection, sectionIsEmpty,
  addLevel, removeLevel, toggleHidden, setRename, removeRename, moveKey, addOrderKey, removeOrderKey,
  setWipe, setWipeAt40, setCoverFlowSlide, setMenuStyle, addStyleFloor, removeStyleFloor, MENU_STYLE_NAMES, wipeOptions, renameSection, filterKeys, previewDefaults,
} from '../components/menus/menu-edit';

const base = () => defaultMenuConfig('MAIN');

describe('text overrides', () => {
  it('stores a typed description and drops it again when emptied', () => {
    const c = setDescription(base(), 'R', 'Mail here');
    expect(c.descriptions).toEqual({ R: 'Mail here' });
    expect(setDescription(c, 'R', '').descriptions).toEqual({});
  });
  it('cuts a description at the 76-character limit', () => {
    expect(setDescription(base(), 'R', 'x'.repeat(100)).descriptions.R).toHaveLength(76);
  });
  it('keeps keys upper case and labels at their limit', () => {
    expect(Object.keys(setLabel(base(), 'r', 'Read').labels)).toEqual(['R']);
    expect(setLabel(base(), 'R', 'y'.repeat(40)).labels.R).toHaveLength(26);
  });
  it('does not mutate its input', () => {
    const c = base();
    setDescription(c, 'R', 'x');
    expect(c.descriptions).toEqual({});
  });
});

describe('placement', () => {
  it('moves a key to a section and back to its default with an empty choice', () => {
    const c = setPlacement(base(), 'FROGGER', 'messages');
    expect(c.placement).toEqual({ FROGGER: 'messages' });
    expect(setPlacement(c, 'FROGGER', '').placement).toEqual({});
  });
});

describe('sections', () => {
  it('moves up and down and stops at the ends', () => {
    const ids = (c: ReturnType<typeof base>) => c.sections.map(s => s.id);
    expect(ids(moveSection(base(), 1, -1)).slice(0, 2)).toEqual(['files', 'messages']);
    expect(ids(moveSection(base(), 0, -1))).toEqual(ids(base()));
    expect(ids(moveSection(base(), 5, 1))).toEqual(ids(base()));
  });
  it('adds a section with an id no other section has', () => {
    let c = addSection(base());
    c = addSection(c);
    const ids = c.sections.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(c.sections.length).toBe(8);
  });
  it('removes only an empty section and forgets placements into it', () => {
    const rows = [{ key: 'R', section: 'messages' }, { key: 'FROGGER', section: 'doors' }];
    let c = setPlacement(base(), 'FROGGER', 'messages');
    expect(sectionIsEmpty(c, rows, 'doors', true)).toBe(true);
    expect(sectionIsEmpty(c, rows, 'messages', true)).toBe(false);
    expect(removeSection(c, rows, 'messages', true)).toBe(c);
    c = removeSection(c, rows, 'doors', true);
    expect(c.sections.map(s => s.id)).not.toContain('doors');
  });
  it('drops placements that pointed into a removed section', () => {
    const rows: Array<{ key: string; section: string }> = [];
    const c = setPlacement(base(), 'FROGGER', 'doors');
    expect(removeSection(c, rows, 'doors', true).placement).toEqual({});
  });
});

describe('per-level exceptions', () => {
  it('adds a level floor once, with nothing hidden, renamed or ordered', () => {
    const c = addLevel(base(), 100);
    expect(c.levels['100']).toEqual({ hide: [], rename: {}, order: [] });
    expect(addLevel(c, 100)).toBe(c);
  });
  it('refuses a floor outside 0-65535', () => {
    const c = base();
    expect(addLevel(c, -1)).toBe(c);
    expect(addLevel(c, 70000)).toBe(c);
    expect(addLevel(c, 1.5)).toBe(c);
  });
  it('hides and unhides a key at a floor', () => {
    let c = toggleHidden(addLevel(base(), 100), 100, 'T');
    expect(c.levels['100'].hide).toEqual(['T']);
    c = toggleHidden(c, 100, 'T');
    expect(c.levels['100'].hide).toEqual([]);
  });
  it('renames and un-renames', () => {
    let c = setRename(addLevel(base(), 10), 10, 'R', 'Mail');
    expect(c.levels['10'].rename).toEqual({ R: 'Mail' });
    c = removeRename(c, 10, 'R');
    expect(c.levels['10'].rename).toEqual({});
  });
  it('removes a floor', () => {
    expect(removeLevel(addLevel(base(), 10), 10).levels).toEqual({});
  });
  it('reorders keys and stops at the ends', () => {
    expect(moveKey(['A', 'B', 'C'], 2, -1)).toEqual(['A', 'C', 'B']);
    expect(moveKey(['A', 'B', 'C'], 0, -1)).toEqual(['A', 'B', 'C']);
    expect(moveKey(['A', 'B', 'C'], 2, 1)).toEqual(['A', 'B', 'C']);
  });
  it('adds an order key once and removes it', () => {
    let c = addOrderKey(addLevel(base(), 10), 10, 'G');
    c = addOrderKey(c, 10, 'G');
    expect(c.levels['10'].order).toEqual(['G']);
    expect(removeOrderKey(c, 10, 'G').levels['10'].order).toEqual([]);
  });
});

describe('cover flow', () => {
  it('sets the slide', () => {
    expect(setCoverFlowSlide(base(), false).coverflow).toEqual({ slide: false });
    expect(setCoverFlowSlide(base(), true).coverflow).toEqual({ slide: true });
  });
});

describe('wipes and menu style', () => {
  it('sets a wipe per event and the 40-column switch', () => {
    expect(setWipe(base(), 'page', 'H').wipes.page).toBe('H');
    expect(setWipe(base(), 'leave', '').wipes.leave).toBe('');
    expect(setWipeAt40(base(), false).wipes.at40).toBe(false);
  });
  it('offers None, Random, then every other wipe by name', () => {
    const o = wipeOptions();
    expect(o.slice(0, 2)).toEqual([{ code: '', name: 'None' }, { code: 'X', name: 'Random' }]);
    expect(o).toHaveLength(12);
    expect(o.find(w => w.code === 'H')?.name).toBe('Horizontal blinds');
    expect(o.every(w => w.name.length > 1)).toBe(true);
  });
  it('sets a style at a floor, adds floors once at the class default and keeps the 0 floor', () => {
    let c = setMenuStyle(base(), 'standard', 0, 'classic');
    expect(c.style.standard).toEqual({ '0': 'classic' });
    c = addStyleFloor(c, 'standard', 100);
    expect(c.style.standard).toEqual({ '0': 'classic', '100': 'coverflow' });
    expect(addStyleFloor(c, 'c64', 100).style.c64).toEqual({ '0': 'pages', '100': 'pages' });
    expect(addStyleFloor(c, 'standard', 100)).toBe(c);
    expect(removeStyleFloor(c, 'standard', 100).style.standard).toEqual({ '0': 'classic' });
    expect(removeStyleFloor(c, 'standard', 0)).toBe(c);
  });
  it('names every style in full words', () => {
    expect(MENU_STYLE_NAMES).toEqual({ classic: 'Classic screen', scroll: 'Grid scroll', pages: 'Grid pages', coverflow: 'Cover flow' });
  });
});

describe('preview defaults', () => {
  it('asks for PETSCII at 40 columns and ANSI wider', () => {
    expect(previewDefaults(40)).toEqual({ columns: 40, mode: 'petscii' });
    expect(previewDefaults(132)).toEqual({ columns: 132, mode: 'ansi' });
  });
});

describe('sections before the entries are known', () => {
  it('treats no section as empty until the entries have loaded, and removes nothing', () => {
    const c = base();
    expect(sectionIsEmpty(c, [], 'doors', false)).toBe(false);
    expect(removeSection(c, [], 'doors', false)).toBe(c);
    expect(sectionIsEmpty(c, [], 'doors', true)).toBe(true);
  });
});

describe('section titles', () => {
  it('keeps the old title when the new one is empty or blank, trims otherwise', () => {
    const c = base();
    expect(renameSection(c, 'files', '   ')).toBe(c);
    expect(renameSection(c, 'files', '')).toBe(c);
    expect(renameSection(c, 'files', '  Downloads ').sections.find(s => s.id === 'files')?.title).toBe('Downloads');
  });
});

describe('wipe names', () => {
  it('names every code but None and Random with something other than its letter', () => {
    const named = wipeOptions().filter(o => o.code && o.code !== 'X');
    expect(named).toHaveLength(Object.keys(WIPE_CODES).length - 1);
    expect(named.every(o => o.name.length > 1)).toBe(true);
  });
});

describe('finding a command', () => {
  it('filters keys case-insensitively and keeps all on a blank query', () => {
    expect(filterKeys(['R', 'FROGGER', 'T'], 'rog')).toEqual(['FROGGER']);
    expect(filterKeys(['R', 'T'], '  ')).toEqual(['R', 'T']);
  });
});
