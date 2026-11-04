# TypeScript Door SDK Critical Review

Date: 2025-12-11
Status: FAILING - Major architectural problems identified

---

## Executive Summary

The current SDK has **fundamental design flaws** that make it confusing, inefficient, and not actually an SDK. After thorough analysis, I recommend **complete redesign** with a clear vision of what problem we're solving.

### Key Finding: **This isn't an SDK - it's a collection of examples**

Doors don't use SDK APIs. They directly interact with BBS internals via the `doorSession` object passed to `runDoor()`. The "SDK" provides no abstraction layer.

---

## Critical Problems

### 1. **False Advertising - No Actual SDK Library**

**Problem:**
- Package exports fancy APIs (`/server`, `/client`, `/engines`, etc.)
- But NO doors import from `@amiexpress/bbs-door-sdk`
- Doors just export `runDoor(doorSession)` and use raw BBS APIs

**Evidence:**
```typescript
// What the SDK CLAIMS (package.json):
"exports": {
  "./server": "./dist/server/index.js",
  "./client": "./dist/client/index.js",
  "./engines/audio": "./dist/engines/audio/index.js"
}

// What doors ACTUALLY do:
export async function runDoor(doorSession: any): Promise<void> {
  const { socket, bbsSession } = doorSession;
  socket.emit('ansi-output', 'Hello\r\n');  // Direct BBS API
  bbsSession.doorInputHandler = (key) => { };  // Direct BBS API
}
```

**Impact:**
- Developers expect an SDK library but get nothing
- Confusing documentation that references unused APIs
- Wasted effort maintaining dead code in `/sdk/engines/`, `/sdk/components/`

### 2. **No Build System - TypeScript Doors Aren't Compiled**

**Problem:**
- Doors are `.ts` files executed directly with `tsx` (TypeScript Execute)
- `npm run build` in door package.json runs `tsc` but output is never used
- No distribution, no optimization, no bundling

**Evidence:**
```json
// Doors/arkanoid/package.json
{
  "main": "index.ts",  // NOT dist/index.js
  "scripts": {
    "build": "tsc"  // Never called, output ignored
  }
}
```

**Impact:**
- Slow startup (TypeScript compiled on every run)
- No code optimization
- Developers waste time setting up `tsconfig.json` and `npm run build`
- Confusion about what "building" means

### 3. **Inconsistent API Surface**

**Problem:**
- Different doors use different property names:
  - Some: `const { socket, bbsSession, user } = doorSession;`
  - Some: `const { socket, session, user } = doorSession;`  (WRONG)
  - Some: `await runDoorWithSession(door, doorSession);` (SDK helper)
  - Some: Direct `socket.on('user-input')` handlers

**Evidence:**
```typescript
// bbslinkwall/index.ts (line 308)
const { socket, user, bbsSession } = doorSession;

// telnet/index.ts (line 289)
const { socket, user, bbsSession } = doorSession;

// Gwall/index.ts (line 657)
const { socket, user, bbs } = doorSession;  // Uses 'bbs', not 'bbsSession'!
```

**Impact:**
- Copy-paste errors between doors
- Hard to debug ("Why does user work in door A but not door B?")
- No type safety (everything is `any`)

### 4. **Massive Dependency Duplication**

**Problem:**
- Each door has its own `node_modules/` directory
- Common dependencies (socket.io, typescript) duplicated 20+ times
- Total size: 300MB+ for 20 doors

**Evidence:**
```bash
sdk/examples/bbslink-wall/node_modules/@socket.io/  (82 packages)
sdk/examples/gwall/node_modules/@socket.io/         (82 packages)
sdk/examples/glc-viewer/node_modules/@socket.io/    (82 packages)
# ... repeated 20+ times
```

**Impact:**
- Slow `npm install` (install same packages 20 times)
- Huge disk usage
- Dependency hell (each door can have different socket.io versions)

### 5. **Misleading Directory Structure**

**Problem:**
The SDK claims to have engines and components, but they're not used:

```
sdk/
  engines/
    audio/         # NOT used by doors
    graphics/      # NOT used by doors
    physics/       # NOT used by doors
  components/
    menu/          # NOT used by doors
    save/          # NOT used by doors
  examples/        # 27 example doors (some work, some don't)
  src/             # Only contains game-engine/ (1 module)
```

**Impact:**
- Developers expect to import from these
- Documentation references them as if they work
- Dead code that adds confusion

### 6. **No Clear Ownership - SDK vs BBS Backend**

**Problem:**
- TypeScript door loading is in `web/backend/src/handlers/door.handler.ts`
- Door discovery is in `web/backend/src/doors/DoorManager.ts`
- The SDK has no role in door execution

**Flow:**
```
User types "ARKANOID"
  → backend/handlers/door.handler.ts finds door
  → Reads Doors/arkanoid/package.json
  → Dynamically imports Doors/arkanoid/index.ts
  → Calls exported runDoor(doorSession)
  → SDK is never involved
```

**Impact:**
- SDK is a misnomer
- Backend handles everything
- "SDK" is just example code

### 7. **Examples vs Real Doors Confusion**

**Problem:**
- `/sdk/examples/` has 27 example doors
- `/Doors/` has "production" doors
- But there's no difference in structure or quality
- Some examples ARE the real doors (bbslinkwall, gwall)

**Impact:**
- Developers don't know where to put new doors
- Duplication between examples and Doors/
- No clear "promotion path" from example to production

---

## What's Actually Working?

### The Simple Pattern DOES Work:

```typescript
// Doors/[name]/index.ts
export async function runDoor(doorSession: any): Promise<void> {
  const { socket, bbsSession, user } = doorSession;

  // Send output
  socket.emit('ansi-output', 'Hello!\r\n');

  // Handle input
  bbsSession.doorInputHandler = (key: string) => {
    if (key === 'q') {
      socket.emit('door:close');
    }
  };

  // Wait for close
  await new Promise<void>((resolve) => {
    socket.once('door:close', resolve);
    socket.once('disconnect', resolve);
  });
}
```

This pattern is:
- Simple
- Direct
- Understandable
- Works reliably

---

## Root Cause Analysis

### The SDK was designed for a different goal than it's being used for:

1. **Original goal (I think)**: Provide engines/components for game development
2. **Actual use**: Simple server-side text doors
3. **Mismatch**: Audio/Graphics/Physics engines are overkill for ANSI text

### The SDK tried to be too many things:

- Game engine (engines/, components/)
- Door scaffolding tool (templates/, CLI)
- Example collection (examples/)
- Runtime library (never materialized)

### The SDK development stalled partway through:

- Exported fancy APIs that were never implemented
- Examples that don't use the APIs
- Documentation referencing unused features

---

## Recommendations

### Option 1: **Honest Naming** (Quick Fix)

**Stop calling it an SDK. Call it what it is:**

```
/door-examples/        # Was: /sdk/examples/
/door-templates/       # Was: /sdk/templates/
/docs/door-development/  # Was: /sdk/docs/
```

**Benefits:**
- Matches reality
- Removes confusion
- Still works the same

**Changes:**
- Rename directories
- Update documentation
- Remove unused exports from package.json
- Keep the simple `runDoor()` pattern

**Effort:** 2-4 hours

---

### Option 2: **Build a Real SDK** (Major Refactor)

**Create an actual library that doors import:**

```typescript
// doors/my-game/index.ts
import { Door, Input, Output } from '@amiexpress/bbs-door-sdk';

const door = new Door({ name: 'My Game' });

door.onStart(async (ctx) => {
  await ctx.output.write('Hello!\r\n');
});

door.onInput(async (ctx, key) => {
  if (key === 'q') {
    await door.exit();
  }
});

export = door;  // Export Door object, not runDoor function
```

**SDK would provide:**
```typescript
class Door {
  constructor(config: DoorConfig);
  onStart(handler: StartHandler): void;
  onInput(handler: InputHandler): void;
  onClose(handler: CloseHandler): void;
  exit(): Promise<void>;
}

class Output {
  write(text: string): Promise<void>;
  clear(): Promise<void>;
  moveCursor(x: number, y: number): Promise<void>;
  setColor(fg: Color, bg?: Color): void;
}

class Input {
  getKey(): Promise<string>;
  getLine(prompt?: string): Promise<string>;
  onKey(handler: KeyHandler): void;
}
```

**Benefits:**
- True abstraction layer
- Type safety
- Easier testing
- Cleaner door code

**Drawbacks:**
- All existing doors break
- Significant refactoring
- More complexity

**Effort:** 2-3 weeks

---

### Option 3: **Minimal SDK** (Middle Ground)

**Provide ONLY helpers, not a framework:**

```typescript
// doors/my-game/index.ts
import { Output, Input, Door } from '@amiexpress/bbs-door-sdk/helpers';

export async function runDoor(doorSession: any): Promise<void> {
  const output = new Output(doorSession.socket);
  const input = new Input(doorSession.bbsSession);

  await output.clear();
  await output.writeLine('Hello!');

  const key = await input.waitForKey();
  if (key === 'q') {
    await output.writeLine('Goodbye!');
  }
}
```

**SDK provides thin wrappers:**
```typescript
class Output {
  constructor(private socket: Socket);
  write(text: string): void {
    this.socket.emit('ansi-output', text);
  }
  clear(): void {
    this.socket.emit('ansi-output', '\x1b[2J\x1b[H');
  }
}

class Input {
  constructor(private bbsSession: BBSSession);
  waitForKey(): Promise<string> {
    return new Promise((resolve) => {
      const handler = (key: string) => {
        this.bbsSession.doorInputHandler = null;
        resolve(key);
      };
      this.bbsSession.doorInputHandler = handler;
    });
  }
}
```

**Benefits:**
- Keep simple `runDoor()` pattern
- Add optional convenience
- Existing doors still work
- New doors can use helpers

**Effort:** 1 week

---

## Decision Framework

### Choose Option 1 if:
- You want doors to keep working as-is
- You don't want to maintain SDK code
- The current pattern is good enough

### Choose Option 2 if:
- You want a professional, polished SDK
- You're willing to rewrite all doors
- You want third-party door developers

### Choose Option 3 if:
- You want incremental improvement
- You want some convenience but not a framework
- You want backward compatibility

---

## My Recommendation: **Option 3 (Minimal SDK)**

**Why:**
1. The current `runDoor()` pattern works
2. But doors have repetitive boilerplate
3. A thin helper layer reduces code without adding complexity
4. Backward compatible - old doors still work

**Implementation Plan:**

1. **Week 1**: Create helper classes
   - `Output` - ANSI output helpers
   - `Input` - Input handling helpers
   - `Storage` - Save/load game data
   - `User` - User info access

2. **Week 2**: Refactor 2-3 existing doors to use helpers
   - Prove the pattern works
   - Document best practices
   - Create migration guide

3. **Week 3**: Update documentation
   - Remove references to unused APIs
   - Document helper classes
   - Provide migration guide

4. **Future**: Gradually migrate other doors

**Success Criteria:**
- Doors using helpers have 30% less boilerplate
- New developers prefer helpers over raw APIs
- Zero breaking changes to existing doors

---

## Appendix: Specific Issues Found

### A. TypeScript Door Loading (door.handler.ts:695)

```typescript
if (doorType === 'TS' || doorType === 'typescript') {
  // Dynamically import the door
  const doorModule = await import(doorPath);
  if (typeof doorModule.runDoor === 'function') {
    await doorModule.runDoor(doorSession);
  }
}
```

**Issues:**
- No error handling
- No timeout
- Can't hot-reload
- `doorSession` is `any` (no types)

### B. Door Discovery (DoorManager.ts)

Scans for `.info` files but doesn't validate:
- TypeScript door structure
- Required exports
- Package.json fields

### C. Package.json Confusion

Doors have metadata fields that do nothing:
- `runtime: "server"` - not used
- `doorPattern: "runDoor"` - assumed, not checked
- `buildable: true` - never built

---

## Conclusion

**The SDK needs a clear vision:**
- Is it a framework? (Option 2)
- Is it just examples? (Option 1)
- Is it convenience helpers? (Option 3)

**Current state is worst of all worlds:**
- Claims to be an SDK (but isn't)
- Has unused code (engines, components)
- Confusing to developers
- No actual value-add

**Fix it by:**
1. Deciding what it should be
2. Removing what it's not
3. Documenting what remains
4. Testing with real doors

Until then, TypeScript doors will continue to cause problems.
