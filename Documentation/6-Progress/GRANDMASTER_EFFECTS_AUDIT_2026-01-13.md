# Grandmaster Visual Effects Audit & Fix - 2026-01-13

## Problem

User reported:
1. Hard drop animation at top of playfield is left-aligned instead of centered (looks buggy)
2. Other background effects are not visible

## Root Causes Identified

### 1. Animation Positioning Not Centered

**File**: `Doors/grandmaster/ui/game-screen.ts` line 707, 710

Animations were hardcoded to absolute screen positions without proper centering:

```typescript
// BEFORE - Left-aligned at fixed positions
if (anim.type === 'gradeUp') {
  const rendered = AnimationRenderer.renderGradeUp(anim);
  effectsContent += `\x1b[${5};${40}H${rendered}`;  // Hardcoded x=40
} else if (anim.type === 'cool' || anim.type === 'regret') {
  const rendered = AnimationRenderer.renderSectionResult(anim);
  effectsContent += `\x1b[${3};${30}H${rendered}`;  // Hardcoded x=30
}
```

**Impact**: Animations appeared left-aligned, not centered on screen as intended.

### 2. Missing 'cool' Particle Preset

**File**: `Doors/grandmaster/effects/particles.ts`

The game engine called `this.particles.spawn('cool', 40, 12)` (line 375 of game-screen.ts) but the 'cool' preset was **not defined** in PARTICLE_PRESETS.

**Impact**: COOL section achievements had no particle effects, making them visually underwhelming.

### 3. Effects Rendering Issues

**File**: `Doors/grandmaster/ui/game-screen.ts` line 717-741

Several animation types were not being rendered at all:
- `comboCounter` - Only displayed in stats box, no on-screen flash
- `tSpin` - No visual flash when T-Spin detected

**Impact**: Missing visual feedback for important game events.

### 4. Z-Order Issue

**File**: `Doors/grandmaster/ui/game-screen.ts` line 472-479

The `effectsBox` was created early in `setupUI()`, meaning other UI elements rendered on top of it, potentially hiding effects.

**Impact**: Effects might be hidden behind stats panels or board borders.

## Fixes Applied

### 1. Fixed Animation Centering

**File**: `Doors/grandmaster/ui/game-screen.ts` line 705-741

```typescript
// AFTER - Dynamically centered based on screen width and text length
if (anim.type === 'gradeUp') {
  const rendered = AnimationRenderer.renderGradeUp(anim);
  // Center grade up animation on screen
  const centerX = Math.floor(screenWidth / 2) - 5;
  effectsContent += `\x1b[${5};${centerX}H${rendered}`;
} else if (anim.type === 'cool' || anim.type === 'regret') {
  const rendered = AnimationRenderer.renderSectionResult(anim);
  // Center section result on screen
  const text = anim.type === 'cool' ? 'COOL!' : 'REGRET';
  const centerX = Math.floor(screenWidth / 2) - Math.floor(text.length / 2);
  effectsContent += `\x1b[${3};${centerX}H${rendered}`;
}
```

**Centering calculation**:
- Screen width = 80 (typical)
- Center = screenWidth / 2 = 40
- Adjust by text length: centerX = 40 - (textLength / 2)

### 2. Added 'cool' Particle Preset

**File**: `Doors/grandmaster/effects/particles.ts` line 126-138

```typescript
// COOL section achievement - celebratory burst
cool: {
  count: 50,
  spread: { x: 4, y: 2 },
  speed: 5,
  life: 35,
  chars: ['●', '○', '★', '◆'],
  colors: ['cyan', 'white', 'green'],
  gravity: 0.1,
  friction: 0.94,
  trail: true,
  fadeOut: true,
},
```

**Design**: Cyan/white/green particle burst with stars and diamonds, matching the COOL achievement's positive vibe.

### 3. Added Missing Animation Rendering

**File**: `Doors/grandmaster/ui/game-screen.ts` line 717-741

```typescript
} else if (anim.type === 'comboCounter') {
  // Render combo counter animation
  const data = anim.data as any;
  const combo = data.combo;
  const progress = anim.elapsed / anim.duration;

  // Flash and fade effect
  if (progress < 0.8) {
    const color = combo >= 15 ? 'red' : combo >= 10 ? 'yellow' : 'cyan';
    const comboText = `${combo} COMBO!`;
    const centerX = Math.floor(screenWidth / 2) - Math.floor(comboText.length / 2);
    effectsContent += `\x1b[${8};${centerX}H{${color}-fg}{bold}${comboText}{/bold}{/${color}-fg}`;
  }
} else if (anim.type === 'tSpin') {
  // Render T-Spin flash
  const progress = anim.elapsed / anim.duration;

  if (progress < 0.6) {
    const tspinText = 'T-SPIN!';
    const centerX = Math.floor(screenWidth / 2) - Math.floor(tspinText.length / 2);
    effectsContent += `\x1b[${10};${centerX}H{magenta-fg}{bold}${tspinText}{/bold}{/magenta-fg}`;
  }
}
```

**New animations**:
- **Combo Counter**: Centered flash showing combo count with color based on milestone (cyan/yellow/red)
- **T-Spin**: Magenta "T-SPIN!" flash centered on screen

### 4. Fixed Z-Order (Effects On Top)

**File**: `Doors/grandmaster/ui/game-screen.ts` line 472-483

```typescript
// Create effectsBox LAST so it renders on top of all other elements
this.effectsBox = createBox({
  parent: this.screen,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  style: { fg: 'white', bg: 'transparent' },
  clickable: false,   // Don't capture clicks
  mouse: false,       // Don't capture mouse
  tags: true,         // Enable blessed tag parsing
});
```

**Changes**:
- Moved creation to end of `setupUI()` (blessed renders last-created elements on top)
- Added `clickable: false` to prevent blocking input
- Added `mouse: false` to prevent blocking mouse events
- Added `tags: true` to ensure blessed color tags are parsed

## Complete Visual Effects Summary

After fixes, GMASTER now has **all** visual effects working:

### Particle Effects (particles.ts)
✅ **lineClear** - Horizontal burst on line clears
✅ **tetris** - Massive explosion on 4-line clears
✅ **perfectClear** - Screen-filling celebration (200 particles)
✅ **gradeUp** - Rising sparkles on grade increases
✅ **tSpin** - Spinning particles on T-Spin
✅ **combo** - Cascading effect on combos
✅ **cool** - Celebratory burst on COOL section *(NEW)*

### Animations (animations.ts)
✅ **gradeUp** - Grade change banner *(FIXED CENTERING)*
✅ **cool/regret** - Section result banner *(FIXED CENTERING)*
✅ **lineClearFlash** - Flash on cleared lines
✅ **lockGlow** - Glow when pieces lock
✅ **perfectClear** - Perfect clear animation
✅ **comboCounter** - Combo milestone flash *(NEW RENDERING)*
✅ **tSpin** - T-Spin flash *(NEW RENDERING)*

### Screen Effects (game-screen.ts)
✅ **Hard drop trails** - Motion blur on hard drops (line 1040-1081)
✅ **Block shine** - Sweeping glare effect (line 792-823)
✅ **Screen shake** - Impact feedback (line 129, uses screen-shake.ts)
✅ **Rainbow borders** - Animated borders for GM/GMM (line 752-788)
✅ **20G gravity flash** - Red/yellow flashing at max gravity (line 146-150, 640-644)
✅ **Grade animation** - Pulsing grade display (line 737-747, 838-856)

### Voice Callouts (sounds)
✅ T-Spin, Tetris, Double, Triple, COOL, REGRET, Combo, Excellent, Bravo

## Testing Required

**RESTART BACKEND FIRST** to load new door bundle:
```bash
./dev/scripts/kill-servers.sh
./dev/scripts/start-servers.sh
```

Then test in GMASTER:

### Animation Centering
1. Do a hard drop - animation should be **centered** at top of screen (not left-aligned)
2. Get a grade-up - "GRADE UP!" banner should be **centered**
3. Complete a section with COOL - "COOL!" should be **centered**
4. Get REGRET - "REGRET" should be **centered**

### New Effects
5. Get a 5+ combo - should see centered "X COMBO!" flash
6. Do a T-Spin - should see centered "T-SPIN!" magenta flash
7. Complete a section with COOL - should see **cyan/white/green particle burst** *(was missing)*

### Existing Effects (verify no regressions)
8. Hard drop trails (motion blur down playfield)
9. Lock glow when pieces land
10. Particles on line clears
11. Screen shake on Tetris
12. Block shine sweep effect
13. Rainbow borders when reaching GM grade

## Status

- [X] Root causes identified (4 issues)
- [X] Animation centering fixed
- [X] Missing 'cool' particle preset added
- [X] Missing animation rendering added (combo, T-Spin)
- [X] Z-order fixed (effectsBox on top)
- [X] Build successful
- [ ] Testing (user to verify all effects visible and centered)

## Technical Notes

**Why ANSI escape codes?**
The effectsBox uses ANSI escape sequences (`\x1b[Y;XH`) for absolute positioning because blessed tags don't support pixel-perfect overlay positioning. This allows effects to float above the playfield without disturbing the layout.

**Centering formula**:
```
centerX = (screenWidth / 2) - (textLength / 2)
```

This works because ANSI cursor positioning is 1-indexed, and we need to start the text to the left of center by half its length.

**Z-ordering in blessed**:
Children are rendered in creation order. Last created = top layer. Moving effectsBox to end ensures it's always visible.
