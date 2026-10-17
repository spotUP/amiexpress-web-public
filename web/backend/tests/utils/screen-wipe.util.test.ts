/**
 * Unit tests for screen-wipe.util.ts
 * Tests BBS screen wipe animations (10 different types)
 */

import { getWipeFrames, getRegionSlideFrames, parseWipeMCI, WipeType } from '../../src/utils/screen-wipe.util';

describe('screen-wipe.util', () => {
  const testContent = 'Hello BBS World!\nLine 2\nLine 3';
  const ansiContent = '\x1b[32mGreen Text\x1b[0m\nNormal Text\n\x1b[31mRed Text\x1b[0m';

  describe('parseWipeMCI', () => {
    it('should parse ~WM matrix wipe code', () => {
      const result = parseWipeMCI('~WMHello World');
      expect(result.wipeType).toBe('matrix');
      expect(result.content).toBe('Hello World');
    });

    it('should parse ~WH horizontal blinds code', () => {
      const result = parseWipeMCI('~WHTest Content');
      expect(result.wipeType).toBe('hblinds');
      expect(result.content).toBe('Test Content');
    });

    it('should parse ~WV vertical blinds code', () => {
      const result = parseWipeMCI('~WVScreen Data');
      expect(result.wipeType).toBe('vblinds');
      expect(result.content).toBe('Screen Data');
    });

    it('should parse ~WS spiral wipe code', () => {
      const result = parseWipeMCI('~WSContent Here');
      expect(result.wipeType).toBe('spiral');
      expect(result.content).toBe('Content Here');
    });

    it('should parse ~WC checkerboard code', () => {
      const result = parseWipeMCI('~WCData');
      expect(result.wipeType).toBe('checker');
      expect(result.content).toBe('Data');
    });

    it('should parse ~WR radial/radar code', () => {
      const result = parseWipeMCI('~WRContent');
      expect(result.wipeType).toBe('radial');
      expect(result.content).toBe('Content');
    });

    it('should parse ~WB block wipe code', () => {
      const result = parseWipeMCI('~WBBlocks');
      expect(result.wipeType).toBe('blocks');
      expect(result.content).toBe('Blocks');
    });

    it('should parse ~WN noise fade code', () => {
      const result = parseWipeMCI('~WNNoise');
      expect(result.wipeType).toBe('noise');
      expect(result.content).toBe('Noise');
    });

    it('should parse ~WT typewriter code', () => {
      const result = parseWipeMCI('~WTType');
      expect(result.wipeType).toBe('typewriter');
      expect(result.content).toBe('Type');
    });

    it('should parse ~WE explode code', () => {
      const result = parseWipeMCI('~WEBoom');
      expect(result.wipeType).toBe('explode');
      expect(result.content).toBe('Boom');
    });

    it('should parse ~WX random code', () => {
      const result = parseWipeMCI('~WXRandom');
      expect(result.wipeType).toBe('random');
      expect(result.content).toBe('Random');
    });

    it('should be case-insensitive', () => {
      const resultLower = parseWipeMCI('~wmMatrix');
      const resultUpper = parseWipeMCI('~WMMatrix');

      expect(resultLower.wipeType).toBe('matrix');
      expect(resultUpper.wipeType).toBe('matrix');
    });

    it('should return null wipeType if no MCI code found', () => {
      const result = parseWipeMCI('No wipe code here');
      expect(result.wipeType).toBeNull();
      expect(result.content).toBe('No wipe code here');
    });

    it('should return null for invalid wipe code', () => {
      const result = parseWipeMCI('~WQINVALID');
      expect(result.wipeType).toBeNull();
    });

    it('should handle content with multiple lines', () => {
      const result = parseWipeMCI('~WMLine1\nLine2\nLine3');
      expect(result.wipeType).toBe('matrix');
      expect(result.content).toBe('Line1\nLine2\nLine3');
    });

    it('should handle empty content after MCI', () => {
      const result = parseWipeMCI('~WM');
      expect(result.wipeType).toBe('matrix');
      expect(result.content).toBe('');
    });
  });

  describe('getWipeFrames', () => {
    describe('matrix wipe', () => {
      it('should return frames for matrix wipe', () => {
        const frames = getWipeFrames('matrix', testContent);

        expect(frames.length).toBeGreaterThan(0);
        expect(frames[0]).toHaveProperty('content');
        expect(frames[0]).toHaveProperty('delay');
      });

      it('should clear the screen once, on the first frame only', () => {
        const frames = getWipeFrames('matrix', testContent);

        // Frame 0 clears and paints the whole screen; every later frame is a
        // delta. A clear per frame is what made the animation flicker.
        expect(frames[0].content).toContain('\x1b[2J\x1b[H');
        frames.slice(1).forEach(frame => {
          expect(frame.content).not.toContain('\x1b[2J');
        });
      });

      it('should end on the screen itself, homed over the last animation frame', () => {
        const frames = getWipeFrames('matrix', testContent);


        // The animation is a model of the screen; the frame the caller is
        // left looking at is the screen. Homed, not cleared, so the identical
        // repaint cannot flash.
        expect(frames[frames.length - 1].content).toBe('\x1b[H' + testContent);
      });

      it('should have consistent delay between animation frames', () => {
        const frames = getWipeFrames('matrix', testContent);

        frames.slice(0, -1).forEach(frame => {
          expect(frame.delay).toBe(50);
        });
        // Nothing waits after the final paint.
        expect(frames[frames.length - 1].delay).toBe(0);
      });
    });

    describe('horizontal blinds wipe', () => {
      it('should return frames for horizontal blinds', () => {
        const frames = getWipeFrames('hblinds', testContent);

        expect(frames.length).toBeGreaterThan(0);
        // The appended final paint carries delay 0 (nothing waits after it).
        frames.slice(0, -1).forEach(frame => {
          expect(frame).toHaveProperty('content');
          expect(frame).toHaveProperty('delay');
          expect(frame.delay).toBe(40);
        });
        expect(frames[frames.length - 1].delay).toBe(0);
      });
    });

    describe('vertical blinds wipe', () => {
      it('should return frames for vertical blinds', () => {
        const frames = getWipeFrames('vblinds', testContent);

        expect(frames.length).toBeGreaterThan(0);
        frames.slice(0, -1).forEach(frame => {
          expect(frame.delay).toBe(40);
        });
        expect(frames[frames.length - 1].delay).toBe(0);
      });
    });

    describe('spiral wipe', () => {
      it('should return frames for spiral wipe', () => {
        const frames = getWipeFrames('spiral', testContent);

        expect(frames.length).toBeGreaterThan(0);
        frames.slice(0, -1).forEach(frame => {
          expect(frame.delay).toBe(30);
        });
        expect(frames[frames.length - 1].delay).toBe(0);
      });
    });

    describe('checkerboard wipe', () => {
      it('should return frames for checkerboard wipe', () => {
        const frames = getWipeFrames('checker', testContent);

        expect(frames.length).toBeGreaterThan(0);
        frames.slice(0, -1).forEach(frame => {
          expect(frame.delay).toBe(100);
        });
        expect(frames[frames.length - 1].delay).toBe(0);
      });

      it('should have exactly 2 phases (white then black squares) plus the final paint', () => {
        const frames = getWipeFrames('checker', testContent);
        expect(frames.length).toBe(3);
        expect(frames[frames.length - 1].content).toBe('\x1b[H' + testContent);
      });
    });

    describe('radial/radar wipe', () => {
      it('should return frames for radial wipe', () => {
        const frames = getWipeFrames('radial', testContent);

        expect(frames.length).toBeGreaterThan(0);
        frames.slice(0, -1).forEach(frame => {
          expect(frame.delay).toBe(25);
        });
        expect(frames[frames.length - 1].delay).toBe(0);
      });
    });

    describe('block wipe', () => {
      it('should return frames for block wipe', () => {
        const frames = getWipeFrames('blocks', testContent);

        expect(frames.length).toBeGreaterThan(0);
        frames.slice(0, -1).forEach(frame => {
          expect(frame.delay).toBe(40);
        });
        expect(frames[frames.length - 1].delay).toBe(0);
      });
    });

    describe('noise fade wipe', () => {
      it('should return frames for noise fade', () => {
        const frames = getWipeFrames('noise', testContent);

        expect(frames.length).toBeGreaterThan(0);
        frames.slice(0, -1).forEach(frame => {
          expect(frame.delay).toBe(50);
        });
        expect(frames[frames.length - 1].delay).toBe(0);
      });
    });

    describe('typewriter wipe', () => {
      it('should return frames for typewriter wipe', () => {
        const frames = getWipeFrames('typewriter', testContent);

        expect(frames.length).toBeGreaterThan(0);
        frames.slice(0, -1).forEach(frame => {
          expect(frame.delay).toBe(30);
        });
        expect(frames[frames.length - 1].delay).toBe(0);
      });
    });

    describe('explode wipe', () => {
      it('should return frames for explode wipe', () => {
        const frames = getWipeFrames('explode', testContent);

        expect(frames.length).toBeGreaterThan(0);
        frames.slice(0, -1).forEach(frame => {
          expect(frame.delay).toBe(40);
        });
        expect(frames[frames.length - 1].delay).toBe(0);
      });
    });

    describe('random wipe', () => {
      it('should return frames for random wipe selection', () => {
        const frames = getWipeFrames('random', testContent);

        expect(frames.length).toBeGreaterThan(0);
        // Random picks one of the 10 wipe types
        frames.forEach(frame => {
          expect(frame).toHaveProperty('content');
          expect(frame).toHaveProperty('delay');
        });
      });

      it('should produce different results on multiple calls', () => {
        // Run multiple times and check if we get different wipe types
        // (statistical test - might occasionally fail if random picks same type)
        const delays = new Set<number>();

        for (let i = 0; i < 20; i++) {
          const frames = getWipeFrames('random', testContent);
          if (frames.length > 0) {
            delays.add(frames[0].delay);
          }
        }

        // Should have at least 2 different delay values (different wipe types)
        expect(delays.size).toBeGreaterThanOrEqual(2);
      });
    });

    describe('ANSI content handling', () => {
      it('should handle content with ANSI color codes', () => {
        const frames = getWipeFrames('matrix', ansiContent);

        expect(frames.length).toBeGreaterThan(0);
        frames.forEach(frame => {
          expect(frame.content).toBeTruthy();
        });
      });

      it('should preserve ANSI codes in final frame', () => {
        const frames = getWipeFrames('typewriter', ansiContent);
        const lastFrame = frames[frames.length - 1];

        // Last frame should contain ANSI reset code
        expect(lastFrame.content).toContain('\x1b[0m');
      });
    });

    describe('edge cases', () => {
      it('should handle empty content', () => {
        const frames = getWipeFrames('matrix', '');

        expect(frames.length).toBeGreaterThanOrEqual(0);
      });

      it('should handle single line content', () => {
        const frames = getWipeFrames('matrix', 'Single line');

        expect(frames.length).toBeGreaterThan(0);
        frames.forEach(frame => {
          expect(frame.content).toBeTruthy();
        });
      });

      it('should handle very long content', () => {
        const longContent = 'Line\n'.repeat(50);
        const frames = getWipeFrames('matrix', longContent);

        expect(frames.length).toBeGreaterThan(0);
      });

      it('should return empty array for invalid wipe type', () => {
        const frames = getWipeFrames('invalid' as WipeType, testContent);
        expect(frames).toEqual([]);
      });
    });
  });

  describe('Integration tests', () => {
    it('should parse MCI and generate matching wipe frames', () => {
      const content = '~WMWelcome to the BBS!\nLine 2\nLine 3';
      const { wipeType, content: cleanContent } = parseWipeMCI(content);

      expect(wipeType).toBe('matrix');
      expect(cleanContent).not.toContain('~WM');

      const frames = getWipeFrames(wipeType!, cleanContent);
      expect(frames.length).toBeGreaterThan(0);
      expect(frames[0].delay).toBe(50); // Matrix delay
    });

    it('should handle all wipe types in sequence', () => {
      const wipeTypes: WipeType[] = [
        'matrix', 'hblinds', 'vblinds', 'spiral', 'checker',
        'radial', 'blocks', 'noise', 'typewriter', 'explode'
      ];

      wipeTypes.forEach(wipeType => {
        const frames = getWipeFrames(wipeType, testContent);
        expect(frames.length).toBeGreaterThan(0);
        expect(frames[0]).toHaveProperty('content');
        expect(frames[0]).toHaveProperty('delay');
      });
    });

    it('should handle screen with ANSI codes and MCI', () => {
      const content = '~WH\x1b[32mGreen\x1b[0m Normal \x1b[31mRed\x1b[0m';
      const { wipeType, content: cleanContent } = parseWipeMCI(content);

      expect(wipeType).toBe('hblinds');

      const frames = getWipeFrames(wipeType!, cleanContent);
      expect(frames.length).toBeGreaterThan(0);
    });

    it('should create smooth animation progression', () => {
      const frames = getWipeFrames('typewriter', testContent);

      // Animation frames all have the same delay (smooth playback); the
      // appended final paint has none, because nothing waits after it.
      const delays = frames.slice(0, -1).map(f => f.delay);
      const uniqueDelays = new Set(delays);
      expect(uniqueDelays.size).toBe(1); // All same delay
      expect(frames[frames.length - 1].delay).toBe(0);

      // Each frame should have content
      frames.forEach(frame => {
        expect(frame.content.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Performance considerations', () => {
    it('should generate frames in reasonable time', () => {
      const start = Date.now();
      const frames = getWipeFrames('matrix', testContent);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100); // Should be fast (< 100ms)
      expect(frames.length).toBeGreaterThan(0);
    });

    it('should handle large content efficiently', () => {
      const largeContent = Array(100).fill('Line of text here').join('\n');

      const start = Date.now();
      const frames = getWipeFrames('checker', largeContent);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(500); // Should still be reasonably fast
      expect(frames.length).toBeGreaterThan(0);
    });
  });

  describe('parseAnsiToGrid — cursor-sequence isolation', () => {
    // Regression: parseAnsiToGrid was setting currentAnsi to cursor-movement
    // sequences (e.g. \x1b[H from ~f clear-screen). gridToAnsi would then
    // re-emit those sequences as "color" codes before the first character on
    // the next row, moving the cursor to home mid-render and offsetting the
    // entire first line of ANSI art.

    it('wipe frames from content starting with ~f clear-screen do not contain raw \\x1b[H in frame text', () => {
      // Simulate the parsed content that arrives after ~f substitution:
      // \x1b[2J\x1b[H followed by real ANSI art content.
      const content = '\x1b[2J\x1b[H\r\nABCDE\r\nFGHIJ';
      const frames = getWipeFrames('matrix', content);
      expect(frames.length).toBeGreaterThan(0);
      // The frame body (after the leading \x1b[2J\x1b[H that wipe adds itself)
      // must not re-emit \x1b[H inside the rendered rows — that would offset chars.
      // Strip the expected leading clear+home prefix, then check the remainder.
      // The final frame is the caller's own content, homed - it carries
      // whatever cursor codes the screen itself carries (here, ~f's own
      // clear+home) and is checked separately below.
      for (const frame of frames.slice(0, -1)) {
        const body = frame.content.replace(/^\x1b\[2J\x1b\[H/, '');
        // \x1b[H (cursor home, no row/col) must not appear in the rendered grid
        expect(body).not.toContain('\x1b[H');
      }
      // The final frame is the screen's own bytes, homed - minus the clear
      // the screen opens with (~f), which would blank the finished animation
      // and repaint it.
      expect(frames[frames.length - 1].content).toBe('\x1b[H\r\nABCDE\r\nFGHIJ');
    });

    it('color sequences are preserved across lines in wipe frames', () => {
      const content = '\x1b[32mGreen line\r\n\x1b[31mRed line';
      const frames = getWipeFrames('typewriter', content);
      const lastFrame = frames[frames.length - 1];
      // Final frame must contain both color codes
      expect(lastFrame.content).toContain('\x1b[32m');
      expect(lastFrame.content).toContain('\x1b[31m');
    });
  });

  describe('getRegionSlideFrames (push wipe P)', () => {
    const screen = Array.from({ length: 20 }, (_, i) => `row${i + 1} text`).join('\r\n');
    const region = { top: 4, rows: 10, forward: true };
    const cupRows = (frame: string): number[] => [...frame.matchAll(/\x1b\[(\d+);1H/g)].map(m => Number(m[1]));

    it('plays 3-4 frames, each writing only rows inside the range', () => {
      const frames = getRegionSlideFrames(screen, 80, region);
      expect(frames.length).toBeGreaterThanOrEqual(3);
      expect(frames.length).toBeLessThanOrEqual(4);
      for (const f of frames) {
        const rows = cupRows(f.content);
        expect(rows).toHaveLength(10);
        expect(Math.min(...rows)).toBe(4);
        expect(Math.max(...rows)).toBe(13);
        expect(f.content).not.toContain('\x1b[2J');
        expect(f.content).not.toMatch(/\x1b\[H/);
        expect(f.content).not.toContain('row3 ');
        expect(f.content).not.toContain('row14 ');
      }
    });

    it('ends on the target rows; forward and back differ', () => {
      const fwd = getRegionSlideFrames(screen, 80, region);
      const back = getRegionSlideFrames(screen, 80, { ...region, forward: false });
      const last = fwd[fwd.length - 1].content;
      expect(last).toContain('row4 text');
      expect(last).toContain('row13 text');
      expect(back[back.length - 1].content).toBe(last);
      expect(fwd[0].content).not.toBe(back[0].content);
      expect(fwd[0].content).toMatch(/;1H(\x1b\[0m)? {60}/);
    });

    it('cover flow Left: the new page crosses the full width and pushes the old one out to the right', () => {
      const parse = (frame: string) => frame.split(/\x1b\[\d+;1H/).slice(1).map(r => r.replace(/\x1b\[[0-9;]*m/g, ''));
      const page = (word: string) => Array.from({ length: 6 }, () => word.padEnd(80)).map(r => [...r].map(char => ({ char, ansi: '\x1b[0m' })));
      const content = Array.from({ length: 6 }, () => 'NEWPAGE').join('\r\n');
      const back = getRegionSlideFrames(content, 80, { top: 1, rows: 6, forward: false }, page('OLDPAGE'));
      const at = (rows: string[], word: string) => rows[0].indexOf(word);
      // The old page moves right a quarter of the width per frame and is gone at the end.
      expect(back.slice(0, -1).map(f => at(parse(f.content), 'OLDPAGE'))).toEqual([20, 40, 60]);
      expect(parse(back[0].content)[0].slice(0, 20).trim()).toBe('');   // the new page's blank right side leads
      const last = parse(back[back.length - 1].content);
      expect(at(last, 'NEWPAGE')).toBe(0);
      expect(at(last, 'OLDPAGE')).toBe(-1);
      const fwd = parse(getRegionSlideFrames(content, 80, { top: 1, rows: 6, forward: true }, page('OLDPAGE'))[0].content);
      expect(at(fwd, 'NEWPAGE')).toBe(60);     // forward: enters from the right edge
      expect(at(fwd, 'OLDPAGE')).toBe(-1);     // and the old page left to the left
    });

    it('a whole-screen getWipeFrames with the push letter has no animation', () => {
      expect(getWipeFrames('P' as WipeType, screen)).toEqual([]);
    });
  });
});
