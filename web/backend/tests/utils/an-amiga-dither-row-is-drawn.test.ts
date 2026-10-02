/**
 * An Amiga screen's 0x7F dither row is drawn, on the web and on an Amiga.
 *
 * Topaz draws a checkerboard at 0x7F. Read as Latin-1 the byte is DEL, which
 * a web terminal does not draw, so 607080's menu showed whatever its wipe
 * animation last left in those cells - random letters (GOTO8O, 2026-10-01).
 * The decoder makes it the medium shade; the wire turns it back into the
 * Amiga's byte for a Latin-1 caller.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readAmigaTextFile } from '../../src/utils/amiga-text-decode.util';
import { encodeForWire } from '../../src/utils/wire-encoding.util';

const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dither-')), 'menu.txt');
fs.writeFileSync(file, Buffer.from([0x7e, 0x66, 0x0d, 0x0a, 0x7f, 0x7f, 0x7f, 0x0d, 0x0a]));

describe('an Amiga dither row', () => {
  it('reaches a web terminal as a character it draws', () => {
    const { text, encoding } = readAmigaTextFile(file);
    expect(encoding).toBe('iso-8859-1');
    expect(text).toBe('~f\r\n▒▒▒\r\n');
  });

  it('reaches an Amiga caller as the byte the artist typed', () => {
    const { text } = readAmigaTextFile(file);
    const bytes = encodeForWire({ connectionType: 'telnet', unicodeCapable: false } as never, text, { sourceCharset: 'iso-8859-1' } as never);
    expect(Buffer.from(bytes as Buffer)).toEqual(Buffer.from([0x7e, 0x66, 0x0d, 0x0a, 0x7f, 0x7f, 0x7f, 0x0d, 0x0a]));
  });

  it('a CP437 medium shade reaches an Amiga caller as the same checker', () => {
    const bytes = encodeForWire({ connectionType: 'telnet', unicodeCapable: false } as never, 'a▒b');
    expect(Buffer.from(bytes as Buffer)).toEqual(Buffer.from([0x61, 0x7f, 0x62]));
  });
});
