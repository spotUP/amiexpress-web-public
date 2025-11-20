# Dungeon RPG - Complete SDK Example

A comprehensive dungeon crawler RPG demonstrating **ALL** AmiExpress SDK features in one cohesive game.

## 🎮 Features Demonstrated

This example showcases the complete SDK in action:

### **AI Engine**
- Enemy pathfinding with A* algorithm
- Patrol behavior (waypoint-based)
- Chase behavior (player detection)
- Sight range and aggro mechanics

### **Level Manager**
- Tile-based dungeon maps loaded from ASCII
- Wall collision detection
- Spawn points for player/enemies
- NPC placement
- Multiple tile types (walls, floors, exits)

### **Inventory System**
- Item management and storage
- Equipment slots
- Item usage (health potions)
- Weight/capacity limits
- Consumable items

### **Save Manager**
- Complete game state persistence
- Save player stats, inventory, quest progress
- Save/load enemy positions
- Dialogue state preservation

### **Dialogue System**
- Branching NPC conversations
- Conditional dialogue (based on gold, items)
- Flag tracking for story progress
- Quest integration
- Item rewards from dialogue

### **Quest System**
- Multi-objective quests
- Progress tracking
- Quest rewards (gold, XP)
- Achievement system
- Quest completion callbacks

### **Graphics Engine**
- ANSI dungeon rendering
- Player, enemy, NPC sprites
- HUD display
- Menu screens

### **Physics Engine**
- Collision detection with walls
- Player/enemy movement validation

### **Audio Engine**
- Sound effects (footsteps, hits, kills)
- Audio feedback for actions

### **Input Engine**
- Action binding for all controls
- Movement, combat, menu navigation

### **HUD Builder**
- Health bar
- Level/XP/Gold display
- Control instructions

## 🕹️ How to Play

### Controls

- **Arrow Keys**: Move your character
- **Space**: Attack adjacent enemies
- **I**: Open inventory
- **Q**: View quests
- **T**: Talk to NPC (when adjacent)
- **S**: Save game
- **L**: Load game

### Gameplay

1. **Start in the dungeon** - You spawn at 'S'
2. **Talk to the Wizard** - Find the '@' NPC and press T
3. **Get a quest** - Accept the quest to clear the dungeon
4. **Fight goblins** - 'G' enemies patrol the dungeon
5. **Collect rewards** - Gain XP and gold from kills
6. **Complete objectives** - Kill all enemies to complete quest
7. **Save progress** - Press S to save anytime

## 🎯 Quest: Clear the Dungeon

**Objective**: Defeat all goblins in the dungeon

**Rewards**:
- 100 Gold
- 100 XP

**Strategy**:
- Talk to the Wizard first for a health potion
- Engage enemies one at a time
- Use hit-and-run tactics
- Save often!

## 🏆 Achievements

### First Blood
**Description**: Defeat your first enemy
**Points**: 10
**Unlocks**: Automatically when you kill your first goblin

## 📚 Game Mechanics

### Combat System
- Player deals 20 damage per hit
- Goblins have 30 HP
- Attack adjacent enemies with Space
- No friendly fire

### Progression
- Gain XP from kills (25 per goblin)
- Earn gold from kills (10 per goblin)
- Level up system (placeholder)

### AI Behavior
- **Patrol**: Enemies walk waypoints when idle
- **Chase**: Enemies pursue player when in sight range (8 tiles)
- **Pathfinding**: Enemies use A* to navigate obstacles

### Dialogue System
- Talk to NPCs when standing next to them
- Make dialogue choices with number keys
- Unlock items and quests through conversation
- Dialogue remembers your choices (flags)

### Inventory
- Health Potion: Restores 50 HP (from Wizard)
- Magic Spell: Purchase from Wizard for 50 gold
- Equipment slots available (future expansion)

## 🗺️ Dungeon Map

```
####################
#..................#    # = Wall
#..S.........E....#    . = Floor
#....#####.........#    S = Player Spawn
#....#...#.........#    E = Enemy
#....#.N.#.........#    N = NPC (Wizard)
#....#...#.........#    X = Exit (unused)
#....#####.........#
#..................#
#.........#####....#
#.........#...#....#
#.........#.X.#....#
#.........#...#....#
#.........#####....#
#..................#
####################
```

## 💾 Save/Load System

### Save Game
- Press **S** to save current progress
- Saves to slot 1 automatically
- Includes:
  - Player position, HP, level, XP, gold
  - Enemy positions and HP
  - Inventory contents
  - Quest progress
  - Dialogue flags

### Load Game
- Press **L** to load saved game
- Restores complete game state
- Continue exactly where you left off

## 🔧 Technical Implementation

### Game Loop
```typescript
- Update (10 FPS)
  - Update AI agents
  - Sync enemy positions from AI
  - Check player proximity for aggro
  - Check achievements

- Render
  - Clear screen
  - Render dungeon tiles
  - Render NPCs and enemies
  - Render player
  - Render HUD
```

### State Management
```typescript
interface Player {
  x, y: number;           // Position
  hp, maxHp: number;      // Health
  level, xp: number;      // Progression
  gold: number;           // Currency
}

interface Enemy {
  id, name: string;
  x, y: number;
  hp, maxHp: number;
  damage, xp, gold: number;
}
```

### Integration Points

**Dialogue → Inventory**
```typescript
// Wizard gives potion through dialogue
action: (ctx) => {
  this.inventory.addItem({
    id: 'health_potion',
    name: 'Health Potion',
    // ...
  });
}
```

**Combat → Quests**
```typescript
// Killing enemy updates quest
this.quests.updateProgress('clear_dungeon', 'kill_goblins', 1);
```

**Save Manager → All Systems**
```typescript
// Complete game state serialization
await this.saveMgr.save(1, {
  player: this.player,
  enemies: Array.from(this.enemies.entries()),
  inventory: this.inventory.exportToJSON(),
  quests: this.quests.exportState(),
  dialogue: this.dialogue.saveState()
});
```

## 🚀 Running the Game

### Development Mode
```bash
npm run dev
```

### Production Build
```bash
npm run build
npm start
```

### Preview in Browser
```bash
npm run preview
```

Then select "dungeon-rpg" from the door list.

## 📖 Learning from This Example

This is the **ultimate reference** for SDK usage. Study it to learn:

1. **System Integration** - How all components work together
2. **Game Architecture** - Proper structure for complex doors
3. **State Management** - Handling player, enemy, and world state
4. **Event Flow** - Coordinating actions across systems
5. **Best Practices** - Patterns for maintainable code

## 🎓 Extending This Game

Ideas for enhancements:

### Easy
- Add more NPCs with different dialogues
- Create new quest chains
- Add more item types
- Expand the dungeon map

### Medium
- Implement equipment system (weapons, armor)
- Add more enemy types with different behaviors
- Create multiple dungeon levels
- Add magic spell system
- Implement shops for buying/selling

### Hard
- Add turn-based combat system
- Implement character classes
- Create procedural dungeon generation
- Add multiplayer co-op
- Build boss battles

## 📝 Code Statistics

- **Total Lines**: ~650
- **Systems Used**: 11 (all of them!)
- **Features Demonstrated**: 40+
- **NPCs**: 1 (Wizard)
- **Enemies**: Dynamic (from map)
- **Quests**: 1 main + 1 achievement
- **Items**: 2 (health potion, spell)

## 🏆 Completion Checklist

Use this to verify all SDK features are working:

- [x] AI pathfinding (enemy patrol)
- [x] AI chase behavior (aggro on sight)
- [x] Level tile rendering
- [x] Collision detection
- [x] Inventory add/remove items
- [x] Save game state
- [x] Load game state
- [x] Dialogue trees with choices
- [x] Conditional dialogue
- [x] Quest tracking
- [x] Quest completion
- [x] Achievement unlocking
- [x] Graphics rendering
- [x] HUD display
- [x] Audio playback
- [x] Input binding
- [x] Physics collision

## License

MIT License - Free to use and modify for your own doors.
