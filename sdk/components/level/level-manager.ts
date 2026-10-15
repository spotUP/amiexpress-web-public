/**
 * Level Manager - Tile Map and Level Management
 *
 * Handles tile-based levels and maps for BBS door games.
 *
 * Features:
 * - Tile map loading and rendering
 * - Collision detection
 * - Layer management
 * - Spawn point handling
 * - Level transitions
 * - Save/load level state
 *
 * @example Basic Usage
 * ```typescript
 * const levelMgr = new LevelManager();
 *
 * const level = levelMgr.loadFromString(`
 *   ################
 *   #..............#
 *   #..S.........E.#
 *   #..............#
 *   ################
 * `, {
 *   '#': { type: 'wall', solid: true, char: '#', color: AnsiColor.White },
 *   '.': { type: 'floor', solid: false, char: '.', color: AnsiColor.Black },
 *   'S': { type: 'spawn', solid: false, char: ' ', color: AnsiColor.Black },
 *   'E': { type: 'exit', solid: false, char: ' ', color: AnsiColor.Black }
 * });
 *
 * const spawn = levelMgr.getSpawnPoint(level.id, 0);
 * ```
 */

import { Level, Tile, Position, Size, AnsiColor } from '../../core/types';
import { EventEmitter } from 'events';

/**
 * Tile definition for parsing
 */
export interface TileDefinition {
  type: string;
  solid: boolean;
  char: string;
  color: AnsiColor;
  properties?: Record<string, any>;
}

/**
 * Level layer
 */
export interface LevelLayer {
  /** Layer name */
  name: string;
  /** Layer tiles */
  tiles: Tile[][];
  /** Layer visible? */
  visible: boolean;
  /** Layer opacity (0-1) */
  opacity: number;
  /** Z-index */
  zIndex: number;
}

/**
 * Level metadata
 */
export interface LevelMetadata {
  /** Level name */
  name: string;
  /** Author */
  author?: string;
  /** Description */
  description?: string;
  /** Difficulty */
  difficulty?: number;
  /** Time limit (seconds) */
  timeLimit?: number;
  /** Custom metadata */
  custom?: Record<string, any>;
}

/**
 * Level Manager
 * Handles level loading, management, and tile operations
 */
export class LevelManager extends EventEmitter {
  private levels: Map<string, Level> = new Map();
  private currentLevel?: Level;
  private layers: Map<string, LevelLayer[]> = new Map();

  constructor() {
    super();
  }

  /**
   * Create empty level
   */
  createLevel(id: string, width: number, height: number, metadata?: LevelMetadata): Level {
    const tiles: Tile[][] = [];

    for (let y = 0; y < height; y++) {
      const row: Tile[] = [];
      for (let x = 0; x < width; x++) {
        row.push({
          type: 'empty',
          gridPosition: { x, y },
          char: ' ',
          color: AnsiColor.Black,
          solid: false,
          properties: {}
        });
      }
      tiles.push(row);
    }

    const level: Level = {
      id,
      name: metadata?.name || id,
      gridSize: { width, height },
      tiles,
      spawns: [],
      data: metadata?.custom || {}
    };

    this.levels.set(id, level);
    this.emit('level-created', level);

    return level;
  }

  /**
   * Load level from ASCII string
   */
  loadFromString(
    id: string,
    mapString: string,
    tileDefs: Record<string, TileDefinition>,
    metadata?: LevelMetadata
  ): Level {
    const lines = mapString.trim().split('\n');
    const height = lines.length;
    const width = Math.max(...lines.map(l => l.length));

    const tiles: Tile[][] = [];
    const spawns: Position[] = [];

    for (let y = 0; y < height; y++) {
      const row: Tile[] = [];
      const line = lines[y];

      for (let x = 0; x < width; x++) {
        const char = line[x] || ' ';
        const def = tileDefs[char] || {
          type: 'empty',
          solid: false,
          char: ' ',
          color: AnsiColor.Black
        };

        const tile: Tile = {
          type: def.type,
          gridPosition: { x, y },
          char: def.char,
          color: def.color,
          solid: def.solid,
          properties: def.properties || {}
        };

        // Track spawn points
        if (def.type === 'spawn') {
          spawns.push({ x, y });
        }

        row.push(tile);
      }
      tiles.push(row);
    }

    const level: Level = {
      id,
      name: metadata?.name || id,
      gridSize: { width, height },
      tiles,
      spawns,
      data: metadata?.custom || {}
    };

    this.levels.set(id, level);
    this.emit('level-loaded', level);

    return level;
  }

  /**
   * Load level from JSON
   */
  loadFromJSON(json: string): Level {
    const data = JSON.parse(json);
    const level: Level = data;

    this.levels.set(level.id, level);
    this.emit('level-loaded', level);

    return level;
  }

  /**
   * Save level to JSON
   */
  saveToJSON(levelId: string): string {
    const level = this.levels.get(levelId);
    if (!level) throw new Error(`Level ${levelId} not found`);

    return JSON.stringify(level, null, 2);
  }

  /**
   * Get level
   */
  getLevel(id: string): Level | undefined {
    return this.levels.get(id);
  }

  /**
   * Set current level
   */
  setCurrentLevel(id: string): void {
    const level = this.levels.get(id);
    if (!level) throw new Error(`Level ${id} not found`);

    this.currentLevel = level;
    this.emit('level-changed', level);
  }

  /**
   * Get current level
   */
  getCurrentLevel(): Level | undefined {
    return this.currentLevel;
  }

  /**
   * Get tile at position
   */
  getTile(levelId: string, x: number, y: number): Tile | null {
    const level = this.levels.get(levelId);
    if (!level) return null;

    if (y < 0 || y >= level.tiles.length) return null;
    if (x < 0 || x >= level.tiles[y].length) return null;

    return level.tiles[y][x];
  }

  /**
   * Set tile at position
   */
  setTile(levelId: string, x: number, y: number, tile: Partial<Tile>): void {
    const level = this.levels.get(levelId);
    if (!level) return;

    if (y < 0 || y >= level.tiles.length) return;
    if (x < 0 || x >= level.tiles[y].length) return;

    Object.assign(level.tiles[y][x], tile);
    this.emit('tile-changed', level, x, y);
  }

  /**
   * Check if position is walkable
   */
  isWalkable(levelId: string, x: number, y: number): boolean {
    const tile = this.getTile(levelId, x, y);
    return tile !== null && !tile.solid;
  }

  /**
   * Get spawn point
   */
  getSpawnPoint(levelId: string, index: number = 0): Position | null {
    const level = this.levels.get(levelId);
    if (!level || !level.spawns[index]) return null;

    return level.spawns[index];
  }

  /**
   * Add spawn point
   */
  addSpawnPoint(levelId: string, position: Position): void {
    const level = this.levels.get(levelId);
    if (!level) return;

    level.spawns.push(position);
    this.emit('spawn-added', level, position);
  }

  /**
   * Find tiles by type
   */
  findTilesByType(levelId: string, type: string): Tile[] {
    const level = this.levels.get(levelId);
    if (!level) return [];

    const result: Tile[] = [];

    for (const row of level.tiles) {
      for (const tile of row) {
        if (tile.type === type) {
          result.push(tile);
        }
      }
    }

    return result;
  }

  /**
   * Get tiles in rectangle
   */
  getTilesInRect(levelId: string, x: number, y: number, width: number, height: number): Tile[] {
    const level = this.levels.get(levelId);
    if (!level) return [];

    const result: Tile[] = [];

    for (let ty = y; ty < y + height; ty++) {
      for (let tx = x; tx < x + width; tx++) {
        const tile = this.getTile(levelId, tx, ty);
        if (tile) result.push(tile);
      }
    }

    return result;
  }

  /**
   * Render level to string (ASCII)
   */
  renderToString(levelId: string, layerName?: string): string {
    const level = this.levels.get(levelId);
    if (!level) return '';

    let output = '';

    for (const row of level.tiles) {
      for (const tile of row) {
        output += tile.char;
      }
      output += '\n';
    }

    return output;
  }

  /**
   * Add layer to level
   */
  addLayer(levelId: string, layer: LevelLayer): void {
    if (!this.layers.has(levelId)) {
      this.layers.set(levelId, []);
    }

    const layers = this.layers.get(levelId)!;
    layers.push(layer);
    layers.sort((a, b) => a.zIndex - b.zIndex);

    this.emit('layer-added', levelId, layer);
  }

  /**
   * Get layers for level
   */
  getLayers(levelId: string): LevelLayer[] {
    return this.layers.get(levelId) || [];
  }

  /**
   * Clone level
   */
  cloneLevel(sourceId: string, targetId: string): Level {
    const source = this.levels.get(sourceId);
    if (!source) throw new Error(`Level ${sourceId} not found`);

    const tiles: Tile[][] = source.tiles.map(row =>
      row.map(tile => ({ ...tile }))
    );

    const level: Level = {
      ...source,
      id: targetId,
      tiles,
      spawns: [...source.spawns]
    };

    this.levels.set(targetId, level);
    this.emit('level-cloned', source, level);

    return level;
  }

  /**
   * Remove level
   */
  removeLevel(id: string): void {
    this.levels.delete(id);
    this.layers.delete(id);
    this.emit('level-removed', id);
  }

  /**
   * Get all level IDs
   */
  getLevelIds(): string[] {
    return Array.from(this.levels.keys());
  }

  /**
   * Cleanup
   */
  dispose(): void {
    this.levels.clear();
    this.layers.clear();
    this.removeAllListeners();
  }
}
