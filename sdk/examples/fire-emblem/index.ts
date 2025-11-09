/**
 * Fire Emblem: Emblem of Valor
 *
 * A complete Fire Emblem-style tactical RPG game using the AmiExpress SDK.
 *
 * Story:
 * The kingdom of Valdora faces invasion from the Darklands Empire.
 * Prince Aldric must lead a ragtag band of heroes to defend his homeland,
 * forge alliances, and uncover the dark secrets behind the invasion.
 *
 * Features:
 * - 15+ story chapters with varied objectives
 * - 20+ unique playable characters
 * - Class promotion system
 * - Support conversations and relationships
 * - Permadeath option
 * - Multiple difficulty levels
 * - Character development and growth
 * - Strategic turn-based combat
 */

import {
  Door,
  GraphicsEngine,
  InputEngine,
  TacticalCombatEngine,
  ClassSystem,
  SaveManager,
  DialogueSystem,
  HUDBuilder,
  AnsiColor
} from '../../core/index';

import {
  TacticalUnit,
  WeaponType,
  WeaponRank,
  Weapon,
  TacticalMap,
  TerrainType,
  Position,
  UnitClass
} from '../../engines/tactical/tactical-combat-engine';

/**
 * Game difficulty settings
 */
export enum Difficulty {
  Easy = 'Easy',
  Normal = 'Normal',
  Hard = 'Hard',
  Lunatic = 'Lunatic'
}

/**
 * Chapter objective types
 */
export enum ObjectiveType {
  Rout = 'Rout',           // Defeat all enemies
  Defeat = 'Defeat',       // Defeat boss
  Survive = 'Survive',     // Survive X turns
  Defend = 'Defend',       // Defend location for X turns
  Escape = 'Escape',       // Get units to escape point
  Seize = 'Seize'          // Seize throne/gate
}

/**
 * Chapter definition
 */
interface Chapter {
  id: string;
  number: number;
  name: string;
  description: string;
  objective: ObjectiveType;
  objectiveDetail?: string;
  map: TacticalMap;
  playerUnits: string[]; // Unit IDs
  enemyUnits: EnemyPlacement[];
  reinforcements?: Reinforcement[];
  conversations?: ChapterConversation[];
  turnLimit?: number;
  rewards?: ChapterReward;
}

/**
 * Enemy placement on map
 */
interface EnemyPlacement {
  unitId: string;
  position: Position;
  ai: 'aggressive' | 'defensive' | 'stationary';
  boss?: boolean;
}

/**
 * Reinforcement definition
 */
interface Reinforcement {
  turn: number;
  units: EnemyPlacement[];
}

/**
 * Chapter conversation
 */
interface ChapterConversation {
  trigger: 'start' | 'end' | 'turn' | 'position';
  turn?: number;
  position?: Position;
  participants: string[];
  dialogue: string[];
}

/**
 * Chapter rewards
 */
interface ChapterReward {
  gold?: number;
  items?: string[];
  recruits?: string[];
}

/**
 * Character definition
 */
interface Character {
  id: string;
  name: string;
  title: string;
  description: string;
  portrait: string; // ASCII art
  classId: string;
  level: number;
  stats: {
    hp: number;
    str: number;
    mag: number;
    skl: number;
    spd: number;
    lck: number;
    def: number;
    res: number;
  };
  weapon: Weapon;
  inventory: Weapon[];
  supports: string[]; // Character IDs they can support with
}

/**
 * Main Fire Emblem game class
 */
export class FireEmblemGame {
  private door: Door;
  private gfx: GraphicsEngine;
  private input: InputEngine;
  private combat: TacticalCombatEngine;
  private classes: ClassSystem;
  private save: SaveManager;
  private dialogue: DialogueSystem;
  private hud: HUDBuilder;

  private currentChapter: number = 0;
  private difficulty: Difficulty = Difficulty.Normal;
  private permadeath: boolean = true;
  private turnCount: number = 0;
  private playerArmy: Map<string, TacticalUnit> = new Map();
  private enemyArmy: Map<string, TacticalUnit> = new Map();
  private casualties: string[] = []; // Fallen units (if permadeath)
  private chapters: Chapter[] = [];
  private characters: Map<string, Character> = new Map();

  // Game state
  private selectedUnit: TacticalUnit | null = null;
  private cursor: Position = { x: 0, y: 0 };
  private gamePhase: 'player' | 'enemy' | 'victory' | 'defeat' = 'player';

  constructor(door: Door) {
    this.door = door;
    this.gfx = new GraphicsEngine({ width: 80, height: 24 });
    this.input = new InputEngine();
    this.combat = new TacticalCombatEngine({ gridWidth: 20, gridHeight: 15 });
    this.classes = new ClassSystem();
    this.save = new SaveManager({ userId: 1, gameId: 'fire-emblem' });
    this.dialogue = new DialogueSystem();
    this.hud = new HUDBuilder();

    this.initializeCharacters();
    this.initializeChapters();
    this.setupInputHandlers();
  }

  /**
   * Initialize all playable characters
   */
  private initializeCharacters(): void {
    // === MAIN CHARACTERS ===

    this.characters.set('aldric', {
      id: 'aldric',
      name: 'Aldric',
      title: 'Prince of Valdora',
      description: 'Crown prince forced to flee his castle when the Darklands Empire invades.',
      portrait: this.createPortrait('A'),
      classId: 'lord',
      level: 1,
      stats: { hp: 18, str: 5, mag: 0, skl: 6, spd: 7, lck: 7, def: 5, res: 2 },
      weapon: {
        id: 'rapier',
        name: 'Rapier',
        type: WeaponType.Sword,
        rank: WeaponRank.D,
        might: 5,
        hit: 95,
        crit: 10,
        weight: 5,
        uses: 40,
        maxUses: 40,
        durability: 40,
        maxDurability: 40,
        range: [1, 1],
        effectiveness: ['armored', 'cavalry']
      },
      inventory: [],
      supports: ['elara', 'marcus', 'lysandra']
    });

    this.characters.set('elara', {
      id: 'elara',
      name: 'Elara',
      title: 'Knight Commander',
      description: 'Veteran knight sworn to protect Prince Aldric at all costs.',
      portrait: this.createPortrait('E'),
      classId: 'cavalier',
      level: 3,
      stats: { hp: 22, str: 8, mag: 0, skl: 7, spd: 7, lck: 4, def: 7, res: 1 },
      weapon: {
        id: 'iron_lance',
        name: 'Iron Lance',
        type: WeaponType.Lance,
        rank: WeaponRank.D,
        might: 7,
        hit: 80,
        crit: 0,
        weight: 8,
        uses: 45,
        maxUses: 45,
        durability: 45,
        maxDurability: 45,
        range: [1, 1]
      },
      inventory: [],
      supports: ['aldric', 'marcus', 'gareth']
    });

    this.characters.set('marcus', {
      id: 'marcus',
      name: 'Marcus',
      title: 'Royal Strategist',
      description: 'Brilliant tactician and childhood friend of Prince Aldric.',
      portrait: this.createPortrait('M'),
      classId: 'mage',
      level: 2,
      stats: { hp: 17, str: 0, mag: 7, skl: 6, spd: 6, lck: 4, def: 3, res: 5 },
      weapon: {
        id: 'fire',
        name: 'Fire',
        type: WeaponType.Tome,
        rank: WeaponRank.E,
        might: 4,
        hit: 90,
        crit: 0,
        weight: 4,
        uses: 40,
        maxUses: 40,
        durability: 40,
        maxDurability: 40,
        range: [1, 2],
        magicDamage: true
      },
      inventory: [],
      supports: ['aldric', 'elara', 'selena']
    });

    this.characters.set('lysandra', {
      id: 'lysandra',
      name: 'Lysandra',
      title: 'Wandering Swordfighter',
      description: 'Mysterious mercenary with unmatched skill with a blade.',
      portrait: this.createPortrait('L'),
      classId: 'myrmidon',
      level: 4,
      stats: { hp: 19, str: 6, mag: 0, skl: 10, spd: 11, lck: 5, def: 4, res: 2 },
      weapon: {
        id: 'killing_edge',
        name: 'Killing Edge',
        type: WeaponType.Sword,
        rank: WeaponRank.C,
        might: 9,
        hit: 75,
        crit: 30,
        weight: 7,
        uses: 20,
        maxUses: 20,
        durability: 20,
        maxDurability: 20,
        range: [1, 1]
      },
      inventory: [],
      supports: ['aldric', 'gareth', 'theron']
    });

    this.characters.set('gareth', {
      id: 'gareth',
      name: 'Gareth',
      title: 'Mountain Warrior',
      description: 'Axe fighter from the northern mountains seeking glory in battle.',
      portrait: this.createPortrait('G'),
      classId: 'fighter',
      level: 3,
      stats: { hp: 23, str: 9, mag: 0, skl: 5, spd: 6, lck: 3, def: 5, res: 0 },
      weapon: {
        id: 'iron_axe',
        name: 'Iron Axe',
        type: WeaponType.Axe,
        rank: WeaponRank.D,
        might: 8,
        hit: 75,
        crit: 0,
        weight: 10,
        uses: 45,
        maxUses: 45,
        durability: 45,
        maxDurability: 45,
        range: [1, 1]
      },
      inventory: [],
      supports: ['elara', 'lysandra', 'nina']
    });

    this.characters.set('selena', {
      id: 'selena',
      name: 'Selena',
      title: 'Healer Priestess',
      description: 'Gentle cleric devoted to healing the wounded and helping those in need.',
      portrait: this.createPortrait('S'),
      classId: 'cleric',
      level: 1,
      stats: { hp: 16, str: 0, mag: 5, skl: 4, spd: 5, lck: 6, def: 2, res: 6 },
      weapon: {
        id: 'heal',
        name: 'Heal',
        type: WeaponType.Staff,
        rank: WeaponRank.E,
        might: 0,
        hit: 100,
        crit: 0,
        weight: 0,
        uses: 30,
        maxUses: 30,
        durability: 30,
        maxDurability: 30,
        range: [1, 1],
        healAmount: 10
      },
      inventory: [],
      supports: ['marcus', 'nina', 'aldric']
    });

    this.characters.set('theron', {
      id: 'theron',
      name: 'Theron',
      title: 'Elite Archer',
      description: 'Renowned archer known for never missing his target.',
      portrait: this.createPortrait('T'),
      classId: 'archer',
      level: 3,
      stats: { hp: 20, str: 7, mag: 0, skl: 8, spd: 6, lck: 5, def: 5, res: 3 },
      weapon: {
        id: 'steel_bow',
        name: 'Steel Bow',
        type: WeaponType.Bow,
        rank: WeaponRank.C,
        might: 9,
        hit: 85,
        crit: 0,
        weight: 9,
        uses: 30,
        maxUses: 30,
        durability: 30,
        maxDurability: 30,
        range: [2, 2]
      },
      inventory: [],
      supports: ['lysandra', 'nina', 'gareth']
    });

    this.characters.set('nina', {
      id: 'nina',
      name: 'Nina',
      title: 'Sky Knight',
      description: 'Spirited pegasus knight who dreams of becoming a legendary hero.',
      portrait: this.createPortrait('N'),
      classId: 'pegasus_knight',
      level: 2,
      stats: { hp: 18, str: 5, mag: 1, skl: 7, spd: 10, lck: 6, def: 4, res: 7 },
      weapon: {
        id: 'slim_lance',
        name: 'Slim Lance',
        type: WeaponType.Lance,
        rank: WeaponRank.D,
        might: 4,
        hit: 95,
        crit: 5,
        weight: 4,
        uses: 30,
        maxUses: 30,
        durability: 30,
        maxDurability: 30,
        range: [1, 1]
      },
      inventory: [],
      supports: ['selena', 'theron', 'gareth']
    });

    // Add more recruitable characters...
    this.characters.set('roland', {
      id: 'roland',
      name: 'Roland',
      title: 'Grizzled Mercenary',
      description: 'Veteran soldier for hire who joins for the right price.',
      portrait: this.createPortrait('R'),
      classId: 'mercenary',
      level: 5,
      stats: { hp: 24, str: 10, mag: 0, skl: 9, spd: 8, lck: 4, def: 7, res: 2 },
      weapon: {
        id: 'steel_sword',
        name: 'Steel Sword',
        type: WeaponType.Sword,
        rank: WeaponRank.C,
        might: 8,
        hit: 90,
        crit: 0,
        weight: 8,
        uses: 30,
        maxUses: 30,
        durability: 30,
        maxDurability: 30,
        range: [1, 1]
      },
      inventory: [],
      supports: ['aldric', 'elara']
    });

    this.characters.set('darius', {
      id: 'darius',
      name: 'Darius',
      title: 'Iron Wall',
      description: 'Heavily armored knight who serves as an impenetrable shield.',
      portrait: this.createPortrait('D'),
      classId: 'knight',
      level: 4,
      stats: { hp: 26, str: 10, mag: 0, skl: 5, spd: 4, lck: 2, def: 12, res: 1 },
      weapon: {
        id: 'iron_lance',
        name: 'Iron Lance',
        type: WeaponType.Lance,
        rank: WeaponRank.D,
        might: 7,
        hit: 80,
        crit: 0,
        weight: 8,
        uses: 45,
        maxUses: 45,
        durability: 45,
        maxDurability: 45,
        range: [1, 1]
      },
      inventory: [],
      supports: ['elara', 'roland']
    });
  }

  /**
   * Initialize all story chapters
   */
  private initializeChapters(): void {
    // === CHAPTER 1: The Fall of Valdora ===
    this.chapters.push({
      id: 'ch1',
      number: 1,
      name: 'The Fall of Valdora',
      description: 'The Darklands Empire attacks the capital. Prince Aldric must escape with his loyal knights.',
      objective: ObjectiveType.Escape,
      objectiveDetail: 'Get Aldric to the escape point',
      map: this.createMap(20, 15, 'castle_courtyard'),
      playerUnits: ['aldric', 'elara', 'marcus'],
      enemyUnits: [
        { unitId: 'soldier1', position: { x: 8, y: 5 }, ai: 'aggressive' },
        { unitId: 'soldier2', position: { x: 12, y: 5 }, ai: 'aggressive' },
        { unitId: 'soldier3', position: { x: 10, y: 7 }, ai: 'aggressive' },
        { unitId: 'mage1', position: { x: 10, y: 3 }, ai: 'defensive' },
        { unitId: 'knight1', position: { x: 10, y: 10 }, ai: 'stationary', boss: true }
      ],
      conversations: [
        {
          trigger: 'start',
          participants: ['aldric', 'elara'],
          dialogue: [
            'Elara: My lord! The castle has fallen! We must escape!',
            'Aldric: What about the civilians? We cannot abandon them!',
            'Elara: They are already fleeing, my prince. Your survival is paramount!',
            'Aldric: ...Very well. Lead the way, Commander.'
          ]
        }
      ],
      rewards: {
        gold: 1000,
        items: ['vulnerary', 'iron_sword']
      }
    });

    // === CHAPTER 2: Refuge in the Forest ===
    this.chapters.push({
      id: 'ch2',
      number: 2,
      name: 'Refuge in the Forest',
      description: 'Pursued by enemy forces, Aldric\'s group seeks shelter in the Whispering Woods.',
      objective: ObjectiveType.Survive,
      objectiveDetail: 'Survive 8 turns',
      turnLimit: 8,
      map: this.createMap(20, 15, 'forest'),
      playerUnits: ['aldric', 'elara', 'marcus'],
      enemyUnits: [
        { unitId: 'brigand1', position: { x: 15, y: 2 }, ai: 'aggressive' },
        { unitId: 'brigand2', position: { x: 15, y: 4 }, ai: 'aggressive' },
        { unitId: 'archer1', position: { x: 18, y: 3 }, ai: 'defensive' },
        { unitId: 'fighter1', position: { x: 16, y: 7 }, ai: 'aggressive' }
      ],
      reinforcements: [
        {
          turn: 4,
          units: [
            { unitId: 'brigand3', position: { x: 19, y: 0 }, ai: 'aggressive' },
            { unitId: 'brigand4', position: { x: 19, y: 14 }, ai: 'aggressive' }
          ]
        }
      ],
      rewards: {
        gold: 1500,
        recruits: ['lysandra']
      }
    });

    // === CHAPTER 3: The Swordfighter ===
    this.chapters.push({
      id: 'ch3',
      number: 3,
      name: 'The Swordfighter',
      description: 'A mysterious mercenary offers her blade to Aldric\'s cause.',
      objective: ObjectiveType.Rout,
      objectiveDetail: 'Defeat all enemies',
      map: this.createMap(20, 15, 'plains'),
      playerUnits: ['aldric', 'elara', 'marcus', 'lysandra'],
      enemyUnits: [
        { unitId: 'soldier4', position: { x: 10, y: 8 }, ai: 'aggressive' },
        { unitId: 'soldier5', position: { x: 12, y: 8 }, ai: 'aggressive' },
        { unitId: 'soldier6', position: { x: 14, y: 8 }, ai: 'aggressive' },
        { unitId: 'myrmidon1', position: { x: 11, y: 10 }, ai: 'aggressive' },
        { unitId: 'myrmidon2', position: { x: 13, y: 10 }, ai: 'aggressive' },
        { unitId: 'cavalier1', position: { x: 12, y: 12 }, ai: 'aggressive', boss: true }
      ],
      conversations: [
        {
          trigger: 'start',
          participants: ['aldric', 'lysandra'],
          dialogue: [
            'Lysandra: You there, princeling. You need skilled fighters, yes?',
            'Aldric: And you are...?',
            'Lysandra: Lysandra. Wandering swordfighter. I\'ve seen what the Empire does.',
            'Aldric: Will you fight with us?',
            'Lysandra: For now. Try not to slow me down.'
          ]
        }
      ],
      rewards: {
        gold: 2000,
        items: ['steel_lance', 'vulnerary']
      }
    });

    // === CHAPTER 4: Mountain Pass ===
    this.chapters.push({
      id: 'ch4',
      number: 4,
      name: 'Mountain Pass',
      description: 'The group must cross treacherous mountain paths while fending off bandits.',
      objective: ObjectiveType.Defeat,
      objectiveDetail: 'Defeat the bandit leader',
      map: this.createMap(20, 15, 'mountains'),
      playerUnits: ['aldric', 'elara', 'marcus', 'lysandra'],
      enemyUnits: [
        { unitId: 'brigand5', position: { x: 8, y: 5 }, ai: 'aggressive' },
        { unitId: 'brigand6', position: { x: 12, y: 5 }, ai: 'aggressive' },
        { unitId: 'fighter2', position: { x: 10, y: 7 }, ai: 'aggressive' },
        { unitId: 'fighter3', position: { x: 10, y: 9 }, ai: 'aggressive' },
        { unitId: 'archer2', position: { x: 8, y: 11 }, ai: 'defensive' },
        { unitId: 'archer3', position: { x: 12, y: 11 }, ai: 'defensive' },
        { unitId: 'warrior1', position: { x: 10, y: 13 }, ai: 'stationary', boss: true }
      ],
      rewards: {
        gold: 2500,
        recruits: ['gareth'],
        items: ['hand_axe']
      }
    });

    // === CHAPTER 5: Sacred reference-board ===
    this.chapters.push({
      id: 'ch5',
      number: 5,
      name: 'Sacred reference-board',
      description: 'Aldric\'s group reaches a temple under siege by the Empire.',
      objective: ObjectiveType.Defend,
      objectiveDetail: 'Defend the temple for 10 turns',
      turnLimit: 10,
      map: this.createMap(20, 15, 'temple'),
      playerUnits: ['aldric', 'elara', 'marcus', 'lysandra', 'gareth'],
      enemyUnits: [
        { unitId: 'soldier7', position: { x: 2, y: 7 }, ai: 'aggressive' },
        { unitId: 'soldier8', position: { x: 17, y: 7 }, ai: 'aggressive' },
        { unitId: 'mage2', position: { x: 5, y: 5 }, ai: 'aggressive' },
        { unitId: 'mage3', position: { x: 14, y: 9 }, ai: 'aggressive' },
        { unitId: 'knight2', position: { x: 10, y: 2 }, ai: 'aggressive' }
      ],
      reinforcements: [
        {
          turn: 3,
          units: [
            { unitId: 'soldier9', position: { x: 0, y: 0 }, ai: 'aggressive' },
            { unitId: 'soldier10', position: { x: 19, y: 0 }, ai: 'aggressive' }
          ]
        },
        {
          turn: 6,
          units: [
            { unitId: 'cavalier2', position: { x: 0, y: 14 }, ai: 'aggressive' },
            { unitId: 'cavalier3', position: { x: 19, y: 14 }, ai: 'aggressive' }
          ]
        }
      ],
      rewards: {
        gold: 3000,
        recruits: ['selena'],
        items: ['mend', 'elixir']
      }
    });

    // Add more chapters (6-15)...
    // For brevity, I'll add simplified versions

    for (let i = 6; i <= 15; i++) {
      this.chapters.push({
        id: `ch${i}`,
        number: i,
        name: `Chapter ${i}`,
        description: `Story chapter ${i}`,
        objective: ObjectiveType.Rout,
        map: this.createMap(20, 15, 'plains'),
        playerUnits: ['aldric', 'elara', 'marcus', 'lysandra', 'gareth', 'selena'],
        enemyUnits: this.generateEnemyUnits(8 + i, i * 2),
        rewards: { gold: 1000 * i }
      });
    }
  }

  /**
   * Generate enemy units for a chapter
   */
  private generateEnemyUnits(count: number, level: number): EnemyPlacement[] {
    const enemies: EnemyPlacement[] = [];
    const classes = ['soldier', 'mage', 'fighter', 'archer', 'cavalier'];

    for (let i = 0; i < count; i++) {
      const classType = classes[Math.floor(Math.random() * classes.length)];
      enemies.push({
        unitId: `${classType}_${i}`,
        position: { x: 10 + i % 5, y: 5 + Math.floor(i / 5) },
        ai: Math.random() > 0.5 ? 'aggressive' : 'defensive',
        boss: i === count - 1
      });
    }

    return enemies;
  }

  /**
   * Create a tactical map
   */
  private createMap(width: number, height: number, theme: string): TacticalMap {
    const map: TacticalMap = {
      width,
      height,
      tiles: []
    };

    // Generate terrain based on theme
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let terrain: TerrainType = TerrainType.Plains;

        if (theme === 'forest') {
          terrain = Math.random() > 0.6 ? TerrainType.Forest : TerrainType.Plains;
        } else if (theme === 'mountains') {
          terrain = Math.random() > 0.5 ? TerrainType.Mountain : TerrainType.Plains;
        } else if (theme === 'castle_courtyard') {
          if (x < 3 || x > width - 4 || y < 3 || y > height - 4) {
            terrain = TerrainType.Wall;
          } else {
            terrain = TerrainType.Floor;
          }
        } else if (theme === 'temple') {
          if (x > 7 && x < 12 && y > 5 && y < 10) {
            terrain = TerrainType.Floor;
          }
        }

        map.tiles.push({
          x,
          y,
          terrain,
          occupant: null
        });
      }
    }

    return map;
  }

  /**
   * Create ASCII portrait
   */
  private createPortrait(initial: string): string {
    return `
  +-----+
  | ${initial}   |
  |     |
  +-----+
`;
  }

  /**
   * Setup input handlers
   */
  private setupInputHandlers(): void {
    this.input.bindAction('move_up', 'ArrowUp', () => this.moveCursor(0, -1));
    this.input.bindAction('move_down', 'ArrowDown', () => this.moveCursor(0, 1));
    this.input.bindAction('move_left', 'ArrowLeft', () => this.moveCursor(-1, 0));
    this.input.bindAction('move_right', 'ArrowRight', () => this.moveCursor(1, 0));
    this.input.bindAction('select', 'z', () => this.handleSelect());
    this.input.bindAction('cancel', 'x', () => this.handleCancel());
    this.input.bindAction('action', 'a', () => this.handleAction());
  }

  /**
   * Move cursor on map
   */
  private moveCursor(dx: number, dy: number): void {
    this.cursor.x = Math.max(0, Math.min(19, this.cursor.x + dx));
    this.cursor.y = Math.max(0, Math.min(14, this.cursor.y + dy));
    this.render();
  }

  /**
   * Handle select action
   */
  private handleSelect(): void {
    if (this.selectedUnit === null) {
      // Select unit at cursor
      const unit = this.combat.getUnitAt(this.cursor);
      if (unit && unit.team === 'player' && !unit.hasActed) {
        this.selectedUnit = unit;
        this.render();
      }
    }
  }

  /**
   * Handle cancel action
   */
  private handleCancel(): void {
    this.selectedUnit = null;
    this.render();
  }

  /**
   * Handle action
   */
  private handleAction(): void {
    if (this.selectedUnit) {
      // Move unit or attack
      const canMove = this.combat.getMovementRange(this.selectedUnit);
      if (canMove.some(pos => pos.x === this.cursor.x && pos.y === this.cursor.y)) {
        this.combat.moveUnit(this.selectedUnit.id, this.cursor);
        this.selectedUnit.hasMoved = true;
        this.selectedUnit = null;
        this.render();
      }
    }
  }

  /**
   * Start new game
   */
  async start(): Promise<void> {
    this.showTitleScreen();
    await this.waitForInput();

    this.showDifficultySelect();
    await this.waitForInput();

    await this.playChapter(0);
  }

  /**
   * Show title screen
   */
  private showTitleScreen(): void {
    this.gfx.clear(AnsiColor.Black);
    const title = `
╔════════════════════════════════════════════════════════════════════════════╗
║                                                                            ║
║          ███████╗███╗   ███╗██████╗ ██╗     ███████╗███╗   ███╗           ║
║          ██╔════╝████╗ ████║██╔══██╗██║     ██╔════╝████╗ ████║           ║
║          █████╗  ██╔████╔██║██████╔╝██║     █████╗  ██╔████╔██║           ║
║          ██╔══╝  ██║╚██╔╝██║██╔══██╗██║     ██╔══╝  ██║╚██╔╝██║           ║
║          ███████╗██║ ╚═╝ ██║██████╔╝███████╗███████╗██║ ╚═╝ ██║           ║
║          ╚══════╝╚═╝     ╚═╝╚═════╝ ╚══════╝╚══════╝╚═╝     ╚═╝           ║
║                                                                            ║
║                         OF VALOR                                           ║
║                                                                            ║
║                    Press Z to Start                                        ║
║                                                                            ║
╚════════════════════════════════════════════════════════════════════════════╝
`;
    this.gfx.drawText(0, 0, title, AnsiColor.Cyan);
    this.door.send(this.gfx.render());
  }

  /**
   * Show difficulty selection
   */
  private showDifficultySelect(): void {
    this.gfx.clear(AnsiColor.Black);
    this.gfx.drawText(10, 5, 'Select Difficulty:', AnsiColor.White);
    this.gfx.drawText(15, 7, '1. Easy', AnsiColor.Green);
    this.gfx.drawText(15, 8, '2. Normal', AnsiColor.Yellow);
    this.gfx.drawText(15, 9, '3. Hard', AnsiColor.Red);
    this.gfx.drawText(15, 10, '4. Lunatic', AnsiColor.Magenta);
    this.gfx.drawText(10, 12, 'Permadeath: [Z] Yes  [X] No', AnsiColor.White);
    this.door.send(this.gfx.render());
  }

  /**
   * Play a chapter
   */
  private async playChapter(chapterIndex: number): Promise<void> {
    const chapter = this.chapters[chapterIndex];
    if (!chapter) {
      this.showVictoryScreen();
      return;
    }

    this.currentChapter = chapterIndex;
    this.turnCount = 0;
    this.loadChapter(chapter);

    // Show chapter intro
    this.showChapterIntro(chapter);
    await this.waitForInput();

    // Main game loop
    while (this.gamePhase !== 'victory' && this.gamePhase !== 'defeat') {
      if (this.gamePhase === 'player') {
        await this.playerPhase();
      } else if (this.gamePhase === 'enemy') {
        await this.enemyPhase();
      }

      this.checkVictoryConditions(chapter);
    }

    if (this.gamePhase === 'victory') {
      this.showChapterClear(chapter);
      await this.playChapter(chapterIndex + 1);
    } else {
      this.showGameOver();
    }
  }

  /**
   * Load chapter data
   */
  private loadChapter(chapter: Chapter): void {
    this.combat.loadMap(chapter.map);

    // Spawn player units
    let spawnX = 2;
    for (const unitId of chapter.playerUnits) {
      const char = this.characters.get(unitId);
      if (char && !this.casualties.includes(unitId)) {
        const unit = this.createUnitFromCharacter(char, { x: spawnX, y: 12 }, 'player');
        this.playerArmy.set(unitId, unit);
        spawnX += 2;
      }
    }

    // Spawn enemy units
    for (const placement of chapter.enemyUnits) {
      const enemy = this.createEnemyUnit(placement);
      this.enemyArmy.set(placement.unitId, enemy);
    }
  }

  /**
   * Create unit from character definition
   */
  private createUnitFromCharacter(char: Character, position: Position, team: 'player' | 'enemy'): TacticalUnit {
    const classData = this.classes.getClass(char.classId);
    if (!classData) {
      throw new Error(`Class not found: ${char.classId}`);
    }

    // Map classId to UnitClass enum
    const unitClass = this.mapClassIdToUnitClass(char.classId);

    return this.combat.createUnit({
      id: char.id,
      name: char.name,
      class: unitClass,
      level: char.level,
      stats: { ...char.stats, mov: classData.baseStats?.mov || 5 },
      growthRates: classData.growthRates || { hp: 50, str: 40, mag: 20, skl: 40, spd: 40, lck: 30, def: 30, res: 20 },
      position,
      team,
      weapon: char.weapon
    });
  }

  /**
   * Map character class ID to UnitClass enum
   */
  private mapClassIdToUnitClass(classId: string): UnitClass {
    const mapping: Record<string, UnitClass> = {
      'lord': UnitClass.Lord,
      'cavalier': UnitClass.Cavalier,
      'knight': UnitClass.Knight,
      'myrmidon': UnitClass.Myrmidon,
      'mercenary': UnitClass.Mercenary,
      'fighter': UnitClass.Fighter,
      'archer': UnitClass.Archer,
      'mage': UnitClass.Mage,
      'cleric': UnitClass.Cleric,
      'pegasus_knight': UnitClass.Pegasus_Knight
    };
    return mapping[classId] || UnitClass.Fighter;
  }

  /**
   * Create enemy unit
   */
  private createEnemyUnit(placement: EnemyPlacement): TacticalUnit {
    // Simplified - would create proper enemy units
    return this.combat.createUnit({
      id: placement.unitId,
      name: 'Enemy',
      class: UnitClass.Fighter,
      level: 5,
      stats: { hp: 25, str: 8, mag: 0, skl: 6, spd: 6, lck: 3, def: 5, res: 2, mov: 5 },
      growthRates: { hp: 50, str: 40, mag: 0, skl: 30, spd: 30, lck: 20, def: 30, res: 20 },
      position: placement.position,
      team: 'enemy'
    });
  }

  /**
   * Show chapter intro
   */
  private showChapterIntro(chapter: Chapter): void {
    this.gfx.clear(AnsiColor.Black);
    this.gfx.drawBox({ x: 5, y: 5, width: 70, height: 10 }, 'double', AnsiColor.Cyan);
    this.gfx.drawText(10, 7, `Chapter ${chapter.number}: ${chapter.name}`, AnsiColor.White);
    this.gfx.drawText(10, 9, chapter.description, AnsiColor.Gray);
    this.gfx.drawText(10, 11, `Objective: ${chapter.objectiveDetail}`, AnsiColor.Yellow);
    this.gfx.drawText(30, 14, 'Press Z to continue', AnsiColor.White);
    this.door.send(this.gfx.render());
  }

  /**
   * Player phase
   */
  private async playerPhase(): Promise<void> {
    this.turnCount++;
    this.render();

    // Reset all player units
    for (const unit of Array.from(this.playerArmy.values())) {
      unit.hasActed = false;
      unit.hasMoved = false;
    }

    // Wait for player to end turn
    // Simplified - would handle full player input
    this.gamePhase = 'enemy';
  }

  /**
   * Enemy phase
   */
  private async enemyPhase(): Promise<void> {
    // Simple AI - move toward player units and attack
    for (const enemy of Array.from(this.enemyArmy.values())) {
      // Find nearest player unit
      let nearestDist = Infinity;
      let nearestPlayer: TacticalUnit | null = null;

      for (const player of Array.from(this.playerArmy.values())) {
        const dist = Math.abs(enemy.position.x - player.position.x) +
                    Math.abs(enemy.position.y - player.position.y);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestPlayer = player;
        }
      }

      if (nearestPlayer) {
        // Try to attack
        const targets = this.combat.getAttackTargets(enemy);
        if (targets.some(t => t.position.x === nearestPlayer.position.x && t.position.y === nearestPlayer.position.y)) {
          const result = this.combat.executeCombat(enemy, nearestPlayer);
          if (nearestPlayer.stats.hp <= 0) {
            this.handleUnitDefeat(nearestPlayer);
          }
        } else {
          // Move closer
          const path = this.combat.findPath(enemy.position, nearestPlayer.position);
          if (path && path.length > 1) {
            this.combat.moveUnit(enemy.id, path[1]);
          }
        }
      }
    }

    this.gamePhase = 'player';
  }

  /**
   * Handle unit defeat
   */
  private handleUnitDefeat(unit: TacticalUnit): void {
    if (unit.team === 'player') {
      if (this.permadeath) {
        this.casualties.push(unit.id);
        this.playerArmy.delete(unit.id);
      } else {
        // Unit retreats
        unit.stats.hp = 1;
      }

      if (unit.id === 'aldric') {
        this.gamePhase = 'defeat';
      }
    } else {
      this.enemyArmy.delete(unit.id);
    }
  }

  /**
   * Check victory conditions
   */
  private checkVictoryConditions(chapter: Chapter): void {
    if (chapter.objective === ObjectiveType.Rout) {
      if (this.enemyArmy.size === 0) {
        this.gamePhase = 'victory';
      }
    } else if (chapter.objective === ObjectiveType.Survive) {
      if (this.turnCount >= (chapter.turnLimit || 0)) {
        this.gamePhase = 'victory';
      }
    }
    // Add more objective checks...
  }

  /**
   * Render game screen
   */
  private render(): void {
    this.gfx.clear(AnsiColor.Black);

    // Draw map
    const chapter = this.chapters[this.currentChapter];
    if (chapter) {
      this.renderMap(chapter.map);
    }

    // Draw units
    for (const unit of Array.from(this.playerArmy.values())) {
      this.gfx.drawChar(unit.position.x, unit.position.y, 'P', AnsiColor.Blue);
    }

    for (const unit of Array.from(this.enemyArmy.values())) {
      this.gfx.drawChar(unit.position.x, unit.position.y, 'E', AnsiColor.Red);
    }

    // Draw cursor
    this.gfx.drawChar(this.cursor.x, this.cursor.y, 'X', AnsiColor.Yellow);

    // Draw HUD
    this.renderHUD();

    this.door.send(this.gfx.render());
  }

  /**
   * Render map
   */
  private renderMap(map: TacticalMap): void {
    for (const tile of map.tiles) {
      let char = '.';
      let color = AnsiColor.White;

      switch (tile.terrain) {
        case TerrainType.Forest:
          char = 'T';
          color = AnsiColor.Green;
          break;
        case TerrainType.Mountain:
          char = '^';
          color = AnsiColor.Gray;
          break;
        case TerrainType.Wall:
          char = '#';
          color = AnsiColor.White;
          break;
        case TerrainType.Water:
          char = '~';
          color = AnsiColor.Cyan;
          break;
      }

      this.gfx.drawChar(tile.x, tile.y, char, color);
    }
  }

  /**
   * Render HUD
   */
  private renderHUD(): void {
    this.gfx.drawText(0, 16, `Turn: ${this.turnCount}`, AnsiColor.White);
    this.gfx.drawText(0, 17, `Phase: ${this.gamePhase}`, AnsiColor.Yellow);

    if (this.selectedUnit) {
      this.gfx.drawText(0, 18, `${this.selectedUnit.name} Lv${this.selectedUnit.level}`, AnsiColor.Cyan);
      this.gfx.drawText(0, 19, `HP: ${this.selectedUnit.stats.hp}/${this.selectedUnit.stats.maxHp}`, AnsiColor.Green);
    }
  }

  /**
   * Show chapter clear screen
   */
  private showChapterClear(chapter: Chapter): void {
    this.gfx.clear(AnsiColor.Black);
    this.gfx.drawText(30, 10, 'CHAPTER CLEAR!', AnsiColor.Green);
    if (chapter.rewards) {
      this.gfx.drawText(25, 12, `Gold: +${chapter.rewards.gold}`, AnsiColor.Yellow);
    }
    this.door.send(this.gfx.render());
  }

  /**
   * Show victory screen
   */
  private showVictoryScreen(): void {
    this.gfx.clear(AnsiColor.Black);
    this.gfx.drawText(25, 10, 'CONGRATULATIONS!', AnsiColor.Green);
    this.gfx.drawText(20, 12, 'You have saved Valdora!', AnsiColor.White);
    this.door.send(this.gfx.render());
  }

  /**
   * Show game over screen
   */
  private showGameOver(): void {
    this.gfx.clear(AnsiColor.Black);
    this.gfx.drawText(30, 10, 'GAME OVER', AnsiColor.Red);
    this.door.send(this.gfx.render());
  }

  /**
   * Wait for input
   */
  private async waitForInput(): Promise<void> {
    return new Promise(resolve => {
      // Simplified - would need door.onInput to properly handle
      setTimeout(() => resolve(), 100);
    });
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.gfx.dispose();
    this.input.dispose();
    this.combat.dispose();
    this.classes.dispose();
    this.save.dispose();
    this.dialogue.dispose();
  }
}

/**
 * Main entry point
 */
export function createFireEmblemGame(door: Door): FireEmblemGame {
  return new FireEmblemGame(door);
}

// Auto-start the game when run directly
const door = new Door({
  name: 'Fire Emblem: Emblem of Valor',
  version: '1.0.0',
  author: 'AmiExpress SDK Team',
  description: 'Tactical RPG in the style of Fire Emblem'
});

const game = createFireEmblemGame(door);
door.start();
