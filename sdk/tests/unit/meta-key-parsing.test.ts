/**
 * Alt + a special key has to arrive as one key, with its own name.
 *
 * Reported 2026-09-01, after the browser was taught to send ESC + CR for
 * Alt+Enter: "nothing happens when i toggle it never goes fullscreen now".
 * The bytes were leaving the browser correctly and the doors were binding
 * the key the SDK documents (TERMINAL_MODE_HOTKEY = 'M-enter'), and two
 * things in this parser stood between them:
 *
 *   1. The escape-sequence regex accepted ESC + LETTER OR DIGIT only, so
 *      ESC + CR was not a sequence at all: the buffer produced an Escape
 *      keypress and then an Enter keypress. In a door that is "close the
 *      dialog, then send the message" - two commands nobody asked for.
 *   2. parseKey's meta branch named the raw second byte, so even when a
 *      sequence did form, Alt+Enter was 'M-\r' and Alt+Tab was 'M-\t'.
 *      Nothing binds those, and nothing ever could.
 *
 * Alt + a printable character was never affected, which is why this has sat
 * here since the parser was written: 'M-c' and 'M-b' are what the ANSI
 * editor uses, and they always worked.
 */

import { Screen } from '../../engines/ui/blessed/core/screen';

interface Seen { full: string; name: string; meta: boolean }

/**
 * The keys the PARSER produced, in order.
 *
 * Listening on the program rather than the screen: the screen re-emits the
 * same keypress to its own listeners and down the focus chain, so a screen
 * listener sees each key several times and says nothing about parsing.
 */
function keysFrom(bytes: string): Seen[] {
  const screen: any = new Screen({ title: 'meta-keys', responsive: true, width: 100, height: 30 } as any);
  const seen: Seen[] = [];
  const program: any = screen.program;
  const listener = (_ch: unknown, key: any) => {
    seen.push({ full: key?.full, name: key?.name, meta: Boolean(key?.meta) });
  };
  program.on('keypress', listener);
  try {
    // The real path. Calling _handleData() directly skips the re-entry
    // guard the 'data' listener sets, and _emitKey re-emits 'data' - so a
    // direct call parses the same bytes three times over and says nothing
    // about what a keystroke does in a running door.
    program.emit('data', bytes);
  } finally {
    program.removeListener?.('keypress', listener);
    screen.destroy();
  }
  return seen;
}

describe('meta key parsing', () => {
  it('reads Alt+Enter as one key called M-enter', () => {
    expect(keysFrom('\x1b\r')).toEqual([{ full: 'M-enter', name: 'enter', meta: true }]);
  });

  it('does not split it into Escape and Enter', () => {
    // The reported symptom: a door saw its dialog close and its message
    // sent, and never saw the key it was listening for.
    const names = keysFrom('\x1b\r').map(k => k.name);
    expect(names).not.toContain('escape');
  });

  it('reads Alt+Tab and Alt+Backspace by name too', () => {
    expect(keysFrom('\x1b\t')).toEqual([{ full: 'M-tab', name: 'tab', meta: true }]);
    expect(keysFrom('\x1b\x7f')).toEqual([{ full: 'M-backspace', name: 'backspace', meta: true }]);
  });

  it('leaves Alt+letter exactly as it was', () => {
    // The ANSI editor's colour pickers are Alt+C and Alt+B.
    expect(keysFrom('\x1bc')).toEqual([{ full: 'M-c', name: 'c', meta: true }]);
    expect(keysFrom('\x1bb')).toEqual([{ full: 'M-b', name: 'b', meta: true }]);
  });

  it('does not turn a lone Escape into a meta key', () => {
    // A bare ESC is held back in case more bytes follow, so what matters
    // here is only that nothing claims a modifier that was not pressed.
    expect(keysFrom('\x1b').every(k => !k.meta)).toBe(true);
  });

  it('still reads a bare Enter as Enter', () => {
    expect(keysFrom('\r')).toEqual([{ full: 'enter', name: 'enter', meta: false }]);
  });

  it('names Alt+Ctrl+key with both modifiers rather than a control byte', () => {
    const [key] = keysFrom('\x1b\x18');   // Alt+Ctrl+X
    expect(key.name).toBe('x');
    expect(key.full).toBe('M-C-x');
  });

  it('reaches a handler bound the way the doors bind it', () => {
    // The whole point: sdk/utils/terminal-mode.ts binds 'M-enter'.
    const screen: any = new Screen({ title: 'bound', responsive: true, width: 100, height: 30 } as any);
    let fired = 0;
    screen.key(['M-enter'], () => { fired++; });
    try {
      (screen.program as any).emit('data', '\x1b\r');
    } finally {
      screen.destroy();
    }
    expect(fired).toBe(1);
  });
});
