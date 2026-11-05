/**
 * The door cursor gate (src/amiga-emulation/session/door-cursor-gate.ts):
 * the cursor is hidden while a 68K door draws and shown while it waits.
 *
 * One reachability test drives the real GetAnswer binary through
 * AmigaDoorSession (constructed the way themec-40.test.ts does it): it paints
 * a banner and then blocks on a JH_PM line read. Every other branch of the
 * gate is tested on the gate itself with a fake socket. (THEMEC and rTW are
 * not used: both poll for keys between timed repaints, so by design the gate
 * never shows their cursor until exit.)
 */
import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { CaptureSocket } from './compact-40/door-capture';
import {
  DoorCursorGate, HIDE_CURSOR as HIDE, SHOW_CURSOR as SHOW, doorCursorToggle, doorInputWait,
} from '../../src/amiga-emulation/session/door-cursor-gate';

const REPO = path.resolve(__dirname, '../../../..');
const GETANSWER = path.join(REPO, 'board', 'Doors', 'GetAnswer', 'GetAnswer');
const PRINTABLE = /[\x21-\x7e]/;

/** Index of the first printable character outside an escape sequence. */
function firstVisible(text: string): number {
  const re = /\x1b\[[0-9;?]*[ -/]*[@-~]|([\s\S])/g;
  for (let m = re.exec(text); m; m = re.exec(text)) if (m[1] && PRINTABLE.test(m[1])) return m.index;
  return -1;
}

const count = (text: string, needle: string): number => text.split(needle).length - 1;

describe('68K door cursor, end to end through AmigaDoorSession', () => {
  jest.setTimeout(120000);

  it('GetAnswer: hidden once in front of its first paint, shown when it blocks on its line input', async () => {
    expect(fs.existsSync(GETANSWER)).toBe(true);
    const { AmigaDoorSession } = require('../../src/amiga-emulation/AmigaDoorSession');
    const socket = new CaptureSocket();
    const session = new AmigaDoorSession(socket as any, {
      executablePath: GETANSWER, doorType: 'XIM', timeout: 30, args: ['1'], assigns: {}, toolTypes: {},
      bbsSession: {
        user: { id: '1', username: 'Sysop', location: 'Local Console', secLevel: 255 },
        nodeId: 1, nodeNumber: 1, bbsName: 'AmiExpress-Web', sysopName: 'Sysop',
        timeRemaining: 60, doorCommand: 'GETANSWER', doorId: 'GETANSWER',
        petsciiMode: false, terminalType: 'modern', screenWidth: 80, screenHeight: 25,
      },
    });
    // GetAnswer prints a banner, prompts "Enter handle/usernr >:" on a JH_PM line read,
    // and leaves on an empty answer.
    let keyAt = -1;
    const timer = setTimeout(() => { keyAt = socket.ansi.length; socket.emit('door:input', '\r'); }, 4000);
    try { await session.start(); } finally { clearTimeout(timer); }

    expect(keyAt).toBeGreaterThan(0);
    const writes = socket.ansi.slice(0, keyAt);
    const beforeKey = writes.join('');
    const all = socket.ansi.join('');
    const hide = beforeKey.indexOf(HIDE);
    const prompt = beforeKey.indexOf('Enter handle');
    expect(prompt).toBeGreaterThan(-1);
    // The hide sits in front of the first glyph...
    expect(hide).toBeGreaterThan(-1);
    expect(hide).toBeLessThan(firstVisible(beforeKey));
    // ...it is sent once for the banner and prompt, not once per write...
    expect(writes.length).toBeGreaterThan(2);
    expect(count(beforeKey, HIDE)).toBe(1);
    // ...and the blocking read gave the caller the cursor back, once, after the prompt.
    expect(count(beforeKey, SHOW)).toBe(1);
    expect(beforeKey.indexOf(SHOW)).toBeGreaterThan(prompt);
    // Door exit leaves the board's prompt with a cursor.
    expect(all.lastIndexOf(SHOW)).toBeGreaterThan(all.lastIndexOf(HIDE));
  });
});

describe('DoorCursorGate', () => {
  /** A socket whose emit records the ansi-output it is handed. */
  function fakeSocket(): { socket: any; out: string[] } {
    const out: string[] = [];
    const socket = { emit(event: string, data?: unknown) { if (event === 'ansi-output') out.push(String(data)); return true; } };
    return { socket, out };
  }

  function gate(waiting: () => boolean = () => false) {
    const { socket, out } = fakeSocket();
    const g = new DoorCursorGate(socket, waiting);
    g.install();
    return { g, socket, out };
  }

  it('hides once in front of the first output, not on every write', () => {
    const { socket, out } = gate();
    socket.emit('ansi-output', 'A');
    socket.emit('ansi-output', 'B');
    socket.emit('ansi-output', 'C');
    expect(out).toEqual([HIDE + 'A', 'B', 'C']);
  });

  it('shows on a blocking read; echo during the read stays shown; output after it hides again', () => {
    let waiting = false;
    const { socket, out } = gate(() => waiting);
    socket.emit('ansi-output', 'menu');
    waiting = true;
    doorInputWait(socket);
    socket.emit('ansi-output', 'x'); // echo of a typed key
    waiting = false;
    socket.emit('ansi-output', 'answer');
    expect(out).toEqual([HIDE + 'menu', SHOW, 'x', HIDE + 'answer']);
  });

  it('a second wait while already shown sends nothing', () => {
    const { socket, out } = gate();
    socket.emit('ansi-output', 'a');
    doorInputWait(socket);
    doorInputWait(socket);
    expect(out).toEqual([HIDE + 'a', SHOW]);
  });

  it('a non-blocking poll is not a wait: the cursor stays hidden between timed repaints', () => {
    const { socket, out } = gate();
    socket.emit('ansi-output', 'frame 1');
    // JH_CK / JH_FetchKey / QUICK_KEY call nothing on the gate.
    socket.emit('ansi-output', 'frame 2');
    expect(out).toEqual([HIDE + 'frame 1', 'frame 2']);
    expect(out.join('')).not.toContain(SHOW);
  });

  it('door-owned ?25 in its own output disables the gate for the rest of the run', () => {
    const { g, socket, out } = gate();
    socket.emit('ansi-output', `${SHOW}own`);
    socket.emit('ansi-output', 'more');
    doorInputWait(socket);
    g.uninstall();
    expect(out).toEqual([`${SHOW}own`, 'more']);
  });

  it('CON_CURSOR takes over: the toggle is emitted, later output and waits are left alone', () => {
    const { g, socket, out } = gate();
    expect(doorCursorToggle(socket, false)).toBe(true);
    socket.emit('ansi-output', 'drawn');
    doorInputWait(socket);
    g.uninstall(); // the door left it hidden: exit shows it
    expect(out).toEqual([HIDE, 'drawn', SHOW]);
  });

  it('uninstall shows a hidden cursor and unwraps emit; without a gate the helpers are no-ops', () => {
    const { g, socket, out } = gate();
    socket.emit('ansi-output', 'x');
    g.uninstall();
    socket.emit('ansi-output', 'board prompt');
    expect(out).toEqual([HIDE + 'x', SHOW, 'board prompt']);
    expect(doorCursorToggle(socket, true)).toBe(false);
    expect(() => doorInputWait(socket)).not.toThrow();
  });

  it('leaves other events and empty output untouched', () => {
    const { socket, out } = gate();
    socket.emit('ansi-output', '');
    socket.emit('door:input', 'k');
    expect(out).toEqual(['']);
  });
});
