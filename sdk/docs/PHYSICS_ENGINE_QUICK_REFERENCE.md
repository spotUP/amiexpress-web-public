# PhysicsEngine Quick Reference

Fast lookup for PhysicsEngine APIs. Provides 2D physics with AABB collision detection.

## Import

```typescript
import { PhysicsEngine } from '@amiexpress/sdk/engines/physics';
const physics = new PhysicsEngine();
```

## Creating Bodies

```typescript
// Dynamic body (affected by physics)
const player = physics.createBody({
  id: 'player',
  x: 40, y: 12,
  width: 2, height: 3,
  type: 'dynamic',
  mass: 1,
  friction: 0.1,
  bounce: 0.2
});

// Static body (immovable, for platforms/walls)
const platform = physics.createBody({
  id: 'platform',
  x: 20, y: 20,
  width: 20, height: 2,
  type: 'static'
});

// Kinematic body (movable but not affected by forces)
const elevator = physics.createBody({
  id: 'elevator',
  x: 50, y: 15,
  width: 5, height: 1,
  type: 'kinematic'
});
```

## Body Types

| Type | Description |
|------|-------------|
| `dynamic` | Fully simulated, responds to forces |
| `static` | Immovable, used for terrain |
| `kinematic` | Moved programmatically, no physics |
| `sensor` | Detects overlap, no collision response |

## Forces and Impulses

```typescript
// Apply continuous force
physics.applyForce('player', { x: 10, y: 0 });  // Push right

// Apply instant impulse (jump, hit)
physics.applyImpulse('player', { x: 0, y: -15 });  // Jump up

// Set velocity directly
physics.setVelocity('player', { x: 5, y: 0 });

// Get current velocity
const vel = physics.getVelocity('player');
```

## Gravity

```typescript
// Set global gravity
physics.setGravity({ x: 0, y: 9.8 });

// Disable gravity for specific body
physics.setBodyGravity('player', { x: 0, y: 0 });

// Low gravity zone
physics.setBodyGravity('astronaut', { x: 0, y: 1.6 });
```

## Collision Detection

```typescript
// Check collision between two bodies
const hit = physics.checkCollision('player', 'enemy');
// Returns: { colliding: boolean, normal: Vector, depth: number }

// Get all bodies colliding with body
const contacts = physics.getContacts('player');
// Returns: string[] of body IDs

// Check if body is on ground
const grounded = physics.isGrounded('player');
```

## Collision Events

```typescript
// Collision start
physics.onCollision((bodyA, bodyB, info) => {
  console.log(`${bodyA} hit ${bodyB}`);
  console.log('Normal:', info.normal);
  console.log('Depth:', info.depth);
});

// Collision end
physics.onCollisionEnd((bodyA, bodyB) => {
  console.log(`${bodyA} separated from ${bodyB}`);
});

// Sensor overlap
physics.onSensorEnter((sensor, body) => {
  console.log(`${body} entered ${sensor}`);
});

physics.onSensorExit((sensor, body) => {
  console.log(`${body} left ${sensor}`);
});
```

## Raycasting

```typescript
// Cast ray and get first hit
const hit = physics.raycast(
  { x: 40, y: 12 },      // Origin
  { x: 1, y: 0 },         // Direction (normalized)
  50                       // Max distance
);

if (hit) {
  console.log('Hit body:', hit.bodyId);
  console.log('Hit point:', hit.point);
  console.log('Distance:', hit.distance);
  console.log('Normal:', hit.normal);
}

// Raycast all (get all intersections)
const hits = physics.raycastAll(origin, direction, distance);
```

## Body Properties

```typescript
interface BodyConfig {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'dynamic' | 'static' | 'kinematic' | 'sensor';
  mass?: number;          // Default: 1
  friction?: number;      // 0-1, default: 0.1
  bounce?: number;        // 0-1, default: 0
  drag?: number;          // Air resistance, default: 0
  maxSpeed?: number;      // Velocity limit
  layer?: number;         // Collision layer
  mask?: number;          // Which layers to collide with
}
```

## Position and Movement

```typescript
// Get position
const pos = physics.getPosition('player');

// Set position (teleport)
physics.setPosition('player', { x: 40, y: 5 });

// Move kinematic body
physics.moveBody('elevator', { x: 50, y: 10 }, 0.5);  // Move over 0.5 seconds
```

## Collision Layers

```typescript
// Setup layers
const LAYER_PLAYER = 1;
const LAYER_ENEMY = 2;
const LAYER_BULLET = 4;
const LAYER_PLATFORM = 8;

// Player collides with enemies and platforms
physics.createBody({
  id: 'player',
  layer: LAYER_PLAYER,
  mask: LAYER_ENEMY | LAYER_PLATFORM,
  // ...
});

// Enemy bullet only hits player
physics.createBody({
  id: 'enemy-bullet',
  layer: LAYER_BULLET,
  mask: LAYER_PLAYER,
  // ...
});
```

## Update Loop

```typescript
// Call each frame with delta time in seconds
function gameLoop() {
  const dt = 0.016;  // ~60fps
  physics.update(dt);
  requestAnimationFrame(gameLoop);
}
```

## Body Management

```typescript
// Get body
const body = physics.getBody('player');

// Remove body
physics.removeBody('enemy');

// Enable/disable body
physics.setEnabled('player', false);  // Pause physics for body
physics.setEnabled('player', true);

// Clear all bodies
physics.clear();
```

## Example: Platformer Physics

```typescript
const physics = new PhysicsEngine();
physics.setGravity({ x: 0, y: 20 });

// Player
physics.createBody({
  id: 'player',
  x: 10, y: 5,
  width: 2, height: 3,
  type: 'dynamic',
  friction: 0.2,
  bounce: 0
});

// Ground
physics.createBody({
  id: 'ground',
  x: 0, y: 22,
  width: 80, height: 2,
  type: 'static'
});

// Platforms
physics.createBody({
  id: 'platform1',
  x: 20, y: 18,
  width: 10, height: 1,
  type: 'static'
});

// Movement
function movePlayer(direction: number) {
  physics.applyForce('player', { x: direction * 50, y: 0 });
}

function jump() {
  if (physics.isGrounded('player')) {
    physics.applyImpulse('player', { x: 0, y: -12 });
  }
}

// Game loop
function update() {
  physics.update(0.016);

  const pos = physics.getPosition('player');
  // Render player at pos.x, pos.y
}
```

## Cleanup

```typescript
physics.dispose();  // Remove all bodies and clear physics
```
