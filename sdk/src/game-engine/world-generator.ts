import { ProceduralGenerator } from './procedural-generator';
import { ANSIColor } from './types';

/**
 * Tile type for world generation
 */
export type TileType = 'grass' | 'forest' | 'mountain' | 'water' | 'desert' | 'snow';

/**
 * Tile interface
 */
export interface Tile {
  type: TileType;
  char: string;
  color: ANSIColor;
  walkable: boolean;
  explored: boolean;
}

/**
 * World chunk interface
 */
export interface Chunk {
  x: number;
  y: number;
  tiles: Tile[][];
  entities: WorldEntity[];
  lastVisited: number;
}

/**
 * World entity interface
 */
export interface WorldEntity {
  id: string;
  type: string;
  x: number;
  y: number;
  name: string;
  data: any;
}

/**
 * World generator for creating procedural worlds
 */
export class WorldGenerator {
  private generator: ProceduralGenerator;
  private chunks: Map<string, Chunk>;
  private seed: number;

  constructor(seed?: number) {
    this.seed = seed || Date.now();
    this.generator = new ProceduralGenerator(this.seed);
    this.chunks = new Map();
  }

  /**
   * Generate or load a chunk at coordinates
   */
  getChunk(x: number, y: number): Chunk {
    const key = `${x},${y}`;

    if (this.chunks.has(key)) {
      return this.chunks.get(key)!;
    }

    // Generate new chunk
    const chunk = this.generateChunk(x, y);
    this.chunks.set(key, chunk);

    return chunk;
  }

  /**
   * Generate a world chunk
   */
  private generateChunk(chunkX: number, chunkY: number): Chunk {
    const size = 16; // 16x16 tiles
    const tiles: Tile[][] = [];
    const entities: WorldEntity[] = [];

    // Generate terrain
    for (let y = 0; y < size; y++) {
      tiles[y] = [];
      for (let x = 0; x < size; x++) {
        const worldX = chunkX * size + x;
        const worldY = chunkY * size + y;

        tiles[y][x] = this.generateTile(worldX, worldY);
      }
    }

    // Generate entities (NPCs, items, etc.)
    if (Math.random() < 0.3) { // 30% chance for entities
      const entityCount = Math.floor(Math.random() * 3) + 1;
      for (let i = 0; i < entityCount; i++) {
        const entity = this.generateEntity(
          chunkX * size + Math.floor(Math.random() * size),
          chunkY * size + Math.floor(Math.random() * size)
        );
        entities.push(entity);
      }
    }

    return {
      x: chunkX,
      y: chunkY,
      tiles,
      entities,
      lastVisited: Date.now()
    };
  }

  /**
   * Generate a terrain tile
   */
  private generateTile(worldX: number, worldY: number): Tile {
    // Simple noise-based terrain generation
    const noise = this.simplexNoise(worldX * 0.1, worldY * 0.1);

    let type: TileType;
    let char: string;
    let color: ANSIColor;
    let walkable: boolean;

    if (noise > 0.3) {
      type = 'mountain';
      char = '^';
      color = ANSIColor.WHITE;
      walkable = false;
    } else if (noise > 0) {
      type = 'forest';
      char = 'T';
      color = ANSIColor.GREEN;
      walkable = true;
    } else if (noise > -0.3) {
      type = 'grass';
      char = '.';
      color = ANSIColor.GREEN;
      walkable = true;
    } else {
      type = 'water';
      char = '~';
      color = ANSIColor.BLUE;
      walkable = false;
    }

    return {
      type,
      char,
      color,
      walkable,
      explored: false
    };
  }

  /**
   * Generate a world entity
   */
  private generateEntity(x: number, y: number): WorldEntity {
    const types = ['npc', 'monster', 'treasure', 'portal'];
    const type = types[Math.floor(Math.random() * types.length)];

    return {
      id: this.generator.generateId(),
      type,
      x,
      y,
      name: this.generator.generateName(type === 'npc' ? 'person' : 'place'),
      data: {}
    };
  }

  /**
   * Simple simplex noise for terrain generation
   */
  private simplexNoise(x: number, y: number): number {
    // Simplified noise function
    return Math.sin(x * 0.5) * Math.cos(y * 0.5) +
           Math.sin(x * 1.1 + 1) * Math.cos(y * 1.1 + 1) * 0.5;
  }

  /**
   * Get all chunks
   */
  getChunks(): Map<string, Chunk> {
    return new Map(this.chunks);
  }

  /**
   * Clear cached chunks
   */
  clearChunks(): void {
    this.chunks.clear();
  }

  /**
   * Get seed
   */
  getSeed(): number {
    return this.seed;
  }
}
