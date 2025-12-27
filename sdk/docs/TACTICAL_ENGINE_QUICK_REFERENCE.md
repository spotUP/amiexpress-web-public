# TacticalCombatEngine Quick Reference

Fast lookup for TacticalCombatEngine APIs. Fire Emblem-style grid-based tactical combat.

## Import

```typescript
import { TacticalCombatEngine } from '@amiexpress/sdk/engines/tactical';
const combat = new TacticalCombatEngine();
```

## Map Setup

```typescript
// Create map from terrain grid
combat.setMap({
  width: 15,
  height: 10,
  terrain: [
    ['plain', 'plain', 'forest', 'mountain', ...],
    ['plain', 'water', 'forest', 'plain', ...],
    // ... rows
  ]
});
```

## Terrain Types

| Terrain | Move Cost | Defense | Avoid | Description |
|---------|-----------|---------|-------|-------------|
| `plain` | 1 | 0 | 0 | Open ground |
| `forest` | 2 | +1 | +20 | Trees, cover |
| `mountain` | 4 | +2 | +30 | High ground |
| `water` | - | - | - | Impassable |
| `wall` | - | - | - | Impassable |
| `road` | 1 | 0 | 0 | Fast travel |
| `sand` | 2 | 0 | +5 | Desert |
| `bridge` | 1 | 0 | 0 | Over water |
| `fort` | 2 | +3 | +20 | Defensive |
| `throne` | 1 | +3 | +30 | Boss position |

## Creating Units

```typescript
// Create a unit
const unit = combat.createUnit({
  id: 'knight-1',
  name: 'Marcus',
  team: 'player',        // player, enemy, ally, neutral
  class: 'knight',
  x: 5, y: 3,
  stats: {
    hp: 30, maxHp: 30,
    str: 12,              // Physical attack
    mag: 2,               // Magic attack
    skl: 8,               // Hit rate
    spd: 6,               // Attack speed, avoid
    lck: 5,               // Crit avoid
    def: 10,              // Physical defense
    res: 3,               // Magic resistance
    mov: 5                // Movement range
  },
  weapon: {
    name: 'Iron Lance',
    type: 'lance',
    might: 7,
    hit: 80,
    crit: 0,
    range: [1],           // Melee only
    weight: 8
  }
});
```

## Unit Classes

| Class | Move | Weapon Types | Notes |
|-------|------|--------------|-------|
| `lord` | 5 | Sword | Main character |
| `knight` | 5 | Lance | High defense |
| `cavalier` | 7 | Sword, Lance | Mounted |
| `pegasus` | 7 | Lance | Flying |
| `mage` | 5 | Tome | Magic damage |
| `archer` | 5 | Bow | Range 2 |
| `thief` | 6 | Sword | Can steal |
| `mercenary` | 5 | Sword | Balanced |
| `fighter` | 5 | Axe | High strength |

## Weapon Triangle

```
Sword > Axe > Lance > Sword
```

Advantage: +15 Hit, +1 Damage
Disadvantage: -15 Hit, -1 Damage

## Movement and Range

```typescript
// Get tiles unit can move to
const moveTiles = combat.getMovementRange('knight-1');
// Returns: { x: number, y: number }[]

// Get tiles unit can attack from current position
const attackTiles = combat.getAttackRange('knight-1');

// Move unit
combat.moveUnit('knight-1', 7, 5);

// Check if unit can reach tile
const canReach = combat.canReach('knight-1', 10, 5);
```

## Combat

```typescript
// Get valid attack targets
const targets = combat.getAttackTargets('knight-1');
// Returns: string[] of unit IDs

// Get battle forecast (before committing)
const forecast = combat.getBattleForecast('knight-1', 'enemy-1');
// Returns: {
//   attacker: { damage: 12, hit: 85, crit: 5, doubleAttack: true },
//   defender: { damage: 8, hit: 70, crit: 0, doubleAttack: false }
// }

// Execute combat
const result = combat.executeCombat('knight-1', 'enemy-1');
// Returns: {
//   attacks: [{ attacker, damage, hit, crit, killed }, ...],
//   attackerAlive: true,
//   defenderAlive: false,
//   expGained: 30
// }
```

## Combat Formulas

```
Physical Damage = Str + Weapon Might - Enemy Def
Magic Damage = Mag + Tome Might - Enemy Res
Hit Rate = Weapon Hit + (Skl * 2) + Lck - Enemy Avoid
Avoid = (Spd * 2) + Lck + Terrain Avoid
Crit Rate = Weapon Crit + (Skl / 2)
Crit Avoid = Lck
Double Attack = Speed >= Enemy Speed + 4
```

## Phase Management

```typescript
// Start player phase
combat.startPhase('player');

// End current phase
combat.endPhase();

// Get current phase
const phase = combat.getCurrentPhase();
// Returns: 'player' | 'enemy' | 'ally'

// Get units that haven't acted
const available = combat.getAvailableUnits('player');

// Mark unit as acted (grayed out)
combat.setUnitActed('knight-1');

// Check if all units have acted
const phaseComplete = combat.isPhaseComplete('player');
```

## Experience and Leveling

```typescript
// Award experience
combat.awardExp('knight-1', 30);

// Check for level up
const levelUp = combat.checkLevelUp('knight-1');
if (levelUp) {
  console.log('Level up! Gains:', levelUp.statGains);
  // { hp: 1, str: 1, spd: 0, def: 1, ... }
}

// Get unit level
const level = combat.getUnitLevel('knight-1');
```

## Healing and Items

```typescript
// Heal unit
combat.healUnit('knight-1', 10);

// Use item
combat.useItem('knight-1', 'vulnerary');  // Heal 10 HP

// Equip weapon
combat.equipWeapon('knight-1', 'Silver Lance');
```

## Unit Management

```typescript
// Get unit by ID
const unit = combat.getUnit('knight-1');

// Get all units on team
const playerUnits = combat.getTeamUnits('player');

// Get units in area
const nearby = combat.getUnitsInRange(5, 5, 3);  // x, y, radius

// Remove unit (death)
combat.removeUnit('enemy-1');

// Check if unit is alive
const alive = combat.isUnitAlive('knight-1');
```

## Win/Lose Conditions

```typescript
// Set victory condition
combat.setVictoryCondition({
  type: 'rout',          // Defeat all enemies
  // OR
  type: 'boss',          // Defeat specific unit
  targetId: 'boss-1',
  // OR
  type: 'seize',         // Reach objective
  targetX: 14, targetY: 5,
  // OR
  type: 'survive',       // Survive turns
  turns: 10
});

// Check win/lose
const victory = combat.checkVictory();
const defeat = combat.checkDefeat();
```

## Events

```typescript
combat.on('phaseStart', (team) => { });
combat.on('unitMoved', (unitId, from, to) => { });
combat.on('combatStart', (attackerId, defenderId) => { });
combat.on('combatEnd', (result) => { });
combat.on('unitDefeated', (unitId, byUnitId) => { });
combat.on('levelUp', (unitId, gains) => { });
combat.on('victory', () => { });
combat.on('defeat', () => { });
```

## Example: Basic Battle

```typescript
const combat = new TacticalCombatEngine();

// Setup map
combat.setMap({
  width: 10,
  height: 8,
  terrain: mapData
});

// Create player unit
combat.createUnit({
  id: 'hero',
  name: 'Aldric',
  team: 'player',
  class: 'lord',
  x: 2, y: 4,
  stats: { hp: 25, maxHp: 25, str: 10, skl: 9, spd: 8, def: 7, res: 5, mov: 5 },
  weapon: { name: 'Iron Sword', type: 'sword', might: 5, hit: 90, range: [1] }
});

// Create enemy
combat.createUnit({
  id: 'bandit',
  team: 'enemy',
  class: 'fighter',
  x: 6, y: 4,
  stats: { hp: 20, maxHp: 20, str: 8, skl: 5, spd: 5, def: 4, res: 2, mov: 5 },
  weapon: { name: 'Iron Axe', type: 'axe', might: 8, hit: 75, range: [1] }
});

// Player turn
combat.startPhase('player');

// Move and attack
combat.moveUnit('hero', 5, 4);  // Move adjacent to enemy
const forecast = combat.getBattleForecast('hero', 'bandit');
console.log(`You deal ${forecast.attacker.damage} (${forecast.attacker.hit}% hit)`);

const result = combat.executeCombat('hero', 'bandit');
if (!result.defenderAlive) {
  console.log('Enemy defeated!');
}

combat.endPhase();
```

## Cleanup

```typescript
combat.dispose();  // Clear all units and map
```
