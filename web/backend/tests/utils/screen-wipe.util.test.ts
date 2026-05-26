/**
 * Unit tests for screen-wipe.util.ts
 * Tests BBS screen wipe animations (10 different types)
 */

import { getWipeFrames, parseWipeMCI, WipeType } from '../../src/utils/screen-wipe.util';

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
      const result = parseWipeMCI('~WZINVALID');
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

      it('should have clear screen code in frames', () => {
        const frames = getWipeFrames('matrix', testContent);

        frames.forEach(frame => {
          expect(frame.content).toContain('\x1b[2J\x1b[H'); // Clear screen + home
        });
      });

      it('should have consistent delay between frames', () => {
        const frames = getWipeFrames('matrix', testContent);

        frames.forEach(frame => {
          expect(frame.delay).toBe(50);
        });
      });
    });

    describe('horizontal blinds wipe', () => {
      it('should return frames for horizontal blinds', () => {
        const frames = getWipeFrames('hblinds', testContent);

        expect(frames.length).toBeGreaterThan(0);
        frames.forEach(frame => {
          expect(frame).toHaveProperty('content');
          expect(frame).toHaveProperty('delay');
          expect(frame.delay).toBe(40);
        });
      });
    });

    describe('vertical blinds wipe', () => {
      it('should return frames for vertical blinds', () => {
        const frames = getWipeFrames('vblinds', testContent);

        expect(frames.length).toBeGreaterThan(0);
        frames.forEach(frame => {
          expect(frame.delay).toBe(40);
        });
      });
    });

    describe('spiral wipe', () => {
      it('should return frames for spiral wipe', () => {
        const frames = getWipeFrames('spiral', testContent);

        expect(frames.length).toBeGreaterThan(0);
        frames.forEach(frame => {
          expect(frame.delay).toBe(30);
        });
      });
    });

    describe('checkerboard wipe', () => {
      it('should return frames for checkerboard wipe', () => {
        const frames = getWipeFrames('checker', testContent);

        expect(frames.length).toBeGreaterThan(0);
        frames.forEach(frame => {
          expect(frame.delay).toBe(100);
        });
      });

      it('should have exactly 2 phases (white then black squares)', () => {
        const frames = getWipeFrames('checker', testContent);
        expect(frames.length).toBe(2);
      });
    });

    describe('radial/radar wipe', () => {
      it('should return frames for radial wipe', () => {
        const frames = getWipeFrames('radial', testContent);

        expect(frames.length).toBeGreaterThan(0);
        frames.forEach(frame => {
          expect(frame.delay).toBe(25);
        });
      });
    });

    describe('block wipe', () => {
      it('should return frames for block wipe', () => {
        const frames = getWipeFrames('blocks', testContent);

        expect(frames.length).toBeGreaterThan(0);
        frames.forEach(frame => {
          expect(frame.delay).toBe(40);
        });
      });
    });

    describe('noise fade wipe', () => {
      it('should return frames for noise fade', () => {
        const frames = getWipeFrames('noise', testContent);

        expect(frames.length).toBeGreaterThan(0);
        frames.forEach(frame => {
          expect(frame.delay).toBe(50);
        });
      });
    });

    describe('typewriter wipe', () => {
      it('should return frames for typewriter wipe', () => {
        const frames = getWipeFrames('typewriter', testContent);

        expect(frames.length).toBeGreaterThan(0);
        frames.forEach(frame => {
          expect(frame.delay).toBe(30);
        });
      });
    });

    describe('explode wipe', () => {
      it('should return frames for explode wipe', () => {
        const frames = getWipeFrames('explode', testContent);

        expect(frames.length).toBeGreaterThan(0);
        frames.forEach(frame => {
          expect(frame.delay).toBe(40);
        });
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

      // Frames should all have same delay (smooth playback)
      const delays = frames.map(f => f.delay);
      const uniqueDelays = new Set(delays);
      expect(uniqueDelays.size).toBe(1); // All same delay

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
      for (const frame of frames) {
        const body = frame.content.replace(/^\x1b\[2J\x1b\[H/, '');
        // \x1b[H (cursor home, no row/col) must not appear in the rendered grid
        expect(body).not.toContain('\x1b[H');
      }
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
});
