/**
 * Tip-of-the-day three-screen proof (skill door-three-screens §5).
 *
 * Drives the door's REAL layout seam (Doors/tip-of-day/layout.ts), not a
 * source pin: the 80-column frame is byte-pinned, the 40-column frame
 * fits the C64 canvas borderless with every word surviving, and the
 * wide frame grows from screen.width.
 *
 * RED-proven 2026-09-11: hardcoding the frame to 62 re-fails the 40-col
 * fit; restoring the width rule greens it again.
 */
import { buildTipFrame } from '../../../../../Doors/tip-of-day/layout';
import type { Tip } from '../../../../../Doors/tip-of-day/tips';

export {};

const TIP: Tip = {
  id: 'door:WHIP',
  kind: 'door',
  title: 'Try WHIP',
  body: 'Demo-scene project management with kanban boards, parties, and a leaderboard.',
  command: 'WHIP',
};

describe('tip-of-the-day layout', () => {
  test('80-column frame is byte-identical', () => {
    const f = buildTipFrame(TIP, 80);
    expect(f).toEqual({
      frameWidth: 64,
      frameHeight: 8,
      bordered: true,
      innerWidth: 60,
      // The frame's own padding, and so the left edge of every child box.
      // It used to be re-derived at each call site, where adding the border
      // a second time pushed the hint row onto the bottom border at 80.
      padding: 1,
      title: 'Tip of the day - Try WHIP'.slice(0, 60),
      body: [
        'Demo-scene project management with kanban boards, parties,',
        'and a leaderboard.',
      ],
      hint: 'Run WHIP at the menu. Any key continues...',
    });
  });

  test('40-column frame fits the C64 canvas, borderless, words survive', () => {
    const f = buildTipFrame(TIP, 40);
    expect(f.bordered).toBe(false);
    expect(f.frameWidth).toBeLessThanOrEqual(40);
    const rows = [f.title, ...f.body, f.hint];
    for (const row of rows) {
      expect(row.length).toBeLessThanOrEqual(40);
      expect(row).not.toMatch(/\x1b/);
    }
    const text = rows.join(' ');
    for (const word of ['Demo-scene', 'kanban', 'leaderboard.', 'WHIP']) {
      expect(text).toContain(word);
    }
  });

  test('132-column frame grows from the screen and fits', () => {
    const narrow = buildTipFrame(TIP, 80);
    const wide = buildTipFrame(TIP, 132);
    expect(wide.frameWidth).toBeGreaterThan(narrow.frameWidth);
    const rows = [wide.title, ...wide.body, wide.hint];
    for (const row of rows) {
      expect(row.length).toBeLessThanOrEqual(132);
    }
  });
});

describe('tip-of-the-day content boxes', () => {
  test('title, body and hint boxes opt out of the default Panel border', () => {
    // Grep-style: Panel defaults border:{type:line} when the key is
    // absent (panel.ts:53), and the borders ate these single-row boxes
    // whole - live 2026-09-11: frame painted, text invisible. The SDK
    // screen cannot run under jest, so the source contract is pinned.
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../../../../../Doors/tip-of-day/app.ts'),
      'utf8',
    );
    for (const anchor of ['content: frame.title', 'content: frame.body.join', 'content: frame.hint']) {
      const at = src.indexOf(anchor);
      expect(at).toBeGreaterThan(-1);
      const window = src.slice(Math.max(0, at - 400), at);
      expect(window).toMatch(/border:\s*undefined/);
    }
  });
});
