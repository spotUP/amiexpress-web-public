/**
 * A deleted conference must stay deleted across a deploy.
 *
 * The admin's conference delete is correct: NAME.n and LOCATION.n shift down,
 * the icon goes, and the directory goes too when the sysop asks. Then the next
 * container start put all of it back - `docker-entrypoint.sh` copies any
 * Conf<n> directory the volume is "missing" and seeds any absent Conf<n>.info,
 * from a template that ships Conf1..Conf14. The live board had five
 * conferences, fourteen directories and fourteen icons, and the screen manager
 * listed all fourteen.
 *
 * The rule the entrypoint now applies is the board's own: a conference is what
 * ConfConfig.info declares (express.e:31849 walks NAME.i/LOCATION.i for
 * i:=1 TO NCONFS) and its directory is whatever LOCATION.n names.
 *
 * These drive the REAL shell out of the real entrypoint - a TypeScript
 * re-implementation would prove nothing about the script that runs on deploy.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const ENTRYPOINT = path.join(__dirname, '..', '..', '..', '..', 'docker-entrypoint.sh');

/** The conference helpers, lifted verbatim from the entrypoint. */
function extractFunctions(): string {
  const source = fs.readFileSync(ENTRYPOINT, 'utf8');
  const start = source.indexOf('conf_tooltype_lines() {');
  const end = source.indexOf('sync_volume_owned() {');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('the conference helpers were not found in docker-entrypoint.sh');
  }
  return source.slice(start, end);
}

let root: string;

/** A ConfConfig.info as the board writes it: tooltypes, NUL-separated. */
function writeConfConfig(entries: { name: string; location: string }[]): void {
  const strings = [`NCONFS=${entries.length}`];
  entries.forEach((entry, i) => {
    strings.push(`NAME.${i + 1}=${entry.name}`);
    strings.push(`LOCATION.${i + 1}=${entry.location}`);
  });
  const body = Buffer.concat(strings.map(s => Buffer.concat([Buffer.from(s, 'latin1'), Buffer.from([0])])));
  fs.writeFileSync(path.join(root, 'volume', 'ConfConfig.info'), body);
}

function ask(entry: string): boolean {
  const script = `
    BBS_DATA_DIR="${root}/volume"
    ${extractFunctions()}
    if conference_still_exists "${entry}"; then echo YES; else echo NO; fi
  `;
  return execFileSync('sh', ['-c', script], { encoding: 'utf8' }).trim() === 'YES';
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'conf-seed-'));
  fs.mkdirSync(path.join(root, 'volume'), { recursive: true });
  fs.mkdirSync(path.join(root, 'image'), { recursive: true });
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('what a deploy is allowed to seed', () => {
  beforeEach(() => {
    // The live board on 2026-09-02: five conferences, directories left where
    // they were when the ones between them were deleted.
    writeConfConfig([
      { name: 'Amiga Demoscene', location: 'BBS:Conf2/' },
      { name: 'C64 Demoscene', location: 'BBS:Conf3/' },
      { name: 'Console Demoscene', location: 'BBS:Conf5/' },
      { name: 'Requests', location: 'BBS:Conf8/' },
      { name: 'Up Rough Internal', location: 'BBS:Conf12/' },
    ]);
  });

  test('a directory a conference still points at is seeded', () => {
    expect(ask('Conf12')).toBe(true);
    expect(ask('Conf2')).toBe(true);
  });

  test('a directory of a conference that was deleted is NOT seeded', () => {
    // Conf9 and Conf13 are exactly the ones that kept coming back.
    expect(ask('Conf9')).toBe(false);
    expect(ask('Conf13')).toBe(false);
    expect(ask('Conf1')).toBe(false);
  });

  test('an icon within NCONFS is seeded, one past it is not', () => {
    // Conf<n>.info is named by POSITION, so five conferences means five icons -
    // even though the directories they point at are 2, 3, 5, 8 and 12.
    expect(ask('Conf5.info')).toBe(true);
    expect(ask('Conf6.info')).toBe(false);
    expect(ask('Conf14.info')).toBe(false);
  });

  test('a non-conference directory is never blocked by this rule', () => {
    expect(ask('Node7')).toBe(true);
    expect(ask('Screens')).toBe(true);
  });
});

describe('a board with no ConfConfig.info', () => {
  test('seeds everything - that is a first run, and the image is the only list', () => {
    expect(ask('Conf9')).toBe(true);
    expect(ask('Conf14.info')).toBe(true);
  });
});
