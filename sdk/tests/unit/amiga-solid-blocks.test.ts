/**
 * A solid block keeps its colour on a terminal that cannot draw one.
 *
 * Reported from a telnet session, 2026-09-02: "it degrades the bg blocks etc
 * in gmaster to # - it can use ansi bg colors like the web client version".
 *
 * Two faults were behind that single "#".
 *
 * SPARKLINE_CHARS ends in the full block, and the sparkline branch ran first,
 * so EVERY solid block in every door - a playfield cell, a bar, a filled
 * panel - was read as the top bar of a sparkline and replaced with "#". The
 * block's own fallback entry was never reached.
 *
 * And that fallback would not have been right either: it hardcoded a white
 * background, so a red piece would have come out white, and it closed with
 * ESC[0m - a full reset that threw away the foreground colour and every
 * attribute the door had set, for the rest of the line.
 *
 * Reverse video fixes both: one space with ESC[7m fills the cell in whatever
 * colour the door was already writing, which is what the block looked like on
 * the web client, and ESC[27m ends it without touching anything else.
 */

import { convertForAmiga } from '../../utils/blessed-helpers';

const ESC = '\x1b';

describe('solid blocks on a non-Unicode terminal', () => {
  it('fills the cell instead of printing a hash', () => {
    const out = convertForAmiga('█');
    expect(out).not.toContain('#');
    expect(out).toBe(`${ESC}[7m ${ESC}[27m`);
  });

  it('keeps the colour the door was drawing in', () => {
    // A red block must still be RED - the door sets the colour, the block
    // just fills the cell.
    const out = convertForAmiga(`${ESC}[31m█${ESC}[0m`);
    expect(out.startsWith(`${ESC}[31m`)).toBe(true);
    expect(out).toContain(`${ESC}[7m ${ESC}[27m`);
    // No colour of its own is invented anywhere in the replacement.
    expect(out).not.toContain(`${ESC}[47m`);
  });

  it('treats the black square the same way', () => {
    expect(convertForAmiga('■')).toBe(`${ESC}[7m ${ESC}[27m`);
  });

  it('still renders a real sparkline as ASCII bars', () => {
    // The lower bars are genuinely sparkline characters and must not become
    // filled cells.
    const out = convertForAmiga('▁▂▃');
    expect(out).not.toContain(`${ESC}[7m`);
  });

  it('does not reset the foreground after a shaded cell', () => {
    // The shade fallbacks set a background; they must restore the default
    // background only (ESC[49m), never ESC[0m, or the text after them loses
    // the door's colour.
    const out = convertForAmiga(`${ESC}[32m▒text`);
    expect(out).toContain(`${ESC}[49m`);
    expect(out).not.toContain(`${ESC}[0m`);
    expect(out.endsWith('text')).toBe(true);
  });
});
