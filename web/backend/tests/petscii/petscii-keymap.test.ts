import { keyEventToPetscii } from '../../../../packages/terminal/src/petscii/keymap';

describe('keyEventToPetscii', () => {
  it('Enter -> $0D', () => expect(keyEventToPetscii('Enter', false)).toEqual([0x0D]));

  it('Backspace -> PETSCII DEL $14', () => expect(keyEventToPetscii('Backspace', false)).toEqual([0x14]));
  it('Delete -> PETSCII DEL $14', () => expect(keyEventToPetscii('Delete', false)).toEqual([0x14]));

  it('arrows -> $11/$91/$1D/$9D', () => {
    expect(keyEventToPetscii('ArrowDown', false)).toEqual([0x11]);
    expect(keyEventToPetscii('ArrowUp', false)).toEqual([0x91]);
    expect(keyEventToPetscii('ArrowRight', false)).toEqual([0x1D]);
    expect(keyEventToPetscii('ArrowLeft', false)).toEqual([0x9D]);
  });

  it('Home / Shift+Home -> $13 / $93', () => {
    expect(keyEventToPetscii('Home', false)).toEqual([0x13]);
    expect(keyEventToPetscii('Home', true)).toEqual([0x93]);
  });

  it('letters are case-swapped (ASCII a -> PETSCII $41)', () => {
    expect(keyEventToPetscii('a', false)).toEqual([0x41]);
    expect(keyEventToPetscii('A', true)).toEqual([0xC1]);
  });

  it('full lowercase range maps to $41-$5A', () => {
    expect(keyEventToPetscii('a', false)).toEqual([0x41]);
    expect(keyEventToPetscii('m', false)).toEqual([0x4D]);
    expect(keyEventToPetscii('z', false)).toEqual([0x5A]);
  });

  it('full uppercase range maps to $C1-$DA', () => {
    expect(keyEventToPetscii('A', true)).toEqual([0xC1]);
    expect(keyEventToPetscii('M', true)).toEqual([0xCD]);
    expect(keyEventToPetscii('Z', true)).toEqual([0xDA]);
  });

  it('F-keys map in exact C64 byte order', () => {
    expect(keyEventToPetscii('F1', false)).toEqual([0x85]);
    expect(keyEventToPetscii('F2', false)).toEqual([0x89]);
    expect(keyEventToPetscii('F3', false)).toEqual([0x86]);
    expect(keyEventToPetscii('F4', false)).toEqual([0x8A]);
    expect(keyEventToPetscii('F5', false)).toEqual([0x87]);
    expect(keyEventToPetscii('F6', false)).toEqual([0x8B]);
    expect(keyEventToPetscii('F7', false)).toEqual([0x88]);
    expect(keyEventToPetscii('F8', false)).toEqual([0x8C]);
  });

  it('digits and punctuation in 0x20-0x3F pass through unchanged', () => {
    expect(keyEventToPetscii('0', false)).toEqual([0x30]);
    expect(keyEventToPetscii('9', false)).toEqual([0x39]);
    expect(keyEventToPetscii(' ', false)).toEqual([0x20]);
    expect(keyEventToPetscii('!', false)).toEqual([0x21]);
    expect(keyEventToPetscii('/', false)).toEqual([0x2F]);
  });

  it('@[\\]^_ pass through unchanged', () => {
    expect(keyEventToPetscii('@', false)).toEqual([0x40]);
    expect(keyEventToPetscii('[', false)).toEqual([0x5B]);
    expect(keyEventToPetscii('\\', false)).toEqual([0x5C]);
    expect(keyEventToPetscii(']', false)).toEqual([0x5D]);
    expect(keyEventToPetscii('^', false)).toEqual([0x5E]);
    expect(keyEventToPetscii('_', false)).toEqual([0x5F]);
  });

  /**
   * Tab and Escape are NOT C64 keys, and they are mapped anyway.
   *
   * This assertion used to include Tab, alongside the modifiers and a glyph
   * PETSCII does not have - true of a C64 keyboard, and wrong for the thing
   * this function actually serves: a browser canvas driven by a real
   * keyboard, in front of doors that navigate with Tab and Escape. A PETSCII
   * caller could open the TetriNET lobby and not move around it.
   */
  it('the door navigation keys the canvas has, a C64 keyboard has not', () => {
    expect(keyEventToPetscii('Tab', false)).toEqual([0x09]);
    expect(keyEventToPetscii('Escape', false)).toEqual([0x1B]);
  });

  it('keys with no byte at all still return null', () => {
    expect(keyEventToPetscii('Shift', false)).toBeNull();
    expect(keyEventToPetscii('Control', false)).toBeNull();
    expect(keyEventToPetscii('{', false)).toBeNull();
  });
});
