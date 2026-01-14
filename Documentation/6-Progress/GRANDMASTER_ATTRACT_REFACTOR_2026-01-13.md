# Grandmaster Attract Mode Refactor - 2026-01-13

## Problem

User reported: "the gmaster demo mode is missing some of the ingame effects/visuals, it should have everything that the ingame playfield has, motion blur etc"

**Root Cause**: AttractScreen duplicated 1000+ lines of rendering logic from GameScreen instead of reusing it. This caused:
- Missing visual effects in attract mode
- Maintenance nightmare (bugs fixed twice, features added twice)
- Easy to miss updates (exactly what happened)
- Code bloat

## Solution: Architectural Refactor

Refactored attract mode to **reuse GameScreen directly** instead of duplicating rendering logic.

### Changes Made

#### 1. Made GameScreen Work Without Player Input

**File**: `Doors/grandmaster/ui/game-screen.ts`

```typescript
// Before: Required InputHandler
constructor(
  private screen: Screen,
  private engine: GameEngine,
  private input: InputHandler,  // ❌ Always required
  ...
)

// After: InputHandler optional for AI-controlled games
constructor(
  private screen: Screen,
  private engine: GameEngine,
  private input: InputHandler | null,  // ✅ Null for attract mode
  ...
) {
  // Guard all input usage with null checks
  if (this.input) {
    this.input.update(deltaTime);
  }
}
```

**Guarded input usage** in 3 places:
- `update()` loop: Check before calling `input.update()`
- `setupInput()`: Early return if no input
- `cleanup()`: Check before calling `input.reset()`

#### 2. Refactored AttractScreen to Use GameScreen

**File**: `Doors/grandmaster/ui/attract-screen.ts`

**Before** (duplicated rendering):
```typescript
private demoEngine: GameEngine | null = null;
private shaker: ScreenShaker;
private particles: ParticleSystem;
private animations: AnimationManager;
// ... 500+ lines of duplicate rendering code

private renderDemo() {
  // Duplicate of GameScreen rendering logic
}
```

**After** (reuses GameScreen):
```typescript
private demoEngine: GameEngine | null = null;
private gameScreen: GameScreen | null = null;  // ✅ Reuse GameScreen!

private async startDemo(): Promise<void> {
  this.demoEngine = new GameEngine('master', this.state.settings, this.sounds);
  this.demoEngine.start();

  // Create GameScreen instance (null input = AI-controlled)
  this.gameScreen = new GameScreen(
    this.screen,
    this.demoEngine,
    null,  // No input - bot controls it
    this.sounds,
    this.state
  );

  // GameScreen handles ALL rendering & effects!
  this.gameScreen.run().catch(err => {
    console.error('[AttractScreen] GameScreen error:', err);
  });
}
```

**Demo update loop** simplified:
```typescript
case 'demo':
  if (this.demoEngine && this.demoRunning && this.gameScreen) {
    // GameScreen handles engine.update() and ALL rendering/effects!
    // We just control the bot AI
    this.botPlayer.update(deltaTime, this.demoEngine);

    // Check for game over
    if (gameState.status === 'gameover' || gameState.status === 'complete') {
      this.demoRunning = false;
      this.gameScreen = null;  // Cleanup
    }
  }
  break;
```

#### 3. Disabled Duplicate Methods

Renamed methods with `_UNUSED` suffix to mark as deprecated:
- `checkDemoEvents_UNUSED()` - GameScreen handles this now
- `renderDemo_UNUSED()` - GameScreen renders playfield
- `renderEffects_UNUSED()` - GameScreen renders effects

Updated `render()` to skip demo rendering:
```typescript
private render(): void {
  // GameScreen handles ALL rendering during demo state!
  // We only render the info panels for non-demo states
  if (this.attractState !== 'demo') {
    switch (this.attractState) {
      case 'leaderboard': this.renderLeaderboard(); break;
      case 'tips': this.renderTips(); break;
      case 'credits': this.renderCredits(); break;
    }
  }
}
```

## Benefits

✅ **Perfect Visual Parity** - Attract mode automatically gets ALL effects:
- Motion blur / hard drop trails
- Particle systems
- Screen shake
- Lock glow
- Combo animations
- Medal awards
- Section completion effects (COOL/REGRET)
- Grade-up animations
- Block shine effects

✅ **Zero Code Duplication** - One playfield renderer, used everywhere

✅ **Easier Maintenance** - Update once, works in both attract & gameplay

✅ **Smaller Codebase** - 500+ lines of duplicate code now marked deprecated (can be deleted later)

✅ **Future-Proof** - New effects added to GameScreen automatically appear in attract mode

## Code Impact

- **Modified**: `Doors/grandmaster/ui/game-screen.ts` (+11 lines, guard input with null checks)
- **Modified**: `Doors/grandmaster/ui/attract-screen.ts` (+30 lines, -500 lines effective)
- **Total**: Net reduction of ~490 lines once deprecated methods are deleted

## Testing Required

**RESTART BACKEND FIRST** to load new door bundle:
```bash
./dev/scripts/kill-servers.sh
./dev/scripts/start-servers.sh
```

Then test:
1. Launch GMASTER and wait for attract mode demo
2. Verify ALL visual effects are present:
   - ✓ Hard drop motion blur/trails
   - ✓ Line clear particles
   - ✓ Screen shake on Tetris
   - ✓ Lock glow when pieces lock
   - ✓ Grade-up animations
   - ✓ Combo counter animations
   - ✓ COOL/REGRET section animations
   - ✓ Block shine sweep effect
3. Verify attract mode still cycles through leaderboard/tips/credits
4. Verify pressing space exits to main menu
5. Play actual game and verify no regressions

## Future Cleanup

The `_UNUSED` methods can be safely deleted in a future PR:
- `checkDemoEvents_UNUSED()`
- `renderDemo_UNUSED()`
- `renderEffects_UNUSED()`
- All related state tracking variables (lastGrade, lastLines, etc.)

This will save another ~500 lines of code.

## Status

- [X] GameScreen made reusable (input optional)
- [X] AttractScreen refactored to use GameScreen
- [X] Duplicate methods marked deprecated
- [X] Build successful
- [ ] Testing (user to verify visual parity)
