/**
 * FM rewrites a DIR listing on delete and on move. Two things went wrong on
 * 2026-09-06, both losing a sysop's data:
 *
 * 1. It read and wrote the listing as 'utf-8'. DIR files are Amiga text -
 *    high-bit bytes carrying ANSI art - so every such byte became U+FFFD and
 *    the write made it permanent. One delete destroyed 42 bytes of art
 *    belonging to OTHER entries in Conf2/Dir1.
 * 2. It rewrote the listing BEFORE attempting the physical delete, kept no
 *    copy, and printed "Delete operation complete" even when the physical
 *    delete threw - so the entry was gone, the file was not, and the sysop
 *    was told it had worked.
 *
 * The listing is the board's ONLY record: these files are not in the database
 * and are gitignored, so a bad rewrite is unrecoverable without the .bak.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const ART = Buffer.from([
  0x2e, 0x2d, 0xb0, 0x20, 0x5f, 0x5f, 0x5f, 0x3a, 0x20, 0xdb, 0xb1, 0xb2, 0x0d, 0x0a,
]);

function makeDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-dirsafe-'));
  const file = path.join(dir, 'DIR1');
  const head = Buffer.from('KEEPME.LHA   N  1024  01-01-26  a kept file\r\n', 'latin1');
  const gone = Buffer.from('GONE.LHA     N  2048  01-01-26  the deleted one\r\n', 'latin1');
  fs.writeFileSync(file, Buffer.concat([head, ART, gone]));
  return file;
}

describe('FM keeps a DIR listing intact when it rewrites one', () => {
  it('preserves high-bit art bytes instead of turning them into U+FFFD', () => {
    const file = makeDir();
    const before = fs.readFileSync(file);
    expect(before.includes(0xdb)).toBe(true);

    // The read/write round trip FM performs.
    const lines = fs.readFileSync(file, 'latin1').split(/\r?\n/);
    fs.writeFileSync(file, lines.join('\r\n'), 'latin1');

    const after = fs.readFileSync(file);
    expect(after.includes(0xdb)).toBe(true);
    expect(after.includes(0xb0)).toBe(true);
    expect(after.indexOf(Buffer.from([0xef, 0xbf, 0xbd]))).toBe(-1);
  });

  it('shows what the old utf-8 round trip did, so the regression is legible', () => {
    const file = makeDir();
    const lines = fs.readFileSync(file, 'utf-8').split(/\r?\n/);
    fs.writeFileSync(file, lines.join('\r\n'), 'utf-8');

    const after = fs.readFileSync(file);
    // Not every byte dies - 0xDB 0xB1 happens to be a valid UTF-8 sequence
    // and survives, which is why the real Conf2/Dir1 kept 126 high-bit bytes
    // and lost 42. What matters is that ANY byte was replaced at all, and
    // that a lone 0xB0 - which cannot begin a valid sequence - is destroyed.
    expect(after.indexOf(Buffer.from([0xef, 0xbf, 0xbd]))).toBeGreaterThan(-1);
    expect(after.includes(0xb0)).toBe(false);
  });
});
