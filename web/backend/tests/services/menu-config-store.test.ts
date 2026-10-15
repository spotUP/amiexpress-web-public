import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readMenuConfig, writeMenuConfig, menuConfigPath, menuLogoDir } from '../../src/services/menu-config.service';

let root: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'menu-config-')); });
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

test('no file reads as the defaults, with no problems', () => {
  const { config, problems } = readMenuConfig(root, 'MAIN');
  expect(config.wipes.open).toBe('X');
  expect(problems).toEqual([]);
});

test('a write stores the repaired config, keeps one .bak, and reads back identical', () => {
  writeMenuConfig(root, 'MAIN', { descriptions: { R: 'first' } });
  const second = writeMenuConfig(root, 'MAIN', { descriptions: { R: 'second' } });
  expect(second.config.descriptions.R).toBe('second');
  expect(JSON.parse(fs.readFileSync(menuConfigPath(root, 'MAIN') + '.bak', 'utf8')).descriptions.R).toBe('first');
  expect(readMenuConfig(root, 'MAIN').config).toEqual(second.config);
  expect(fs.readdirSync(path.join(root, 'Menus')).filter(f => f.includes('.tmp'))).toEqual([]);
});

test('a file that is not JSON reads as the defaults and says so', () => {
  fs.mkdirSync(path.join(root, 'Menus'));
  fs.writeFileSync(menuConfigPath(root, 'BULLETINS'), '{oops');
  const { config, problems } = readMenuConfig(root, 'BULLETINS');
  expect(config.sections).toEqual([{ id: 'bulletins', title: 'Bulletins' }]);
  expect(problems[0]).toMatch(/not JSON/);
});

test('paths: Menus/<KIND>.json and Screens/menus/<kind>/logos', () => {
  expect(menuConfigPath(root, 'MAIN')).toBe(path.join(root, 'Menus', 'MAIN.json'));
  expect(menuLogoDir(root, 'BULLETINS')).toBe(path.join(root, 'Screens', 'menus', 'bulletins', 'logos'));
});
