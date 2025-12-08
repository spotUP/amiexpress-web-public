# Enhanced AI Prompt for AmiExpress SDK Door Development

**Purpose:** This prompt should be used by AI assistants when tasked with fixing SDK errors or creating new doors.

---

## MASTER PROMPT FOR AI ASSISTANTS

When a user asks you to work with the AmiExpress BBS SDK (fixing errors, creating doors, or improving existing code), follow this comprehensive protocol:

### PHASE 1: ASSESSMENT AND PLANNING

**1.1 Understand the Task**
- Read the user's request carefully
- Identify if this is: bug fixing, new door creation, or enhancement
- Clarify any ambiguous requirements BEFORE starting

**1.2 Review Current State**
- Check SDK build status: `cd sdk && npm run build`
- Test all example doors: `cd sdk && ./test-all-doors.sh`
- Identify which doors/files are failing
- Document all errors found

**1.3 Create Development Plan**
- Use TodoWrite tool to create a comprehensive task list
- Break down work into discrete, testable phases
- Include testing steps for each phase
- Never start coding without a clear plan

### PHASE 2: ERROR FIXING PROTOCOL

**2.1 Fix Build Errors Systematically**

For each failing door:
1. **Identify the root cause** - Don't guess, read the error message
2. **Fix ONE issue at a time** - Never batch multiple fixes without testing
3. **Test immediately after each fix** - Run `npm run build` in the door directory
4. **Verify the fix** - Ensure it builds with ZERO errors
5. **Move to next error** - Repeat until all errors are resolved

**2.2 Common SDK Error Patterns and Solutions**

| Error Type | Common Cause | Solution |
|------------|--------------|----------|
| "Missing script: build" | No build script in package.json | Add `"build": "tsc"` to scripts |
| "Cannot find module" | Missing dependency | Add to dependencies in package.json |
| "Property X does not exist" | Type mismatch | Fix TypeScript types or add proper imports |
| "No such file or directory" | Wrong file path | Check absolute vs relative paths |
| Build succeeds but runtime crashes | Missing error handling | Wrap I/O operations in try-catch |

**2.3 Package.json Requirements**

EVERY door must have these fields:

```json
{
  "name": "door-name",
  "version": "1.0.0",
  "description": "Clear description",
  "main": "dist/index.js",
  "bbsCommand": "COMMANDNAME",
  "buildable": true,
  "scripts": {
    "build": "tsc"
  },
  "dependencies": {
    "@amiexpress/bbs-door-sdk": "file:../.."
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.2.2"
  }
}
```

### PHASE 3: NEW DOOR CREATION PROTOCOL

**3.1 Pre-Creation Checklist**

Before writing ANY code:
- [ ] Read SDK documentation: `sdk/docs/AI_DOOR_CREATION_GUIDE.md`
- [ ] Review relevant example doors in `sdk/doors/`
- [ ] Identify which SDK systems are needed (see Framework Selection Guide)
- [ ] Create detailed task list with TodoWrite tool
- [ ] Plan data structures and persistence strategy

**3.2 Step-by-Step Creation Process**

```
1. Create door directory: sdk/doors/door-name/
2. Create package.json with ALL required fields
3. Create tsconfig.json (copy from working example)
4. Create index.ts with basic Door class structure
5. Implement core functionality incrementally
6. Test build after EACH major change
7. Add data persistence (using fs module)
8. Test with mock data
9. Add error handling to ALL I/O operations
10. Final build test: npm run build (MUST succeed)
11. Final validation: Run SDK test script
```

**3.3 Mandatory Code Patterns**

**Door Class Structure:**
```typescript
import { Door } from '@amiexpress/bbs-door-sdk';
import * as fs from 'fs';
import * as path from 'path';

class MyDoor {
  private door: Door;
  private dataDir: string;
  // ... other properties

  constructor() {
    this.door = new Door({
      name: 'Door Name',
      version: '1.0.0',
      author: 'Author Name',
    });

    // Setup data directory (ALWAYS do this for doors that save data)
    this.dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }

    // Setup event handlers
    this.door.onConnect(async (user) => {
      await this.handleConnect(user);
    });

    this.door.onInput((user, key) => {
      this.handleInput(user, key.key);
    });

    this.door.onDisconnect((user) => {
      this.handleDisconnect(user);
    });
  }

  private async handleConnect(user: any): Promise<void> {
    // Connection logic here
  }

  private handleInput(user: any, key: string): void {
    // Input handling here
  }

  private handleDisconnect(user: any): void {
    // Cleanup and save data here
  }

  public start(): void {
    this.door.start();
  }
}

const door = new MyDoor();
door.start();
```

**Data Persistence Pattern (REQUIRED for doors with state):**
```typescript
private loadData(userId: number): any {
  try {
    if (fs.existsSync(this.dataFile)) {
      const data = fs.readFileSync(this.dataFile, 'utf-8');
      const allData = JSON.parse(data);
      return allData[userId] || null;
    }
    return null;
  } catch (error) {
    console.error('[ERROR] Load failed:', error);
    return null;
  }
}

private saveData(userId: number, userData: any): void {
  try {
    let allData = {};
    if (fs.existsSync(this.dataFile)) {
      const data = fs.readFileSync(this.dataFile, 'utf-8');
      allData = JSON.parse(data);
    }
    allData[userId] = userData;
    fs.writeFileSync(this.dataFile, JSON.stringify(allData, null, 2));
  } catch (error) {
    console.error('[ERROR] Save failed:', error);
  }
}
```

### PHASE 4: FRAMEWORK SELECTION

**4.1 Decision Matrix**

Ask yourself these questions:

| Question | YES → Use This | Example |
|----------|----------------|---------|
| Need forms, dialogs, widgets? | UIEngine (Neo-Blessed) | bug-tracker, bbs-dashboard |
| Need simple graphics/text rendering? | GraphicsEngine | space-shooter, tetris |
| Need multiplayer? | NetworkEngine | tic-tac-toe, fire-emblem |
| Need RPG features? | Inventory + Dialogue + Quest | dungeon-rpg |
| Need tactical combat? | TacticalCombat | fire-emblem |
| Need AI pathfinding? | AIEngine | dungeon-rpg (enemies) |
| Need collision detection? | PhysicsEngine | space-shooter |
| Need sound effects? | AudioEngine | space-shooter |

**4.2 Complexity Assessment**

- **Simple (Door API only):** Utilities, announcements → 1-2 hours
- **Low (Door + Graphics):** Text games, simple tools → 2-4 hours
- **Medium (Multiple Systems):** Action games, complex UI → 4-8 hours
- **High (Many Systems):** RPGs, multiplayer games → 8-16 hours
- **Very High (All Systems):** Tactical RPGs → 16+ hours

**4.3 Suggest Features to User**

Based on the door type, proactively suggest SDK features:

```
User: "Create a space shooter game"

AI Response:
"I'll create a production-ready space shooter using these SDK features:
- GraphicsEngine: ANSI rendering for game graphics
- PhysicsEngine: Collision detection for bullets/enemies
- InputEngine: Smooth keyboard controls
- Data persistence: High score tracking across sessions

Additional features I can add:
- AudioEngine: Sound effects for shooting/explosions
- ParticleEngine: Explosion effects
- Multiple difficulty levels
- Power-ups and upgrades

Would you like me to include any of these additional features?"
```

### PHASE 5: QUALITY ASSURANCE

**5.1 ZERO TOLERANCE FOR ERRORS**

Every door MUST:
- Build with `npm run build` (ZERO TypeScript errors)
- Run without crashes
- Handle edge cases (empty input, missing files, invalid data)
- Persist data correctly
- Exit cleanly

**5.2 Testing Protocol**

After completing ANY door work:

```bash
# Step 1: Test SDK build
cd sdk
npm run build
# MUST succeed with no errors

# Step 2: Test all example doors
./test-all-doors.sh
# MUST show "All doors built successfully!"

# Step 3: Test specific door (if new/modified)
cd examples/door-name
npm run build
# MUST succeed with no errors

# Step 4: Manual runtime test
npm start
# MUST run without crashes
# Test all features
# Test edge cases
# Test data persistence
```

**5.3 Production Readiness Checklist**

Before considering work complete, verify:

- [ ] ZERO build errors
- [ ] ZERO runtime crashes
- [ ] NO TODOs in code
- [ ] NO STUBS or placeholders
- [ ] ALL functions fully implemented
- [ ] Error handling for ALL I/O
- [ ] Data persists correctly
- [ ] User instructions clear
- [ ] Exit mechanism works (Q key, etc.)
- [ ] Package.json complete
- [ ] README.md exists and accurate
- [ ] Code comments for complex logic
- [ ] Tested with multiple users (if multiplayer)

### PHASE 6: DOCUMENTATION

**6.1 Code Comments**

Add comments for:
- Complex algorithms
- Non-obvious logic
- Data structure definitions
- Public API methods
- Configuration parameters

DON'T comment:
- Obvious code (e.g., `// increment counter` for `counter++`)
- Every single line
- TODOs or FIXMEs (implement it instead!)

**6.2 README.md Template**

Every door should have:

```markdown
# Door Name

Description of what this door does.

## Features

- Feature 1
- Feature 2
- Feature 3

## Installation

```bash
cd sdk/doors/door-name
npm install
npm run build
```

## Usage

BBS Command: `COMMANDNAME`

Controls:
- Arrow keys: Movement
- Space: Action
- Q: Quit

## Data Storage

Data is stored in: `data/door-name-data.json`

## SDK Systems Used

- GraphicsEngine: For rendering
- PhysicsEngine: For collisions
- (etc.)

## Development

```bash
npm run dev  # Watch mode
npm run build  # Compile
```

## License

MIT
```

### PHASE 7: COMMUNICATION WITH USER

**7.1 Progress Updates**

Use TodoWrite tool to:
- Show task progress transparently
- Update status as you complete each task
- Keep user informed of what you're working on

**7.2 Error Reporting**

When errors occur:
1. Explain what went wrong clearly
2. Explain why it happened
3. Explain what you're doing to fix it
4. Don't hide failures - be transparent

**7.3 Feature Suggestions**

Proactively suggest SDK features that would enhance the door:
- "I can add multiplayer support using NetworkEngine"
- "High score tracking would be easy with data persistence"
- "UI forms could make configuration easier"

### PHASE 8: FINAL VALIDATION

**8.1 Run Complete Test Suite**

```bash
cd /path/to/sdk
npm run build && ./test-all-doors.sh
```

Output MUST be:
```
=========================================
SUMMARY:
  Successful: 21 (or current door count)
  Failed: 0

All doors built successfully!
```

**8.2 Verify Changes**

```bash
# Check git status
git status

# Review changes
git diff

# Ensure no unintended files changed
```

**8.3 Final Report to User**

Provide:
- Summary of all changes made
- List of files created/modified
- Confirmation that all tests pass
- Instructions for testing the door
- Next steps (if any)

---

## CRITICAL REMINDERS

1. **NEVER leave TODOs or stubs** - Implement fully or don't implement at all
2. **TEST AFTER EVERY CHANGE** - Don't batch multiple changes without testing
3. **NO SHORTCUTS** - Production-ready means production-ready
4. **USE EXAMPLES** - Copy patterns from working example doors
5. **READ THE ERRORS** - Error messages tell you what's wrong
6. **DATA SAFETY** - Always wrap I/O in try-catch blocks
7. **USER EXPERIENCE** - Make doors intuitive and provide clear feedback
8. **DOCUMENT AS YOU GO** - Don't leave documentation for "later"
9. **BE TRANSPARENT** - Use TodoWrite to show progress
10. **ASK QUESTIONS** - Clarify ambiguous requirements before coding

---

## EXAMPLE WORKFLOW

```
User: "Create a word guessing game for the BBS"

AI Process:

1. [TodoWrite] Create task list:
   - Review SDK documentation
   - Design game logic
   - Select SDK frameworks
   - Create package.json
   - Implement game class
   - Add data persistence
   - Test build
   - Test gameplay
   - Document

2. [Review] Check SDK docs and examples
   - Decision: Use GraphicsEngine for simple ANSI rendering
   - Pattern: Similar to 2048-game for input handling

3. [Design] Game mechanics:
   - Random word selection
   - Letter guessing
   - Lives system
   - High score tracking
   - Word list storage

4. [Implement] Step by step:
   - Create package.json with all required fields
   - Create tsconfig.json
   - Create WordGuessingGame class
   - Implement word selection
   - Implement guess checking
   - Implement rendering
   - Add high score persistence
   - Test build (PASS)
   - Test gameplay

5. [Document] Create README.md

6. [Validate] Run test suite (ALL PASS)

7. [Report] Provide summary to user:
   "Created production-ready word guessing game with:
   - Random word selection from 100+ words
   - Lives system (6 attempts)
   - High score tracking
   - Clean ANSI graphics
   - Data persistence across sessions
   
   Files created:
   - sdk/doors/word-guess/package.json
   - sdk/doors/word-guess/tsconfig.json
   - sdk/doors/word-guess/index.ts
   - sdk/doors/word-guess/README.md
   
   All tests passing. Ready for distribution.
   
   Try it: cd sdk/doors/word-guess && npm start"
```

---

## RESOURCES

- Complete guide: `sdk/docs/AI_DOOR_CREATION_GUIDE.md`
- SDK README: `sdk/README.md`
- API reference: `sdk/docs/API_REFERENCE.md`
- Example doors: `sdk/doors/`
- Testing script: `sdk/test-all-doors.sh`

---

## SUCCESS CRITERIA

A task is complete when:

1. ✅ All code compiles with ZERO errors
2. ✅ All doors build successfully
3. ✅ No TODOs or stubs remain
4. ✅ All features fully implemented
5. ✅ Error handling in place
6. ✅ Data persists correctly
7. ✅ Documentation complete
8. ✅ User can immediately use the door
9. ✅ Door is ready for BBS distribution
10. ✅ You would be proud to ship this to production

---

Remember: **Quality over speed. Production-ready over "good enough". Complete over partial.**

When in doubt, refer to working example doors and follow their patterns exactly.
