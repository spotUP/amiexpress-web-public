import { defaultMenuConfig, validateMenuConfig, levelEntry, widthClassOf, cleanText, MENU_KINDS, MENU_KIND_COMMAND } from '../../src/screens/menu-config/menu-config';

test('an absent config is the derived menu with the default wipes and overflow (Decisions 31, 33)', () => {
  const c = defaultMenuConfig('MAIN');
  expect(c.sections.map(s => s.title)).toEqual(['Messages', 'Files', 'Conferences', 'Doors', 'Account', 'System']);
  expect(c.wipes).toEqual({ open: 'X', leave: '', page: 'H', at40: true });
  expect(levelEntry(c.overflow.c64, 10)).toBe('pages');
  expect(levelEntry(c.overflow.standard, 10)).toBe('scroll');
  expect(c.logos).toEqual([]);
  expect(defaultMenuConfig('BULLETINS').sections).toEqual([{ id: 'bulletins', title: 'Bulletins' }]);
  expect(MENU_KINDS).toEqual(['MAIN', 'BULLETINS']);
  expect(MENU_KIND_COMMAND).toEqual({ MAIN: 'MENU', BULLETINS: 'B' });
});

test('the highest level floor at or below the caller wins; none below the lowest', () => {
  const map = { '0': 'a', '100': 'b', '250': 'c' };
  expect(levelEntry(map, 0)).toBe('a');
  expect(levelEntry(map, 99)).toBe('a');
  expect(levelEntry(map, 100)).toBe('b');
  expect(levelEntry(map, 255)).toBe('c');
  expect(levelEntry({ '10': 'x' }, 5)).toBeUndefined();
});

test('width classes: 40 is c64, 80 standard, 120 and up wide (Decision 30)', () => {
  expect(widthClassOf(40)).toBe('c64');
  expect(widthClassOf(80)).toBe('standard');
  expect(widthClassOf(119)).toBe('standard');
  expect(widthClassOf(120)).toBe('wide');
});

test('control bytes and escape sequences never survive into a label or description', () => {
  expect(cleanText('Read\tMail\x1b[2J\r\n', 40)).toBe('ReadMail');
  expect(cleanText('G\xf6teborg news', 40)).toBe('G\xf6teborg news');
  expect(cleanText('x'.repeat(300), 76)).toHaveLength(76);
});

test('a bad file is repaired field by field, and every repair is named', () => {
  const { config, problems } = validateMenuConfig('MAIN', {
    version: 1,
    wipes: { open: 'Q', leave: 'X', page: '', at40: 'yes' },
    labels: { R: 'Read\x1bMail' },
    descriptions: { R: 42 },
    levels: { abc: { hide: ['R'] }, '10': { hide: 'R' } },
    overflow: { c64: { '0': 'sideways' } },
    logos: [{ position: 'middle', widthClass: 'standard', levelFloor: 0, rule: 'fixed', files: ['a.txt'] },
            { position: 'header', widthClass: 'standard', levelFloor: 0, rule: 'fixed', files: ['../../etc/passwd'] }],
  });
  expect(config.wipes).toEqual({ open: 'X', leave: 'X', page: '', at40: true });
  expect(config.labels).toEqual({ R: 'ReadMail' });
  expect(config.descriptions).toEqual({});
  expect(Object.keys(config.levels)).toEqual([]);
  expect(levelEntry(config.overflow.c64, 0)).toBe('pages');
  expect(config.logos).toEqual([]);
  expect(problems.length).toBeGreaterThanOrEqual(7);
});

test('placement to a section that does not exist falls back to the default section', () => {
  const { config, problems } = validateMenuConfig('MAIN', { placement: { R: 'nowhere', F: 'messages' } });
  expect(config.placement).toEqual({ F: 'messages' });
  expect(problems).toContain('placement R: no section "nowhere"');
});

test('a C1 control (8-bit CSI 0x9B) is stripped from a label while printable latin1 stays', () => {
  expect(cleanText('Re\x9b31mad\x80\x9fX', 26)).toBe('Re31madX');
  expect(cleanText('K\xf6ra \xe5t', 26)).toBe('K\xf6ra \xe5t');
});

test('a duplicate section id is dropped with a problem line, the first one wins', () => {
  const { config, problems } = validateMenuConfig('MAIN', { sections: [{ id: 'a', title: 'First' }, { id: 'b', title: 'Two' }, { id: 'a', title: 'Again' }] });
  expect(config.sections).toEqual([{ id: 'a', title: 'First' }, { id: 'b', title: 'Two' }]);
  expect(problems).toContain('sections: duplicate id "a" dropped');
});

test('a second logo set for the same position, width class and level floor is dropped with a reason', () => {
  const set = (afterSection: number, floor = 0) => ({ position: 'between', widthClass: 'standard', levelFloor: floor, rule: 'fixed', files: ['a.txt'], afterSection });
  const { config, problems } = validateMenuConfig('MAIN', { logos: [set(0), set(2), set(2, 10)] });
  expect(config.logos.map(l => [l.levelFloor, l.afterSection])).toEqual([[0, 0], [10, 2]]);
  expect(problems).toContain('logos: a second between set for standard at level 0 was dropped');
});
