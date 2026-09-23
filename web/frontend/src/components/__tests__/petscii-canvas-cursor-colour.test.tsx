/**
 * THE CURSOR IS THE TERMINAL'S, NOT THE C64's.
 *
 * Sysop, 2026-09-15: "i get a white cursor in the petscii mode. make it red
 * like the ansi mode". The canvas painted the cursor in the COLOUR RAM under
 * it - white on a fresh screen, and whatever the last PETSCII colour code
 * said once the caller had typed - so the same board showed two different
 * cursors depending on which mode you had chosen, and the PETSCII one moved
 * around the palette as you went.
 *
 * It takes the ANSI terminal's own theme colour now, from the same constant,
 * so the two modes cannot drift apart again. An editor can still ask for the
 * old behaviour with `cursorColour="ink"`.
 *
 * AND A LIVE SESSION ASKS FOR `"pen"`, which is a third thing: the colour the
 * NEXT character will be. A PETSCII caller types in sixteen colours now and a
 * colour chord prints nothing, so `"ink"` cannot answer it - colour RAM only
 * moves when something is printed. "the cursor needs to change color so i see
 * that i change color" (the sysop, 2026-09-23), which supersedes the red
 * cursor he asked for above.
 *
 * jsdom has no rasterizer, so this asserts on the recording context double:
 * the cursor's fill is the only one a single character cell wide.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { act } from 'react';
import { render, cleanup } from '@testing-library/react';
import { PetsciiCanvas } from '../../../../../packages/terminal/src/petscii/PetsciiCanvas';
import { XTERM_CONFIG } from '../../../../../packages/terminal/src/utils/terminal-utils';
import { PetsciiMachine } from '@amiexpress/bbs-door-sdk/petscii';

import {
  ctxByCanvas,
  installFakeCanvasContext,
  stubDocumentFonts,
  type FakeCtx,
} from './helpers/fake-canvas-ctx';

stubDocumentFonts();

const DEST_CELL = 8;

beforeEach(() => {
  vi.useFakeTimers();
  installFakeCanvasContext();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** The fillStyle in force when the one-cell-wide fill was issued. */
function cursorFillStyles(ctx: FakeCtx): string[] {
  const styles: string[] = [];
  let current = '';
  for (const call of ctx.calls) {
    if (call.method === 'fillStyle=') current = String(call.args[0]);
    if (call.method === 'fillRect' && call.args[2] === DEST_CELL && call.args[3] === DEST_CELL) {
      styles.push(current);
    }
  }
  return styles;
}

async function mount(props: Record<string, unknown> = {}) {
  const machine = new PetsciiMachine();
  const view = render(<PetsciiCanvas machine={machine} cursorVisible {...props} />);
  await act(async () => { await Promise.resolve(); });
  const canvas = view.container.querySelector('canvas')!;
  return { ctx: ctxByCanvas.get(canvas)!, machine };
}

describe('PetsciiCanvas: the cursor is the board\'s cursor colour', () => {
  it('paints it in the ANSI terminal theme\'s colour, not the colour RAM', async () => {
    const { ctx } = await mount();
    const styles = cursorFillStyles(ctx);
    expect(styles.length).toBeGreaterThan(0);
    // RED on the old code: the colour RAM of a fresh screen is white.
    expect(styles.every((s) => s.toLowerCase() === XTERM_CONFIG.theme.cursor.toLowerCase())).toBe(true);
    expect(styles[0].toLowerCase()).not.toBe('#ffffff');
  });

  it('takes the PEN when a live session asks, so a colour chord is visible', async () => {
    const { ctx, machine } = await mount({ cursorColour: 'pen' });
    const before = cursorFillStyles(ctx).length;

    // Ctrl+3 on a C64 keyboard: the RED colour byte. Nothing is printed by
    // it, which is the whole reason `ink` cannot show it.
    await act(async () => {
      machine.feed([0x1c]);
      await Promise.resolve();
    });
    vi.advanceTimersByTime(600);
    await act(async () => { await Promise.resolve(); });

    const styles = cursorFillStyles(ctx);
    expect(styles.length).toBeGreaterThan(before);
    expect(styles[styles.length - 1].toLowerCase()).not.toBe(styles[0].toLowerCase());
  });

  it('still takes the cell\'s own ink when an editor asks for it', async () => {
    const { ctx } = await mount({ cursorColour: 'ink' });
    const styles = cursorFillStyles(ctx);
    expect(styles.length).toBeGreaterThan(0);
    // A fresh machine's colour RAM is the C64's own white.
    expect(styles[0].toLowerCase()).not.toBe(XTERM_CONFIG.theme.cursor.toLowerCase());
  });
});
