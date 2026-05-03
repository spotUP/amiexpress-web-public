/**
 * Regression tests for the shared Amiga-text decoder.
 *
 * Bulletins, screens, and BullHelp all share this pipeline so they don't
 * silently corrupt Amiga ANSI art with UTF-8 round-trips. The original
 * symptom: flt.txt rendered with `ï¿½` mojibake at every 0xB7 byte because
 * the bulletin path used `readString('utf8')`.
 */

jest.mock('../../src/utils/amigafs', () => ({
  existsSync: jest.fn(),
  statSync: jest.fn(),
  readFileSync: jest.fn(),
  resolvePath: jest.fn((p: string) => p),
}));

import * as amigafs from '../../src/utils/amigafs';
import { fileCache } from '../../src/utils/file-cache.util';
import {
  detectEncoding,
  parseSauceMetadata,
  readAmigaTextFile,
  readAmigaTextFileWithTransforms,
  stripSauceMetadata,
  transformIceColors,
} from '../../src/utils/amiga-text-decode.util';

type MockFile = { content: Buffer; mtime: number };
const mockFiles = new Map<string, MockFile>();

beforeEach(() => {
  mockFiles.clear();
  fileCache.clear();

  (amigafs.existsSync as jest.Mock).mockImplementation((p: string) => mockFiles.has(p));
  (amigafs.statSync as jest.Mock).mockImplementation((p: string) => {
    const f = mockFiles.get(p);
    if (!f) throw new Error(`File not found: ${p}`);
    return { mtimeMs: f.mtime };
  });
  (amigafs.readFileSync as jest.Mock).mockImplementation((p: string, encoding?: string) => {
    const f = mockFiles.get(p);
    if (!f) throw new Error(`File not found: ${p}`);
    if (encoding) return f.content.toString(encoding as BufferEncoding);
    return f.content;
  });
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('amiga-text-decode: encoding detection', () => {
  test('returns cp437 when SAUCE metadata present', () => {
    const buf = Buffer.from('hello');
    const sauce = { hasSauce: true };
    expect(detectEncoding(buf, '/foo.txt', sauce)).toBe('cp437');
  });

  test('returns cp437 for .ans extension', () => {
    const buf = Buffer.from('hello');
    expect(detectEncoding(buf, '/foo.ans', { hasSauce: false })).toBe('cp437');
  });

  test('returns iso-8859-1 when buffer has Latin-1 markers (©, ®, ·)', () => {
    const buf = Buffer.from([0xa9, 0xae, 0xb7, 0xb7, 0xb7]);
    expect(detectEncoding(buf, '/foo.txt', { hasSauce: false })).toBe('iso-8859-1');
  });

  test('returns iso-8859-1 when buffer has Latin-1 fractions (¼½¾)', () => {
    const buf = Buffer.from([0xbc, 0xbd, 0xbe]);
    expect(detectEncoding(buf, '/foo.txt', { hasSauce: false })).toBe('iso-8859-1');
  });

  test('returns cp437 when buffer has heavy box-drawing density', () => {
    // Many 0xC4 (─) and 0xCD (═) — strong CP437 indicator with no Latin-1 cues.
    const buf = Buffer.from(new Array(40).fill(0xc4).concat(new Array(40).fill(0xcd)));
    expect(detectEncoding(buf, '/foo.txt', { hasSauce: false })).toBe('cp437');
  });

  test('defaults to iso-8859-1 (Amiga convention) for plain ASCII files', () => {
    const buf = Buffer.from('Hello world\r\n', 'ascii');
    expect(detectEncoding(buf, '/foo.txt', { hasSauce: false })).toBe('iso-8859-1');
  });

  test('skips bytes inside ANSI escape sequences when scoring', () => {
    // ESC[40;31m … (the 0x40 byte inside the SGR shouldn't count as box-drawing).
    const buf = Buffer.from([0x1b, 0x5b, 0x34, 0x30, 0x3b, 0x33, 0x31, 0x6d, 0xb7]);
    expect(detectEncoding(buf, '/foo.txt', { hasSauce: false })).toBe('iso-8859-1');
  });
});

describe('amiga-text-decode: SAUCE handling', () => {
  test('parseSauceMetadata returns hasSauce=false for plain files', () => {
    expect(parseSauceMetadata(Buffer.from('hello'))).toEqual({ hasSauce: false });
  });

  test('parseSauceMetadata reads dimensions and iCE flag', () => {
    // Build a SAUCE block: marker + 87 padding bytes + dataType + fileType +
    // tInfo1 (LE) + tInfo2 (LE) + ... + tInfoFlags
    const marker = Buffer.from('SAUCE00', 'ascii');
    const sauce = Buffer.alloc(128);
    marker.copy(sauce, 0);
    sauce[94] = 1; // dataType: Character
    sauce[95] = 1; // fileType: ANSI
    sauce.writeUInt16LE(80, 96); // tInfo1: width
    sauce.writeUInt16LE(25, 98); // tInfo2: height
    sauce[104] = 0x01; // iCE colors flag
    const buf = Buffer.concat([Buffer.from('artwork '), sauce]);

    const info = parseSauceMetadata(buf);
    expect(info.hasSauce).toBe(true);
    expect(info.tInfo1).toBe(80);
    expect(info.tInfo2).toBe(25);
    expect(info.iceColors).toBe(true);
  });

  test('stripSauceMetadata removes the SAUCE block (and preceding 0x1A SUB)', () => {
    const body = Buffer.from('artwork');
    const sub = Buffer.from([0x1a]);
    const sauce = Buffer.alloc(128);
    Buffer.from('SAUCE00', 'ascii').copy(sauce, 0);
    const buf = Buffer.concat([body, sub, sauce]);

    const stripped = stripSauceMetadata(buf);
    expect(stripped.equals(body)).toBe(true);
  });

  test('stripSauceMetadata is idempotent for files without SAUCE', () => {
    const buf = Buffer.from('plain content');
    expect(stripSauceMetadata(buf).equals(buf)).toBe(true);
  });
});

describe('amiga-text-decode: readAmigaTextFile', () => {
  test('preserves a standalone 0xB7 (·) byte through the full pipeline', () => {
    // Realistic shape from flt.txt: cursor positioning + middle dot.
    const bytes = Buffer.from([
      0x1b, 0x5b, 0x35, 0x30, 0x48, 0xb7, 0x1b, 0x5b, 0x31, 0x36, 0x48,
    ]);
    mockFiles.set('/Conf2/Screens/flt.txt', { content: bytes, mtime: 1 });

    const result = readAmigaTextFile('/Conf2/Screens/flt.txt');

    expect(result.encoding).toBe('iso-8859-1');
    expect(result.text).toContain('·');
    expect(result.text).not.toContain('�');
    expect(result.text).not.toContain('ï¿½');
  });

  test('preserves Amiga high-bit symbols (©, ®, ¼½¾) round-trip clean', () => {
    const bytes = Buffer.from([0xa9, 0xae, 0xb7, 0xbc, 0xbd, 0xbe]);
    mockFiles.set('/banner.txt', { content: bytes, mtime: 1 });

    const result = readAmigaTextFile('/banner.txt');

    expect(result.encoding).toBe('iso-8859-1');
    expect(result.text).toBe('©®·¼½¾');
  });

  test('decodes CP437 box-drawing when SAUCE is present', () => {
    const sauce = Buffer.alloc(128);
    Buffer.from('SAUCE00', 'ascii').copy(sauce, 0);
    sauce[94] = 1;
    sauce[95] = 1;
    sauce.writeUInt16LE(80, 96);
    sauce.writeUInt16LE(25, 98);
    sauce[104] = 0;
    // CP437: 0xC4 = ─, 0xCD = ═, 0xDA = ┌
    const body = Buffer.from([0xda, 0xc4, 0xcd]);
    const buf = Buffer.concat([body, sauce]);
    mockFiles.set('/art.ans', { content: buf, mtime: 1 });

    const result = readAmigaTextFile('/art.ans');
    expect(result.encoding).toBe('cp437');
    expect(result.text).toBe('┌─═');
    expect(result.width).toBe(80);
    expect(result.height).toBe(25);
  });

  test('passes PETSCII .seq files through as UTF-8', () => {
    const buf = Buffer.from('petscii content', 'utf-8');
    mockFiles.set('/foo.seq', { content: buf, mtime: 1 });

    const result = readAmigaTextFile('/foo.seq');
    expect(result.encoding).toBe('utf-8');
    expect(result.text).toBe('petscii content');
  });

  test('cache poisoning is now impossible: even if readString runs first, readAmigaTextFile recovers raw bytes', () => {
    // This is the exact failure mode that turned flt.txt into mojibake. The
    // bulletin display path used to call readString first, populating the
    // cache with a UTF-8-lossy string. A subsequent screen render would call
    // readBuffer and get Buffer.from(string), inserting EF BF BD where 0xB7
    // used to be.
    const bytes = Buffer.from([
      0x1b, 0x5b, 0x35, 0x30, 0x48, 0xb7, 0x1b, 0x5b, 0x31, 0x36, 0x48,
    ]);
    mockFiles.set('/Conf2/Screens/flt.txt', { content: bytes, mtime: 1 });

    // Step 1: simulate the legacy bulletin handler poisoning the cache.
    fileCache.readString('/Conf2/Screens/flt.txt', 'utf8');

    // Step 2: the new pipeline must still see the original bytes.
    const result = readAmigaTextFile('/Conf2/Screens/flt.txt');

    expect(result.text).toContain('·');
    expect(result.text).not.toContain('ï¿½');
    expect(result.text).not.toContain('�');
  });
});

describe('amiga-text-decode: iCE colors transform', () => {
  test('promotes blink + bg40 to bright bg100', () => {
    const input = '\x1b[5;44mtext\x1b[0m';
    expect(transformIceColors(input)).toBe('\x1b[104mtext\x1b[0m');
  });

  test('passes through SGR sequences without blink unchanged', () => {
    const input = '\x1b[31;44mfoo\x1b[0m';
    expect(transformIceColors(input)).toBe('\x1b[31;44mfoo\x1b[0m');
  });

  test('ESC[m (full reset) clears blink state', () => {
    // After reset, the next blink+bg40 should still be promoted (state isolated).
    const input = '\x1b[5;44mA\x1b[m\x1b[5;44mB';
    expect(transformIceColors(input)).toContain('\x1b[104m');
  });

  test('readAmigaTextFileWithTransforms applies iCE transform when SAUCE flag set', () => {
    const sauce = Buffer.alloc(128);
    Buffer.from('SAUCE00', 'ascii').copy(sauce, 0);
    sauce[94] = 1;
    sauce[95] = 1;
    sauce.writeUInt16LE(80, 96);
    sauce.writeUInt16LE(25, 98);
    sauce[104] = 0x01; // iCE on
    const body = Buffer.from('\x1b[5;44mblink-bg-on');
    mockFiles.set('/ice.ans', { content: Buffer.concat([body, sauce]), mtime: 1 });

    const result = readAmigaTextFileWithTransforms('/ice.ans');
    expect(result.iceColors).toBe(true);
    expect(result.text).toContain('\x1b[104m');
    expect(result.text).not.toContain('\x1b[5;44m');
  });

  test('readAmigaTextFileWithTransforms leaves text alone when iCE is off', () => {
    const body = Buffer.from('\x1b[5;44mblink-bg-on');
    mockFiles.set('/normal.txt', { content: body, mtime: 1 });

    const result = readAmigaTextFileWithTransforms('/normal.txt');
    expect(result.iceColors).toBe(false);
    expect(result.text).toContain('\x1b[5;44m');
  });
});
