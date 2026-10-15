/**
 * Telnet emitter transduction (petscii-full-canvas plan, Task 5) and THE
 * NON-NEGOTIABLE: a non-PETSCII session's ansi-output path is byte-identical
 * to what it was before the transducer existed.
 */
process.env.SKIP_DB_INIT = '1';

import { buildConnectionEmitter } from '../../src/server/connection-emitter';
import { PetsciiMachine } from '@amiexpress/bbs-door-sdk/petscii';

function connectionWith(session: any) {
  const written: Buffer[] = [];
  const connection: any = {
    write: (b: Buffer | string) => written.push(Buffer.isBuffer(b) ? b : Buffer.from(b)),
    session,
    sessionId: 'emitter-test',
    on() {}, off() {}, close() {},
  };
  return { connection, written, all: () => Buffer.concat(written) };
}
const scUpper = (ch: string) => 0x41 + (ch.charCodeAt(0) - 0x41);
const cell = (m: PetsciiMachine, x: number, y: number) => m.state.screen[y * 40 + x];

describe('non-PETSCII sessions are byte-for-byte unaffected (THE NON-NEGOTIABLE)', () => {
  const payloads = [
    '\x1b[2J\x1b[H\x1b[1;32mHello\x1b[0m\r\n',
    'bare LF line\nnext',
    '\x1b[3;5HX\x1b[K',
    'Username: ',
  ];
  for (const terminalType of ['modern', 'unknown', undefined]) {
    it(`terminalType=${terminalType}: strings get only the legacy CRLF normalization, buffers pass untouched`, () => {
      const { connection, written, all } = connectionWith({ terminalType, petsciiMode: false });
      const emitter = buildConnectionEmitter(connection);
      for (const p of payloads) emitter.emit('ansi-output', p);
      expect(all().toString('utf-8')).toBe(payloads.map((p) => p.replace(/\r?\n/g, '\r\n')).join(''));
      const bin = Buffer.from([0x18, 0x42, 0x00, 0xFF, 0x0A]);
      emitter.emit('ansi-output', bin);
      expect(Buffer.compare(written[written.length - 1], bin)).toBe(0);
      expect(connection.session.petsciiTransducer).toBeUndefined();
    });
  }
});

describe('C64 sessions get transduced PETSCII with cursor and color intact', () => {
  it('a login walk renders on a C64 screen: welcome line, then the prompt on its own row, case-correct', () => {
    const { connection, all } = connectionWith({ terminalType: 'c64', petsciiMode: true });
    const emitter = buildConnectionEmitter(connection);
    emitter.emit('ansi-output', '\r\n\r\n\x1b[36m-= Welcome to AmiExpress-Web =-\x1b[0m\r\n\r\n');
    emitter.emit('ansi-output', '\x1b[32mPlease login to continue.\x1b[0m\r\n\r\n');
    emitter.emit('ansi-output', 'Username: ');
    const m = new PetsciiMachine();
    m.feed(all());
    expect(cell(m, 3, 2)).toBe(scUpper('W'));
    expect(m.state.colorRam[2 * 40 + 3]).toBe(3);      // cyan
    expect(cell(m, 0, 6)).toBe(scUpper('U'));
    expect(m.state.cursorX).toBe(10);
    expect(m.state.cursorY).toBe(6);
    expect(m.state.charsetBank).toBe(1);
    const bytes = Array.from(all());
    expect(bytes.indexOf(0x0E)).toBeGreaterThan(-1);                 // charset prelude from the oracle, no session flag
    expect(bytes.indexOf(0x0E)).toBeLessThan(bytes.indexOf(0x2D));   // ...and before the first printable ('-')
  });

  it('a blessed-style positioned frame lands where the door put it (cursor survives, strip-ANSI is gone)', () => {
    const { connection, all } = connectionWith({ terminalType: 'c64', petsciiMode: true });
    const emitter = buildConnectionEmitter(connection);
    emitter.emit('ansi-output', '\x1b[2J\x1b[5;3H\x1b[33mMENU\x1b[0m\x1b[7;3H┌─┐');
    const m = new PetsciiMachine();
    m.feed(all());
    expect(cell(m, 2, 4)).toBe(scUpper('M'));
    expect(m.state.colorRam[4 * 40 + 2]).toBe(7);
    expect(cell(m, 2, 6)).toBe(0x70);
  });

  it('state carries across chunks and emitters: one transducer per session', () => {
    const session: any = { terminalType: 'c64', petsciiMode: true };
    const { connection, all } = connectionWith(session);
    const a = buildConnectionEmitter(connection);
    const b = buildConnectionEmitter(connection);
    a.emit('ansi-output', '\x1b[31mred');
    b.emit('ansi-output', ' still red');
    const bytes = Array.from(all());
    expect(bytes.filter((x) => x === 0x1C)).toHaveLength(1);
    expect(bytes.filter((x) => x === 0x0E)).toHaveLength(1);
    expect(a.session).toBe(session);
  });

  it('petscii-bytes are forwarded raw AND observed, so the next text re-selects the text bank', () => {
    const { connection, written } = connectionWith({ terminalType: 'c64', petsciiMode: true });
    const emitter = buildConnectionEmitter(connection);
    const seq = Buffer.from([0x93, 0x8E, 0x1C, 0xA1, 0xB0]);
    emitter.emit('petscii-bytes', seq.toString('base64'));
    expect(Buffer.compare(written[0], seq)).toBe(0);
    emitter.emit('ansi-output', 'Hi');
    expect(Array.from(written[1])).toEqual([0x0E, 0xC8, 0x49]);
  });

  it('petscii-output (legacy PUA) is transduced for a telnet session that answered P', () => {
    const { connection, written } = connectionWith({ terminalType: 'modern', petsciiMode: true });
    const emitter = buildConnectionEmitter(connection);
    emitter.emit('petscii-output', String.fromCodePoint(0xE081));
    expect(Array.from(written[0])).toEqual([0x12, 0x41]);
  });
});
