# Fire Emblem: Emblem of Valor

A complete Fire Emblem-style tactical RPG built with the AmiExpress BBS Door SDK.

## Story

The kingdom of Valdora faces invasion from the Darklands Empire. Prince Aldric must lead a ragtag band of heroes to defend his homeland, forge alliances, and uncover the dark secrets behind the invasion.

## Features

### Single Player Campaign

- **15+ Story Chapters** - Epic campaign with varied objectives
- **20+ Unique Characters** - Each with their own personality and backstory
- **Character Development** - Level up, promote classes, learn skills
- **Support System** - Build relationships between characters
- **Multiple Difficulty Levels** - Easy, Normal, Hard, Lunatic
- **Permadeath Option** - Classic Fire Emblem challenge

### Tactical Combat

- **Grid-Based Combat** - Strategic positioning and movement
- **Weapon Triangle System** - Sword > Axe > Lance > Sword
- **Combat Forecasting** - Preview battle results before engaging
- **Critical Hits & Double Attacks** - Based on stats and skills
- **Terrain Effects** - Forests, mountains, and more affect battle
- **Phase-Based Turns** - Player Phase → Enemy Phase

### Class System

**Base Classes (Tier 1):**
- Lord - Versatile leader with balanced stats
- Cavalier - Mounted lance/sword user
- Knight - Heavy armor, high defense
- Myrmidon - Fast sword fighter
- Mage - Magic user with tomes
- Archer - Ranged bow attacks
- Pegasus Knight - Flying lance user
- Cleric - Healing staff user
- Mercenary - Balanced sword fighter
- Fighter - Axe wielding warrior

**Advanced Classes (Tier 2):**
- Great Lord, Paladin, General, Swordmaster, Sage, Sniper, Falcon Knight, Hero, Warrior, Assassin

Each class has:
- Unique stat growths
- Weapon proficiencies
- Movement type (Infantry, Cavalry, Flying, Armored)
- Learnable skills

### Skills System

**40+ Skills** including:
- **Passive Skills**: HP +5, Strength +2, Speed +2, Avoid +10
- **Combat Skills**: Sol, Luna, Astra, Aether, Lethality
- **Defensive Skills**: Pavise, Aegis, Miracle
- **Stance Skills**: Armored Blow, Darting Blow
- **Weapon Skills**: Swordfaire, Lancefaire, Axefaire
- **Utility Skills**: Pass, Canter, Armsthrift

### Multiplayer Modes

- **Skirmish** - 1v1 tactical battles on preset maps
- **Team Battle** - 2v2 cooperative battles
- **Draft Battle** - Players alternate picking units, then battle
- **Co-op Campaign** - Play story mode with a friend

## Playable Characters

### Starting Roster

**Aldric** - Prince of Valdora (Lord)
- Balanced stats, natural leader
- Learns: Charm, Dual Strike+

**Elara** - Knight Commander (Cavalier)
- High mobility mounted knight
- Learns: Canter, Discipline

**Marcus** - Royal Strategist (Mage)
- Powerful magic attacks
- Learns: Magic +2, Focus

**Lysandra** - Wandering Swordfighter (Myrmidon)
- High skill and speed, devastating criticals
- Learns: Avoid +10, Vantage

**Gareth** - Mountain Warrior (Fighter)
- Raw strength with axes
- Learns: Strength +2, Wrath

**Selena** - Healer Priestess (Cleric)
- Essential support unit
- Learns: Resistance +2, Miracle

**Theron** - Elite Archer (Archer)
- Long-range precision attacks
- Learns: Skill +2, Bowfaire

**Nina** - Sky Knight (Pegasus Knight)
- High mobility flying unit
- Learns: Speed +2, Darting Blow

**Roland** - Grizzled Mercenary (Mercenary)
- Veteran fighter, reliable damage
- Learns: HP +5, Armsthrift

**Darius** - Iron Wall (Knight)
- Impenetrable defense
- Learns: Defense +2, Wary Fighter

### Recruit More Characters!

Many more characters join throughout the campaign, each with unique abilities and stories.

## Chapter Objectives

### Objective Types

- **Rout** - Defeat all enemies
- **Defeat** - Defeat the boss unit
- **Survive** - Survive X turns
- **Defend** - Defend a location for X turns
- **Escape** - Get units to the escape point
- **Seize** - Seize throne or gate

### Sample Chapters

**Chapter 1: The Fall of Valdora**
- Objective: Escape the castle
- Units: Aldric, Elara, Marcus
- Story: The Darklands Empire attacks! Escape with your life!

**Chapter 2: Refuge in the Forest**
- Objective: Survive 8 turns
- Story: Pursued by enemies in the Whispering Woods

**Chapter 3: The Swordfighter**
- Objective: Defeat all enemies
- Story: Lysandra joins your cause
- Reward: Recruit Lysandra

**Chapter 4: Mountain Pass**
- Objective: Defeat the bandit leader
- Story: Navigate treacherous mountain paths
- Reward: Recruit Gareth

**Chapter 5: Sacred reference-board**
- Objective: Defend temple for 10 turns
- Story: Protect the temple from Imperial forces
- Reward: Recruit Selena (Cleric)

## Combat Mechanics

### Weapon Triangle

```
Sword → Axe → Lance → Sword
  ↓      ↓      ↓
 +15    +15    +15   (Hit and Avoid)
```

Advantage also activates **Break** - prevents counterattack!

### Stats Explained

- **HP** - Hit Points, unit dies at 0
- **Str** - Strength, physical damage
- **Mag** - Magic, magical damage
- **Skl** - Skill, affects hit rate and criticals
- **Spd** - Speed, affects avoid and double attacks
- **Lck** - Luck, affects all calculations slightly
- **Def** - Defense, reduces physical damage
- **Res** - Resistance, reduces magical damage
- **Mov** - Movement range per turn

### Hit Rate Calculation

```
Hit% = Weapon Hit + (Skill × 2) + Luck
     - (Enemy Speed × 2) - Enemy Luck
     + Weapon Triangle Bonus
     + Terrain Bonus
```

### Damage Calculation

```
Damage = Weapon Might + Attack Stat - Defense Stat
       + Weapon Triangle Bonus
```

### Critical Hit

```
Crit% = Weapon Crit + (Skill ÷ 2) - Enemy Luck
Critical Damage = Damage × 3
```

### Double Attack

```
If (Attacker Speed - Defender Speed) ≥ 4:
  Attacker attacks twice
```

### Experience & Leveling

```
Base Exp = 10
+ Level Difference Bonus
+ 30 for defeating enemy
+ 40 for defeating with final blow

Level Up: Random stat increases based on Growth Rates
```

## Growth Rates

Each unit has percentage chances to increase stats on level up:

**Example: Aldric (Lord)**
- HP: 80% - Str: 40% - Mag: 5% - Skl: 50%
- Spd: 50% - Lck: 60% - Def: 30% - Res: 25%

Higher growth rates = more likely to increase that stat!

## Class Promotion

- Promote at **Level 10+** (varies by class)
- Gain **stat bonuses** immediately
- Access to **new weapons**
- Learn **advanced skills**
- Increased **stat caps**

Example: Myrmidon → Swordmaster
- +2 HP, +1 Str, +2 Skl, +3 Spd, +1 Lck, +1 Def, +1 Res, +1 Mov
- Learns: Astra (5 hits at 50% damage)
- Learns: Swordfaire (+5 damage with swords)

## How to Play

### Single Player

```typescript
import { Door } from '@amiexpress/sdk';
import { createFireEmblemGame } from '@amiexpress/sdk/doors/fire-emblem';

const door = new Door({
  name: 'Fire Emblem: Emblem of Valor',
  version: '1.0.0',
  author: 'Your Name'
});

door.onConnect(async (user) => {
  const game = createFireEmblemGame(door);
  await game.start();
});

door.start();
```

### Multiplayer

```typescript
import { Door } from '@amiexpress/sdk';
import { MultiplayerManager, MultiplayerMode } from '@amiexpress/sdk/doors/fire-emblem/multiplayer';

const door = new Door({
  name: 'Fire Emblem: Multiplayer',
  version: '1.0.0',
  author: 'Your Name'
});

door.onConnect(async (user) => {
  const mp = new MultiplayerManager(door, user.id);

  // Create lobby
  const lobbyCode = await mp.createLobby(MultiplayerMode.Skirmish);
  console.log(`Lobby Code: ${lobbyCode}`);

  // Or join lobby
  // await mp.joinLobby('ABC123');

  // Or matchmaking
  // await mp.findMatch(MultiplayerMode.DraftBattle);
});

door.start();
```

## Controls

### Battle Controls

- **Arrow Keys** - Move cursor
- **Z** - Select unit / Confirm action
- **X** - Cancel / Deselect
- **A** - Open action menu
- **S** - View stats
- **E** - End turn

### Menu Controls

- **Arrow Keys** - Navigate
- **Z** - Confirm
- **X** - Cancel/Back

## Tips & Strategy

### Early Game

1. **Protect Aldric** - Game Over if he falls!
2. **Use the Weapon Triangle** - Massive advantage
3. **Position is key** - Terrain and formation matter
4. **Don't overextend** - Enemy reinforcements arrive
5. **Balance exp gain** - Level everyone, not just one unit

### Mid Game

1. **Promote wisely** - Consider timing and class choice
2. **Manage supports** - Pair units for bonuses
3. **Save healers** - Staff uses are limited
4. **Scout ahead** - Use flying units for vision
5. **Plan for boss** - They're tough!

### Late Game

1. **Skill synergy** - Combine skills for devastating combos
2. **Specialized roles** - Tank, damage, support, utility
3. **Counter threats** - Bring right weapons for enemy types
4. **Inventory management** - Repair weapons, carry items
5. **Support chains** - Max out character relationships

### Multiplayer Tips

1. **Draft balanced** - Don't over-invest in one type
2. **Mobility wins** - Cavalry and fliers control the map
3. **Protect healers** - They're force multipliers
4. **Bait and punish** - Lure enemies into bad trades
5. **Objective matters** - Don't forget win condition!

## Technical Details

### Systems Used

- **TacticalCombatEngine** - Grid combat, weapon triangle, forecasting
- **ClassSystem** - 20 classes, 40+ skills, promotion
- **GraphicsEngine** - ANSI rendering
- **NetworkEngine** - Turn-based multiplayer
- **DialogueSystem** - Story conversations
- **SaveManager** - Save/load campaign progress

### File Structure

```
sdk/doors/fire-emblem/
├── index.ts           # Main game (campaign)
├── multiplayer.ts     # Multiplayer modes
└── README.md          # This file

sdk/engines/tactical/
└── tactical-combat-engine.ts  # Core combat system

sdk/components/tactical/
└── class-system.ts    # Classes, skills, promotion
```

## Credits

- **Game Design** - Inspired by Fire Emblem series (Nintendo/Intelligent Systems)
- **SDK** - AmiExpress BBS Door SDK
- **Combat System** - Fire Emblem-style mechanics
- **Multiplayer** - Real-time synchronization

## License

MIT License - See LICENSE file for details

---

**Ready to fight for Valdora?**

Start your tactical journey today!
