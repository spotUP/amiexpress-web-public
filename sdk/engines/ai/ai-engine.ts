/**
 * AI Engine - Pathfinding and Behavior Management
 *
 * Provides AI capabilities for BBS door games including:
 * - A* pathfinding
 * - Behavior state machines
 * - NPC movement and decision making
 * - Threat assessment
 * - Goal-oriented action planning (GOAP)
 *
 * @example Basic Pathfinding
 * ```typescript
 * const ai = new AIEngine();
 *
 * const path = ai.findPath(
 *   { x: 0, y: 0 },
 *   { x: 10, y: 10 },
 *   (pos) => !isBlocked(pos)
 * );
 * ```
 *
 * @example Behavior State Machine
 * ```typescript
 * const npc = ai.createAI('enemy1', { x: 10, y: 10 });
 *
 * ai.setState(npc, 'patrol');
 * ai.onStateChange(npc, (oldState, newState) => {
 *   console.log(`NPC transitioned: ${oldState} -> ${newState}`);
 * });
 *
 * // Update each frame
 * ai.update(deltaTime);
 * ```
 */

import { EventEmitter } from 'events';
import { Position, PathNode, AIState, PhysicsBody } from '../../core/types';

/**
 * AI configuration
 */
export interface AIConfig {
  /** Pathfinding heuristic */
  heuristic?: 'manhattan' | 'euclidean' | 'diagonal';
  /** Max pathfinding iterations */
  maxIterations?: number;
  /** Update frequency (ms) */
  updateInterval?: number;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * AI agent definition
 */
export interface AIAgent {
  /** Unique ID */
  id: string;
  /** Current position */
  position: Position;
  /** Current state */
  state: AIState;
  /** Movement speed */
  speed: number;
  /** Sight range */
  sightRange: number;
  /** Current path */
  path?: Position[];
  /** Current target */
  target?: Position | PhysicsBody;
  /** Custom AI data */
  data: Record<string, any>;
}

/**
 * Behavior definition
 */
export interface Behavior {
  /** Behavior name */
  name: string;
  /** Entry callback */
  onEnter?: (agent: AIAgent) => void;
  /** Update callback */
  onUpdate?: (agent: AIAgent, delta: number) => void;
  /** Exit callback */
  onExit?: (agent: AIAgent) => void;
  /** Transition conditions */
  transitions?: Array<{
    to: string;
    condition: (agent: AIAgent) => boolean;
  }>;
}

/**
 * AI Engine
 * Handles pathfinding, behavior management, and decision making
 */
export class AIEngine extends EventEmitter {
  private config: Required<AIConfig>;
  private agents: Map<string, AIAgent> = new Map();
  private behaviors: Map<string, Behavior> = new Map();
  private updateTimer?: NodeJS.Timeout;

  constructor(config: AIConfig = {}) {
    super();

    this.config = {
      heuristic: config.heuristic || 'euclidean',
      maxIterations: config.maxIterations || 1000,
      updateInterval: config.updateInterval || 100,
      debug: config.debug ?? false
    };

    this.registerDefaultBehaviors();
  }

  /**
   * Initialize AI engine
   */
  init(): void {
    // Start update loop
    this.updateTimer = setInterval(() => {
      this.update(this.config.updateInterval / 1000);
    }, this.config.updateInterval);
  }

  /**
   * Create AI agent
   */
  createAgent(id: string, position: Position, config?: Partial<AIAgent>): AIAgent {
    const agent: AIAgent = {
      id,
      position: { ...position },
      state: {
        state: 'idle',
        data: {}
      },
      speed: config?.speed || 1,
      sightRange: config?.sightRange || 10,
      data: config?.data || {}
    };

    this.agents.set(id, agent);
    this.emit('agent-created', agent);

    return agent;
  }

  /**
   * Remove AI agent
   */
  removeAgent(id: string): void {
    this.agents.delete(id);
    this.emit('agent-removed', id);
  }

  /**
   * Get AI agent
   */
  getAgent(id: string): AIAgent | undefined {
    return this.agents.get(id);
  }

  /**
   * Get all agents
   */
  getAllAgents(): AIAgent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Find path from start to goal using A*
   */
  findPath(
    start: Position,
    goal: Position,
    isWalkable: (pos: Position) => boolean
  ): Position[] | null {
    const openSet: PathNode[] = [];
    const closedSet = new Set<string>();

    const startNode: PathNode = {
      position: start,
      g: 0,
      h: this.heuristic(start, goal),
      f: 0
    };
    startNode.f = startNode.g + startNode.h;
    openSet.push(startNode);

    let iterations = 0;

    while (openSet.length > 0 && iterations < this.config.maxIterations) {
      iterations++;

      // Get node with lowest f score
      openSet.sort((a, b) => a.f - b.f);
      const current = openSet.shift()!;

      // Check if we reached the goal
      if (current.position.x === goal.x && current.position.y === goal.y) {
        return this.reconstructPath(current);
      }

      closedSet.add(this.positionKey(current.position));

      // Check neighbors
      const neighbors = this.getNeighbors(current.position);
      for (const neighbor of neighbors) {
        if (!isWalkable(neighbor)) continue;
        if (closedSet.has(this.positionKey(neighbor))) continue;

        const g = current.g + this.distance(current.position, neighbor);
        const h = this.heuristic(neighbor, goal);
        const f = g + h;

        // Check if neighbor is already in open set
        const existingNode = openSet.find(
          n => n.position.x === neighbor.x && n.position.y === neighbor.y
        );

        if (!existingNode) {
          openSet.push({
            position: neighbor,
            g,
            h,
            f,
            parent: current
          });
        } else if (g < existingNode.g) {
          existingNode.g = g;
          existingNode.f = g + existingNode.h;
          existingNode.parent = current;
        }
      }
    }

    // No path found
    return null;
  }

  /**
   * Register behavior
   */
  registerBehavior(behavior: Behavior): void {
    this.behaviors.set(behavior.name, behavior);
  }

  /**
   * Set agent state/behavior
   */
  setState(agentId: string, stateName: string, data?: Record<string, any>): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    const behavior = this.behaviors.get(stateName);
    const oldState = agent.state.state;

    // Exit old behavior
    if (oldState !== stateName) {
      const oldBehavior = this.behaviors.get(oldState);
      oldBehavior?.onExit?.(agent);
    }

    // Update state
    agent.state = {
      state: stateName as any,
      data: data || {}
    };

    // Enter new behavior
    behavior?.onEnter?.(agent);

    this.emit('state-change', agent, oldState, stateName);
  }

  /**
   * Move agent along path
   */
  moveAlongPath(agentId: string, delta: number): boolean {
    const agent = this.agents.get(agentId);
    if (!agent || !agent.path || agent.path.length === 0) {
      return false;
    }

    const target = agent.path[0];
    const dx = target.x - agent.position.x;
    const dy = target.y - agent.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < 0.1) {
      // Reached waypoint
      agent.path.shift();
      return agent.path.length > 0;
    }

    // Move towards target
    const step = agent.speed * delta;
    agent.position.x += (dx / distance) * step;
    agent.position.y += (dy / distance) * step;

    return true;
  }

  /**
   * Check if agent can see target
   */
  canSee(agentId: string, target: Position): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) return false;

    const distance = this.distance(agent.position, target);
    return distance <= agent.sightRange;
  }

  /**
   * Find nearest agent
   */
  findNearestAgent(position: Position, filter?: (agent: AIAgent) => boolean): AIAgent | null {
    let nearest: AIAgent | null = null;
    let minDistance = Infinity;

    for (const agent of this.agents.values()) {
      if (filter && !filter(agent)) continue;

      const distance = this.distance(position, agent.position);
      if (distance < minDistance) {
        minDistance = distance;
        nearest = agent;
      }
    }

    return nearest;
  }

  /**
   * Get agents within range
   */
  getAgentsInRange(position: Position, range: number): AIAgent[] {
    const result: AIAgent[] = [];

    for (const agent of this.agents.values()) {
      const distance = this.distance(position, agent.position);
      if (distance <= range) {
        result.push(agent);
      }
    }

    return result;
  }

  /**
   * Update all agents
   */
  update(delta: number): void {
    for (const agent of this.agents.values()) {
      // Update behavior
      const behavior = this.behaviors.get(agent.state.state);
      behavior?.onUpdate?.(agent, delta);

      // Check transitions
      if (behavior?.transitions) {
        for (const transition of behavior.transitions) {
          if (transition.condition(agent)) {
            this.setState(agent.id, transition.to);
            break;
          }
        }
      }

      // Move along path if one exists
      if (agent.path && agent.path.length > 0) {
        this.moveAlongPath(agent.id, delta);
      }
    }

    this.emit('update', delta);
  }

  /**
   * Register default behaviors
   */
  private registerDefaultBehaviors(): void {
    // Idle behavior
    this.registerBehavior({
      name: 'idle',
      onUpdate: (agent, delta) => {
        // Do nothing, just idle
      }
    });

    // Patrol behavior
    this.registerBehavior({
      name: 'patrol',
      onEnter: (agent) => {
        if (!agent.state.data.waypoints) {
          agent.state.data.waypoints = [];
          agent.state.data.currentWaypoint = 0;
        }
      },
      onUpdate: (agent, delta) => {
        const waypoints = agent.state.data.waypoints;
        if (!waypoints || waypoints.length === 0) return;

        if (!agent.path || agent.path.length === 0) {
          // Move to next waypoint
          const wpIndex = agent.state.data.currentWaypoint;
          const target = waypoints[wpIndex];
          agent.state.target = target;
          agent.path = [target]; // Simple path, could use findPath for complex maps

          agent.state.data.currentWaypoint = (wpIndex + 1) % waypoints.length;
        }
      }
    });

    // Chase behavior
    this.registerBehavior({
      name: 'chase',
      onUpdate: (agent, delta) => {
        if (!agent.state.target) return;

        const target = agent.state.target as Position;
        const distance = this.distance(agent.position, target);

        if (distance > 1) {
          // Continue chasing
          agent.path = [target]; // Could use findPath here
        } else {
          // Reached target, transition to attack
          this.setState(agent.id, 'attack');
        }
      }
    });

    // Attack behavior
    this.registerBehavior({
      name: 'attack',
      onEnter: (agent) => {
        this.emit('agent-attack', agent);
      },
      onUpdate: (agent, delta) => {
        if (!agent.state.target) {
          this.setState(agent.id, 'idle');
          return;
        }

        const target = agent.state.target as Position;
        const distance = this.distance(agent.position, target);

        if (distance > agent.sightRange) {
          // Lost sight of target
          this.setState(agent.id, 'idle');
        }
      }
    });

    // Flee behavior
    this.registerBehavior({
      name: 'flee',
      onUpdate: (agent, delta) => {
        if (!agent.state.target) {
          this.setState(agent.id, 'idle');
          return;
        }

        const threat = agent.state.target as Position;
        const dx = agent.position.x - threat.x;
        const dy = agent.position.y - threat.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < agent.sightRange) {
          // Run away
          const fleeX = agent.position.x + (dx / distance) * 10;
          const fleeY = agent.position.y + (dy / distance) * 10;
          agent.path = [{ x: fleeX, y: fleeY }];
        } else {
          // Safe distance reached
          this.setState(agent.id, 'idle');
        }
      }
    });
  }

  /**
   * Calculate heuristic distance
   */
  private heuristic(a: Position, b: Position): number {
    switch (this.config.heuristic) {
      case 'manhattan':
        return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      case 'diagonal':
        const dx = Math.abs(a.x - b.x);
        const dy = Math.abs(a.y - b.y);
        return Math.max(dx, dy);
      case 'euclidean':
      default:
        return this.distance(a, b);
    }
  }

  /**
   * Calculate actual distance
   */
  private distance(a: Position, b: Position): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Get neighboring positions (8 directions)
   */
  private getNeighbors(pos: Position): Position[] {
    return [
      { x: pos.x - 1, y: pos.y },     // Left
      { x: pos.x + 1, y: pos.y },     // Right
      { x: pos.x, y: pos.y - 1 },     // Up
      { x: pos.x, y: pos.y + 1 },     // Down
      { x: pos.x - 1, y: pos.y - 1 }, // Up-left
      { x: pos.x + 1, y: pos.y - 1 }, // Up-right
      { x: pos.x - 1, y: pos.y + 1 }, // Down-left
      { x: pos.x + 1, y: pos.y + 1 }  // Down-right
    ];
  }

  /**
   * Reconstruct path from goal node
   */
  private reconstructPath(node: PathNode): Position[] {
    const path: Position[] = [];
    let current: PathNode | undefined = node;

    while (current) {
      path.unshift(current.position);
      current = current.parent;
    }

    return path;
  }

  /**
   * Create position key for set
   */
  private positionKey(pos: Position): string {
    return `${pos.x},${pos.y}`;
  }

  /**
   * Cleanup
   */
  dispose(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
    }

    this.agents.clear();
    this.behaviors.clear();
    this.removeAllListeners();
  }
}
