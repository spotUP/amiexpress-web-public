/**
 * The Status column and the Open button agree about where a bulletin is.
 *
 * `bulletinFilesAvailable` scanned `Bulletins/` AND `Doors/emp_tools/` -
 * correctly, because that is where the 68K door looks - while the browser,
 * the reader and the writer looked only in `Bulletins/`. So a bulletin that
 * lived only beside the door reported [OK] in the admin's Status column, did
 * not appear in the browser below it, and answered 404 on Open.
 *
 * One list of directories now, asked by all four.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  bulletinFilesAvailable,
  listBulletins,
  readBulletin,
  writeBulletin,
} from '../../src/services/bulls-config.service';

function board(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bulletin-dirs-'));
  fs.mkdirSync(path.join(root, 'Bulletins'), { recursive: true });
  fs.mkdirSync(path.join(root, 'Doors', 'emp_tools'), { recursive: true });
  return root;
}

describe('a bulletin that lives only beside the door', () => {
  it('is listed, read and written where it actually is', () => {
    const root = board();
    fs.writeFileSync(path.join(root, 'Doors', 'emp_tools', 'bull9.txt'), 'Beside the door\n', 'latin1');

    expect(bulletinFilesAvailable(root).has('bull9.txt')).toBe(true);
    expect(listBulletins(root).map((b) => b.name)).toContain('bull9.txt');
    expect(readBulletin(root, 'bull9.txt')).toContain('Beside the door');

    writeBulletin(root, 'bull9.txt', 'Edited\n');
    expect(fs.readFileSync(path.join(root, 'Doors', 'emp_tools', 'bull9.txt'), 'latin1')).toBe('Edited\n');
    // Not copied into the other directory behind the sysop's back.
    expect(fs.existsSync(path.join(root, 'Bulletins', 'bull9.txt'))).toBe(false);
  });

  it('still prefers Bulletins/ when both hold the same name', () => {
    const root = board();
    fs.writeFileSync(path.join(root, 'Bulletins', 'bull1.txt'), 'the board\n', 'latin1');
    fs.writeFileSync(path.join(root, 'Doors', 'emp_tools', 'bull1.txt'), 'the door\n', 'latin1');

    expect(readBulletin(root, 'bull1.txt')).toContain('the board');
    expect(listBulletins(root).filter((b) => b.name === 'bull1.txt')).toHaveLength(1);
  });

  it('puts a brand new bulletin in Bulletins/', () => {
    const root = board();

    writeBulletin(root, 'bull10.txt', 'New\n');

    expect(fs.existsSync(path.join(root, 'Bulletins', 'bull10.txt'))).toBe(true);
  });
});
