/**
 * SP6's validator: can this theme be selected without breaking a caller?
 *
 * A partial theme is allowed by design, so none of these ask "is every screen
 * present". Each blocking rule names a file a caller WOULD be shown that the
 * board cannot serve, or that silently removes content the board has - and
 * each test is named after that symptom rather than after the rule's number.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { validateTheme, validateThemeFile } from '../../src/screens/theme-validation';
import { clearThemeRegistryCache, writeTheme, type ThemeEntry } from '../../src/screens/theme-registry';
import { invalidateScreenIndex } from '../../src/screens/screen-index.service';

let root: string;

function write(rel: string, body: string): void {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body, 'latin1');
}

function theme(files: Record<string, string>, over: Partial<ThemeEntry> = {}): ThemeEntry {
  const entry: ThemeEntry = {
    slug: 'neon', title: 'Neon', author: 'Skope', owner: 'skope',
    dir: 'Themes/neon', widths: [80], doorTheme: '', status: 'draft', ...over,
  };
  writeTheme(root, entry);
  for (const [rel, body] of Object.entries(files)) write(path.join('Themes', 'neon', rel), body);
  clearThemeRegistryCache();
  invalidateScreenIndex();
  return entry;
}

const rules = (findings: { rule: string }[]) => findings.map(f => f.rule);

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'theme-validate-'));
  fs.writeFileSync(path.join(root, 'ConfConfig.info'), '');
  clearThemeRegistryCache();
  invalidateScreenIndex();

  // A board with one screen that has a security variant, which is what rule 5
  // is about, plus a plain global screen.
  write('Node1/LOGON.txt', 'the board logon\r\n');
  write('Node1/Logon100.txt', 'the board sysop logon\r\n');
  write('Screens/BULL.TXT', 'the board bulletin\r\n');
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  invalidateScreenIndex();
});

test('a theme that only redraws one screen is publishable', () => {
  const report = validateTheme(root, theme({ 'Board/BULL.TXT': 'the neon bulletin\r\n' }));

  expect(report.blocking).toEqual([]);
  expect(report.publishable).toBe(true);
});

test('says a file the board could never serve is there, and publishes anyway', () => {
  // It BLOCKED until 2026-09-18. On a theme an artist has worked in, most of
  // what that caught was the admin's own `.backup` and `.removed-<stamp>`
  // copies - 28 of h7's 38 "problems" - and a file the loader never opens
  // cannot show a caller anything broken.
  const report = validateTheme(root, theme({ 'Board/logo.png': 'PNG\r\n' }));

  expect(rules(report.blocking)).not.toContain('not-a-screen-file');
  expect(rules(report.advisory)).toContain('not-a-screen-file');
  expect(report.publishable).toBe(true);
});

test('refuses a theme whose screen is empty, because a caller would see nothing', () => {
  const report = validateTheme(root, theme({ 'Board/BULL.TXT': '' }));

  expect(rules(report.blocking)).toContain('file-problem');
  expect(report.blocking[0].message).toMatch(/blank screen/);
});

test('refuses a theme whose colour codes lost their escape byte', () => {
  // 47 files on the live board are in this state: the caller sees `[0;31m`
  // printed instead of the colour.
  const report = validateTheme(root, theme({ 'Board/BULL.TXT': '[0;1;31mred[0m\r\n' }));

  expect(rules(report.blocking)).toContain('file-problem');
});

test('refuses a theme whose menu calls a door this board does not have', () => {
  const report = validateTheme(root, theme({ 'Board/BULL.TXT': '~CC_nosuchdoor|\r\n' }));

  const found = report.blocking.filter(f => f.rule === 'unresolved-reference');
  expect(found).toHaveLength(1);
  expect(found[0].message).toMatch(/nosuchdoor/);
});

test("refuses a theme whose screen gives every node one node's content", () => {
  const report = validateTheme(root, theme({ 'Board/BULL.TXT': '~SS_BBS:Node1/LOGON.txt|\r\n' }));

  expect(rules(report.blocking)).toContain('scope-specific-reference');
});

test("refuses a theme whose base logon would hide the board's level-100 logon", () => {
  const report = validateTheme(root, theme({ 'Node/LOGON.txt': 'the neon logon\r\n' }));

  const found = report.blocking.filter(f => f.rule === 'shadows-security-variant');
  expect(found.length).toBeGreaterThan(0);
  expect(found[0].message).toMatch(/Logon100\.txt/);
  expect(found[0].message).toMatch(/level-100/);
});

test('a theme that provides the security variant too is publishable', () => {
  const report = validateTheme(root, theme({
    'Node/LOGON.txt': 'the neon logon\r\n',
    'Node/Logon100.txt': 'the neon sysop logon\r\n',
  }));

  expect(rules(report.blocking)).not.toContain('shadows-security-variant');
});

test('says so, without blocking, when a 40-column theme carries no 40-column art', () => {
  const report = validateTheme(root, theme({ 'Board/BULL.TXT': 'the neon bulletin\r\n' }, { widths: [80, 40] }));

  expect(rules(report.advisory)).toContain('width-without-evidence');
  expect(report.publishable).toBe(true);
});

test('counts how much of the board a theme covers, and never gates on it', () => {
  const report = validateTheme(root, theme({ 'Board/BULL.TXT': 'the neon bulletin\r\n' }));

  expect(report.coverage.provided).toBe(1);
  expect(report.coverage.total).toBeGreaterThan(1);
  expect(rules(report.advisory)).toContain('coverage');
  expect(report.publishable).toBe(true);
});

test("a single saved file is judged on its own, without the board's variants", () => {
  // The save path asks about ONE file and must not report shadowing: that is
  // a fact about the theme and the board together, and it belongs to publish.
  const entry = theme({ 'Node/LOGON.txt': 'the neon logon\r\n' });

  expect(validateThemeFile(root, entry, 'Node/LOGON.txt')).toEqual([]);
  expect(rules(validateThemeFile(root, entry, 'Node/NOTHERE.txt'))).toEqual([]);
});

test("the artist's own notes are not judged as art", () => {
  const report = validateTheme(root, theme({ 'THEME.txt': '' }));

  expect(report.blocking).toEqual([]);
});
