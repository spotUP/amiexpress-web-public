/**
 * "it should work just like the screen view" (sysop, 2026-11-04): a door slot
 * has to answer "Draw as" and "still to draw" the way a screen does, and to
 * refuse to show art that does not exist.
 */
import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';

import { buildDoorArtCards, isStillToDraw, type DoorArtSection } from '../../src/pages/door-art-view';

const slot = (over: Partial<DoorArtSection> = {}): DoorArtSection => ({
  file: 'Bulls.CFG', section: 'title', label: 'Title logo', lines: 4,
  maxLines: 10, maxLineLength: 79, ...over,
});

const card = (over: Partial<DoorArtSection>, format = '') =>
  buildDoorArtCards([{ command: 'MT', name: 'MegaTop', sections: [slot(over)] }], format, new QueryClient())[0];

describe('door art cards', () => {
  it('names the door and slot, and stays findable by command and file', () => {
    expect(card({}).label).toBe('MegaTop - Title logo');
    expect(card({}).path).toBe('MT/Bulls.CFG [title]');
    expect(card({}).detail).toBe('4 of 10 rows');
  });

  it('marks an empty slot and a lost file as work, and draws neither', () => {
    expect(isStillToDraw(card({ lines: 0 }))).toBe(true);
    expect(card({ lines: 0 }).badge?.label).toBe('Not drawn yet');
    expect(card({ missing: true }).problem).toBe(true);
    expect(card({ missing: true }).detail).toBe('File not there any more');
    expect(isStillToDraw(card({}))).toBe(false);
  });

  it('shows the narrow drawing when one exists and says so when none does', () => {
    const drawn = card({ variants: { c64: true } }, 'petscii');
    expect(drawn.missingFormat).toBeUndefined();
    expect(drawn.source?.queryKey).toContain('c64');

    expect(card({}, 'petscii').missingFormat).toBe('PETSCII');
    expect(card({}, 'teletext').missingFormat).toBe('Teletext');
    expect(card({ variants: { c64: true } }, 'rip').missingFormat).toBe('RIP');
    expect(isStillToDraw(card({}, 'petscii'))).toBe(true);
  });

  it('falls back to the native page for teletext', () => {
    const native = card({ variants: { tti: true } }, 'teletext');
    expect(native.format).toBe('teletext-native');
    expect(native.source?.queryKey).toContain('tti');
  });

  it('keys every card under door-art, which is what a save invalidates', () => {
    expect(card({}).source?.queryKey[0]).toBe('door-art');
    expect(card({ variants: { ttx: true } }, 'teletext').source?.queryKey[0]).toBe('door-art');
  });
});
