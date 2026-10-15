/** What the logo-set and C64-menu edits do to a menu config - pure, no page. */
import { describe, expect, it } from 'vitest';
import { defaultMenuConfig } from '@bbs/screens/menu-config/menu-config';
import {
  addLogoFile, addLogoSet, logoOffers, moveLogoFile, removeLogoFile, removeLogoSet, setLogoRule,
  NARROWEST_COLUMNS, positionWidths, WIDER_NOTE,
} from '../components/menus/menu-logo-edit';
import {
  addC64Floor, addC64Key, addC64Section, moveC64Key, removeC64Key, removeC64Section, renameC64Section, c64KeyChoices,
} from '../components/menus/menu-c64-edit';

const FILES = [
  { file: 'cat.txt', rows: 6, cols: 60, alphabet: 'ansi' as const },
  { file: 'huge.txt', rows: 6, cols: 100, alphabet: 'ansi' as const },
  { file: 'pet.seq', rows: 5, cols: 40, alphabet: 'petscii' as const },
];
const base = () => defaultMenuConfig('MAIN');

describe('logo offers', () => {
  it('offers .seq to a C64 set and .txt to the others', () => {
    expect(logoOffers(FILES, 'c64').map(o => o.file)).toEqual(['pet.seq']);
    expect(logoOffers(FILES, 'standard').map(o => o.file)).toEqual(['cat.txt', 'huge.txt']);
  });
  it('marks a logo wider than the narrowest screen of the class as never drawn', () => {
    expect(NARROWEST_COLUMNS).toEqual({ c64: 40, standard: 80, wide: 120 });
    const offers = logoOffers(FILES, 'standard');
    expect(offers.find(o => o.file === 'huge.txt')).toMatchObject({ fits: false, note: WIDER_NOTE });
    expect(offers.find(o => o.file === 'cat.txt')).toMatchObject({ fits: true });
    expect(logoOffers(FILES, 'wide').find(o => o.file === 'huge.txt')?.fits).toBe(true);
  });
  it('limits the side position to wide screens', () => {
    expect(positionWidths('side')).toEqual(['wide']);
    expect(positionWidths('header')).toEqual(['c64', 'standard', 'wide']);
  });
});

describe('logo sets', () => {
  it('adds a header set at Standard with cat.txt, then Rotate', () => {
    let c = addLogoSet(base(), FILES, 'header', 'standard', 'cat.txt');
    c = setLogoRule(c, 0, 'rotate');
    expect(c.logos).toEqual([{ position: 'header', widthClass: 'standard', levelFloor: 0, rule: 'rotate', files: ['cat.txt'], afterSection: 0 }]);
  });
  it('refuses a file that cannot be drawn there', () => {
    const c = base();
    expect(addLogoSet(c, FILES, 'header', 'standard', 'huge.txt')).toBe(c);
    expect(addLogoSet(c, FILES, 'header', 'c64', 'cat.txt')).toBe(c);
    expect(addLogoSet(c, FILES, 'header', 'standard', 'pet.seq')).toBe(c);
    expect(addLogoSet(c, FILES, 'side', 'standard', 'cat.txt')).toBe(c);
    expect(addLogoSet(c, FILES, 'header', 'standard', 'gone.txt')).toBe(c);
  });
  it('orders, adds and removes files; the last file cannot go (remove the set instead)', () => {
    let c = addLogoSet(base(), FILES, 'footer', 'standard', 'cat.txt');
    const more = [...FILES, { file: 'dog.txt', rows: 3, cols: 20, alphabet: 'ansi' as const }];
    c = addLogoFile(c, more, 0, 'dog.txt');
    c = addLogoFile(c, more, 0, 'dog.txt');
    expect(c.logos[0].files).toEqual(['cat.txt', 'dog.txt']);
    expect(addLogoFile(c, more, 0, 'huge.txt')).toBe(c);
    c = moveLogoFile(c, 0, 1, -1);
    expect(c.logos[0].files).toEqual(['dog.txt', 'cat.txt']);
    c = removeLogoFile(c, 0, 'dog.txt');
    expect(removeLogoFile(c, 0, 'cat.txt')).toBe(c);
    expect(removeLogoSet(c, 0).logos).toEqual([]);
  });
});

describe('C64 menus', () => {
  it('builds Quick with R and G', () => {
    let c = addC64Floor(base(), 0);
    c = addC64Section(c, 0);
    c = renameC64Section(c, 0, 0, 'Quick');
    c = addC64Key(c, 0, 0, 'r');
    c = addC64Key(c, 0, 0, 'G');
    expect(c.c64Menus['0'].sections).toEqual([{ title: 'Quick', keys: ['R', 'G'] }]);
  });
  it('lists a key once per floor, and moves and removes keys and sections', () => {
    let c = addC64Section(addC64Floor(base(), 0), 0);
    c = addC64Key(addC64Key(addC64Key(c, 0, 0, 'R'), 0, 0, 'R'), 0, 0, 'G');
    expect(c.c64Menus['0'].sections[0].keys).toEqual(['R', 'G']);
    c = addC64Section(c, 0);
    expect(addC64Key(c, 0, 1, 'R')).toBe(c);
    c = moveC64Key(c, 0, 0, 1, -1);
    expect(c.c64Menus['0'].sections[0].keys).toEqual(['G', 'R']);
    c = removeC64Key(c, 0, 0, 'G');
    expect(c.c64Menus['0'].sections[0].keys).toEqual(['R']);
    expect(c64KeyChoices(c, 0, ['R', 'G', 'T'])).toEqual(['G', 'T']);
    expect(removeC64Section(c, 0, 1).c64Menus['0'].sections).toHaveLength(1);
  });
  it('strips control text from a title and cuts it to the section limit', () => {
    let c = addC64Section(addC64Floor(base(), 0), 0);
    c = renameC64Section(c, 0, 0, `A\x1b[31mB${'x'.repeat(60)}`);
    expect(c.c64Menus['0'].sections[0].title.length).toBeLessThanOrEqual(30);
    expect(c.c64Menus['0'].sections[0].title).not.toMatch(/\x1b/);
  });
});
