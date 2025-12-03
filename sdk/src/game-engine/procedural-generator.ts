import { Quest, Item } from './types';

/**
 * Procedural content generator for creating dynamic game content
 */
export class ProceduralGenerator {
  private seed: number;
  private rng: () => number;

  constructor(seed?: number) {
    this.seed = seed || Date.now();
    this.rng = this.createRNG(this.seed);
  }

  /**
   * Create seeded random number generator
   */
  private createRNG(seed: number): () => number {
    let x = Math.sin(seed) * 10000;
    return () => {
      x = Math.sin(x) * 10000;
      return x - Math.floor(x);
    };
  }

  /**
   * Generate a random name
   */
  generateName(type: 'person' | 'place' | 'item' | 'creature' = 'person'): string {
    const syllables = {
      person: [
        ['Ar', 'Bel', 'Cor', 'Dan', 'El', 'Fen', 'Gor', 'Hal', 'Ian', 'Jen'],
        ['a', 'e', 'i', 'o', 'u', 'ae', 'ea', 'ou', 'ai', 'io'],
        ['dor', 'wen', 'ric', 'las', 'ton', 'bar', 'den', 'mar', 'lin', 'thor']
      ],
      place: [
        ['Storm', 'Crystal', 'Iron', 'Shadow', 'Moon', 'Sun', 'Star', 'Wind', 'Fire', 'Ice'],
        ['peak', 'vale', 'forge', 'spire', 'haven', 'reach', 'watch', 'hold', 'gate', 'tower']
      ],
      item: [
        ['Ancient', 'Mystic', 'Enchanted', 'Cursed', 'Blessed', 'Divine', 'Arcane', 'Sacred', 'Lost', 'Forgotten'],
        ['Sword', 'Shield', 'Amulet', 'Ring', 'Crown', 'Orb', 'Tome', 'Key', 'Crystal', 'Relic']
      ],
      creature: [
        ['Shadow', 'Frost', 'Fire', 'Storm', 'Crystal', 'Iron', 'Blood', 'Night', 'Dawn', 'Void'],
        ['wolf', 'dragon', 'eagle', 'bear', 'lion', 'hawk', 'serpent', 'phoenix', 'titan', 'beast']
      ]
    };

    const parts = syllables[type];
    let name = '';

    parts.forEach(part => {
      name += part[Math.floor(this.rng() * part.length)];
    });

    return name;
  }

  /**
   * Generate a quest with procedural elements
   */
  generateQuest(): Quest {
    const questTypes = [
      'rescue', 'retrieve', 'defeat', 'explore', 'deliver', 'escort', 'investigate', 'craft'
    ];

    const type = questTypes[Math.floor(this.rng() * questTypes.length)];
    const target = this.generateName(type === 'defeat' ? 'creature' : 'person');
    const location = this.generateName('place');

    let description = '';
    let objectives: string[] = [];

    switch (type) {
      case 'rescue':
        description = `Rescue ${target} from the dangers of ${location}`;
        objectives = [`Travel to ${location}`, `Defeat the captors`, `Free ${target}`];
        break;
      case 'retrieve':
        const item = this.generateName('item');
        description = `Retrieve the ${item} from ${location}`;
        objectives = [`Journey to ${location}`, `Find the ${item}`, `Return safely`];
        break;
      case 'defeat':
        description = `Defeat the ${target} terrorizing ${location}`;
        objectives = [`Locate the ${target}`, `Engage in combat`, `Claim victory`];
        break;
      case 'explore':
        description = `Explore the mysterious ${location}`;
        objectives = [`Enter ${location}`, `Map the area`, `Discover secrets`];
        break;
      default:
        description = `Complete the ${type} mission at ${location}`;
        objectives = [`Go to ${location}`, `Complete the task`, `Return for reward`];
    }

    return {
      id: this.generateId(),
      title: `${type.charAt(0).toUpperCase() + type.slice(1)} Quest`,
      description,
      objectives,
      reward: {
        xp: 100 + Math.floor(this.rng() * 400),
        gold: 50 + Math.floor(this.rng() * 200),
        items: []
      },
      completed: false
    };
  }

  /**
   * Generate a procedural item
   */
  generateItem(): Item {
    const materials = ['Wooden', 'Iron', 'Steel', 'Mithril', 'Adamant', 'Crystal', 'Divine'];
    const types = ['Sword', 'Shield', 'Armor', 'Helmet', 'Boots', 'Gloves', 'Ring', 'Amulet'];

    const material = materials[Math.floor(this.rng() * materials.length)];
    const type = types[Math.floor(this.rng() * types.length)];

    const itemType = type === 'Sword' ? 'weapon' :
                    type === 'Shield' || type === 'Armor' || type === 'Helmet' ? 'armor' : 'misc';

    return {
      id: this.generateId(),
      name: `${material} ${type}`,
      description: `A ${material.toLowerCase()} ${type.toLowerCase()} of fine craftsmanship`,
      type: itemType,
      value: 10 + Math.floor(this.rng() * 90),
      stackable: false,
      quantity: 1
    };
  }

  /**
   * Generate a creature name
   */
  generateCreatureName(): string {
    return this.generateName('creature');
  }

  /**
   * Generate a location name
   */
  generateLocationName(): string {
    return this.generateName('place');
  }

  /**
   * Generate unique ID
   */
  generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }

  /**
   * Generate a random number in range
   */
  random(min: number, max: number): number {
    return min + Math.floor(this.rng() * (max - min + 1));
  }

  /**
   * Choose random element from array
   */
  choose<T>(array: T[]): T {
    return array[Math.floor(this.rng() * array.length)];
  }

  /**
   * Reset RNG with new seed
   */
  setSeed(seed: number): void {
    this.seed = seed;
    this.rng = this.createRNG(seed);
  }

  /**
   * Get current seed
   */
  getSeed(): number {
    return this.seed;
  }
}
