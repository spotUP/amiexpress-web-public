/**
 * Editor clipboard: Alt+C lifts the select-tool marquee, Alt+V stamps it at
 * the cursor, Alt+X lifts and blanks. Through the SDK's own
 * copySelection/pasteSelection - one undo step each, cloned cells.
 */
import { describe, expect, it } from 'vitest';
import { editorShortcut } from './editor-shortcuts';
import {
  blankCanvas, createSurface, pointerToCanvas, typeText,
  copySelectedRegion, pasteRegion, cutSelectedRegion, undo,
  selectedRegionToText, pasteText,
  type EditorSurface,
} from '../pages/screen-editor-state';

/** A surface with "AB" on row 1 and a 2x1 marquee committed over it. */
function selectedAb(): EditorSurface {
  let s = createSurface(blankCanvas(25, 80));
  s = typeText({ ...s, fg: 7, bg: 0 }, 0, 1, 'AB');
  const selecting = { ...s, tool: 'select' as const };
  let d = pointerToCanvas(selecting, 0, 1, 'down');
  d = pointerToCanvas(d, 1, 1, 'move');
  return pointerToCanvas(d, 1, 1, 'up');
}

describe('editorShortcut clipboard keys', () => {
  it('maps Alt+C/X/V, leaving tool letters alone', () => {
    expect(editorShortcut({ key: 'c', code: 'KeyC', altKey: true })).toEqual({ action: 'copy' });
    expect(editorShortcut({ key: 'x', code: 'KeyX', altKey: true })).toEqual({ action: 'cut' });
    expect(editorShortcut({ key: 'v', code: 'KeyV', altKey: true })).toEqual({ action: 'paste' });
    expect(editorShortcut({ key: 's', code: 'KeyS', altKey: true })).toEqual({ action: 'tool', tool: 'select' });
  });
  it('maps Cmd/Ctrl+C/X/V for Mac hands', () => {
    expect(editorShortcut({ key: 'c', code: 'KeyC', metaKey: true })).toEqual({ action: 'copy' });
    expect(editorShortcut({ key: 'x', code: 'KeyX', metaKey: true })).toEqual({ action: 'cut' });
    expect(editorShortcut({ key: 'v', code: 'KeyV', metaKey: true })).toEqual({ action: 'paste' });
    expect(editorShortcut({ key: 'c', code: 'KeyC', ctrlKey: true })).toEqual({ action: 'copy' });
  });
  it('erases with Backspace as well as Delete', () => {
    expect(editorShortcut({ key: 'Delete' })).toEqual({ action: 'delete' });
    expect(editorShortcut({ key: 'Backspace' })).toEqual({ action: 'delete' });
  });
});

describe('copy/paste/cut regions', () => {
  it('copies nothing with no marquee', () => {
    expect(copySelectedRegion(createSurface(blankCanvas(25, 80)))).toBeNull();
  });
  it('copies the marquee as a clone', () => {
    const s = selectedAb();
    const region = copySelectedRegion(s);
    expect(region?.map(r => r.map(c => c.char).join(''))).toEqual(['AB']);
    region![0][0].char = 'Z';
    expect(s.canvas[1][0].char).toBe('A');
  });
  it('pastes at a cell and undoes in one step', () => {
    const s = selectedAb();
    const region = copySelectedRegion(s)!;
    const pasted = pasteRegion(s, 10, 5, region);
    expect(pasted.canvas[5][10].char).toBe('A');
    expect(pasted.canvas[5][11].char).toBe('B');
    expect(pasted.canvas[1][0].char).toBe('A');
    const undone = undo(pasted);
    expect(undone.canvas[5][10].char).toBe(' ');
    expect(undone.canvas[1][0].char).toBe('A');
  });
  it('cuts: lifts and blanks, undo restores', () => {
    const s = selectedAb();
    const { surface, region } = cutSelectedRegion(s);
    expect(region?.map(r => r.map(c => c.char).join(''))).toEqual(['AB']);
    expect(surface.canvas[1][0].char).toBe(' ');
    expect(surface.canvas[1][1].char).toBe(' ');
    const undone = undo(surface);
    expect(undone.canvas[1][0].char).toBe('A');
    expect(undone.canvas[1][1].char).toBe('B');
  });
  it('cuts nothing with no marquee', () => {
    const s = createSurface(blankCanvas(25, 80));
    expect(cutSelectedRegion(s).region).toBeNull();
  });
});

describe('system clipboard text', () => {
  it('reads the marquee as trimmed text rows', () => {
    expect(selectedRegionToText(selectedAb())).toBe('AB');
  });
  it('reads nothing with no marquee', () => {
    expect(selectedRegionToText(createSurface(blankCanvas(25, 80)))).toBeNull();
  });
  it('stamps system text in current colours and undoes in one step', () => {
    const s = selectedAb();
    const pasted = pasteText({ ...s, fg: 2, bg: 4 }, 10, 5, 'Hi\nYo');
    expect(pasted.canvas[5][10]).toMatchObject({ char: 'H', fg: 2, bg: 4 });
    expect(pasted.canvas[6][10].char).toBe('Y');
    expect(pasted.canvas[6][11].char).toBe('o');
    const undone = undo(pasted);
    expect(undone.canvas[5][10].char).toBe(' ');
    expect(undone.canvas[1][0].char).toBe('A');
  });
  it('clips system text at the canvas edge', () => {
    const s = createSurface(blankCanvas(25, 80));
    const pasted = pasteText(s, 79, 24, 'AB\nCD');
    expect(pasted.canvas[24][79].char).toBe('A');
    expect(pasted.canvas).toHaveLength(25);
  });
});
