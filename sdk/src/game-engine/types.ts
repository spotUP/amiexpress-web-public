/**
 * ANSI Color codes
 */
export enum ANSIColor {
  BLACK = 30,
  RED = 31,
  GREEN = 32,
  YELLOW = 33,
  BLUE = 34,
  MAGENTA = 35,
  CYAN = 36,
  WHITE = 37,
  BRIGHT_BLACK = 90,
  BRIGHT_RED = 91,
  BRIGHT_GREEN = 92,
  BRIGHT_YELLOW = 93,
  BRIGHT_BLUE = 94,
  BRIGHT_MAGENTA = 95,
  BRIGHT_CYAN = 96,
  BRIGHT_WHITE = 97,
  GRAY = 90  // Alias for BRIGHT_BLACK
}

/**
 * ANSI Background colors
 */
export enum ANSIBackground {
  BLACK = 40,
  RED = 41,
  GREEN = 42,
  YELLOW = 43,
  BLUE = 44,
  MAGENTA = 45,
  CYAN = 46,
  WHITE = 47,
  BRIGHT_BLACK = 100,
  BRIGHT_RED = 101,
  BRIGHT_GREEN = 102,
  BRIGHT_YELLOW = 103,
  BRIGHT_BLUE = 104,
  BRIGHT_MAGENTA = 105,
  BRIGHT_CYAN = 106,
  BRIGHT_WHITE = 107
}

/**
 * ANSI Text styles
 */
export enum ANSIStyle {
  RESET = 0,
  BOLD = 1,
  DIM = 2,
  UNDERLINE = 4,
  BLINK = 5,
  REVERSE = 7,
  HIDDEN = 8
}

/**
 * Character stats interface for RPG characters
 */
export interface CharacterStats {
  name: string;
  level: number;
  experience: number;
  health: number;
  maxHealth: number;
  mana?: number;
  maxMana?: number;
  strength?: number;
  dexterity?: number;
  intelligence?: number;
  wisdom?: number;
  charisma?: number;
  constitution?: number;
  gold: number;
  inventory: string[];
  equipment: Record<string, string>;
}

/**
 * High score entry
 */
export interface HighScore {
  username: string;
  score: number;
  date: Date;
  level?: number;
}

/**
 * Quest interface
 */
export interface Quest {
  id: string;
  title: string;
  description: string;
  objectives: string[];
  reward: {
    xp?: number;
    gold?: number;
    items?: string[];
  };
  completed: boolean;
}

/**
 * Item interface
 */
export interface Item {
  id: string;
  name: string;
  description: string;
  type: 'weapon' | 'armor' | 'consumable' | 'quest' | 'misc';
  value: number;
  stackable: boolean;
  quantity?: number;
}

/**
 * Player interface
 */
export interface Player {
  stats: CharacterStats;
  inventory: Item[];
  equipped: Map<string, Item>;
  quests: Quest[];
}

/**
 * Particle interface for particle effects
 */
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ax: number;
  ay: number;
  life: number;
  maxLife: number;
  char: string;
  color: ANSIColor;
}

/**
 * Physics object interface for platformer games
 */
export interface PhysicsObject {
  x: number;
  y: number;
  width: number;
  height: number;
  velocityX: number;
  velocityY: number;
  onGround: boolean;
}

/**
 * Platform interface for platformer games
 */
export interface Platform {
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'solid' | 'breakable' | 'moving';
}

/**
 * Personality traits for AI NPCs
 */
export interface PersonalityTraits {
  openness: number;        // 0-100: Curious vs. Cautious
  conscientiousness: number; // 0-100: Organized vs. Carefree
  extraversion: number;    // 0-100: Outgoing vs. Reserved
  agreeableness: number;   // 0-100: Friendly vs. Challenging
  neuroticism: number;     // 0-100: Calm vs. Anxious
  intelligence: number;    // 0-100: Smart vs. Simple
  creativity: number;      // 0-100: Innovative vs. Traditional
}

/**
 * Memory system for AI entities
 */
export interface AIMemory {
  shortTerm: Map<string, any>;
  longTerm: Map<string, any>;
  emotionalState: Map<string, number>;
  relationships: Map<string, number>; // entityId -> relationship score (-100 to 100)
}
