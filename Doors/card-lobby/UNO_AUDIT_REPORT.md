# UNO Implementation Audit Report
Date: 2026-01-21
Auditor: Claude Sonnet 4.5

## Executive Summary
Comprehensive audit of UNO game implementation for card-lobby door. Found 12 issues ranging from critical bugs to minor improvements needed.

**Severity Breakdown:**
- CRITICAL: 3 issues
- HIGH: 4 issues
- MEDIUM: 3 issues
- LOW: 2 issues

---

## CRITICAL ISSUES

### C1: Wild Draw 4 Challenge Always Succeeds
**File:** `lib/uno-engine.ts:476`
**Severity:** CRITICAL

```typescript
// Line 476-476
const wasIllegal = true;  // This should be tracked when card is played
```

**Problem:** The Wild Draw 4 challenge logic is hardcoded to always return `wasIllegal = true`, meaning every challenge succeeds regardless of whether the play was actually illegal.

**Impact:** Breaks core UNO challenge mechanic. Players will always succeed in challenging Wild Draw 4, even when the play was legal.

**Root Cause:** The `playCard()` method opens a challenge window (line 294) but doesn't store whether the Wild Draw 4 was illegal. The `challengeWildDrawFour()` method has no way to know if it was an illegal play.

**Fix Required:**
1. Add `wasIllegalWildDrawFour: boolean` field to `ChallengeWindow` interface
2. In `openWildDraw4Challenge()`, set this field based on whether player had matching color
3. In `challengeWildDrawFour()`, use `this.state.challengeWindow.wasIllegalWildDrawFour`

---

### C2: Missing chooseColor Call After playCard Returns needsColorChoice
**File:** `lib/uno-engine.ts:302-310`
**Severity:** CRITICAL

```typescript
if ((card.value === 'Wild' || card.value === 'Wild4' || card.value === 'WildChange') && !chosenColor) {
  return {
    success: true,
    message: 'Card played, choose a color',
    needsColorChoice: true
  };
}
```

**Problem:** When `playCard()` returns `needsColorChoice: true`, the card is already removed from hand and added to discard pile (line 299-300), BUT no color has been chosen and `applyCardEffect()` hasn't run yet. The game state is incomplete.

**Impact:**
- Game state is partially updated (card moved to discard)
- No color chosen yet
- Effects not applied
- Turn not advanced
- If caller doesn't immediately call `chooseColor()`, game is in broken state

**Fix Required:** Redesign the flow to either:
1. Return early BEFORE removing card from hand, OR
2. Require `chooseColor` parameter to be provided upfront for wild cards

Current implementation in GameStateManager (line 920-930) handles this correctly by prompting for color before calling playCard, but the engine itself is in an inconsistent state during the interim.

---

### C3: UNO Call Reset Logic Missing
**File:** `lib/uno-engine.ts:316-318`
**Severity:** CRITICAL

```typescript
if (currentPlayer.hand.length === 1 && !currentPlayer.calledUno) {
  this.openUnoChallenge(playerId);
}
```

**Problem:** Once a player calls UNO (`calledUno = true`), this flag is NEVER reset. This means:
1. Player calls UNO when down to 1 card
2. Player draws more cards (now has 2+ cards)
3. Player plays down to 1 card again
4. Challenge window doesn't open because `calledUno` is still true

**Impact:** Players can call UNO once and never need to call it again for the entire game.

**Fix Required:** Reset `calledUno` to `false` when player's hand goes above 1 card (in `drawCard()` method).

---

## HIGH SEVERITY ISSUES

### H1: Missing State Persistence Methods
**File:** `managers/GameStateManager.ts`
**Severity:** HIGH

**Problem:** GameStateManager has these methods for UNO:
- `startUnoGame()` - calls `saveUnoGameState()`
- `advanceUnoGame()` - calls `loadUnoGameState()` and `saveUnoGameState()`
- `handleUnoAction()` - calls `loadUnoGameState()` and `saveUnoGameState()`

BUT these save/load callback methods are NOT implemented anywhere. They're passed as callbacks but never defined.

**Impact:** UNO games cannot be saved or loaded. State will be lost on every action.

**Fix Required:** Implement in main door index.ts:
```typescript
saveUnoGameState: (table, engine, beforeStacks, timestamp) => {
  table.hand = {
    snapshot: engine.serialize(),
    beforeStacks,
    startedAt: timestamp || Date.now(),
    updatedAt: Date.now(),
    variant: engine.getGameState().variant,
    events: [],
  };
},

loadUnoGameState: (table) => {
  if (!table.hand) return null;
  const engine = UnoGameEngine.deserialize(table.hand.snapshot);
  return { engine, beforeStacks: table.hand.beforeStacks };
}
```

---

### H2: Missing broadcastEvent Implementation
**File:** `managers/GameStateManager.ts`
**Severity:** HIGH

**Problem:** All UNO methods call `callbacks.broadcastEvent()` but this is not implemented anywhere.

**Impact:** Multi-node synchronization will not work. Players on different nodes won't see game updates.

**Fix Required:** Implement RPC handler in server.ts (as outlined in plan).

---

### H3: Draw Stack Not Cleared After Forced Draw
**File:** `lib/uno-engine.ts:345-388`
**Severity:** HIGH

```typescript
// Line 371-372
// Clear draw stack
this.state.drawStack = 0;

// Line 379-382
// If can't play drawn card (or drew multiple), turn ends
if (!canPlayDrawnCard || drawnCards.length > 1) {
  this.state.currentPlayerIndex = this.getNextPlayerIndex();
}
```

**Problem:** When a player draws from a Draw 2 or Wild Draw 4 stack, the drawStack is cleared (line 372) and turn advances (line 381). However, according to official UNO rules, if you're forced to draw from a Draw 2/Draw 4, your turn ALWAYS ends - you cannot play even if the drawn cards are playable.

**Current Behavior:** If player draws 1 card from draw stack, they get option to play it.

**Expected Behavior:** If draw stack > 0, player draws and turn ends automatically.

**Fix Required:** Change logic to always end turn when `cardsToDraw > 1` was true initially (from draw stack).

---

### H4: Missing Input Validation in handleUnoAction
**File:** `managers/GameStateManager.ts:869-1000`
**Severity:** HIGH

**Problem:** The `handleUnoAction()` method doesn't validate that the action types match what's expected:
- `play-card` expects `cardIndex` parameter but doesn't validate it's provided
- `choose-color` expects `chosenColor` but no validation
- No type guards on the `action` parameter

**Impact:** Runtime errors if called with wrong parameters.

**Fix Required:** Add parameter validation at start of method.

---

## MEDIUM SEVERITY ISSUES

### M1: Incomplete House Rules Implementation
**File:** `lib/uno-engine.ts`
**Severity:** MEDIUM

**Problem:** House Rules cards (HR1-HR5, WildChange) are defined in types and deck creation, but:
- No `createHouseRule()` method implemented
- No `activateHouseRule()` method implemented
- No `completeHouseRuleAction()` method implemented
- No `changeHouseRule()` method implemented

These were in the class signature comment but never implemented.

**Impact:** House Rules variant is incomplete. Marked as disabled in GAME_CATALOG which is correct.

**Fix Required:** Either implement House Rules fully or remove from Standard UNO deck.

---

### M2: Bot AI Doesn't Consider Draw Stack
**File:** `managers/GameStateManager.ts:756-815`
**Severity:** MEDIUM

**Problem:** Bot AI in `performBotUnoAction()` doesn't check if there's a draw stack. If previous player played Draw 2 or Wild Draw 4, bot should be forced to draw cards, not allowed to play a card.

**Current Behavior:** Bot will try to play cards even when draw stack is active.

**Expected Behavior:** If `state.drawStack > 0`, bot must draw cards (unless implementing stacking rules).

**Fix Required:** Add check at start of `performBotUnoAction()`:
```typescript
if (state.drawStack > 0) {
  const result = engine.drawCard(playerId);
  pushEvent(result.message);
  return;
}
```

---

### M3: No Protection Against Empty Draw Pile
**File:** `lib/uno-engine.ts:645-655`
**Severity:** MEDIUM

```typescript
private reshuffleDeck(): void {
  if (this.state.discardPile.length <= 1) {
    // Can't reshuffle - no cards available
    return;
  }
  // ...
}
```

**Problem:** If `reshuffleDeck()` can't reshuffle (only 1 card in discard), it just returns. But callers of `this.reshuffleDeck()` assume cards are available after calling it.

**Impact:** If draw pile runs out and discard pile only has 1 card, `shift()` on empty draw pile returns `undefined`, which gets pushed to player hand as undefined.

**Fix Required:**
1. Make `reshuffleDeck()` return boolean success
2. Check return value in all callers
3. Handle case where no more cards available (rare but possible)

---

## LOW SEVERITY ISSUES

### L1: Inconsistent Card ID Format
**File:** `lib/uno-engine.ts:118-133`
**Severity:** LOW

**Problem:** Card IDs are created as:
- Number cards: "R5", "G3" (color + number)
- Action cards: Should be "RSkip", "GReverse" but parsing at line 131 assumes single character color

**Current Code:**
```typescript
const value = id.substring(1) as UnoValue;  // Gets "Skip", "Reverse", etc.
```

This works for multi-character values like "Skip" but card creation does:
```typescript
createCard(`${color}Skip`)  // Creates "RSkip"
```

**Impact:** None currently, parsing works correctly. But ID format is inconsistent.

**Fix Required:** Document expected format or normalize to always use single-char values.

---

### L2: Magic Numbers in Bot AI
**File:** `managers/GameStateManager.ts:799-813`
**Severity:** LOW

**Problem:** Bot AI has magic numbers with no explanation:
- `Math.random() > 0.25` - 75% chance to play drawn card
- Priority values: 3, 2, 1, 0 - no constants defined

**Impact:** Hard to tune bot difficulty, unclear strategy.

**Fix Required:** Extract to named constants with comments explaining strategy.

---

## MISSING FEATURES (From Plan)

### MF1: Real-Time Event Broadcasting
**Status:** Not implemented
**Plan Reference:** Phase 4

**Missing Components:**
- `broadcastUnoEvent` RPC handler in server.ts
- `pollTableEvents` RPC handler in server.ts
- Event polling in main door loop
- Cross-node challenge window synchronization

**Impact:** Multi-node gameplay will not work.

---

### MF2: Main Door Integration
**Status:** Not implemented
**Plan Reference:** Integration needed

**Missing Components:**
- UNO game routing in index.ts
- UNO UI panel switching (vs poker panels)
- UNO action button setup
- Card selection input handling
- State save/load implementation

**Impact:** UNO cannot be played from door - only engine exists.

---

### MF3: UNO Achievements
**Status:** Not implemented
**Plan Reference:** Phase 8

**Missing:**
- UNO-specific achievements in constants.ts
- Achievement unlock logic in finalizeUnoGame

**Impact:** No progression system for UNO players.

---

## CODE QUALITY ISSUES

### Q1: TypeScript Type Safety
Several `as` type assertions that could be strengthened:
- Line 121, 127, 131: `as UnoValue` - could validate value first
- Line 130: `as UnoColor` - no validation

### Q2: Error Handling
Most methods return success/failure objects, but:
- No try/catch blocks for unexpected errors
- No logging of error conditions
- Silent failures in some places (e.g., reshuffleDeck)

### Q3: Missing Unit Tests
No unit tests created for:
- UnoGameEngine core logic
- Bot AI decision making
- Challenge mechanics
- State serialization/deserialization

---

## COMPLIANCE WITH CLAUDE.MD

### ✅ PASSED
- No emojis in code
- No stubs that silently fail (methods return error results)
- TypeScript compiles successfully
- No guessing - types are explicit
- File under 2000 lines (uno-engine.ts is 1077 lines)

### ⚠️ WARNINGS
- W1: Need to validate against express.e UNO implementation if one exists
- W2: No context efficiency issues, but could batch similar operations

---

## RECOMMENDATIONS

### Immediate Fixes (Before Testing)
1. **CRITICAL:** Fix Wild Draw 4 challenge logic (C1)
2. **CRITICAL:** Fix UNO call reset logic (C3)
3. **HIGH:** Implement state save/load methods (H1)
4. **HIGH:** Add draw stack check to bot AI (M2)

### Short-Term (Before Multi-Node Testing)
5. **CRITICAL:** Resolve wild card color choice flow (C2)
6. **HIGH:** Implement broadcastEvent (H2)
7. **HIGH:** Add input validation (H4)
8. **MEDIUM:** Fix empty draw pile handling (M3)

### Medium-Term (Before Production)
9. Complete main door integration
10. Add unit tests for engine
11. Implement real-time event system
12. Add UNO achievements

### Long-Term (Enhancement)
13. Implement House Rules variant fully
14. Add rule variants (stacking, jump-in, 7-0 rule)
15. Tune bot AI difficulty levels

---

## CONCLUSION

The UNO implementation has solid architecture and follows good patterns from the existing poker code. However, there are 3 critical bugs that must be fixed before any testing:

1. Wild Draw 4 challenge always succeeds (broken game mechanic)
2. UNO call flag never resets (exploit allowing players to skip UNO calls)
3. Missing state persistence (games can't be saved/loaded)

Additionally, the main door integration is completely missing, so UNO cannot actually be played yet.

**Estimated Fix Time:**
- Critical fixes: 2-3 hours
- High priority fixes: 3-4 hours
- Medium priority fixes: 2-3 hours
- Main door integration: 4-6 hours
- **Total: 11-16 hours to playable state**

The code quality is generally good with clear structure, proper TypeScript usage, and following established patterns. Once the critical bugs are fixed and integration is complete, this will be a solid UNO implementation.
