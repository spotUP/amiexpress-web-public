/**
 * The kitty graphics encoder (port of UP-Term's pic/kittyout.c), the reply
 * reader, and the session service that decides who is asked and who gets a
 * picture. The wiring through the telnet entry point is
 * tests/transport/kitty-graphics-entry.test.ts.
 */
import {
  KITTY_DELETE_ALL,
  KITTY_PROBE,
  KITTY_QUERY,
  KITTY_REPLY_MAX,
  encodeKittyPixels,
  encodeKittyPng,
  kittyReplyIsOk,
  splitKittyReplies,
} from '../../src/utils/kitty-graphics.util';
import {
  sendKittyImage,
  sessionHasKittyGraphics,
  startKittyProbe,
  takeKittyReplies,
} from '../../src/services/kitty-graphics.service';
import type { BBSSession } from '../../src/index';

/** Every APC in `s`: [keys, payload]. */
function apcs(s: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const re = /\x1b_G([^;]*);([^\x1b]*)\x1b\\/g;
  for (let m = re.exec(s); m; m = re.exec(s)) out.push([m[1], m[2]]);
  return out;
}

describe('kitty encoder (kittyout.c port)', () => {
  it('sends the same detection query as UP-Term kout_query', () => {
    expect(KITTY_QUERY).toBe('\x1b_Gi=31,s=1,v=1,a=q,t=d,f=24;AAAA\x1b\\');
    expect(KITTY_PROBE).toBe(`${KITTY_QUERY}\r\x1b[K`);
    expect(KITTY_DELETE_ALL).toBe('\x1b_Ga=d,d=A,q=2\x1b\\');
  });

  it('encodes RGB pixels in one chunk with the kout_pixels key order', () => {
    const px = new Uint8Array([255, 0, 0, 0, 255, 0]);
    const out = encodeKittyPixels(px, 2, 1, 3, { id: 7, cols: 4, rows: 2, quiet: 2 });
    expect(out).toBe(`\x1b_Ga=T,f=24,s=2,v=1,i=7,c=4,r=2,q=2,m=0;${Buffer.from(px).toString('base64')}\x1b\\`);
    expect(encodeKittyPixels(new Uint8Array(8), 2, 1, 4)).toContain('a=T,f=32,s=2,v=1,m=0;');
  });

  it('rejects a size that does not match the buffer', () => {
    expect(encodeKittyPixels(new Uint8Array(5), 2, 1, 3)).toBeNull();
    expect(encodeKittyPixels(new Uint8Array(0), 0, 0, 3)).toBeNull();
    expect(encodeKittyPng(new Uint8Array(0))).toBeNull();
  });

  it('chunks at 3072 raw bytes with m=1 on all but the last, keys only on the first', () => {
    const png = new Uint8Array(3072 * 2 + 10).map((_, k) => (k * 7) & 0xff);
    const parts = apcs(encodeKittyPng(png, { cols: 10 }) as string);
    expect(parts.map(([k]) => k)).toEqual(['a=T,f=100,c=10,m=1', 'm=1', 'm=0']);
    expect(parts[0][1]).toHaveLength(4096);
    const back = Buffer.concat(parts.map(([, b]) => Buffer.from(b, 'base64')));
    expect(Buffer.compare(back, Buffer.from(png))).toBe(0);
  });
});

describe('kitty reply reader', () => {
  it('knows the OK answer to the query and nothing else', () => {
    expect(kittyReplyIsOk('i=31;OK')).toBe(true);
    expect(kittyReplyIsOk('i=31;ENOTSUPPORTED:x')).toBe(false);
    expect(kittyReplyIsOk('i=32;OK')).toBe(false);
  });

  it('takes replies out of the input, around the keys typed', () => {
    const r = splitKittyReplies('', 'a\x1b_Gi=31;OK\x1b\\b');
    expect(r).toEqual({ text: 'ab', replies: ['i=31;OK'], pending: '' });
  });

  it('holds a reply cut by a packet boundary and finishes it next chunk', () => {
    const first = splitKittyReplies('', 'x\x1b_Gi=3');
    expect(first).toEqual({ text: 'x', replies: [], pending: '\x1b_Gi=3' });
    const second = splitKittyReplies(first.pending, '1;OK\x1b\\y');
    expect(second).toEqual({ text: 'y', replies: ['i=31;OK'], pending: '' });
  });

  it('never holds a lone ESC key or an overlong string', () => {
    expect(splitKittyReplies('', '\x1b').text).toBe('\x1b');
    const long = `\x1b_G${'z'.repeat(KITTY_REPLY_MAX)}`;
    expect(splitKittyReplies('', long)).toEqual({ text: long, replies: [], pending: '' });
  });
});

type S = Partial<BBSSession>;

describe('kitty session service', () => {
  it('asks a telnet or SSH caller once, never a C64, PETSCII or web caller', () => {
    const write = jest.fn();
    const telnet: S = { connectionType: 'telnet' };
    expect(startKittyProbe(telnet as BBSSession, { isC64: false }, write)).toBe(true);
    expect(startKittyProbe(telnet as BBSSession, { isC64: false }, write)).toBe(false);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith(KITTY_PROBE);

    expect(startKittyProbe({ connectionType: 'ssh' } as BBSSession, { isC64: false }, write)).toBe(true);
    expect(startKittyProbe({ connectionType: 'telnet' } as BBSSession, { isC64: true }, write)).toBe(false);
    expect(startKittyProbe({ connectionType: 'telnet', petsciiMode: true } as BBSSession, { isC64: false }, write)).toBe(false);
    expect(startKittyProbe({ connectionType: 'web' } as BBSSession, { isC64: false }, write)).toBe(false);
    expect(write).toHaveBeenCalledTimes(2);
  });

  it('filters only a caller that was asked', () => {
    const unasked: S = { connectionType: 'telnet' };
    expect(takeKittyReplies(unasked as BBSSession, '\x1b_Gi=31;OK\x1b\\')).toBe('\x1b_Gi=31;OK\x1b\\');
    expect(unasked.kittyGraphics).toBeUndefined();

    const asked: S = { connectionType: 'telnet', kittyProbeSent: true };
    expect(takeKittyReplies(asked as BBSSession, 'q\x1b_Gi=31;OK\x1b\\')).toBe('q');
    expect(asked.kittyGraphics).toBe(true);
  });

  it('sends a picture only to an OK caller who still reads ANSI', () => {
    expect(sessionHasKittyGraphics({ kittyGraphics: true } as BBSSession)).toBe(true);
    expect(sessionHasKittyGraphics({ kittyGraphics: true, ansiMode: false } as BBSSession)).toBe(false);
    expect(sessionHasKittyGraphics({ kittyGraphics: true, petsciiMode: true } as BBSSession)).toBe(false);
    expect(sessionHasKittyGraphics({} as BBSSession)).toBe(false);

    const raw = jest.fn();
    const text = jest.fn();
    const png = { png: new Uint8Array([1, 2, 3]) };
    expect(sendKittyImage({ kittyGraphics: true } as BBSSession, png, { fallback: 'F' }, raw, text)).toBe(true);
    expect(raw).toHaveBeenCalledWith('\x1b_Ga=T,f=100,q=2,m=0;AQID\x1b\\');
    expect(text).not.toHaveBeenCalled();

    expect(sendKittyImage({} as BBSSession, png, { fallback: 'F' }, raw, text)).toBe(false);
    expect(text).toHaveBeenCalledWith('F');
    expect(raw).toHaveBeenCalledTimes(1);
  });
});
