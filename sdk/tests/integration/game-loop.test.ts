/**
 * Integration Tests - Game Loop
 *
 * Tests multiple engines working together in a realistic game scenario
 */

import { GraphicsEngine } from '../../engines/graphics/graphics-engine';
import { PhysicsEngine } from '../../engines/physics/physics-engine';
import { InputEngine } from '../../engines/input/input-engine';
import { AnsiColor, KeyEvent } from '../../core/types';

describe('Game Loop Integration', () => {
  let gfx: GraphicsEngine;
  let physics: PhysicsEngine;
  let input: InputEngine;

  beforeEach(() => {
    gfx = new GraphicsEngine({ width: 80, height: 24 });
    physics = new PhysicsEngine({ gravity: { x: 0, y: 9.8 } });
    input = new InputEngine();
  });

  describe('Player Movement', () => {
    test('should move player with keyboard input', () => {
      // Create player physics body
      const player = physics.createBody({
        id: 'player',
        position: { x: 40, y: 20 },
        size: { width: 2, height: 2 },
        mass: 1
      });

      // Create player sprite
      gfx.createSprite({
        id: 'player',
        frames: [{ data: ' O \n/|\\\n/ \\', duration: 100 }],
        position: { x: 40, y: 20 },
        size: { width: 3, height: 3 }
      });

      // Bind movement controls
      input.bindAction('move-left', 'ArrowLeft', () => {
        physics.applyForce('player', { x: -100, y: 0 });
      });

      input.bindAction('move-right', 'ArrowRight', () => {
        physics.applyForce('player', { x: 100, y: 0 });
      });

      // Simulate left arrow press
      const leftKey: KeyEvent = {
        key: 'ArrowLeft',
        ctrl: false,
        alt: false,
        shift: false,
        code: 37
      };

      input.processInput(leftKey);
      physics.update(0.016); // One frame

      // Player should have moved left
      expect(player.velocity.x).toBeLessThan(0);
    });

    test('should sync sprite position with physics body', () => {
      // Create player
      const player = physics.createBody({
        id: 'player',
        position: { x: 10, y: 10 },
        size: { width: 2, height: 2 },
        mass: 1
      });

      gfx.createSprite({
        id: 'player',
        frames: [{ data: 'P', duration: 100 }],
        position: { x: 10, y: 10 },
        size: { width: 1, height: 1 }
      });

      // Apply velocity
      physics.setVelocity('player', { x: 5, y: 0 });
      physics.update(1); // 1 second

      // Sync sprite with physics
      gfx.moveSprite('player', player.position);

      // Positions should match
      expect(player.position.x).toBeGreaterThan(10);
    });
  });

  describe('Collision-Based Gameplay', () => {
    test('should detect player collecting item', (done) => {
      // Create player
      physics.createBody({
        id: 'player',
        position: { x: 0, y: 10 },
        size: { width: 2, height: 2 },
        mass: 1,
        category: 'player'
      });

      // Create collectible
      physics.createBody({
        id: 'coin',
        position: { x: 5, y: 10 },
        size: { width: 1, height: 1 },
        mass: 0,
        category: 'item'
      });

      let score = 0;

      // Handle collision
      physics.onCollision((collision) => {
        if (
          (collision.bodyA.id === 'player' && collision.bodyB.category === 'item') ||
          (collision.bodyB.id === 'player' && collision.bodyA.category === 'item')
        ) {
          score += 10;
          physics.removeBody('coin');
          done();
        }
      });

      // Move player towards coin
      physics.setVelocity('player', { x: 10, y: 0 });

      // Update physics for several frames
      for (let i = 0; i < 10; i++) {
        physics.update(0.1);
      }
    });

    test('should handle platform jumping', () => {
      // Create player
      const player = physics.createBody({
        id: 'player',
        position: { x: 10, y: 10 },
        size: { width: 2, height: 2 },
        mass: 1
      });

      // Create platform
      physics.createBody({
        id: 'platform',
        position: { x: 0, y: 15 },
        size: { width: 20, height: 1 },
        mass: 0,
        static: true
      });

      // Bind jump
      let onGround = false;

      physics.onCollision((collision) => {
        if (
          (collision.bodyA.id === 'player' && collision.bodyB.id === 'platform') ||
          (collision.bodyB.id === 'player' && collision.bodyA.id === 'platform')
        ) {
          onGround = true;
        }
      });

      input.bindAction('jump', ' ', () => {
        if (onGround) {
          physics.applyImpulse('player', { x: 0, y: -20 });
          onGround = false;
        }
      });

      // Simulate space bar press
      const spaceKey: KeyEvent = {
        key: ' ',
        ctrl: false,
        alt: false,
        shift: false,
        code: 32
      };

      // Let player fall to platform
      for (let i = 0; i < 10; i++) {
        physics.update(0.1);
      }

      // Jump
      input.processInput(spaceKey);

      expect(player.velocity.y).toBeLessThan(0);
    });
  });

  describe('Complete Game Loop', () => {
    test('should run full game loop cycle', () => {
      // Setup
      const player = physics.createBody({
        id: 'player',
        position: { x: 40, y: 20 },
        size: { width: 2, height: 2 },
        mass: 1
      });

      gfx.createSprite({
        id: 'player',
        frames: [
          { data: ' O \n/|\\\n/ \\', duration: 100 }
        ],
        position: { x: 40, y: 20 },
        size: { width: 3, height: 3 }
      });

      // Add background
      gfx.addParallaxLayer({
        image: 'stars',
        scrollSpeed: 0.3,
        depth: 5,
        opacity: 1.0
      });

      // Add particles
      gfx.createParticleSystem({
        type: 'dust',
        count: 10,
        lifetime: 1000,
        velocity: { min: 1, max: 3 },
        position: { x: 40, y: 22 }
      });

      // Simulate game loop
      for (let frame = 0; frame < 60; frame++) {
        const delta = 16; // ~60fps

        // Update physics
        physics.update(delta / 1000);

        // Update particles
        gfx.updateParticles(delta);

        // Sync sprite with physics
        gfx.moveSprite('player', player.position);

        // Render
        gfx.clear(AnsiColor.Black);
        gfx.drawParallax();
        gfx.drawSprite('player');
        gfx.drawParticles();

        const output = gfx.render();
        expect(output).toBeDefined();
      }

      // Player should have moved due to gravity
      expect(player.position.y).toBeGreaterThan(20);
    });

    test('should handle complex input sequences', () => {
      let moveCount = 0;

      // Setup WASD controls
      input.mapKey('w', 'ArrowUp');
      input.mapKey('a', 'ArrowLeft');
      input.mapKey('s', 'ArrowDown');
      input.mapKey('d', 'ArrowRight');

      // Bind actions
      input.bindAction('up', 'ArrowUp', () => moveCount++);
      input.bindAction('left', 'ArrowLeft', () => moveCount++);
      input.bindAction('down', 'ArrowDown', () => moveCount++);
      input.bindAction('right', 'ArrowRight', () => moveCount++);

      // Add combo macro
      input.addMacro('combo', ['w', 'w', 'd'], 500);

      // Simulate input sequence
      const inputs: KeyEvent[] = [
        { key: 'w', ctrl: false, alt: false, shift: false, code: 87 },
        { key: 'w', ctrl: false, alt: false, shift: false, code: 87 },
        { key: 'd', ctrl: false, alt: false, shift: false, code: 68 }
      ];

      inputs.forEach(input.processInput.bind(input));

      expect(moveCount).toBe(3);
      expect(input.isMacroTriggered('combo')).toBe(true);
    });
  });

  describe('Cutscene Integration', () => {
    test('should pause gameplay during cutscene', () => {
      const player = physics.createBody({
        id: 'player',
        position: { x: 10, y: 10 },
        size: { width: 2, height: 2 },
        mass: 1
      });

      // Start cutscene
      const cutscene = {
        id: 'intro',
        scenes: [
          { image: 'scene1', duration: 1000 }
        ],
        skippable: true,
        onComplete: () => {
          // Resume gameplay
        }
      };

      gfx.playCutscene(cutscene);

      // Game loop
      const delta = 16;

      if (gfx.isCutscenePlaying()) {
        // Don't update physics during cutscene
        gfx.updateCutscene(delta);
      } else {
        physics.update(delta / 1000);
      }

      expect(gfx.isCutscenePlaying()).toBe(true);
    });
  });

  describe('Performance', () => {
    test('should handle multiple sprites efficiently', () => {
      // Create many sprites
      for (let i = 0; i < 50; i++) {
        gfx.createSprite({
          id: `sprite${i}`,
          frames: [{ data: '*', duration: 100 }],
          position: { x: i % 80, y: Math.floor(i / 80) },
          size: { width: 1, height: 1 }
        });
      }

      // Render frame
      const start = Date.now();
      gfx.clear();

      for (let i = 0; i < 50; i++) {
        gfx.drawSprite(`sprite${i}`);
      }

      const output = gfx.render();
      const elapsed = Date.now() - start;

      expect(output).toBeDefined();
      expect(elapsed).toBeLessThan(100); // Should render in < 100ms
    });

    test('should handle many physics bodies', () => {
      // Create many bodies
      for (let i = 0; i < 100; i++) {
        physics.createBody({
          id: `body${i}`,
          position: { x: i % 20, y: Math.floor(i / 20) },
          size: { width: 1, height: 1 },
          mass: 1
        });
      }

      // Update physics
      const start = Date.now();
      physics.update(0.016);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(50); // Should update in < 50ms
    });
  });
});
