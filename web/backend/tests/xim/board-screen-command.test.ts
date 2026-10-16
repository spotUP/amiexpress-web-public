import { boardScreenAnswer, type BoardScreenContext } from '../../src/amiga-emulation/xim/board-screen';
import { responsiveDoorGeometry } from '../../src/amiga-emulation/xim/screen-width.util';
import { MouseAbsorber } from '../../src/amiga-emulation/xim/mouse-absorber';
import { isIOCommand } from '../../src/amiga-emulation/xim/command-classes';
import { ASYNC_OUTPUT_COMMANDS } from '../../src/amiga-emulation/session/lifecycle/door-message-callbacks';
import { XIMCommand } from '../../src/amiga-emulation/xim/types';

const sent: string[] = [];
const ctx = (session: any): BoardScreenContext => {
  const c: any = { session, socket: { _directEmit: (_e: string, d: string) => sent.push(d), emit: (_e: string, d: string) => sent.push(d) },
    state: { wipeCapture: null }, mouse: null, columns: () => 80 };
  c.armMouse = (on: boolean) => { c.mouse = on ? new MouseAbsorber() : null; };
  return c;
};
beforeEach(() => { sent.length = 0; });

test('both new commands are routed and awaited (the two lines that get forgotten)', () => {
  expect(XIMCommand.AEW_SCREEN).toBe(10800);
  expect(XIMCommand.AEW_MENU).toBe(10900);
  for (const c of [XIMCommand.AEW_SCREEN, XIMCommand.AEW_MENU]) {
    expect(isIOCommand(c)).toBe(true);
    expect(ASYNC_OUTPUT_COMMANDS).toContain(c);
  }
});

test('SIZE: an ANSI caller gets the real width, floored at 80 and capped at 160; a C64 gets 40x25', async () => {
  expect(await boardScreenAnswer('SIZE', ctx({ screenWidth: 80, wireWidth: 132, wireHeight: 40 }))).toBe('132\t40');
  expect(await boardScreenAnswer('SIZE', ctx({ screenWidth: 80, wireWidth: 60 }))).toMatch(/^80\t/);
  expect(await boardScreenAnswer('SIZE', ctx({ wireWidth: 300, wireHeight: 90 }))).toBe('160\t50');
  expect(await boardScreenAnswer('SIZE', ctx({ petsciiMode: true, petsciiColumns: 40, wireWidth: 132 }))).toBe('40\t25');
  expect(responsiveDoorGeometry({ texttvMode: true } as any).cols).toBe(40);
});

test('WIPE IN captures, WIPE END plays the reveal of what was captured, then releases', async () => {
  const c = ctx({ screenWidth: 80 });
  expect(await boardScreenAnswer('WIPE IN H', c)).toBe('OK');
  expect(c.state.wipeCapture).toEqual({ kind: 'in', letter: 'H', text: [] });
  c.state.wipeCapture!.text.push('\x1b[2J\x1b[HMAIN MENU\r\n');
  expect(await boardScreenAnswer('WIPE END', c)).toBe('OK');
  expect(c.state.wipeCapture).toBeNull();
  expect(sent.length).toBeGreaterThan(2);
  expect(sent.join('')).toContain('MAIN MENU');
});

test('a teletext caller, an unknown letter or an empty one gets NO and nothing is captured', async () => {
  const t = ctx({ texttvMode: true });
  expect(await boardScreenAnswer('WIPE IN X', t)).toBe('NO');
  expect(t.state.wipeCapture).toBeNull();
  expect(await boardScreenAnswer('WIPE IN Q', ctx({}))).toBe('NO');
  expect(await boardScreenAnswer('WIPE OUT ', ctx({}))).toBe('NO');
});

test('MOUSE ON turns reporting on for an ANSI caller only; MOUSE? hands out one event', async () => {
  const c = ctx({ screenWidth: 80 });
  expect(await boardScreenAnswer('MOUSE ON', c)).toBe('OK');
  expect(sent.join('')).toContain('\x1b[?1003h\x1b[?1006h');
  c.mouse!.absorb('\x1b[<0;12;7M');
  expect(await boardScreenAnswer('MOUSE?', c)).toBe('P\t12\t7');
  expect(await boardScreenAnswer('MOUSE?', c)).toBe('');
  expect(await boardScreenAnswer('MOUSE OFF', c)).toBe('OK');
  expect(c.mouse).toBeNull();
  expect(await boardScreenAnswer('MOUSE ON', ctx({ petsciiMode: true }))).toBe('NO');
});

test('a throwing handler answers empty and releases a held wipe', async () => {
  const c = ctx({ screenWidth: 80 });
  c.socket = {};   // playWipeFrames cannot emit
  await boardScreenAnswer('WIPE IN H', c);
  c.state.wipeCapture!.text.push('x');
  await expect(boardScreenAnswer('WIPE END', c)).rejects.toBeDefined();
  expect(c.state.wipeCapture).toBeNull();   // the XIM route turns the throw into an empty answer
});

test('an unknown request answers empty', async () => {
  expect(await boardScreenAnswer('BOGUS 1', ctx({}))).toBe('');
});

import { capWipeFrames, WIPE_BUDGET_MS } from '../../src/amiga-emulation/xim/board-screen';

test('a wipe longer than the budget drops to its final frame instead of nearing the 5 s deadline', () => {
  const frames = Array.from({ length: 200 }, (_, i) => ({ content: String(i), delay: 100 }));
  const kept = capWipeFrames(frames);
  expect(kept[kept.length - 1].content).toBe('199');
  expect(kept.slice(0, -1).reduce((a, f) => a + Math.max(16, f.delay), 0)).toBeLessThanOrEqual(WIPE_BUDGET_MS);
  expect(kept.length).toBeLessThan(40);
  const short = [{ content: 'a', delay: 20 }, { content: 'b', delay: 0 }];
  expect(capWipeFrames(short)).toEqual(short);
});

test('a second WIPE IN while one is held plays the held one first', async () => {
  const c = ctx({ screenWidth: 80 });
  await boardScreenAnswer('WIPE IN H', c);
  c.state.wipeCapture!.text.push('FIRST SCREEN');
  expect(await boardScreenAnswer('WIPE OUT H', c)).toBe('OK');
  expect(sent.join('')).toContain('FIRST SCREEN');
  expect(c.state.wipeCapture).toEqual({ kind: 'out', letter: 'H', text: [] });
});

test('WIPE IN P <top> <rows> <F|B> stores the region and END plays region frames only; bad ranges answer NO', async () => {
  const c = ctx({ screenWidth: 80 });
  expect(await boardScreenAnswer('WIPE IN P 4 10 F', c)).toBe('OK');
  expect(c.state.wipeCapture).toEqual({ kind: 'in', letter: 'P', text: [], region: { top: 4, rows: 10, forward: true } });
  c.state.wipeCapture!.text.push('\x1b[2J\x1b[H' + Array.from({ length: 20 }, (_, i) => `line${i + 1}`).join('\r\n'));
  expect(await boardScreenAnswer('WIPE END', c)).toBe('OK');
  const out = sent.join('');
  expect(out).toContain('line4');
  expect(out).not.toContain('\x1b[2J');
  expect(out).not.toContain('line3');
  for (const bad of ['WIPE IN P', 'WIPE IN P 4 10', 'WIPE IN P 0 5 F', 'WIPE IN P 4 0 F', 'WIPE IN P 20 10 F', 'WIPE IN P 4 x F', 'WIPE IN P 4 10 X', 'WIPE OUT P 4 10 F']) {
    const b = ctx({ screenWidth: 80 });
    expect(await boardScreenAnswer(bad, b)).toBe('NO');
    expect(b.state.wipeCapture).toBeNull();
  }
  const x = ctx({ screenWidth: 80 });
  expect(await boardScreenAnswer('WIPE IN X', x)).toBe('OK');
  expect(x.state.wipeCapture).toEqual({ kind: 'in', letter: 'X', text: [] });
});
