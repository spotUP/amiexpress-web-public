/**
 * The news bulletins are written straight onto the live board on a timer, and
 * two ways of losing content were sitting in that write.
 *
 * A READ ERROR IS NOT AN EMPTY FILE. ensureBullHelpLine swallowed every error
 * from reading BullHelp.txt and carried on with '', then wrote that back with
 * one line appended - so a file the board could not read for a moment came
 * back with every other bulletin's line gone. The board lists its own
 * bulletins from that file, and this runs hourly: quiet, permanent loss.
 *
 * A KILL MID-WRITE IS A TRUNCATED BULLETIN. writeFileSync onto the live file
 * leaves a zero-byte bulletin if the process dies partway - a known sighting
 * on this board. Written to a temp file in the same directory and renamed,
 * a reader sees the old file or the new one and never half of one.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { ensureBullHelpLine } from '../../src/services/news-bulletins';

let dir = '';
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bulls-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

const help = () => path.join(dir, 'BullHelp.txt');

describe('BullHelp.txt', () => {
  it('gains a line for a bulletin it does not name yet', () => {
    fs.writeFileSync(help(), '#1    Welcome\n', 'latin1');
    ensureBullHelpLine(dir, 7, 'News');
    const text = fs.readFileSync(help(), 'latin1');
    expect(text).toContain('#1    Welcome');
    expect(text).toContain('#7    News');
  });

  it('names a bulletin once, however many times the timer ticks', () => {
    fs.writeFileSync(help(), '#7    News\n', 'latin1');
    ensureBullHelpLine(dir, 7, 'News');
    ensureBullHelpLine(dir, 7, 'News');
    expect(fs.readFileSync(help(), 'latin1').match(/#7\b/g)).toHaveLength(1);
  });

  it('writes the file when there is none - the only empty that is real', () => {
    ensureBullHelpLine(dir, 7, 'News');
    expect(fs.readFileSync(help(), 'latin1')).toBe('#7    News\n');
  });

  it('LEAVES THE FILE ALONE when it cannot be read', () => {
    const existing = '#1    Welcome\n#2    Rules\n#7    News\n';
    fs.writeFileSync(help(), existing, 'latin1');

    // The destructive case is a read that fails while the write would have
    // SUCCEEDED - a locked file, a busy disk, too many open handles. A chmod
    // cannot express that (it blocks both), so the read is made to fail here
    // and the write is left working, which is exactly the shape that used to
    // replace the file with a single line.
    const busy = () => {
      throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' });
    };

    let threw = false;
    try { ensureBullHelpLine(dir, 8, 'Sport', busy); } catch { threw = true; }

    // Whatever it decided to do, the board's own listing is still there.
    expect(fs.readFileSync(help(), 'latin1')).toBe(existing);
    expect(threw).toBe(true);
  });

  it('leaves no temp file behind, and no half-written target', () => {
    const existing = '#1    Welcome\n';
    fs.writeFileSync(help(), existing, 'latin1');
    // A directory the board cannot write into: the temp file cannot be made.
    fs.chmodSync(dir, 0o500);
    if (canStillWrite(dir)) { fs.chmodSync(dir, 0o700); return; }

    expect(() => ensureBullHelpLine(dir, 9, 'Weather')).toThrow();

    fs.chmodSync(dir, 0o700);
    expect(fs.readdirSync(dir).filter((f) => f.includes('.tmp-'))).toEqual([]);
    expect(fs.readFileSync(help(), 'latin1')).toBe(existing);
  });
});

/** Root ignores the mode bits, and then the test is asserting nothing. */
function canStillRead(file: string): boolean {
  try { fs.readFileSync(file); return true; } catch { return false; }
}
function canStillWrite(d: string): boolean {
  const probe = path.join(d, '.probe');
  try { fs.writeFileSync(probe, 'x'); fs.unlinkSync(probe); return true; } catch { return false; }
}
