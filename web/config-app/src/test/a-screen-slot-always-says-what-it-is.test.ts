/**
 * A screen slot always says what it is, and always has a way forward.
 *
 * Step 1 of `thoughts/shared/plans/2026-09-14-screens-one-page-one-dialog-design.md`.
 *
 * The studio decided whether an artist may draw from FOUR hidden variables -
 * whose theme the file is in, whether the file exists, which format the slot
 * is, and `isNew` - read in six places and never shown. Three dead ends came
 * out of that in one evening, and the sysop's verdict was that the UX is a
 * failure and that he could not use the thing he commissioned.
 *
 * This module is the replacement: one pure function that says what a slot IS,
 * and one table saying what that state permits. The two properties at the
 * bottom of this file are the point - every one of those three bugs fails the
 * first of them.
 */
import { describe, expect, it } from 'vitest';
import {
  screenSlotState, slotAffordances, ALL_SLOT_STATES,
  type ScreenSlotInput,
} from '../pages/screen-slot-state';
import type { ArtistTheme } from '../pages/use-my-theme';
import type { ScreenIndexShape } from '../pages/screen-index-view';

const ansiguy: ArtistTheme = {
  slug: 'ansiguy', title: "ansiguy's screens", status: 'draft',
  dir: 'Themes/ansiguy', owner: 'ansiguy', screens: 1, mine: true,
};
const board: ArtistTheme = {
  slug: 'default', title: "The board's own screens", status: 'live',
  dir: '', owner: '', screens: 40, mine: false,
};

const SEQ = 'Themes/ansiguy/Node/BBSTITLE.SEQ';
const BOARD_SEQ = 'Node1/BBSTITLE.SEQ';

function indexWith(entries: Record<string, { theme?: string }>): ScreenIndexShape {
  const files = Object.fromEntries(
    Object.entries(entries).map(([relPath, extra]) => [relPath, { relPath, ...extra }]),
  );
  return { files } as unknown as ScreenIndexShape;
}

const drawn = { content: '', format: 'petscii' as const, bytes: 10 };

function input(over: Partial<ScreenSlotInput> = {}): ScreenSlotInput {
  return {
    path: SEQ,
    file: drawn,
    isLoading: false,
    theme: ansiguy,
    index: indexWith({ [SEQ]: { theme: 'ansiguy' } }),
    ...over,
  };
}

describe('what a screen slot is', () => {
  it('is loading while the answer is not known', () => {
    expect(screenSlotState(input({ isLoading: true })).kind).toBe('loading');
    expect(screenSlotState(input({ path: null })).kind).toBe('loading');
  });

  it('is yours when the file sits in the theme you are wearing', () => {
    expect(screenSlotState(input()).kind).toBe('yours-drawn');
  });

  it('is yours-and-undrawn when the theme owns the slot but no file is there', () => {
    // The sysop's case: Themes/ansiguy/Node/BBSTITLE.SEQ, nothing drawn.
    const state = screenSlotState(input({ file: undefined }));
    expect(state.kind).toBe('yours-undrawn');
  });

  it('names the board copy an undrawn slot could be started from', () => {
    const state = screenSlotState(input({
      file: undefined,
      index: indexWith({ [SEQ]: { theme: 'ansiguy' }, [BOARD_SEQ]: {} }),
    }));
    expect(state).toMatchObject({ kind: 'yours-undrawn', boardCopy: BOARD_SEQ });
  });

  it("is somebody else's when the file belongs to another theme", () => {
    const state = screenSlotState(input({
      path: 'Themes/skope/Node/BBSTITLE.SEQ',
      index: indexWith({ 'Themes/skope/Node/BBSTITLE.SEQ': { theme: 'skope' } }),
    }));
    expect(state).toMatchObject({ kind: 'theirs-drawn', owner: 'skope' });
  });

  it("is the board's own when the file carries no theme at all", () => {
    const state = screenSlotState(input({
      path: BOARD_SEQ,
      index: indexWith({ [BOARD_SEQ]: {} }),
    }));
    expect(state.kind).toBe('boards-drawn');
  });

  it("the board's screens ARE yours when you are wearing the board", () => {
    // `default` has no directory of its own, so a board screen is the file to
    // edit - comparing it to the slug called every board screen somebody
    // else's and offered to copy the board's art into the board.
    const state = screenSlotState(input({
      path: BOARD_SEQ,
      theme: board,
      index: indexWith({ [BOARD_SEQ]: {} }),
    }));
    expect(state.kind).toBe('yours-drawn');
  });

  it('is undrawable when the bytes are not art, and says why', () => {
    const state = screenSlotState(input({ file: { ...drawn, format: 'binary' } }));
    expect(state).toMatchObject({ kind: 'undrawable' });
    if (state.kind === 'undrawable') expect(state.reason).toMatch(/\S/);
  });
});

describe('what a slot lets you do', () => {
  it('offers upload but NOT drawing on an empty RIP slot', () => {
    // No drawing surface for RIP on this board; the art is converted from SVG.
    const { actions } = slotAffordances(screenSlotState(input({
      path: 'Themes/ansiguy/Node/bbstitle.rip',
      file: undefined,
      index: indexWith({ 'Themes/ansiguy/Node/bbstitle.rip': { theme: 'ansiguy' } }),
    })));
    expect(actions).toContain('upload');
    expect(actions).not.toContain('draw');
  });

  it('offers drawing and uploading on your own undrawn slot', () => {
    const { actions } = slotAffordances(screenSlotState(input({ file: undefined })));
    expect(actions).toContain('draw');
    expect(actions).toContain('upload');
  });

  it("offers a way to take somebody else's screen into your theme", () => {
    const state = screenSlotState(input({
      path: 'Themes/skope/Node/BBSTITLE.SEQ',
      index: indexWith({ 'Themes/skope/Node/BBSTITLE.SEQ': { theme: 'skope' } }),
    }));
    expect(slotAffordances(state).actions).toContain('redraw-into-mine');
  });

  it('never offers drawing on a screen that is not yours', () => {
    const state = screenSlotState(input({
      path: 'Themes/skope/Node/BBSTITLE.SEQ',
      index: indexWith({ 'Themes/skope/Node/BBSTITLE.SEQ': { theme: 'skope' } }),
    }));
    expect(slotAffordances(state).actions).not.toContain('draw');
  });
});

/*
 * THE TWO PROPERTIES. These are why the module exists.
 *
 * Every dead end found on 2026-09-14 - a .seq row that opened read-only with
 * no route onward, an undrawn .seq that offered only upload, a read-only view
 * with its way forward in a different paragraph - fails the first of them.
 */
describe('the properties that keep the studio usable', () => {
  it('no state is a dead end: every one offers at least one way forward', () => {
    for (const state of ALL_SLOT_STATES) {
      const { actions } = slotAffordances(state);
      expect(actions.length, `${state.kind} offers nothing`).toBeGreaterThan(0);
    }
  });

  it('no state is silent: every one says what it is, in a sentence', () => {
    for (const state of ALL_SLOT_STATES) {
      const { sentence } = slotAffordances(state);
      expect(sentence, `${state.kind} says nothing`).toMatch(/\S/);
      // A sentence, not a label: it has to read as an answer to "why".
      expect(sentence.length, `${state.kind} is too terse to explain anything`).toBeGreaterThan(4);
    }
  });

  it('covers every state the union can hold, so a new one cannot be forgotten', () => {
    const kinds = new Set(ALL_SLOT_STATES.map(s => s.kind));
    expect([...kinds].sort()).toEqual([
      'boards-drawn', 'loading', 'theirs-drawn', 'undrawable', 'yours-drawn', 'yours-undrawn',
    ]);
  });
});
