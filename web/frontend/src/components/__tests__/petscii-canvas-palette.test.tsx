/**
 * Which sixteen colours the canvas paints with.
 *
 * A C64 is a VIC-II. The web terminal's 80-column screen is a C128's, whose
 * VDC has its own sixteen - so the canvas defaults to the palette the SCREEN
 * implies, and a caller who chose otherwise is passed his choice.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
import { PetsciiCanvas } from '../../../../../packages/terminal/src/petscii/PetsciiCanvas';
import {
  PetsciiMachine,
  WideScreenMachine,
  C64_PALETTE_COLODORE,
  C128_VDC_PALETTE,
} from '@amiexpress/bbs-door-sdk/petscii';
import { ctxByCanvas, installFakeCanvasContext, stubDocumentFonts, type FakeCtx } from './helpers/fake-canvas-ctx';

stubDocumentFonts();
beforeEach(() => { installFakeCanvasContext(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

/** The colour the border was filled with - the first fill of every paint. */
async function borderColour(machine: PetsciiMachine, palette?: readonly string[]): Promise<string> {
  const { container, unmount } = render(<PetsciiCanvas machine={machine} palette={palette} />);
  const canvas = container.querySelector('canvas')!;
  let ctx: FakeCtx | undefined;
  await waitFor(() => {
    ctx = ctxByCanvas.get(canvas);
    expect(ctx?.calls.some((c) => c.method === 'fillRect')).toBe(true);
  });
  // The border is the FIRST thing every paint fills, so the first colour
  // written to the context is the border's.
  const first = ctx!.calls.find((c) => c.method === 'fillStyle=');
  unmount();
  return String(first?.args[0] ?? '');
}

describe('the palette a PETSCII screen implies', () => {
  it('paints a C64 in VIC-II colours and the wide screen in the C128 VDC ones', async () => {
    // Border colour 6 is blue on a VIC-II and BLUE on the VDC too, so the
    // cell that tells them apart is one of the four surprises: colour 8,
    // orange on a C64 and magenta on a C128.
    const c64 = new PetsciiMachine();
    const wide = new WideScreenMachine();
    c64.state.border = 8;
    wide.state.border = 8;

    expect(C64_PALETTE_COLODORE[8]).not.toBe(C128_VDC_PALETTE[8]);
    expect(await borderColour(c64)).toBe(C64_PALETTE_COLODORE[8]);
    expect(await borderColour(wide)).toBe(C128_VDC_PALETTE[8]);
  });

  it('lets the caller overrule it', async () => {
    const wide = new WideScreenMachine();
    wide.state.border = 8;
    // A caller who prefers the C64's colours on the wide screen.
    expect(await borderColour(wide, C64_PALETTE_COLODORE)).toBe(C64_PALETTE_COLODORE[8]);
  });
});
