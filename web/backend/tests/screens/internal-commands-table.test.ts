/**
 * The internal command table is the one place a command's label, section,
 * description and gate live. Two drifts it must never have: a switch case it
 * does not list, and a gate express.e does not check.
 */
import * as fs from 'fs';
import * as path from 'path';
import { INTERNAL_COMMANDS, internalCommandRow, DEFAULT_SECTIONS } from '../../src/screens/menu-config/internal-commands';
import { ACSPermission } from '../../src/constants/acs-permissions';

const REPO = path.resolve(__dirname, '../../../..');
const HANDLER = fs.readFileSync(path.join(REPO, 'web/backend/src/handlers/command.handler.ts'), 'utf8');
const EXPRESS = fs.readFileSync(path.join(REPO, 'AmiExpress-Sources/express.e'), 'latin1');

/** Every case label of the internal dispatch switch, symbols included (`<`, `>>`, `^`, `?`). */
function switchCases(): string[] {
  const start = HANDLER.indexOf("case 'D':");
  const end = HANDLER.indexOf("case 'DOORS':", start) + 20;
  const body = HANDLER.slice(start, end);
  return [...body.matchAll(/^\s*case '([^']+)':/gm)].map(m => m[1]);
}

/** The text of `PROC <name>(` up to its `ENDPROC`. */
function proc(name: string): string {
  const at = EXPRESS.indexOf(`PROC ${name}(`);
  if (at < 0) return '';
  return EXPRESS.slice(at, EXPRESS.indexOf('ENDPROC', at));
}

test('every case of the internal switch has exactly one row, and no row is invented', () => {
  const cases = switchCases().sort();
  const rows = INTERNAL_COMMANDS.map(r => r.code).sort();
  expect(cases.length).toBe(64);
  expect(rows).toEqual(cases);
});

test('the five symbol commands the tab-completion list misses are in the table', () => {
  for (const code of ['<', '>', '<<', '>>', '^']) expect(internalCommandRow(code)).toBeDefined();
});

test('every gate is a real ACSPermission key, SYSOP, or none', () => {
  for (const row of INTERNAL_COMMANDS) {
    if (row.gate === null || row.gate === 'SYSOP') continue;
    expect(ACSPermission[row.gate as keyof typeof ACSPermission]).toEqual(expect.any(Number));
  }
});

test("every express.e row's gate is checked inside that express.e procedure", () => {
  for (const row of INTERNAL_COMMANDS) {
    const m = /^express\.e:\d+ (internalCommand\w+)$/.exec(row.source);
    if (!m || row.gate === null) continue;
    expect(proc(m[1])).toContain(`checkSecurity(ACS_${row.gate})`);
  }
});

test('labels are full words and fit a 40-column row beside the longest key', () => {
  for (const row of INTERNAL_COMMANDS) {
    expect(row.label.length).toBeGreaterThan(1);
    expect(row.label.length).toBeLessThanOrEqual(26);
    expect(row.description.length).toBeLessThanOrEqual(76);
    expect(row.label).not.toMatch(/\b(Msg|Cnf|Conf|Dl|Ul|Sys|Usr)\b/);
  }
});

test('every row sits in a default section', () => {
  const ids = new Set(DEFAULT_SECTIONS.map(s => s.id));
  for (const row of INTERNAL_COMMANDS) expect(ids.has(row.section)).toBe(true);
});
