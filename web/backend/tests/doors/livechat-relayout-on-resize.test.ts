/**
 * LiveChat relays out when the terminal changes size.
 *
 * Reported 2026-08-26: "http://localhost:3001/chat doesn't redraw after a
 * browser window resize."
 *
 * The chain from the browser was intact - the page emits terminal-size, the
 * backend forwards screen:resize, and the SDK's Screen reallocates its
 * buffers, invalidates coordinate caches and renders. What was missing was
 * the last step: the DOOR's panels are positioned by updateLayout(), and
 * that was bound to sidebar events only, so the screen changed size
 * underneath a layout that never recomputed.
 *
 * An earlier fix had made the door lay itself out ONCE at startup, because
 * it used to depend on a resize event arriving after it opened. Both are
 * needed: the one-shot answers "what size am I now", the binding answers
 * "what size did I just become". This test exists so the second one is not
 * dropped again while fixing the first.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const DOOR = join(__dirname, '..', '..', '..', '..', 'Doors', 'livechat');
const server = readFileSync(join(DOOR, 'server.ts'), 'utf8');
const helpers = readFileSync(
  join(__dirname, '..', '..', '..', '..', 'sdk', 'utils', 'blessed-helpers.ts'),
  'utf8'
);

describe('the door', () => {
  it('lays out once at startup', () => {
    // Without this it opens on top of itself when the terminal settles its
    // size before the door starts.
    expect(server).toMatch(/^  updateLayout\(\);$/m);
  });

  it('lays out again on every screen resize', () => {
    expect(server).toMatch(/screen\.on\('resize', updateLayout\)/);
  });

  it('reads the live screen size when it lays out', () => {
    // A layout that captured the size at construction would recompute the
    // same positions for ever.
    const body = server.slice(server.indexOf('function updateLayout() {'));

    expect(body.slice(0, 200)).toMatch(/const width = \(screen as any\)\.width/);
    expect(body.slice(0, 200)).toMatch(/const height = \(screen as any\)\.height/);
  });
});

describe('the footer on a short window', () => {
  const body = server.slice(server.indexOf('function updateLayout() {'));

  it('applies the height the solver decided, not the constant', () => {
    // Otherwise the solver shrinks the footer on paper while the door keeps
    // drawing it at full size, straight over the content.
    expect(body).toMatch(/inputBox\.position\.height = solved\.input\.height/);
    expect(body).toMatch(/inputBox\.position\.bottom = solved\.statusHeight/);
  });

  it('hides the status bar and menu when there is no room for them', () => {
    expect(body).toMatch(/solved\.statusHeight > 0[\s\S]{0,80}?statusBar\.hide\(\)/);
    expect(body).toMatch(/solved\.menuHeight > 0[\s\S]{0,120}?hide\(\)/);
  });
});

describe('the screen underneath it', () => {
  it('is resized when the backend forwards the new size', () => {
    expect(helpers).toMatch(/bbs\.on\('screen:resize'/);
    expect(helpers).toMatch(/screen\.resize\(size\.cols, size\.rows\)/);
  });

  it('does not pre-set the dimensions before resizing', () => {
    // Assigning width/height first makes resize() see no change and return
    // early, leaving the buffers at the old size - a black screen.
    const handler = helpers.slice(
      helpers.indexOf("bbs.on('screen:resize'"),
      helpers.indexOf("bbs.on('screen:resize'") + 900
    );

    expect(handler).not.toMatch(/screen\.width\s*=/);
    expect(handler).not.toMatch(/screen\.height\s*=/);
  });
});
