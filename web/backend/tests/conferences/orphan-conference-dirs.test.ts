/**
 * Conference directories nothing points at.
 *
 * A delete leaves the directory alone unless the sysop ticks the box, because
 * the messages and uploads inside belong to the conference rather than to its
 * position. That is right, and it means a board accumulates directories no
 * conference reads: the live board carried nine, and until 2026-09-02 the
 * deploy seeded them back even after they were removed.
 *
 * Nothing could SEE them. This is that list, and the removal that goes with
 * it - refusing, always, to touch a directory some LOCATION.n still names.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  listOrphanConferenceDirs, removeOrphanConferenceDir,
} from '../../src/conferences/orphan-conference-dirs';

let root: string;

function writeConfConfig(entries: { name: string; location: string }[]): void {
  const lines = [`NCONFS=${entries.length}`];
  entries.forEach((entry, i) => {
    lines.push(`NAME.${i + 1}=${entry.name}`);
    lines.push(`LOCATION.${i + 1}=${entry.location}`);
  });
  fs.writeFileSync(path.join(root, 'ConfConfig.info'), lines.join('\n') + '\n');
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'orphan-conf-'));
  for (let n = 1; n <= 14; n += 1) fs.mkdirSync(path.join(root, `Conf${n}`), { recursive: true });
  fs.mkdirSync(path.join(root, 'Node1'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Conf9', 'bull20.txt'), 'a bulletin\n');
  fs.mkdirSync(path.join(root, 'Conf9', 'MsgBase'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Conf9', 'MsgBase', '1'), 'a message\n');

  // The live board: five conferences, in the directories they always had.
  writeConfConfig([
    { name: 'Amiga Demoscene', location: 'BBS:Conf2/' },
    { name: 'C64 Demoscene', location: 'BBS:Conf3/' },
    { name: 'Console Demoscene', location: 'BBS:Conf5/' },
    { name: 'Requests', location: 'BBS:Conf8/' },
    { name: 'Up Rough Internal', location: 'BBS:Conf12/' },
  ]);
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('listing the directories no conference reads', () => {
  test('names every Conf<n> directory nothing points at, and no live one', () => {
    const orphans = listOrphanConferenceDirs(root).map(o => o.dir);

    expect(orphans).toEqual(['Conf1', 'Conf4', 'Conf6', 'Conf7', 'Conf9', 'Conf10', 'Conf11', 'Conf13', 'Conf14']);
    expect(orphans).not.toContain('Conf12');
  });

  test('says how much is in each, so the sysop is not deleting blind', () => {
    const conf9 = listOrphanConferenceDirs(root).find(o => o.dir === 'Conf9');

    expect(conf9?.files).toBe(2);
    expect(conf9?.bytes).toBeGreaterThan(0);
  });

  test('a board with no ConfConfig.info has no orphans - nothing is known to be dead', () => {
    fs.rmSync(path.join(root, 'ConfConfig.info'));

    expect(listOrphanConferenceDirs(root)).toEqual([]);
  });
});

describe('removing one', () => {
  test('deletes the directory and everything in it', () => {
    removeOrphanConferenceDir(root, 'Conf9');

    expect(fs.existsSync(path.join(root, 'Conf9'))).toBe(false);
    expect(listOrphanConferenceDirs(root).map(o => o.dir)).not.toContain('Conf9');
  });

  test("refuses a directory a conference still reads", () => {
    expect(() => removeOrphanConferenceDir(root, 'Conf12')).toThrow(/conference 5/i);
    expect(fs.existsSync(path.join(root, 'Conf12'))).toBe(true);
  });

  test('refuses anything that is not a conference directory name', () => {
    expect(() => removeOrphanConferenceDir(root, '../Access')).toThrow();
    expect(() => removeOrphanConferenceDir(root, 'Node1')).toThrow();
    expect(fs.existsSync(path.join(root, 'Node1'))).toBe(true);
  });

  test('refuses when the board has no ConfConfig.info to be sure with', () => {
    fs.rmSync(path.join(root, 'ConfConfig.info'));

    expect(() => removeOrphanConferenceDir(root, 'Conf9')).toThrow(/ConfConfig/i);
    expect(fs.existsSync(path.join(root, 'Conf9'))).toBe(true);
  });
});
