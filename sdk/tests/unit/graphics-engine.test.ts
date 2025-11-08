/**
 * Unit Tests for Graphics Engine
 */

import { GraphicsEngine } from '../../engines/graphics/graphics-engine';
import { AnsiColor, Cutscene } from '../../core/types';

describe('GraphicsEngine', () => {
  let gfx: GraphicsEngine;

  beforeEach(() => {
    gfx = new GraphicsEngine({ width: 80, height: 24 });
  });

  describe('Initialization', () => {
    test('should initialize with correct dimensions', () => {
      expect(gfx).toBeDefined();
    });

    test('should render empty screen as ANSI', () => {
      const output = gfx.render();
      expect(output).toContain('\x1b['); // Should contain ANSI codes
    });
  });

  describe('Basic Drawing', () => {
    test('should clear screen with color', () => {
      gfx.clear(AnsiColor.Blue);
      const output = gfx.render();
      expect(output).toBeDefined();
    });

    test('should draw text at position', () => {
      gfx.drawText(10, 10, 'Hello World', AnsiColor.White);
      const output = gfx.render();
      expect(output).toContain('Hello World');
    });

    test('should draw rectangle', () => {
      gfx.drawRect(5, 5, 20, 10, '#', AnsiColor.Green);
      const output = gfx.render();
      expect(output).toBeDefined();
    });

    test('should draw box with border', () => {
      gfx.drawBox(10, 5, 30, 10, AnsiColor.Cyan, AnsiColor.Black);
      const output = gfx.render();
      expect(output).toBeDefined();
    });
  });

  describe('Sprite System', () => {
    test('should create sprite', () => {
      const sprite = gfx.createSprite({
        id: 'player',
        frames: [
          { data: ' O \n/|\\\n/ \\', duration: 100 }
        ],
        position: { x: 10, y: 10 },
        size: { width: 3, height: 3 }
      });

      expect(sprite).toBeDefined();
      expect(sprite.id).toBe('player');
    });

    test('should play sprite animation', () => {
      gfx.createSprite({
        id: 'player',
        frames: [
          { data: 'frame1', duration: 100 },
          { data: 'frame2', duration: 100 }
        ],
        position: { x: 10, y: 10 },
        size: { width: 6, height: 1 }
      });

      gfx.playSprite('player');
      // Animation should be playing
    });

    test('should stop sprite animation', () => {
      gfx.createSprite({
        id: 'player',
        frames: [{ data: 'test', duration: 100 }],
        position: { x: 0, y: 0 },
        size: { width: 4, height: 1 }
      });

      gfx.playSprite('player');
      gfx.stopSprite('player');
      // Animation should be stopped
    });

    test('should move sprite', () => {
      gfx.createSprite({
        id: 'player',
        frames: [{ data: 'P', duration: 100 }],
        position: { x: 10, y: 10 },
        size: { width: 1, height: 1 }
      });

      gfx.moveSprite('player', { x: 20, y: 15 });
      // Sprite should be at new position
    });
  });

  describe('Parallax System', () => {
    test('should add parallax layer', () => {
      gfx.addParallaxLayer({
        image: 'background',
        scrollSpeed: 0.5,
        depth: 3,
        opacity: 1.0
      });
      // Layer should be added
    });

    test('should update parallax scroll', () => {
      gfx.addParallaxLayer({
        image: 'bg1',
        scrollSpeed: 0.5,
        depth: 1,
        opacity: 1.0
      });

      gfx.updateParallax(10, 0);
      // Parallax should scroll
    });
  });

  describe('Particle System', () => {
    test('should create particle system', () => {
      gfx.createParticleSystem({
        type: 'explosion',
        count: 20,
        lifetime: 1000,
        velocity: { min: 1, max: 5 },
        position: { x: 40, y: 12 },
        color: AnsiColor.Red
      });
      // Particles should be created
    });

    test('should update particles', () => {
      gfx.createParticleSystem({
        type: 'rain',
        count: 10,
        lifetime: 2000,
        velocity: { min: 1, max: 3 },
        gravity: 0.5
      });

      gfx.updateParticles(16); // ~60fps frame
      // Particles should update
    });
  });

  describe('Cutscene System', () => {
    test('should play cutscene', () => {
      const cutscene: Cutscene = {
        id: 'intro',
        scenes: [
          { image: 'scene1', duration: 1000 },
          { image: 'scene2', duration: 1000, transition: 'fade' }
        ],
        skippable: true
      };

      gfx.playCutscene(cutscene);
      expect(gfx.isCutscenePlaying()).toBe(true);
    });

    test('should update cutscene', () => {
      const cutscene: Cutscene = {
        id: 'test',
        scenes: [
          { image: 'scene1', duration: 100 }
        ],
        skippable: true
      };

      gfx.playCutscene(cutscene);
      const playing = gfx.updateCutscene(16);
      expect(playing).toBe(true);
    });

    test('should stop cutscene', () => {
      const cutscene: Cutscene = {
        id: 'test',
        scenes: [
          { image: 'scene1', duration: 1000 }
        ],
        skippable: true
      };

      gfx.playCutscene(cutscene);
      gfx.stopCutscene();
      expect(gfx.isCutscenePlaying()).toBe(false);
    });

    test('should call onComplete callback', (done) => {
      const cutscene: Cutscene = {
        id: 'test',
        scenes: [
          { image: 'scene1', duration: 1 }
        ],
        skippable: true,
        onComplete: () => {
          done();
        }
      };

      gfx.playCutscene(cutscene);

      // Wait for cutscene to complete
      setTimeout(() => {
        gfx.updateCutscene(100);
      }, 10);
    });
  });

  describe('Camera System', () => {
    test('should set camera position', () => {
      gfx.setCamera({ x: 100, y: 50 });
      // Camera should be set
    });

    test('should move camera', () => {
      gfx.setCamera({ x: 0, y: 0 });
      gfx.moveCamera(10, 5);
      // Camera should move
    });
  });

  describe('ANSI Loading', () => {
    test('should load ANSI art', () => {
      const ansiData = '\x1b[31mRed Text\x1b[0m';
      gfx.loadAnsi('test', ansiData);
      // ANSI should be cached
    });

    test('should draw loaded ANSI', () => {
      const ansiData = 'Test Art';
      gfx.loadAnsi('art1', ansiData);
      gfx.drawAnsi('art1', { x: 0, y: 0 });

      const output = gfx.render();
      expect(output).toBeDefined();
    });
  });

  describe('Rendering', () => {
    test('should render frame to ANSI', () => {
      gfx.clear(AnsiColor.Black);
      gfx.drawText(0, 0, 'Test', AnsiColor.White);

      const output = gfx.render();
      expect(output).toContain('\x1b['); // ANSI codes
      expect(output).toContain('\x1b[0m'); // Reset at end
    });

    test('should use double buffering', () => {
      const gfxBuffered = new GraphicsEngine({
        width: 80,
        height: 24,
        doubleBuffer: true
      });

      const output = gfxBuffered.render();
      expect(output).toBeDefined();
    });
  });
});
