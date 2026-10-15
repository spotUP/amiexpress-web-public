/**
 * A MODAL DOES NOT DIM THE SCREEN. A TERMINAL CANNOT.
 *
 * "the modals dim the screen that is not possible in a bbs, fix at sdk and
 * app level if needed" (sysop, 2026-09-16).
 *
 * A cell has a foreground, a background and an attribute. There is no alpha,
 * so nothing can be dimmed: the only way to make a cell darker is to REPAINT
 * it, which means deciding what it now says. What the Overlay used to do
 * instead was write an OSC `9999;overlay` and let the web client draw a
 * translucent rectangle over its canvas in CSS.
 *
 * That is an effect of the browser, not of the door - and a caller on telnet,
 * on SSH or on a C64 never saw it. The same door looked like two different
 * doors depending on how somebody dialled in, and the version that looked
 * "right" was the one no BBS can actually produce.
 *
 * So the rule is about what reaches the WIRE: whatever a door asks for, no
 * dimming instruction is written to the terminal. The overlay itself stays -
 * it catches clicks and holds focus while a modal is up, which is real work.
 */

import { Overlay } from '../../engines/ui/blessed/widgets/overlay';

/** An overlay with a screen that records every byte written to the wire. */
function anOverlay(options: Record<string, unknown> = {}): { overlay: any; written: string[] } {
  const written: string[] = [];
  const overlay: any = new Overlay({ ...options } as never);
  overlay.screen = {
    width: 80,
    height: 25,
    render: () => {},
    clearRegion: () => {},
    program: { write: (data: string) => { written.push(data); } },
  };
  return { overlay, written };
}

const OVERLAY_OSC = /\]9999;overlay/;

describe('showing a modal', () => {
  it('writes no dimming instruction to the terminal', () => {
    const { overlay, written } = anOverlay();
    overlay.show();
    expect(written.join('').match(OVERLAY_OSC)).toBeNull();
  });

  it('writes none when it is hidden again either', () => {
    const { overlay, written } = anOverlay();
    overlay.show();
    overlay.hide();
    expect(written.join('').match(OVERLAY_OSC)).toBeNull();
  });

  it('writes none however opaque a door asks it to be', () => {
    // A door may still carry an `opacity` - it is simply not a thing a
    // terminal can honour, so nothing goes out.
    const { overlay, written } = anOverlay({ opacity: 0.9 });
    overlay.show();
    overlay.setOpacity(0.5);
    expect(written.join('').match(OVERLAY_OSC)).toBeNull();
  });

  it('writes none when a dialog asks for a cutout', () => {
    // `setExclude` existed to punch the dialog out of the CSS dim. With no
    // dim there is nothing to punch, and nothing to send.
    const { overlay, written } = anOverlay();
    overlay.show();
    overlay.setExclude({ xi: 10, yi: 5, xl: 40, yl: 15 });
    expect(written.join('').match(OVERLAY_OSC)).toBeNull();
  });
});

describe('the overlay itself', () => {
  it('still answers for its opacity, because doors read it', () => {
    const { overlay } = anOverlay({ opacity: 0.4 });
    expect(typeof overlay.opacity).toBe('number');
  });

  it('is still a widget a modal can sit on', () => {
    // The point of keeping it: it catches clicks and holds focus while a
    // modal is up. Only the CSS effect went.
    const { overlay } = anOverlay();
    expect(typeof overlay.show).toBe('function');
    expect(typeof overlay.hide).toBe('function');
  });
});
