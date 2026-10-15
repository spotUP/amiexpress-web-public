/**
 * A batch line finds its door even when it disagrees with the disk about case.
 *
 * The line on this board is
 *
 *     doors:quicknew/quicknew doors:quicknew/quicknew.config1 7 >bbs:screens/quicknew.txt
 *
 * and the volume holds `Doors/QuickNew/QuickNew`. AmigaDOS does not care.
 *
 * `findInsensitiveFull` resolved only the BASENAME and passed the directory
 * through literally, so the lookup happened in `/app/data/bbs/Doors/quicknew` -
 * a directory that does not exist on a case-sensitive filesystem - and the
 * answer was "no such door".
 *
 * The cost was not an error message. The batch fell through to the TypeScript
 * generator instead of the door the line names, so on 2026-09-15 the restored
 * 68K QuickNew sat on the volume, the batch line named it, the sysop logged off
 * to test it, and every logoff went on running the generator. The board looked
 * like it was working while running something else.
 *
 * NOTE ON PLATFORM. This repo is developed on macOS, whose default volume is
 * case-insensitive: the old code passes here too, because `readdirSync` of the
 * lowercase directory simply works. The container runs ext4 and does not. So
 * this test can only FAIL on the platform that has the bug - it is written
 * against the property that matters (can the door actually be opened) rather
 * than against a spelling, so it is at least correct on both.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as amigafs from '../../src/utils/amigafs';

function aVolume(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'door-case-'));
  // The volume spells it the way an Amiga sysop did.
  fs.mkdirSync(path.join(root, 'Doors', 'QuickNew'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Doors', 'QuickNew', 'QuickNew'), 'the door');
  fs.writeFileSync(path.join(root, 'Doors', 'QuickNew', 'QuickNew.Config1'), 'the config');
  return root;
}

describe('resolving a door named by a batch line', () => {
  let root: string;

  beforeEach(() => { root = aVolume(); amigafs.forgetDirectoryListings(); });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('opens the door when the DIRECTORY disagrees about case', () => {
    // The whole bug in one line: the directory, not the file.
    const asked = path.join(root, 'Doors', 'quicknew', 'QuickNew');
    const resolved = amigafs.resolvePath(asked);

    expect(resolved).not.toBeNull();
    expect(fs.readFileSync(resolved as string, 'utf8')).toBe('the door');
  });

  it('opens it when every segment disagrees, which is what the batch line does', () => {
    const asked = path.join(root, 'doors', 'quicknew', 'quicknew');
    const resolved = amigafs.resolvePath(asked);

    expect(resolved).not.toBeNull();
    expect(fs.readFileSync(resolved as string, 'utf8')).toBe('the door');
  });

  it('finds the config the same line passes as an argument', () => {
    const asked = path.join(root, 'doors', 'quicknew', 'quicknew.config1');
    const resolved = amigafs.resolvePath(asked);

    expect(resolved).not.toBeNull();
    expect(fs.readFileSync(resolved as string, 'utf8')).toBe('the config');
  });

  it('still answers null for a door that genuinely is not there', () => {
    // Case-insensitive must not mean "finds anything": a missing door has to
    // stay missing, or the batch would try to run nothing at all.
    expect(amigafs.resolvePath(path.join(root, 'doors', 'nosuchdoor', 'nosuchdoor'))).toBeNull();
  });

  it('resolves the directory, which is the segment that was being skipped', () => {
    // Asserted through the per-directory lookup so it holds on a
    // case-insensitive filesystem too, where resolvePath short-circuits.
    expect(amigafs.findCaseInsensitive(path.join(root, 'Doors'), 'quicknew'))
      .toBe(path.join(root, 'Doors', 'QuickNew'));
  });
});
