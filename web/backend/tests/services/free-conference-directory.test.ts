/**
 * A new conference gets a directory nobody else is living in.
 *
 * Conference numbers renumber on delete and directories stay put, so on this
 * board conference 12's home was BBS:Conf13/. Creating a new conference 13
 * used `Conf<id>` and handed it that same directory; setupConference then
 * built its skeleton inside it, and the delete-files switch destroyed
 * conference 12's messages and files along with the new conference. The
 * allocator picks a directory that no LOCATION.n references and that does
 * not exist on disk.
 */

process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { freeConferenceDirectory } from '../../src/services/config-services/conference-config.service';

function makeRoot(dirs: string[]): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'free-dir-'));
  for (const d of dirs) fs.mkdirSync(path.join(root, d), { recursive: true });
  return root;
}

describe('freeConferenceDirectory', () => {
  it('skips the directory another conference lives in, even under a different number', () => {
    // Twelve conferences, and number 12 lives in Conf13 - the exact board
    // state this bug destroyed data on.
    const root = makeRoot(['Conf13']);
    const entries = Array.from({ length: 12 }, (_, i) => ({
      location: `BBS:Conf${i + 1 === 12 ? 13 : i + 1}/`,
    }));

    // Conf12 is unreferenced (12 lives in Conf13) and not on disk.
    expect(freeConferenceDirectory(entries, root)).toBe('BBS:Conf12/');
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('skips a directory that exists on disk even when nothing references it', () => {
    const root = makeRoot(['Conf1', 'Conf2']);
    expect(freeConferenceDirectory([{ location: 'BBS:Conf1/' }], root)).toBe('BBS:Conf3/');
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('compares case-insensitively, the way an Amiga volume does', () => {
    const root = makeRoot([]);
    expect(freeConferenceDirectory([{ location: 'BBS:CONF1/' }], root)).toBe('BBS:Conf2/');
    fs.rmSync(root, { recursive: true, force: true });
  });
});
