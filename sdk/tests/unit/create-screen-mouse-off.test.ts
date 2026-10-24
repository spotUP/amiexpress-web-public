/**
 * A door that never asks for the mouse must not switch mouse reporting on.
 *
 * createScreen() used to call screen.enableMouse() for every door, which
 * writes ?1000h ?1003h ?1006h. ?1003h is all-motion tracking, so merely
 * hovering over the caller's terminal sent reports: the sysop saw mouse
 * reporting in the board after the Tip of the day door (2026-10-24), a door
 * that passes enableMouse: false. A door that wants the mouse opts in through
 * DoorInputManager({ enableMouse: true }), which switches it on itself.
 */
import { createScreen } from '../../utils/blessed-helpers';

function fakeBbs(out: string[]) {
  return {
    write: (data: string) => { out.push(data); },
    getTerminalSize: () => ({ width: 80, height: 25 }),
    unicodeCapable: true,
    connectionType: 'telnet',
  };
}

describe('createScreen mouse reporting', () => {
  it('does not switch mouse reporting on for a door that never asked', () => {
    const out: string[] = [];
    const screen = createScreen(fakeBbs(out), { title: 'Tip of the day' });
    screen.render();
    const wire = out.join('');
    expect(wire).not.toContain('\x1b[?1003h');
    expect(wire).not.toContain('\x1b[?1000h');
    screen.destroy();
  });

  it('still switches it on when the door enables the mouse', () => {
    const out: string[] = [];
    const screen = createScreen(fakeBbs(out), { title: 'Mouse door' });
    screen.enableMouse();
    expect(out.join('')).toContain('\x1b[?1000h');
    screen.destroy();
  });
});

describe('mouse toggle key', () => {
  it('does not switch mouse reporting on in a door that never asked', () => {
    const out: string[] = [];
    const screen = createScreen(fakeBbs(out), { title: 'Tip of the day' });
    screen.program.emit('keypress', null, { full: 'f12', name: 'f12' });
    expect(screen.program.isMouseEnabled()).toBe(false);
    expect(out.join('')).not.toContain('\x1b[?1003h');
    screen.destroy();
  });

  it('releases and restores a mouse door capture', () => {
    const out: string[] = [];
    const screen = createScreen(fakeBbs(out), { title: 'Mouse door' });
    screen.enableMouse();
    screen.program.emit('keypress', null, { full: 'f12', name: 'f12' });
    expect(screen.program.isMouseEnabled()).toBe(false);
    screen.program.emit('keypress', null, { full: 'f12', name: 'f12' });
    expect(screen.program.isMouseEnabled()).toBe(true);
    screen.destroy();
  });
});
