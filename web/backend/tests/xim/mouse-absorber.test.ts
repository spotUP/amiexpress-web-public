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

test('wheel reports are U and D; an arrow key passes untouched', () => {
  const m = new MouseAbsorber();
  expect(m.absorb('\x1b[<64;1;1M\x1b[<65;1;1M\x1b[A')).toBe(MOUSE_WAKE + '\x1b[A');
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

describe('a report split anywhere across chunks', () => {
  const REPORT = '\x1b[<35;10;5M';
  afterEach(() => jest.useRealTimers());

  test('ESC | [<35;10;5M and ESC[ | <35;10;5M leak nothing to the key queue', () => {
    for (const cut of [['x\x1b', '[<35;10;5M'], ['x\x1b[', '<35;10;5M']]) {
      const m = new MouseAbsorber();
      const out = m.absorb(cut[0]) + m.absorb(cut[1]);
      expect(out).toBe('x' + MOUSE_WAKE);
      expect(m.next()).toEqual({ kind: 'M', col: 10, row: 5 });
      expect(m.next()).toBeNull();
    }
  });

  test('every byte boundary of a full report gives one wake, one event, no stray bytes', () => {
    for (let i = 0; i <= REPORT.length; i++) {
      const m = new MouseAbsorber();
      const out = m.absorb('a' + REPORT.slice(0, i)) + m.absorb(REPORT.slice(i) + 'b');
      expect(out).toBe('a' + MOUSE_WAKE + 'b');
      expect(m.next()).toEqual({ kind: 'M', col: 10, row: 5 });
      expect(m.next()).toBeNull();
    }
  });

  test('a lone ESC reaches the door as an Esc key after the settle window, not before', () => {
    jest.useFakeTimers();
    const settled: string[] = [];
    const m = new MouseAbsorber((k) => settled.push(k), 50);
    expect(m.absorb('\x1b')).toBe('');
    jest.advanceTimersByTime(49);
    expect(settled).toEqual([]);
    jest.advanceTimersByTime(1);
    expect(settled).toEqual(['\x1b']);
    expect(m.absorb('[<35;10;5M')).toBe('[<35;10;5M');
  });

  test('ESC + [A (an arrow split across chunks) is preserved in order and nothing settles later', () => {
    jest.useFakeTimers();
    const settled: string[] = [];
    const m = new MouseAbsorber((k) => settled.push(k), 50);
    expect(m.absorb('q\x1b') + m.absorb('[Ax')).toBe('q\x1b[Ax');
    jest.advanceTimersByTime(500);
    expect(settled).toEqual([]);
  });

  test('Alt-key (ESC then a letter) passes through in order', () => {
    const m = new MouseAbsorber();
    expect(m.absorb('\x1b') + m.absorb('x')).toBe('\x1bx');
  });

  test('a drip of partial chunks is flushed 50 ms after the FIRST held byte, not restarted by each chunk', () => {
    jest.useFakeTimers();
    const settled: string[] = [];
    const m = new MouseAbsorber((k) => settled.push(k), 50);
    m.absorb('\x1b');
    jest.advanceTimersByTime(30);
    m.absorb('[<3');
    jest.advanceTimersByTime(19);
    expect(settled).toEqual([]);
    jest.advanceTimersByTime(1);
    expect(settled).toEqual(['\x1b[<3']);
  });

  test('flush hands on a held lone ESC and stops the timer; reset discards it', () => {
    jest.useFakeTimers();
    const settled: string[] = [];
    const m = new MouseAbsorber((k) => settled.push(k), 50);
    m.absorb('\x1b');
    expect(m.flush()).toBe('\x1b');
    expect(m.flush()).toBe('');
    m.absorb('\x1b[<3');
    m.reset();
    jest.advanceTimersByTime(500);
    expect(settled).toEqual([]);
    expect(m.flush()).toBe('');
  });
});

describe('events arrive in order', () => {
  test('press then move is delivered press first', () => {
    const m = new MouseAbsorber();
    m.absorb('\x1b[<0;1;1M\x1b[<35;2;2M');
    expect([m.next(), m.next(), m.next()]).toEqual([{ kind: 'P', col: 1, row: 1 }, { kind: 'M', col: 2, row: 2 }, null]);
  });
  test('move, move, press is the latest move then the press', () => {
    const m = new MouseAbsorber();
    m.absorb('\x1b[<35;2;2M\x1b[<35;3;3M\x1b[<0;4;4M');
    expect([m.next(), m.next(), m.next()]).toEqual([{ kind: 'M', col: 3, row: 3 }, { kind: 'P', col: 4, row: 4 }, null]);
  });
});
