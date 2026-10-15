# AIEngine Quick Reference

Fast lookup for AIEngine APIs. Provides A* pathfinding and behavior state machines for NPCs.

## Import

```typescript
import { AIEngine } from '@amiexpress/sdk/engines/ai';
const ai = new AIEngine();
```

## Core Concepts

- **Agent**: An NPC entity with position, behavior state, and optional path
- **Behavior**: Named state with enter/update/exit callbacks
- **Pathfinding**: A* algorithm on 2D grids with configurable heuristics

## Agent Management

```typescript
// Create agent
const agent = ai.createAgent({
  id: 'guard-1',
  x: 10,
  y: 5,
  speed: 2,
  sightRange: 8,
  state: 'patrol'
});

// Get/remove agents
const agent = ai.getAgent('guard-1');
ai.removeAgent('guard-1');

// Get agents in range of position
const nearby = ai.getAgentsInRange(playerX, playerY, 10);
```

## Pathfinding

```typescript
// Set walkable grid (true = walkable, false = blocked)
ai.setGrid(grid);  // boolean[][]

// Find path between points
const path = ai.findPath(startX, startY, endX, endY);
// Returns: { x: number, y: number }[] or null if no path

// Configure heuristic
ai.setHeuristic('manhattan');   // Default, grid movement
ai.setHeuristic('euclidean');   // Straight-line distance
ai.setHeuristic('diagonal');    // 8-directional movement
```

## Behavior State Machine

```typescript
// Register behavior with callbacks
ai.registerBehavior('patrol', {
  enter: (agent) => {
    agent.data.patrolIndex = 0;
  },
  update: (agent, deltaTime) => {
    // Move along patrol route
    const target = patrolPoints[agent.data.patrolIndex];
    moveToward(agent, target, deltaTime);
  },
  exit: (agent) => {
    // Cleanup when leaving state
  }
});

// Set agent state (triggers enter/exit callbacks)
ai.setState('guard-1', 'chase');

// Get current state
const state = ai.getState('guard-1');
```

## Update Loop

```typescript
// Call each frame with delta time in ms
function gameLoop() {
  const deltaTime = 16; // ~60fps
  ai.update(deltaTime);
  requestAnimationFrame(gameLoop);
}
```

## Common Behavior States

| State | Description |
|-------|-------------|
| `idle` | Standing still, waiting |
| `patrol` | Following waypoint route |
| `chase` | Pursuing target |
| `attack` | Attacking target in range |
| `flee` | Running away from threat |
| `search` | Looking for lost target |

## Agent Properties

```typescript
interface Agent {
  id: string;
  x: number;
  y: number;
  speed: number;         // Movement speed
  sightRange: number;    // Detection radius
  state: string;         // Current behavior state
  path: Point[] | null;  // Current A* path
  target: Point | null;  // Target position
  data: Record<string, any>;  // Custom data storage
}
```

## Heuristic Functions

| Heuristic | Use Case | Formula |
|-----------|----------|---------|
| `manhattan` | 4-directional grid | `|dx| + |dy|` |
| `euclidean` | Free movement | `sqrt(dx^2 + dy^2)` |
| `diagonal` | 8-directional grid | `max(|dx|, |dy|)` |

## Events

```typescript
ai.on('stateChange', (agentId, oldState, newState) => { });
ai.on('pathComplete', (agentId) => { });
ai.on('pathBlocked', (agentId) => { });
ai.on('targetReached', (agentId) => { });
```

## Example: Guard AI

```typescript
const ai = new AIEngine();

// Create grid from map
const grid = map.tiles.map(row => row.map(tile => tile.walkable));
ai.setGrid(grid);

// Define behaviors
ai.registerBehavior('patrol', {
  enter: (agent) => {
    agent.data.waypointIndex = 0;
    agent.target = waypoints[0];
  },
  update: (agent, dt) => {
    if (ai.getAgentsInRange(agent.x, agent.y, agent.sightRange).includes(player)) {
      ai.setState(agent.id, 'chase');
      return;
    }
    // Continue patrol...
  }
});

ai.registerBehavior('chase', {
  enter: (agent) => {
    agent.path = ai.findPath(agent.x, agent.y, player.x, player.y);
  },
  update: (agent, dt) => {
    if (distance(agent, player) > agent.sightRange * 1.5) {
      ai.setState(agent.id, 'patrol');
    }
  }
});

// Create guard
ai.createAgent({
  id: 'guard',
  x: 5, y: 5,
  speed: 1.5,
  sightRange: 6,
  state: 'patrol'
});
```

## Cleanup

```typescript
ai.dispose();  // Remove all agents and behaviors
```
