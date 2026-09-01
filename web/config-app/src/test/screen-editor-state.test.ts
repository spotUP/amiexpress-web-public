/**
 * Drawing on a screen, through the SDK's tools rather than around them.
 *
 * Every assertion here is really about delegation: the door's editor and the
 * browser's have to draw the same line, so a tool reimplemented in the admin
 * is the defect this whole phase exists to avoid. What IS the admin's own
 * problem is React - a surface is replaced, not mutated, and the SDK's undo
 * history is keyed on one EditorState instance, so the instance has to survive
 * every replacement.
 */
import { describe, expect, it } from 'vitest';
import {
  createSurface, pointerToCanvas, typeCharacter, typeText, undo, redo,
} from '../pages/screen-editor-state';
import { createCanvas, getCell } from '@amiexpress/bbs-door-sdk/engines/ui/ansi-editor/core/canvas';

describe('drawing on a screen', () => {
  it('a pointer down with the draw tool paints one cell in the chosen colour', () => {
    const surface = { ...createSurface(createCanvas(8, 4)), tool: 'draw' as const, fg: 12, char: '█' };

    const after = pointerToCanvas(surface, 2, 1, 'down');

    expect(getCell(after.canvas, 2, 1)).toMatchObject({ char: '█', fg: 12 });
  });

  it('a drag paints every cell it crosses', () => {
    const surface = { ...createSurface(createCanvas(8, 4)), tool: 'draw' as const, fg: 9, char: '#' };

    const drawn = ['down', 'move', 'up'].reduce<ReturnType<typeof createSurface>>(
      (acc, phase, index) => pointerToCanvas(acc, index, 0, phase as 'down' | 'move' | 'up'),
      surface,
    );

    expect(getCell(drawn.canvas, 0, 0)?.char).toBe('#');
    expect(getCell(drawn.canvas, 1, 0)?.char).toBe('#');
  });

  it('typing puts the character where the cursor is, in the current colours', () => {
    const surface = { ...createSurface(createCanvas(8, 4)), fg: 14, bg: 1 };

    const after = typeCharacter(surface, 3, 2, 'X');

    expect(getCell(after.canvas, 3, 2)).toMatchObject({ char: 'X', fg: 14, bg: 1 });
  });

  it('undo puts the cell back the way it was, and redo returns it', () => {
    const start = { ...createSurface(createCanvas(8, 4)), tool: 'draw' as const, fg: 9, char: '#' };
    const drawn = pointerToCanvas(start, 1, 1, 'down');

    expect(getCell(undo(drawn).canvas, 1, 1)?.char).not.toBe('#');
    expect(getCell(redo(undo(drawn)).canvas, 1, 1)?.char).toBe('#');
  });

  it('undo unwinds typing one character at a time', () => {
    const surface = createSurface(createCanvas(8, 4));
    const typed = typeCharacter(typeCharacter(surface, 0, 0, 'H'), 1, 0, 'I');

    const back = undo(typed);

    expect(getCell(back.canvas, 0, 0)?.char).toBe('H');
    expect(getCell(back.canvas, 1, 0)?.char).not.toBe('I');
  });

  it('undo on an untouched screen changes nothing and does not throw', () => {
    const surface = createSurface(createCanvas(4, 2));

    expect(() => undo(surface)).not.toThrow();
    expect(getCell(undo(surface).canvas, 0, 0)?.char).toBe(' ');
  });

  it('the line tool draws from the down cell to the up cell, not one dot', () => {
    const surface = { ...createSurface(createCanvas(8, 4)), tool: 'line' as const, fg: 15, char: '█' };

    const drawn = pointerToCanvas(pointerToCanvas(surface, 0, 0, 'down'), 4, 0, 'up');

    expect(getCell(drawn.canvas, 2, 0)?.char).toBe('█');
  });

  it('the fill tool floods, so one click is not one cell', () => {
    const surface = { ...createSurface(createCanvas(4, 2)), tool: 'fill' as const, fg: 10, char: '█' };

    const filled = pointerToCanvas(pointerToCanvas(surface, 0, 0, 'down'), 0, 0, 'up');

    expect(getCell(filled.canvas, 3, 1)?.char).toBe('█');
  });

  it('the pick tool hands the cell it picked back to the surface', () => {
    const drawn = pointerToCanvas(
      { ...createSurface(createCanvas(8, 4)), tool: 'draw' as const, fg: 13, bg: 2, char: '#' },
      1, 1, 'down',
    );

    const picked = pointerToCanvas({ ...drawn, tool: 'pick' as const }, 1, 1, 'down');

    expect(picked).toMatchObject({ fg: 13, bg: 2, char: '#' });
  });

  it('writes a whole MCI code at once, and undoes it at once', () => {
    const surface = createSurface(createCanvas(20, 2));

    const inserted = typeText(surface, 2, 1, '~CL.');

    expect([0, 1, 2, 3].map(i => getCell(inserted.canvas, 2 + i, 1)?.char).join('')).toBe('~CL.');
    // One undo, not four: an inserted code is one thing the sysop did.
    expect(getCell(undo(inserted).canvas, 2, 1)?.char).toBe(' ');
  });

  it('hands React a new canvas each time, because the SDK draws in place', () => {
    const surface = { ...createSurface(createCanvas(4, 2)), tool: 'draw' as const, char: '#' };

    const after = pointerToCanvas(surface, 0, 0, 'down');

    expect(after.canvas).not.toBe(surface.canvas);
    expect(getCell(surface.canvas, 0, 0)?.char).toBe(' ');
  });

  it('keeps one undo history across the surfaces React replaces', () => {
    // The SDK keys undo on the EditorState instance through a WeakMap. A
    // surface that built a fresh state per change would have an empty history
    // every time and undo would silently do nothing.
    const first = typeCharacter(createSurface(createCanvas(4, 2)), 0, 0, 'A');
    const second = typeCharacter({ ...first, fg: 3 }, 1, 0, 'B');

    expect(second.state).toBe(first.state);
    expect(getCell(undo(second).canvas, 0, 0)?.char).toBe('A');
  });
});
