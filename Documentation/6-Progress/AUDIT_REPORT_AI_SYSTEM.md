# AI System Audit Report

**Date:** 2026-01-22
**Auditor:** Claude
**Scope:** Card Game AI System (Poker & UNO)

---

## CRITICAL BUGS (Must Fix)

### 1. CRITICAL: Card Format Bug in Poker AI
**File:** `sdk/engines/cards/ai/utils/hand-strength.ts:15-24`

**Issue:** `parsePokerCard()` doesn't lowercase the suit character.

```typescript
// Current code (BROKEN):
function parsePokerCard(card: string): string {
  const trimmed = card.trim().toUpperCase();
  const suit = trimmed.slice(-1);  // Returns "S" not "s"
  const rank = trimmed.slice(0, -1);
  const normalizedRank = rank === '10' ? 'T' : rank;
  return `${normalizedRank}${suit}`;  // Returns "AS" not "As"
}
```

**Impact:** @pokertools/evaluator expects lowercase suits ("As", "Kh"). This will cause evaluation failures or incorrect hand rankings.

**Fix:**
```typescript
function parsePokerCard(card: string): string {
  const trimmed = card.trim().toUpperCase();
  const suit = trimmed.slice(-1).toLowerCase();  // Add .toLowerCase()
  const rank = trimmed.slice(0, -1);
  const normalizedRank = rank === '10' ? 'T' : rank;
  return `${normalizedRank}${suit}`;
}
```

---

### 2. CRITICAL: Division by Zero in Pot Odds
**File:** `sdk/engines/cards/ai/utils/hand-strength.ts:167-180`

**Issue:** Division by zero if `callAmount` is 0.

```typescript
export function calculatePotOdds(
  currentPot: number,
  callAmount: number
): PotOdds {
  const potSize = currentPot + callAmount;
  const odds = potSize / callAmount;  // CRASH if callAmount === 0
  const requiredEquity = callAmount / potSize;  // CRASH if potSize === 0
  // ...
}
```

**Impact:** Crashes AI if pot odds calculation attempted with 0 call amount.

**Fix:**
```typescript
export function calculatePotOdds(
  currentPot: number,
  callAmount: number
): PotOdds {
  if (callAmount === 0) {
    return {
      callAmount: 0,
      potSize: currentPot,
      odds: Infinity,
      requiredEquity: 0,
    };
  }

  const potSize = currentPot + callAmount;
  const odds = potSize / callAmount;
  const requiredEquity = callAmount / potSize;
  // ...
}
```

---

### 3. CRITICAL: Card Exhaustion in Monte Carlo
**File:** `sdk/engines/cards/ai/utils/hand-strength.ts:101-114`

**Issue:** No validation that enough cards remain in deck for simulation.

```typescript
for (let opp = 0; opp < numOpponents; opp++) {
  opponentHands.push([shuffled[cardIndex++], shuffled[cardIndex++]]);
}
// If numOpponents * 2 + cardsNeeded > shuffled.length,
// we'll push undefined into opponentHands
```

**Impact:** With many opponents (e.g., 9-player table), simulation could exceed available cards, causing undefined in evaluateStrings() and crashes.

**Fix:**
```typescript
// Before simulation loop:
const cardsNeededPerSim = numOpponents * 2 + (5 - board.length);
if (cardsNeededPerSim > deck.length) {
  console.warn('[HandStrength] Not enough cards for full simulation, reducing opponents');
  numOpponents = Math.floor((deck.length - (5 - board.length)) / 2);
}
```

---

### 4. CRITICAL: UNO Card Counting Double-Counts Cards
**File:** `sdk/engines/cards/ai/uno-ai-strategy.ts:281-288`

**Issue:** `updateCardCounting()` tracks ALL cards in discard pile every time, causing exponential double-counting.

```typescript
private updateCardCounting(playerId: string, discardPile: any[]): void {
  const state = this.cardCounting.get(playerId);
  if (!state) return;

  // Track all cards in discard pile (simple approach - just update totals)
  for (const card of discardPile) {
    trackCard(state, card.color, card.value);  // COUNTS SAME CARDS MULTIPLE TIMES
  }
}
```

**Impact:** Card counts become wildly inaccurate after a few turns. Color selection and challenge decisions based on incorrect data.

**Fix:**
```typescript
export class UnoAIStrategy implements CardGameAIStrategy {
  private cardCounting: Map<string, CardCountingState> = new Map();
  private lastDiscardCount: Map<string, number> = new Map();  // NEW: track last count

  private updateCardCounting(playerId: string, discardPile: any[]): void {
    const state = this.cardCounting.get(playerId);
    if (!state) return;

    const lastCount = this.lastDiscardCount.get(playerId) ?? 0;
    const newCards = discardPile.slice(lastCount);  // Only NEW cards

    for (const card of newCards) {
      trackCard(state, card.color, card.value);
    }

    this.lastDiscardCount.set(playerId, discardPile.length);
  }
}
```

---

## HIGH PRIORITY BUGS (Should Fix)

### 5. HIGH: UNO Discard Pile Could Be Empty
**File:** `sdk/engines/cards/ai/uno-ai-strategy.ts:154`

**Issue:** No check if `discardPile` is empty before accessing.

```typescript
const topCard = state.discardPile[state.discardPile.length - 1];
// topCard is undefined if discardPile is empty
```

**Impact:** Crash if AI tries to make decision when discard pile is empty (shouldn't happen in normal play, but defensive coding is needed).

**Fix:**
```typescript
if (!state.discardPile || state.discardPile.length === 0) {
  // Shouldn't happen, but fallback to drawing
  return {
    type: 'uno',
    action: UnoActionType.DRAW_CARD,
    reasoning: 'Empty discard pile',
  };
}
const topCard = state.discardPile[state.discardPile.length - 1];
```

---

### 6. HIGH: UNO Challenge Probability Can Exceed 1.0
**File:** `sdk/engines/cards/ai/uno-ai-strategy.ts:268`

**Issue:** Multiplying probability by 1.5 can exceed 1.0.

```typescript
if (challengeWindow.wasIllegalWildDrawFour) {
  return Math.random() < challengeProbability * 1.5;
  // If challengeProbability is 0.95, this becomes 1.425
  // Math.random() < 1.425 is always true
}
```

**Impact:** Expert bots (0.95 probability) will ALWAYS challenge illegal wilds instead of 95% of the time.

**Fix:**
```typescript
if (challengeWindow.wasIllegalWildDrawFour) {
  return Math.random() < Math.min(1.0, challengeProbability * 1.5);
}
```

---

### 7. HIGH: UNO Calls Without Playing Card
**File:** `sdk/engines/cards/ai/uno-ai-strategy.ts:78-86`

**Issue:** When player has 2 cards, AI returns CALL_UNO action without playing a card. This creates a separate turn for calling UNO.

```typescript
if (player.hand.length === 2 && !player.calledUno) {
  return {
    type: 'uno',
    action: UnoActionType.CALL_UNO,
    reasoning: 'Calling UNO preemptively',
  };
}
```

**Impact:** Depends on how UNO engine handles this. If engine expects UNO call to be part of card play action, this won't work correctly.

**Recommendation:** Verify UNO engine API. If engine requires combined action, modify to:
```typescript
// Don't return early - instead set a flag
const shouldCallUno = player.hand.length === 2 && !player.calledUno;

// Later, when playing card:
if (shouldCallUno) {
  // Call UNO before playing card
  engine.callUno(playerId);
}
// Then play card as normal
```

---

### 8. HIGH: Missing Amount Validation in Integration
**File:** `Doors/card-lobby/managers/GameStateManager.ts:347-361`

**Issue:** BET and RAISE actions assume `decision.amount` exists, but it's optional in the type definition.

```typescript
case 'bet':
  if (decision.amount) {  // Good - checks existence
    engine.act({ type: PokerAction.BET, playerId, amount: decision.amount });
    pushEvent(`${actorSeat.name} bets ${decision.amount}`);
  }
  break;
```

**Impact:** If `decision.amount` is undefined, nothing happens (silent failure). Better to have explicit fallback.

**Fix:**
```typescript
case 'bet':
  if (decision.amount) {
    engine.act({ type: PokerAction.BET, playerId, amount: decision.amount });
    pushEvent(`${actorSeat.name} bets ${decision.amount}`);
  } else {
    // Fallback: check if we can't bet
    engine.act({ type: PokerAction.CHECK, playerId });
    pushEvent(`${actorSeat.name} checks (bet amount missing)`);
  }
  break;
```

---

## MEDIUM PRIORITY ISSUES (Recommended Fixes)

### 9. MEDIUM: Poker Mistake Logic Could Be Improved
**File:** `sdk/engines/cards/ai/poker-ai-strategy.ts:276-294`

**Issue:** `makeMistake()` doesn't consider game context when making random mistakes.

```typescript
if (toCall === 0) {
  return {
    type: 'poker',
    action: Math.random() < 0.5 ? PokerActionType.CHECK : PokerActionType.BET,
    amount: Math.random() < 0.5 ? engine.state.bigBlind : Math.floor(stack * 0.3),
    reasoning: 'Random mistake',
  };
}
```

**Impact:** Easy bots might bet 30% of stack randomly, which is sometimes not a mistake. Could be more realistic.

**Recommendation:** Make mistakes more context-aware:
```typescript
// Random overbet (mistake)
if (toCall === 0 && Math.random() < 0.3) {
  return {
    type: 'poker',
    action: PokerActionType.BET,
    amount: Math.floor(stack * (0.5 + Math.random() * 0.5)),  // Bet 50-100% of stack
    reasoning: 'Overbet mistake',
  };
}

// Random fold (mistake)
if (toCall > 0 && Math.random() < 0.3) {
  return {
    type: 'poker',
    action: PokerActionType.FOLD,
    reasoning: 'Folding mistake',
  };
}
```

---

### 10. MEDIUM: UNO CHOOSE_COLOR Action Type
**File:** `sdk/engines/cards/ai/uno-ai-strategy.ts:132`

**Issue:** Returns `UnoActionType.CHOOSE_COLOR` but this might not match engine's expected API.

```typescript
return {
  type: 'uno',
  action: UnoActionType.CHOOSE_COLOR,
  cardIndex: bestCard.index,
  color: chosenColor,
  // ...
};
```

**Impact:** Depends on engine integration. If engine expects PLAY_CARD with color parameter instead, this won't work.

**Recommendation:** Verify UNO engine API at `Doors/card-lobby/lib/uno-engine.ts`. Check if `playCard()` accepts color parameter or if separate `chooseColor()` method exists.

---

## LOW PRIORITY / ENHANCEMENTS

### 11. Type Safety: Replace `any` Types
**Files:** Multiple

**Issue:** Many functions use `any` types for engine state, reducing type safety.

**Recommendation:** Create proper TypeScript interfaces for engine state structures in `types.ts`.

---

### 12. Performance: Cache Hand Evaluations
**File:** `sdk/engines/cards/ai/utils/hand-strength.ts`

**Issue:** Hand evaluation happens every decision. For same hole cards + board, result is identical.

**Recommendation:** Add memoization:
```typescript
const evaluationCache = new Map<string, HandStrength>();

export function evaluateHandStrength(
  holeCards: readonly string[],
  boardCards: readonly string[]
): HandStrength {
  const cacheKey = [...holeCards, ...boardCards].sort().join(',');
  if (evaluationCache.has(cacheKey)) {
    return evaluationCache.get(cacheKey)!;
  }

  // ... existing evaluation logic ...

  evaluationCache.set(cacheKey, result);
  return result;
}
```

---

### 13. UX: Add Debug Logging
**Files:** All strategy files

**Issue:** No visibility into AI decision-making for debugging.

**Recommendation:** Add optional debug parameter:
```typescript
export class PokerAIStrategy implements CardGameAIStrategy {
  constructor(private debug: boolean = false) {}

  async makeDecision(context: DecisionContext): Promise<AIDecision> {
    // ...
    if (this.debug) {
      console.log('[PokerAI]', {
        equity,
        position,
        action: decision.action,
        reasoning: decision.reasoning,
      });
    }
    return decision;
  }
}
```

---

## TESTING RECOMMENDATIONS

### Unit Tests Needed
1. **hand-strength.ts**
   - Test card format parsing with various inputs
   - Test pot odds with edge cases (0 call, 0 pot)
   - Test Monte Carlo with max players (9)
   - Test equity calculation accuracy

2. **poker-ai-strategy.ts**
   - Test each difficulty level makes appropriate decisions
   - Test mistake frequency matches skillLevel config
   - Test position awareness adjustments
   - Test bluff frequency

3. **uno-ai-strategy.ts**
   - Test card counting accuracy
   - Test color selection logic
   - Test challenge timing
   - Test UNO calling logic

4. **Integration**
   - Test AI initialization in card-lobby
   - Test bot difficulty assignment
   - Test fallback to legacy bot
   - Test error handling

### Manual Testing Checklist
- [ ] Easy bot makes obvious mistakes (folds good hands, bets randomly)
- [ ] Medium bot uses basic strategy (pot odds, position)
- [ ] Hard bot plays strong (rarely makes mistakes)
- [ ] Expert bot plays near-optimally (almost never makes mistakes)
- [ ] Bots never crash the game
- [ ] Bots make legal moves only
- [ ] Poker games complete successfully with 2-9 players
- [ ] UNO games complete successfully with 2-10 players
- [ ] Bot thinking delays feel realistic
- [ ] Performance meets targets (<100ms poker, <10ms UNO)

---

## SUMMARY

**Total Issues Found:** 13
- **Critical:** 4 bugs (must fix before deployment)
- **High Priority:** 4 bugs (should fix soon)
- **Medium Priority:** 2 issues (recommended)
- **Low Priority:** 3 enhancements (nice to have)

**Estimated Fix Time:**
- Critical bugs: 2-3 hours
- High priority: 2-3 hours
- Medium priority: 1-2 hours
- **Total: 5-8 hours**

**Overall Assessment:**
The AI system has a solid architecture using the Strategy pattern and difficulty-based configuration. The core logic is sound but has several critical bugs that will cause crashes or incorrect behavior in production. After fixing the critical and high-priority bugs, the system should be production-ready for testing.

---

## RECOMMENDATIONS

1. **Fix all CRITICAL bugs immediately** - These will cause crashes or incorrect gameplay
2. **Add comprehensive unit tests** - Especially for edge cases
3. **Verify UNO engine integration** - Check action types and API compatibility
4. **Add debug logging** - Will help identify issues during testing
5. **Performance profiling** - Verify <100ms poker decisions with 200 MC samples
6. **Manual playtesting** - Each difficulty level for both games

---

**Audit Complete**
