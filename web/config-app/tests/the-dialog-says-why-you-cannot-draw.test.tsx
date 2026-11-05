/**
 * The dialog SAYS what the slot is, in every state.
 *
 * Step 2 of `thoughts/shared/plans/2026-09-14-screens-one-page-one-dialog-design.md`.
 *
 * Until now the answer to "why can I not draw here" was computed four ways in
 * six places and rendered in none of them, so an artist looking at art they
 * could not change had nothing on screen telling them whether it was the
 * theme, the missing file or the format. One of those paragraphs said "The
 * board's own screen" even when the file belonged to another ARTIST.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScreenSlotBanner } from '../src/components/ScreenSlotBanner';
import { ALL_SLOT_STATES, type ScreenSlotState } from '../src/pages/screen-slot-state';

const drawn = (over: Partial<ScreenSlotState> = {}) => ({
  kind: 'yours-drawn', path: 'Themes/a/Node/BBSTITLE.SEQ', format: 'petscii',
  ...over,
}) as ScreenSlotState;

describe('the banner above a screen', () => {
  it('says something in every state the slot can be in', () => {
    for (const state of ALL_SLOT_STATES) {
      const { unmount } = render(<ScreenSlotBanner state={state} themeTitle="ansiguy's screens" />);
      expect(screen.getByTestId('screen-slot-sentence').textContent ?? '').toMatch(/\S/);
      unmount();
    }
  });

  it("names the OWNER of somebody else's screen, not the board", () => {
    render(
      <ScreenSlotBanner
        state={{ kind: 'theirs-drawn', path: 'Themes/skope/x.SEQ', format: 'petscii', owner: 'skope' }}
        themeTitle="ansiguy's screens"
      />,
    );
    expect(screen.getByTestId('screen-slot-sentence').textContent).toContain('skope');
  });

  it('offers to draw on an undrawn slot of your own', async () => {
    const onDraw = vi.fn();
    render(
      <ScreenSlotBanner
        state={{ kind: 'yours-undrawn', path: 'Themes/a/Node/BBSTITLE.SEQ', format: 'petscii' }}
        themeTitle="ansiguy's screens"
        onDraw={onDraw}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /Draw one here/ }));
    expect(onDraw).toHaveBeenCalled();
  });

  it("offers the board's copy as a starting point when there is one", async () => {
    const onCopyBoard = vi.fn();
    render(
      <ScreenSlotBanner
        state={{ kind: 'yours-undrawn', path: 'Themes/a/x.SEQ', format: 'petscii', boardCopy: 'Node1/BBSTITLE.SEQ' }}
        themeTitle="ansiguy's screens"
        onCopyBoard={onCopyBoard}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /Start from the board/ }));
    expect(onCopyBoard).toHaveBeenCalledWith('Node1/BBSTITLE.SEQ');
  });

  it('never draws a button the page cannot honour', () => {
    // The state permits draw and upload; the page passed neither handler.
    render(
      <ScreenSlotBanner
        state={{ kind: 'yours-undrawn', path: 'Themes/a/x.SEQ', format: 'petscii' }}
        themeTitle="ansiguy's screens"
      />,
    );
    expect(screen.queryByRole('button')).toBeNull();
    // ...and it still says what the slot is, which is the half that must never
    // disappear.
    expect(screen.getByTestId('screen-slot-sentence').textContent ?? '').toMatch(/\S/);
  });

  it('names the theme a redraw would land in, because that is the question', async () => {
    const onRedrawIntoMine = vi.fn();
    render(
      <ScreenSlotBanner
        state={drawn({ kind: 'boards-drawn' })}
        themeTitle="ansiguy's screens"
        onRedrawIntoMine={onRedrawIntoMine}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /Redraw this in ansiguy's screens/ }));
    expect(onRedrawIntoMine).toHaveBeenCalled();
  });

  it('an empty RIP slot says it is brought in, rather than hiding a button', () => {
    // RIP has no drawing surface on this board - the art comes out of
    // Illustrator and is converted - so the sentence has to carry that, or an
    // artist hunts for a Draw button that will never be there.
    render(
      <ScreenSlotBanner
        state={{ kind: 'yours-undrawn', path: 'Themes/a/bbstitle.rip', format: 'rip' }}
        themeTitle="ansiguy's screens"
        onDraw={vi.fn()}
        onUpload={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /Draw one here/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Upload a drawing/ })).toBeInTheDocument();
    expect(screen.getByTestId('screen-slot-sentence').textContent).toMatch(/brought in/);
  });
});
