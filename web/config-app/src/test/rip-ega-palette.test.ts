/**
 * The palette the editor indexes into.
 *
 * RipScreenEditor draws a swatch per EGA colour and writes the INDEX into the
 * file's `1B` button style, so the count is part of the contract: sixteen
 * swatches, indexes 0-15, which is what RIP's colour arguments hold. The
 * editor's own tests mock the terminal package to keep a canvas-bound vendor
 * out of jsdom, so this is the one place that reads the real thing.
 */
import { describe, expect, it } from 'vitest';
import { EGA_PALETTE } from '../../../../packages/terminal/src/rip/RIPTypes';

describe('the EGA palette a RIP screen names its colours from', () => {
  it('has the sixteen entries RIP colour arguments can express', () => {
    expect(EGA_PALETTE).toHaveLength(16);
  });

  it('gives every index a colour the browser can paint', () => {
    for (const css of EGA_PALETTE) expect(css).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
});
