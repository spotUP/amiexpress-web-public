/**
 * getConfLocation and getConfName - express.e:2084-2087 and 2114-2117.
 *
 * Both return the n-th confDirs / confNames item, filled at 31849-31859 from
 * LOCATION.n / NAME.n of ConfConfig.info, the location through checkPathSlash
 * (MiscFuncs.e:66-71: add '/' unless the last character is ':' or '/').
 * The web ports are conferenceAmigaPath (conference-paths.ts) and
 * doorConferenceName (custom-msgbase.ts); the ledger's cited lines are not them.
 *
 * Kept web divergence: an empty LOCATION falls back to BBS:Conf<n>/ (express
 * would hand back an unset string).
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { conferenceAmigaPath } from '../../src/conferences/conference-paths';
import { doorConferenceName } from '../../src/services/custom-msgbase';

let root: string;
function writeConfConfig(entries: { name: string; location: string }[]): void {
  const lines = [`NCONFS=${entries.length}`];
  entries.forEach((e, i) => { lines.push(`NAME.${i + 1}=${e.name}`, `LOCATION.${i + 1}=${e.location}`); });
  fs.writeFileSync(path.join(root, 'ConfConfig.info'), lines.join('\n') + '\n');
}

beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'confget-')); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

describe('getConfLocation (express.e:2084-2087)', () => {
  test('a slash is added only when the last character is neither colon nor slash', () => {
    writeConfConfig([
      { name: 'A', location: 'BBS:Conf2' },
      { name: 'B', location: 'BBS:' },
      { name: 'C', location: 'BBS:Conf3/' },
    ]);
    expect(conferenceAmigaPath(root, 1)).toBe('BBS:Conf2/');
    expect(conferenceAmigaPath(root, 2)).toBe('BBS:');
    expect(conferenceAmigaPath(root, 3)).toBe('BBS:Conf3/');
  });

  test('a volume-root location takes a subdirectory without a stray slash', () => {
    writeConfConfig([{ name: 'B', location: 'BBS:' }]);
    expect(conferenceAmigaPath(root, 1, 'MsgBase')).toBe('BBS:MsgBase/');
  });

  test('the n-th entry is answered, whatever its number', () => {
    writeConfConfig([{ name: 'A', location: 'BBS:Conf2/' }, { name: 'B', location: 'BBS:Conf9/' }]);
    expect(conferenceAmigaPath(root, 2)).toBe('BBS:Conf9/');
  });
});

describe('getConfName (express.e:2114-2117)', () => {
  test('answers NAME.n of the conference asked for', () => {
    writeConfConfig([{ name: 'Amiga Warez!', location: 'BBS:Conf1/' }, { name: 'Elite', location: 'BBS:Conf2/' }]);
    expect(doorConferenceName(root, 1)).toBe('Amiga Warez!');
    expect(doorConferenceName(root, 2)).toBe('Elite');
  });
});
