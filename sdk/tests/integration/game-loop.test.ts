/**
 * Integration tests — game-loop scenarios across the three engines
 * (Graphics, Physics, Input) running together.
 *
 * The previous version of this file used multiple APIs that no longer
 * exist (gravity vector instead of scalar, InputEngine.mapKey,
 * InputEngine.addMacro, InputEngine.isMacroTriggered, single-arg
 * physics.onCollision). Rewritten against the current surface so the
 * three engines actually compose the way games rely on them.
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { GraphicsEngine } from '../../engines/graphics/graphics-engine';
import { PhysicsEngine } from '../../engines/physics/physics-engine';
import { InputEngine } from '../../engines/input/input-engine';
import { AnsiColor } from '../../core/types';
import type { KeyEvent } from '../../core/types';

function k(key: string): KeyEvent {
  return { key, ctrl: false, alt: false, shift: false, code: key.charCodeAt(0) };
}

describe('Game Loop Integration', () => {
  let gfx: GraphicsEngine;
  let physics: PhysicsEngine;
  let input: InputEngine;

  beforeEach(() => {
    gfx = new GraphicsEngine({ width: 80, height: 24 });
    physics = new PhysicsEngine({ gravity: 9.8 });
    input = new InputEngine();
  });

  describe('Player Movement', () => {
    test('keyboard input drives physics velocity through bound actions', () => {
      const player = physics.createBody({
        id: 'player',
        position: { x: 40, y: 20 },
        size: { width: 2, height: 2 },
        mass: 1,
        friction: 1, // disable damping so the impulse is observable
      });

      input.bindAction('move-left', 'ArrowLeft', () => {
        physics.applyImpulse('player', { x: -5, y: 0 });
      });
      input.bindAction('move-right', 'ArrowRight', () => {
        physics.applyImpulse('player', { x: 5, y: 0 });
      });

      input.processInput(k('ArrowLeft'));
      input.processInput(k('ArrowLeft'));
      expect(player.velocity.x).toBeCloseTo(-10);

      input.processInput(k('ArrowRight'));
      expect(player.velocity.x).toBeCloseTo(-5);
    });

    test('sprite position can be synced with physics body each frame', () => {
      physics.createBody({
        id: 'player',
        position: { x: 10, y: 5 },
        size: { width: 2, height: 2 },
        velocity: { x: 30, y: 0 },
        friction: 1,
      });
      const sprite = gfx.createSprite({
        id: 'player',
        frames: [{ data: ' O \n/|\\\n/ \\', duration: 100 }],
        position: { x: 10, y: 5 },
        size: { width: 3, height: 3 },
      });

      // Game-loop step: advance physics, then mirror onto sprite.
      physics.update(0.5);
      const body = physics.getBody('player')!;
      sprite.position = { ...body.position };

      expect(sprite.position.x).toBeCloseTo(body.position.x);
      expect(sprite.position.x).toBeGreaterThan(10);
    });
  });

  describe('Collision-driven gameplay', () => {
    test('player overlapping a "coin" body triggers the player↔item callback', () => {
      physics.createBody({
        id: 'player',
        position: { x: 10, y: 10 },
        size: { width: 2, height: 2 },
        mass: 1,
        friction: 1,
        category: 'player',
      });
      physics.createBody({
        id: 'coin',
        position: { x: 11, y: 10 }, // overlap from t=0
        size: { width: 1, height: 1 },
        mass: 0,
        static: true,
        category: 'item',
      });

      const onCollect = jest.fn();
      physics.onCollision('player', 'item', onCollect);

      physics.update(1 / 60); // a single fixed step is enough for the AABB hit
      expect(onCollect).toHaveBeenCalled();
    });

    test('jump: an impulse moves the player upward, gravity brings them back down', () => {
      const player = physics.createBody({
        id: 'player',
        position: { x: 10, y: 10 },
        size: { width: 2, height: 2 },
        mass: 1,
        friction: 1,
      });

      input.bindAction('jump', ' ', () => {
        physics.applyImpulse('player', { x: 0, y: -20 });
      });

      input.processInput(k(' '));
      expect(player.velocity.y).toBe(-20);

      // Apply gravity manually each step (the engine doesn't auto-apply
      // gravity to all bodies — applyGravity is opt-in per body).
      // gravity=9.8, dt=1/60 → ~0.16 m/s velocity gain per tick. Need
      // ~125 ticks to flip a -20 m/s upward velocity to positive falling.
      for (let i = 0; i < 200; i++) {
        physics.applyGravity('player');
        physics.update(1 / 60);
      }
      expect(player.velocity.y).toBeGreaterThan(0);
    });
  });

  describe('Complete frame cycle', () => {
    test('input → physics → graphics in a single frame all compose without error', () => {
      const player = physics.createBody({
        id: 'p',
        position: { x: 5, y: 5 },
        size: { width: 1, height: 1 },
        friction: 1,
      });
      gfx.createSprite({
        id: 'p',
        frames: [{ data: '@', duration: 100 }],
        position: { x: 5, y: 5 },
        size: { width: 1, height: 1 },
      });

      let pressed = 0;
      input.bindAction('go', 'g', () => { pressed++; });

      input.processInput(k('g'));
      physics.applyImpulse('p', { x: 1, y: 0 });
      physics.update(1.0);

      gfx.clear(AnsiColor.Black);
      gfx.drawSprite('p');
      const out = gfx.render();

      expect(pressed).toBe(1);
      expect(player.position.x).toBeGreaterThan(5);
      expect(out).toBeDefined();
      expect(out.length).toBeGreaterThan(0);
    });

    test('many actions on the same key all fire in one input event', () => {
      const fired: string[] = [];
      input.bindAction('a', 'x', () => fired.push('a'));
      input.bindAction('b', 'x', () => fired.push('b'));
      input.bindAction('c', 'x', () => fired.push('c'));

      input.processInput(k('x'));
      expect(fired).toEqual(['a', 'b', 'c']);
    });
  });

  describe('Performance smoke', () => {
    test('rendering 50 sprites completes well under one second', () => {
      for (let i = 0; i < 50; i++) {
        gfx.createSprite({
          id: `s${i}`,
          frames: [{ data: '*', duration: 100 }],
          position: { x: i % 80, y: Math.floor(i / 80) },
          size: { width: 1, height: 1 },
        });
      }
      const start = Date.now();
      gfx.clear();
      for (let i = 0; i < 50; i++) gfx.drawSprite(`s${i}`);
      const out = gfx.render();
      const elapsed = Date.now() - start;
      expect(out).toBeDefined();
      // Generous bound — guards against pathological perf regressions
      // without being flaky on a slow CI box.
      expect(elapsed).toBeLessThan(1000);
    });

    test('100 physics bodies update without throwing or stalling', () => {
      for (let i = 0; i < 100; i++) {
        physics.createBody({
          id: `b${i}`,
          position: { x: (i * 3) % 200, y: Math.floor(i / 20) * 3 },
          size: { width: 1, height: 1 },
          friction: 1,
        });
      }
      const start = Date.now();
      physics.update(0.016);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(1000);
    });
  });
});
