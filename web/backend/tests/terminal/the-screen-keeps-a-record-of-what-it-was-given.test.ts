/**
 * The browser's screen keeps a record of what it was given, in order.
 *
 * Global Last Callers "sometimes" draws with its header gone (2026-09-27):
 * exactly what a clear landing mid-draw produces, and only in the browser.
 * The recorder is how the sysop captures the next one - so what matters is
 * that a clear, a reset or a resize shows up BETWEEN the writes it fell
 * between, and that the capture cannot grow without bound.
 */
import {
  createWireRecorder,
  recordTerminal,
  recordPetscii,
} from '../../../../packages/terminal/src/utils/wire-recorder';

function fakeTerminal() {
  const screen: string[] = [];
  return {
    screen,
    write(data: string | Uint8Array) { screen.push(typeof data === 'string' ? data : 'bytes'); },
    reset() { screen.push('<reset>'); },
    clear() { screen.push('<clear>'); },
    resize(cols: number, rows: number) { screen.push(`<${cols}x${rows}>`); },
  };
}

describe('the wire recorder', () => {
  it('records a reset between the writes it fell between, and still lets each act', () => {
    let clock = 0;
    const recorder = createWireRecorder(1024, () => ++clock);
    const term = fakeTerminal();
    recordTerminal(term, recorder);

    term.write('HEADER\r\n');
    term.reset();
    term.write('\x1b[A\x1b[A');
    term.resize(80, 26);

    expect(recorder.events().map((e) => [e.kind, e.data])).toEqual([
      ['write', 'HEADER\r\n'],
      ['reset', undefined],
      ['write', '\x1b[A\x1b[A'],
      ['resize', '80x26'],
    ]);
    expect(term.screen).toEqual(['HEADER\r\n', '<reset>', '\x1b[A\x1b[A', '<80x26>']);
  });

  it('keeps ESC readable in a dump, one event per line', () => {
    const recorder = createWireRecorder(1024, () => 7);
    recorder.record('write', '\x1b[2J');
    recordPetscii(recorder, [0x93, 0x05]);
    const lines = recorder.dump().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('{"t":7,"kind":"write","data":"\\u001b[2J"}');
    expect(JSON.parse(lines[1]).data).toBe('\x93\x05');
  });

  it('drops the oldest events once the budget is spent', () => {
    const recorder = createWireRecorder(40);
    for (let i = 0; i < 10; i++) recorder.record('write', `row ${i} ....`);
    const kept = recorder.events().map((e) => e.data);
    expect(kept[kept.length - 1]).toBe('row 9 ....');
    expect(kept).not.toContain('row 0 ....');
    expect(kept.length).toBeLessThan(10);
  });
});
