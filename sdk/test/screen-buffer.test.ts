/**
 * ScreenBuffer regression tests.
 *
 * Symptom these guard against (ARKANOID, 2026-08-24): the game re-sent its
 * whole playfield every frame - 4669 bytes measured at the door output
 * boundary, 25-62 times a second - so xterm.js kept painting half-parsed
 * frames and the bricks flickered. The buffer's contract is that a frame only
 * costs the cells that actually changed.
 */

import { ScreenBuffer } from '../client/screen-buffer';

/** Strip the once-per-session hard clear so tests can assert on the diff. */
function firstFlush(buf: ScreenBuffer): string {
  return buf.flush();
}

describe('ScreenBuffer', () => {
  describe('first flush', () => {
    it('erases the screen once, because the BBS drew there before the door started', () => {
      const buf = new ScreenBuffer({ cols: 20, rows: 4 });
      buf.drawText(1, 1, 'HI');

      const out = firstFlush(buf);

      expect(out).toContain('\x1b[2J');
      expect(out).toContain('HI');
    });

    it('does not erase again on later frames', () => {
      const buf = new ScreenBuffer({ cols: 20, rows: 4 });
      buf.drawText(1, 1, 'HI');
      firstFlush(buf);

      buf.drawText(1, 1, 'HO');
      const out = buf.flush();

      expect(out).not.toContain('\x1b[2J');
    });
  });

  describe('unchanged frames', () => {
    it('emits nothing when the frame is identical to the one on screen', () => {
      const buf = new ScreenBuffer({ cols: 40, rows: 10 });
      buf.drawBox(1, 1, 40, 10, '\x1b[44m');
      buf.drawText(5, 5, 'SCORE: 00000100', '\x1b[33m');
      firstFlush(buf);

      // Redraw the very same frame, exactly as a game loop would.
      buf.drawBox(1, 1, 40, 10, '\x1b[44m');
      buf.drawText(5, 5, 'SCORE: 00000100', '\x1b[33m');

      expect(buf.flush()).toBe('');
    });
  });

  describe('small changes stay small', () => {
    it('does not resend the whole playfield when only the ball moved', () => {
      const buf = new ScreenBuffer({ cols: 80, rows: 24 });

      const drawPlayfield = (ballX: number) => {
        buf.clear();
        // A full 76x19 playfield background plus a row of bricks - the shape
        // of the frame that measured 4669 bytes before this buffer existed.
        buf.drawBox(2, 3, 76, 19, '\x1b[40m');
        for (let i = 0; i < 12; i++) {
          buf.drawBlock(4 + i * 6, 5, '\x1b[41m', 6);
        }
        buf.drawBlock(ballX, 15, '\x1b[107m', 1);
      };

      drawPlayfield(40);
      const full = firstFlush(buf);

      drawPlayfield(41);
      const moved = buf.flush();

      // The old renderer paid full price for this frame; the buffer pays for
      // two cells (the vacated one and the new one).
      expect(moved.length).toBeLessThan(60);
      expect(full.length).toBeGreaterThan(1000);
    });

    it('rewrites only the digits that changed in a score readout', () => {
      const buf = new ScreenBuffer({ cols: 80, rows: 24 });
      buf.drawText(2, 1, 'SCORE: 00000100', '\x1b[33m');
      firstFlush(buf);

      buf.drawText(2, 1, 'SCORE: 00000200', '\x1b[33m');
      const out = buf.flush();

      expect(out).toContain('2');
      expect(out).not.toContain('SCORE');
    });
  });

  describe('attribute handling', () => {
    it('emits an attribute once for a run of cells that share it', () => {
      const buf = new ScreenBuffer({ cols: 20, rows: 2 });
      buf.drawBlock(1, 1, '\x1b[41m', 10);

      const out = firstFlush(buf);
      const occurrences = out.split('\x1b[41m').length - 1;

      expect(occurrences).toBe(1);
    });

    it('resets attributes at the end of the frame so later output is unstyled', () => {
      const buf = new ScreenBuffer({ cols: 20, rows: 2 });
      buf.drawBlock(1, 1, '\x1b[41m', 4);

      expect(firstFlush(buf).endsWith('\x1b[0m')).toBe(true);
    });

    it('treats a colour change on the same character as a change', () => {
      const buf = new ScreenBuffer({ cols: 20, rows: 2 });
      buf.drawBlock(3, 1, '\x1b[41m', 1);
      firstFlush(buf);

      buf.drawBlock(3, 1, '\x1b[47m', 1);
      const out = buf.flush();

      expect(out).toContain('\x1b[47m');
    });
  });

  describe('clipping', () => {
    it('drops writes past the right edge instead of wrapping them onto the next row', () => {
      const buf = new ScreenBuffer({ cols: 10, rows: 3 });
      buf.drawText(8, 1, 'ABCDEF');
      firstFlush(buf);

      expect(buf.getCell(10, 1).ch).toBe('C');
      expect(buf.getCell(1, 2).ch).toBe(' ');
    });

    it('ignores writes outside the grid', () => {
      const buf = new ScreenBuffer({ cols: 10, rows: 3 });

      expect(() => {
        buf.drawText(0, 0, 'X');
        buf.drawText(11, 4, 'Y');
        buf.drawBlock(-5, 2, '\x1b[41m', 3);
      }).not.toThrow();
    });
  });

  describe('cursor visibility', () => {
    it('hides the cursor once, not every frame', () => {
      const buf = new ScreenBuffer({ cols: 20, rows: 3 });
      buf.setCursorHidden(true);
      buf.drawText(1, 1, 'A');
      const first = firstFlush(buf);

      buf.setCursorHidden(true);
      buf.drawText(1, 1, 'B');
      const second = buf.flush();

      expect(first).toContain('\x1b[?25l');
      expect(second).not.toContain('\x1b[?25l');
    });

    it('shows the cursor again when asked', () => {
      const buf = new ScreenBuffer({ cols: 20, rows: 3 });
      buf.setCursorHidden(true);
      firstFlush(buf);

      buf.setCursorHidden(false);
      expect(buf.flush()).toContain('\x1b[?25h');
    });
  });

  describe('screen changes behind the buffer', () => {
    it('redraws everything after forceRedraw, even though the frame is unchanged', () => {
      const buf = new ScreenBuffer({ cols: 20, rows: 3 });
      buf.drawText(1, 1, 'HELLO');
      firstFlush(buf);

      buf.drawText(1, 1, 'HELLO');
      buf.forceRedraw();
      const out = buf.flush();

      expect(out).toContain('HELLO');
      expect(out).not.toContain('\x1b[2J');
    });

    it('erases again after hardClear', () => {
      const buf = new ScreenBuffer({ cols: 20, rows: 3 });
      buf.drawText(1, 1, 'HELLO');
      firstFlush(buf);

      buf.hardClear();
      buf.drawText(1, 1, 'HELLO');
      const out = buf.flush();

      expect(out).toContain('\x1b[2J');
      expect(out).toContain('HELLO');
    });
  });

  describe('clear()', () => {
    it('erases stale content by diffing it away, not by flashing the screen', () => {
      const buf = new ScreenBuffer({ cols: 20, rows: 3 });
      buf.drawText(1, 1, 'MENU');
      firstFlush(buf);

      buf.clear();
      buf.drawText(1, 2, 'GAME');
      const out = buf.flush();

      expect(out).not.toContain('\x1b[2J');
      expect(out).toContain('GAME');
      // The four cells 'MENU' occupied must be blanked.
      expect(buf.getCell(1, 1).ch).toBe(' ');
      expect(out).toContain('    ');
    });
  });
});
