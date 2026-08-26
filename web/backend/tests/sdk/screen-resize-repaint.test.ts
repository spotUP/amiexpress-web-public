/**
 * A resized screen repaints everything, not just what changed.
 *
 * Reported 2026-08-26 with a screenshot: resizing the browser on /chat left
 * the LiveChat UI black, and moving the mouse drew panel outlines back in
 * one region at a time.
 *
 * That pattern - blank, then filling in piecemeal wherever something is
 * invalidated - is the signature of a differential renderer working from a
 * false record. realloc() COPIES the old lastBuffer into the new one, so
 * after a resize the renderer believes the terminal still shows what it
 * showed before, and emits only the cells that differ from a screen that no
 * longer exists. The terminal itself has been cleared, or reflowed by the
 * browser, and shows nothing.
 *
 * After a resize, lastBuffer is not evidence of anything.
 */

import { Screen, Box } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

/** A screen whose terminal output is captured rather than written out. */
function screenWithCapture(width: number, height: number) {
  const written: string[] = [];
  const screen = new Screen({
    title: 'resize repaint test',
    width,
    height,
    output: (data: string) => written.push(data),
  } as any);
  return { screen, written };
}

const MARKER = 'PANEL-CONTENT';

function panel(screen: any) {
  return new Box({
    parent: screen,
    top: 0,
    left: 0,
    width: 30,
    height: 5,
    content: MARKER,
    tags: false,
  } as any);
}

describe('after a resize', () => {
  it('writes the existing content out again', () => {
    const { screen, written } = screenWithCapture(80, 24);
    panel(screen);
    screen.render();

    written.length = 0;            // everything from here on is the resize
    screen.resize(100, 30);

    expect(written.join('')).toContain(MARKER);
  });

  it('repaints on a resize that changes only the height', () => {
    const { screen, written } = screenWithCapture(80, 24);
    panel(screen);
    screen.render();

    written.length = 0;
    screen.resize(80, 30);

    expect(written.join('')).toContain(MARKER);
  });

  it('repaints when shrinking as well as growing', () => {
    // Shrinking clears the terminal, so a differential render there leaves
    // the screen black - exactly the reported screenshot.
    const { screen, written } = screenWithCapture(100, 30);
    panel(screen);
    screen.render();

    written.length = 0;
    screen.resize(80, 24);

    expect(written.join('')).toContain(MARKER);
  });

  it('does not repaint when the size did not actually change', () => {
    // The full repaint is for resizes; a no-op resize must stay a no-op, or
    // every stray resize event costs a whole screen of output.
    const { screen, written } = screenWithCapture(80, 24);
    panel(screen);
    screen.render();

    written.length = 0;
    screen.resize(80, 24);

    expect(written.join('')).toBe('');
  });

  it('tells its elements to lay out again', () => {
    // The door repositions its panels from this event; it must arrive
    // before the repaint, or the repaint draws the old layout.
    const { screen } = screenWithCapture(80, 24);
    let sizeWhenNotified = '';
    screen.on('resize', () => {
      sizeWhenNotified = `${(screen as any).width}x${(screen as any).height}`;
    });

    screen.resize(100, 30);

    expect(sizeWhenNotified).toBe('100x30');
  });
});
