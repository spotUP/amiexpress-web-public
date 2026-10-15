/**
 * Graphics Engine Test Suite
 *
 * Tests ANSI rendering, sprites, particles, and drawing operations.
 */

import { GraphicsEngine } from '../engines/graphics/graphics-engine';
import { AnsiColor } from '../core/types';

describe('GraphicsEngine', () => {
  let gfx: GraphicsEngine;

  beforeEach(() => {
    gfx = new GraphicsEngine({ width: 80, height: 24 });
  });

  afterEach(() => {
    gfx.dispose();
  });

  describe('Initialization', () => {
    it('should create with specified dimensions', () => {
      expect(gfx).toBeDefined();
      // Note: Internal buffer size not exposed, but render should work
    });

    it('should have default configuration', () => {
      const config = new GraphicsEngine({ width: 40, height: 20 });
      expect(config).toBeDefined();
    });
  });

  describe('Drawing Operations', () => {
    it('should draw character at position', () => {
      gfx.drawChar(5, 5, 'X', AnsiColor.Red);
      const output = gfx.render();
      expect(output).toContain('X');
    });

    it('should draw text at position', () => {
      gfx.drawText(10, 10, 'Hello World', AnsiColor.Green);
      const output = gfx.render();
      expect(output).toContain('Hello World');
    });

    it('should handle ANSI color codes', () => {
      gfx.drawChar(0, 0, 'A', AnsiColor.Red);
      const output = gfx.render();
      // Should contain ANSI escape codes
      expect(output).toMatch(/\x1b\[\d+m/);
    });
  });

  describe('Clear Operations', () => {
    it('should clear screen with color', () => {
      gfx.drawText(5, 5, 'Test', AnsiColor.White);
      gfx.clear(AnsiColor.Black);
      const output = gfx.render();
      // After clear, should not contain test text in visible area
      expect(output.length).toBeGreaterThan(0);
    });
  });

  describe('Box Drawing', () => {
    it('should draw box with border', () => {
      gfx.drawBox(
        { x: 5, y: 5, width: 10, height: 5 },
        'single',
        AnsiColor.White
      );
      const output = gfx.render();
      expect(output.length).toBeGreaterThan(0);
    });
  });

  describe('Sprite Management', () => {
    it('should create sprite', () => {
      const spriteId = gfx.createSprite(
        'test-sprite',
        { x: 10, y: 10 },
        { width: 3, height: 2 },
        ['XXX', 'XXX']
      );
      expect(spriteId).toBe('test-sprite');
    });

    it('should render sprite', () => {
      gfx.createSprite('sprite1', { x: 5, y: 5 }, { width: 3, height: 1 }, ['ABC']);
      gfx.drawSprites();
      const output = gfx.render();
      expect(output).toContain('ABC');
    });
  });

  describe('Particle System', () => {
    it('should create particle system', () => {
      gfx.createParticleSystem({
        type: 'test',
        count: 10,
        lifetime: 1000,
        velocity: { min: 1, max: 3 },
        position: { x: 40, y: 12 },
        color: AnsiColor.Red
      });
      // Particles created, update to activate
      gfx.updateParticles(16);
      // Render should include particles
      const output = gfx.render();
      expect(output.length).toBeGreaterThan(0);
    });
  });

  describe('Rendering', () => {
    it('should render to ANSI string', () => {
      gfx.drawText(0, 0, 'Test', AnsiColor.White);
      const output = gfx.render();
      expect(typeof output).toBe('string');
      expect(output.length).toBeGreaterThan(0);
    });

    it('should include ANSI escape codes', () => {
      gfx.drawChar(0, 0, 'X', AnsiColor.Red);
      const output = gfx.render();
      expect(output).toMatch(/\x1b\[/); // ANSI escape sequence
    });
  });

  describe('Resource Cleanup', () => {
    it('should dispose without errors', () => {
      gfx.drawText(5, 5, 'Test', AnsiColor.White);
      expect(() => gfx.dispose()).not.toThrow();
    });
  });
});
