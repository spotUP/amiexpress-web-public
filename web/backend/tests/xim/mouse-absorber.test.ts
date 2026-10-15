import { MouseAbsorber, MOUSE_WAKE } from '../../src/amiga-emulation/xim/mouse-absorber';

test('a report never reaches the key queue; one wake byte stands for it', () => {
  const m = new MouseAbsorber();
  expect(m.absorb('a\x1b[<0;10;5Mb')).toBe('a' + MOUSE_WAKE + 'b');
  expect(m.next()).toEqual({ kind: 'P', col: 10, row: 5 });
  expect(m.next()).toBeNull();
});

test('a report split across chunks is held until it is whole, and keys around it pass', () => {
  const m = new MouseAbsorber();
  expect(m.absorb('x\x1b[<35;1')).toBe('x');
  expect(m.absorb('0;5My')).toBe(MOUSE_WAKE + 'y');
  expect(m.next()).toEqual({ kind: 'M', col: 10, row: 5 });
});

test('a flood of motion is one wake and the latest position', () => {
  const m = new MouseAbsorber();
  let keys = '';
  for (let i = 1; i <= 200; i++) keys += m.absorb(`\x1b[<35;${i};3M`);
  expect(keys).toBe(MOUSE_WAKE);
  expect(m.next()).toEqual({ kind: 'M', col: 200, row: 3 });
});

test('presses and releases queue (up to 8) behind a motion, each with its own place', () => {
  const m = new MouseAbsorber();
  m.absorb('\x1b[<35;2;2M\x1b[<0;4;4M\x1b[<0;4;4m');
  expect([m.next(), m.next(), m.next(), m.next()]).toEqual([
    { kind: 'M', col: 2, row: 2 }, { kind: 'P', col: 4, row: 4 }, { kind: 'R', col: 4, row: 4 }, null]);
});

test('wheel reports are U and D; an ESC that is not a mouse report passes untouched', () => {
  const m = new MouseAbsorber();
  expect(m.absorb('\x1b[<64;1;1M\x1b[<65;1;1M\x1b[A\x1b')).toBe(MOUSE_WAKE + '\x1b[A\x1b');
  expect([m.next()!.kind, m.next()!.kind]).toEqual(['U', 'D']);
});

test('a typed 0x1E never poses as a wake byte', () => {
  expect(new MouseAbsorber().absorb('a\x1eb')).toBe('ab');
});

import { inputForTrace } from '../../src/amiga-emulation/xim/secret-input';

test('a trace names a mouse report and never prints its bytes', () => {
  expect(inputForTrace({}, 'a\x1b[<35;10;5Mb', (s) => s)).toBe('a<mouse>b');
  expect(inputForTrace({}, '\x1b[A', (s) => s)).toBe('\x1b[A');
});

import { doorInputTraceLine, setSecretInput } from '../../src/amiga-emulation/xim/secret-input';

test('TRACE_DOOR_INPUT names a mouse report and withholds a secret, like the other two traces', () => {
  const s = { nodeId: 2 };
  expect(doorInputTraceLine(s, 'door:input', '\x1b[<35;4;4M')).toContain('data="<mouse>"');
  setSecretInput(s, true);
  expect(doorInputTraceLine(s, 'door:input', 'hunter2')).not.toContain('hunter2');
  setSecretInput(s, false);
});
