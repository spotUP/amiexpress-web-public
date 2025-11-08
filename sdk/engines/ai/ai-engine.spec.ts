/**
 * AI Engine Test Suite
 *
 * Tests pathfinding, behaviors, and agent management.
 */

import { AIEngine } from '../engines/ai/ai-engine';

describe('AIEngine', () => {
  let ai: AIEngine;

  beforeEach(() => {
    ai = new AIEngine();
  });

  afterEach(() => {
    ai.dispose();
  });

  describe('Agent Management', () => {
    it('should create agent', () => {
      const agent = ai.createAgent('agent1', { x: 0, y: 0 });
      expect(agent).toBeDefined();
      expect(agent.id).toBe('agent1');
      expect(agent.position.x).toBe(0);
      expect(agent.position.y).toBe(0);
    });

    it('should get agent by ID', () => {
      ai.createAgent('agent1', { x: 5, y: 10 });
      const agent = ai.getAgent('agent1');
      expect(agent).toBeDefined();
      expect(agent?.id).toBe('agent1');
    });

    it('should remove agent', () => {
      ai.createAgent('agent1', { x: 0, y: 0 });
      ai.removeAgent('agent1');
      const agent = ai.getAgent('agent1');
      expect(agent).toBeUndefined();
    });

    it('should get all agents', () => {
      ai.createAgent('agent1', { x: 0, y: 0 });
      ai.createAgent('agent2', { x: 5, y: 5 });
      const agents = ai.getAllAgents();
      expect(agents).toHaveLength(2);
    });
  });

  describe('Pathfinding', () => {
    it('should find path between two points', () => {
      const path = ai.findPath(
        { x: 0, y: 0 },
        { x: 5, y: 5 },
        () => true // All walkable
      );

      expect(path).not.toBeNull();
      expect(path?.length).toBeGreaterThan(0);
      expect(path?.[0]).toEqual({ x: 0, y: 0 });
      expect(path?.[path.length - 1]).toEqual({ x: 5, y: 5 });
    });

    it('should return null if no path exists', () => {
      const path = ai.findPath(
        { x: 0, y: 0 },
        { x: 5, y: 5 },
        () => false // Nothing walkable
      );

      expect(path).toBeNull();
    });

    it('should navigate around obstacles', () => {
      const path = ai.findPath(
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        (pos) => {
          // Wall at x=2
          return pos.x !== 2;
        }
      );

      expect(path).not.toBeNull();
      expect(path?.every(p => p.x !== 2)).toBe(true);
    });
  });

  describe('Behavior States', () => {
    it('should set agent state', () => {
      const agent = ai.createAgent('agent1', { x: 0, y: 0 });
      ai.setState('agent1', 'patrol');
      expect(agent.state.state).toBe('patrol');
    });

    it('should register custom behavior', () => {
      const behavior = {
        name: 'custom',
        onEnter: jest.fn(),
        onUpdate: jest.fn()
      };

      ai.registerBehavior(behavior);
      const agent = ai.createAgent('agent1', { x: 0, y: 0 });
      ai.setState('agent1', 'custom');

      expect(behavior.onEnter).toHaveBeenCalled();
    });
  });

  describe('Sight and Detection', () => {
    it('should detect targets in sight range', () => {
      const agent = ai.createAgent('agent1', { x: 0, y: 0 }, { sightRange: 10 });
      const canSee = ai.canSee('agent1', { x: 5, y: 5 });
      expect(canSee).toBe(true);
    });

    it('should not detect targets outside sight range', () => {
      const agent = ai.createAgent('agent1', { x: 0, y: 0 }, { sightRange: 5 });
      const canSee = ai.canSee('agent1', { x: 20, y: 20 });
      expect(canSee).toBe(false);
    });
  });

  describe('Agent Finding', () => {
    it('should find nearest agent', () => {
      ai.createAgent('agent1', { x: 0, y: 0 });
      ai.createAgent('agent2', { x: 10, y: 10 });
      ai.createAgent('agent3', { x: 3, y: 3 });

      const nearest = ai.findNearestAgent({ x: 0, y: 0 });
      expect(nearest?.id).toBe('agent1'); // Same position = nearest
    });

    it('should find agents in range', () => {
      ai.createAgent('agent1', { x: 0, y: 0 });
      ai.createAgent('agent2', { x: 5, y: 5 });
      ai.createAgent('agent3', { x: 20, y: 20 });

      const inRange = ai.getAgentsInRange({ x: 0, y: 0 }, 10);
      expect(inRange.length).toBe(2); // agent1 and agent2
    });
  });

  describe('Update Loop', () => {
    it('should update agent behaviors', () => {
      const agent = ai.createAgent('agent1', { x: 0, y: 0 });
      ai.setState('agent1', 'idle');

      // Update should not throw
      expect(() => ai.update(0.016)).not.toThrow();
    });
  });
});
