/**
 * State Synchronization Module
 *
 * Efficient game state synchronization with:
 * - Multiple sync strategies (snapshot, delta, lockstep)
 * - Delta compression for bandwidth optimization
 * - State checksums for desync detection
 * - Priority-based updates
 * - Area of Interest (only sync nearby entities)
 */

import { EventEmitter } from 'events';
import type {
  SyncConfig,
  SyncStrategy,
  SyncState,
  Snapshot,
  DeltaUpdate,
  EntityState,
  EntityChange,
  AreaOfInterestConfig,
  Vector3,
  IStateSynchronizer,
} from '../types';
import type { ConnectionManager } from './connection';

// Default sync configuration
const DEFAULT_CONFIG: Required<SyncConfig> = {
  strategy: 'delta',
  tickRate: 60,
  snapshotRate: 20,
  interpolationDelay: 100,
  maxDeltaSize: 1024,
  compression: true,
  checksumValidation: true,
  priorityLevels: 3,
  areaOfInterest: {
    enabled: false,
    radius: 1000,
    updateInterval: 100,
    priorityZones: [],
  },
};

/**
 * State Synchronizer
 *
 * Manages efficient state synchronization between clients and server.
 */
export class StateSynchronizer extends EventEmitter implements IStateSynchronizer {
  readonly name = 'sync';

  private connection: ConnectionManager;
  private config: Required<SyncConfig>;
  private _state: SyncState;
  private entities: Map<string, EntityState> = new Map();
  private snapshotBuffer: Snapshot[] = [];
  private pendingChanges: EntityChange[] = [];
  private localPosition: Vector3 = { x: 0, y: 0, z: 0 };
  private tickTimer?: NodeJS.Timeout;
  private snapshotTimer?: NodeJS.Timeout;
  private lastSyncTime = 0;

  constructor(connection: ConnectionManager, config: Partial<SyncConfig> = {}) {
    super();
    this.connection = connection;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this._state = this.createInitialState();
    this.setupEventHandlers();
  }

  /**
   * Create initial sync state
   */
  private createInitialState(): SyncState {
    return {
      localTick: 0,
      serverTick: 0,
      tickDelta: 0,
      lastSnapshot: null,
      pendingDeltas: [],
      desyncCount: 0,
    };
  }

  /**
   * Get current sync state
   */
  get state(): SyncState {
    return { ...this._state };
  }

  /**
   * Initialize synchronizer
   */
  async init(): Promise<void> {
    this.startTickLoop();
  }

  /**
   * Configure synchronizer
   */
  configure(config: Partial<SyncConfig>): void {
    this.config = { ...this.config, ...config };

    // Restart loops if tick rate changed
    if (config.tickRate || config.snapshotRate) {
      this.stopTickLoop();
      this.startTickLoop();
    }
  }

  /**
   * Setup socket event handlers
   */
  private setupEventHandlers(): void {
    const socket = this.connection.getSocket();
    if (!socket) return;

    socket.on('sync:snapshot', (snapshot: Snapshot) => {
      this.handleSnapshot(snapshot);
    });

    socket.on('sync:delta', (delta: DeltaUpdate) => {
      this.handleDelta(delta);
    });

    socket.on('sync:tick', (serverTick: number) => {
      this._state.serverTick = serverTick;
      this._state.tickDelta = this._state.localTick - serverTick;
    });

    socket.on('sync:desync', (details: any) => {
      this._state.desyncCount++;
      this.emit('sync:desync', details);
      this.requestFullSync();
    });
  }

  /**
   * Handle incoming snapshot
   */
  private handleSnapshot(snapshot: Snapshot): void {
    // Validate checksum if enabled
    if (this.config.checksumValidation) {
      const calculatedChecksum = this.calculateChecksum(snapshot.entities);
      if (calculatedChecksum !== snapshot.checksum) {
        this._state.desyncCount++;
        this.emit('sync:desync', { reason: 'checksum_mismatch', snapshot });
        return;
      }
    }

    // Decompress if needed
    const entities = snapshot.compressed
      ? this.decompressEntities(snapshot.entities)
      : snapshot.entities;

    // Update entities
    this.entities.clear();
    for (const entity of entities) {
      this.entities.set(entity.id, entity);
    }

    // Add to buffer for interpolation
    this.snapshotBuffer.push({ ...snapshot, entities });
    while (this.snapshotBuffer.length > 30) {
      this.snapshotBuffer.shift();
    }

    this._state.lastSnapshot = snapshot;
    this._state.serverTick = snapshot.tick;

    this.emit('sync:snapshot', snapshot);
  }

  /**
   * Handle incoming delta update
   */
  private handleDelta(delta: DeltaUpdate): void {
    // Check if we have the base snapshot
    const baseSnapshot = this.snapshotBuffer.find(s => s.tick === delta.baseTick);
    if (!baseSnapshot && this._state.lastSnapshot?.tick !== delta.baseTick) {
      // Request full snapshot if we're missing the base
      this.requestFullSync();
      return;
    }

    // Apply changes
    for (const change of delta.changes) {
      switch (change.changeType) {
        case 'create':
          if (change.fields) {
            this.entities.set(change.entityId, change.fields as EntityState);
          }
          break;

        case 'update':
          const existing = this.entities.get(change.entityId);
          if (existing && change.fields) {
            this.entities.set(change.entityId, { ...existing, ...change.fields });
          }
          break;

        case 'delete':
          this.entities.delete(change.entityId);
          break;
      }
    }

    this._state.serverTick = delta.targetTick;
    this._state.pendingDeltas.push(delta);

    // Keep only recent deltas
    while (this._state.pendingDeltas.length > 60) {
      this._state.pendingDeltas.shift();
    }

    this.emit('sync:delta', delta);
  }

  /**
   * Push local state to server
   */
  pushState(entities: EntityState[]): void {
    const socket = this.connection.getSocket();
    if (!socket?.connected) return;

    this._state.localTick++;

    // Filter by area of interest
    const filteredEntities = this.config.areaOfInterest.enabled
      ? this.filterByAreaOfInterest(entities)
      : entities;

    // Prioritize entities
    const prioritizedEntities = this.prioritizeEntities(filteredEntities);

    if (this.config.strategy === 'delta') {
      // Send delta update
      const changes = this.calculateDelta(prioritizedEntities);

      if (changes.length > 0) {
        const delta: DeltaUpdate = {
          baseTick: this._state.serverTick,
          targetTick: this._state.localTick,
          timestamp: Date.now(),
          changes,
          compressed: this.config.compression,
        };

        // Fall back to snapshot if delta is too large
        if (JSON.stringify(delta).length > this.config.maxDeltaSize) {
          this.pushSnapshot(prioritizedEntities);
        } else {
          socket.emit('sync:delta', delta);
        }
      }
    } else if (this.config.strategy === 'snapshot') {
      // Send full snapshot at snapshot rate
      const now = Date.now();
      if (now - this.lastSyncTime >= 1000 / this.config.snapshotRate) {
        this.pushSnapshot(prioritizedEntities);
        this.lastSyncTime = now;
      }
    } else if (this.config.strategy === 'lockstep') {
      // Lockstep: send inputs, not state
      // State is deterministically calculated from inputs
      socket.emit('sync:lockstep', {
        tick: this._state.localTick,
        hash: this.calculateChecksum(prioritizedEntities),
      });
    }

    // Update local entity cache
    for (const entity of entities) {
      this.entities.set(entity.id, entity);
    }
  }

  /**
   * Push a full snapshot
   */
  private pushSnapshot(entities: EntityState[]): void {
    const socket = this.connection.getSocket();
    if (!socket?.connected) return;

    const compressed = this.config.compression
      ? this.compressEntities(entities)
      : entities;

    const snapshot: Snapshot = {
      tick: this._state.localTick,
      timestamp: Date.now(),
      serverTime: Date.now(),
      entities: compressed,
      checksum: this.calculateChecksum(entities),
      compressed: this.config.compression,
    };

    socket.emit('sync:snapshot', snapshot);
    this.lastSyncTime = Date.now();
  }

  /**
   * Calculate delta between current and previous state
   */
  private calculateDelta(entities: EntityState[]): EntityChange[] {
    const changes: EntityChange[] = [];
    const currentIds = new Set(entities.map(e => e.id));
    const previousIds = new Set(this.entities.keys());

    for (const entity of entities) {
      const previous = this.entities.get(entity.id);

      if (!previous) {
        // New entity
        changes.push({
          entityId: entity.id,
          changeType: 'create',
          fields: entity,
          timestamp: Date.now(),
        });
      } else {
        // Check for changes
        const changedFields = this.getChangedFields(previous, entity);
        if (changedFields) {
          changes.push({
            entityId: entity.id,
            changeType: 'update',
            fields: changedFields,
            timestamp: Date.now(),
          });
        }
      }
    }

    // Deleted entities
    for (const id of previousIds) {
      if (!currentIds.has(id)) {
        changes.push({
          entityId: id,
          changeType: 'delete',
          timestamp: Date.now(),
        });
      }
    }

    return changes;
  }

  /**
   * Get changed fields between two entity states
   */
  private getChangedFields(prev: EntityState, curr: EntityState): Partial<EntityState> | null {
    const changes: Partial<EntityState> = {};
    let hasChanges = false;

    for (const key of Object.keys(curr) as (keyof EntityState)[]) {
      if (key === 'id' || key === 'type') continue;

      const prevValue = prev[key];
      const currValue = curr[key];

      if (JSON.stringify(prevValue) !== JSON.stringify(currValue)) {
        (changes as any)[key] = currValue;
        hasChanges = true;
      }
    }

    return hasChanges ? changes : null;
  }

  /**
   * Get snapshot at specific tick
   */
  getSnapshot(tick?: number): Snapshot | null {
    if (tick === undefined) {
      return this._state.lastSnapshot;
    }

    return this.snapshotBuffer.find(s => s.tick === tick) || null;
  }

  /**
   * Get entity by ID
   */
  getEntity(entityId: string): EntityState | undefined {
    return this.entities.get(entityId);
  }

  /**
   * Get all entities
   */
  getAllEntities(): EntityState[] {
    return Array.from(this.entities.values());
  }

  /**
   * Request full state resync
   */
  requestFullSync(): void {
    const socket = this.connection.getSocket();
    if (socket?.connected) {
      socket.emit('sync:request_full');
    }
  }

  /**
   * Set area of interest center
   */
  setAreaOfInterest(position: Vector3, radius?: number): void {
    this.localPosition = position;
    if (radius !== undefined) {
      this.config.areaOfInterest.radius = radius;
    }

    const socket = this.connection.getSocket();
    if (socket?.connected) {
      socket.emit('sync:aoi', {
        position,
        radius: this.config.areaOfInterest.radius,
      });
    }
  }

  /**
   * Filter entities by area of interest
   */
  private filterByAreaOfInterest(entities: EntityState[]): EntityState[] {
    if (!this.config.areaOfInterest.enabled) {
      return entities;
    }

    const radius = this.config.areaOfInterest.radius;
    const radiusSquared = radius * radius;

    return entities.filter(entity => {
      if (!entity.position) return true; // Always include non-spatial entities

      const dx = entity.position.x - this.localPosition.x;
      const dy = entity.position.y - this.localPosition.y;
      const dz = entity.position.z - this.localPosition.z;
      const distSquared = dx * dx + dy * dy + dz * dz;

      return distSquared <= radiusSquared;
    });
  }

  /**
   * Prioritize entities based on priority level
   */
  private prioritizeEntities(entities: EntityState[]): EntityState[] {
    return entities.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Compress entities for transmission
   */
  private compressEntities(entities: EntityState[]): EntityState[] {
    // Simple compression: round numbers, remove unchanged defaults
    return entities.map(entity => {
      const compressed: EntityState = {
        id: entity.id,
        type: entity.type,
        priority: entity.priority,
        lastUpdate: entity.lastUpdate,
        custom: {},
      };

      if (entity.ownerId !== undefined) compressed.ownerId = entity.ownerId;
      if (entity.state) compressed.state = entity.state;
      if (entity.health !== undefined) compressed.health = Math.round(entity.health);

      if (entity.position) {
        compressed.position = {
          x: Math.round(entity.position.x * 100) / 100,
          y: Math.round(entity.position.y * 100) / 100,
          z: Math.round(entity.position.z * 100) / 100,
        };
      }

      if (entity.rotation) {
        compressed.rotation = {
          x: Math.round(entity.rotation.x * 1000) / 1000,
          y: Math.round(entity.rotation.y * 1000) / 1000,
          z: Math.round(entity.rotation.z * 1000) / 1000,
          w: Math.round(entity.rotation.w * 1000) / 1000,
        };
      }

      if (entity.velocity) {
        compressed.velocity = {
          x: Math.round(entity.velocity.x * 100) / 100,
          y: Math.round(entity.velocity.y * 100) / 100,
          z: Math.round(entity.velocity.z * 100) / 100,
        };
      }

      if (Object.keys(entity.custom).length > 0) {
        compressed.custom = entity.custom;
      }

      return compressed;
    });
  }

  /**
   * Decompress entities
   */
  private decompressEntities(entities: EntityState[]): EntityState[] {
    // Decompression is identity since we're using simple rounding
    return entities;
  }

  /**
   * Calculate checksum for state validation
   */
  private calculateChecksum(entities: EntityState[]): string {
    const sorted = [...entities].sort((a, b) => a.id.localeCompare(b.id));
    const str = JSON.stringify(sorted);

    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }

    return hash.toString(16);
  }

  /**
   * Start tick loop
   */
  private startTickLoop(): void {
    this.stopTickLoop();

    const tickInterval = 1000 / this.config.tickRate;

    this.tickTimer = setInterval(() => {
      this._state.localTick++;
      this.emit('tick', this._state.localTick);
    }, tickInterval);
  }

  /**
   * Stop tick loop
   */
  private stopTickLoop(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = undefined;
    }
    if (this.snapshotTimer) {
      clearInterval(this.snapshotTimer);
      this.snapshotTimer = undefined;
    }
  }

  /**
   * Get interpolation time (for rendering)
   */
  getInterpolationTime(): number {
    return Date.now() - this.config.interpolationDelay;
  }

  /**
   * Get interpolated entities for rendering
   */
  getInterpolatedEntities(renderTime?: number): EntityState[] {
    const time = renderTime ?? this.getInterpolationTime();

    // Find snapshots to interpolate between
    let before: Snapshot | null = null;
    let after: Snapshot | null = null;

    for (let i = this.snapshotBuffer.length - 1; i >= 0; i--) {
      const snapshot = this.snapshotBuffer[i];
      if (snapshot.timestamp <= time) {
        before = snapshot;
        after = this.snapshotBuffer[i + 1] || null;
        break;
      }
    }

    if (!before) {
      return Array.from(this.entities.values());
    }

    if (!after) {
      return before.entities;
    }

    // Interpolate between snapshots
    const t = (time - before.timestamp) / (after.timestamp - before.timestamp);
    return this.interpolateEntities(before.entities, after.entities, t);
  }

  /**
   * Interpolate between two entity states
   */
  private interpolateEntities(before: EntityState[], after: EntityState[], t: number): EntityState[] {
    const result: EntityState[] = [];
    const afterMap = new Map(after.map(e => [e.id, e]));

    for (const entityBefore of before) {
      const entityAfter = afterMap.get(entityBefore.id);

      if (!entityAfter) {
        result.push(entityBefore);
        continue;
      }

      const interpolated: EntityState = {
        ...entityBefore,
        custom: { ...entityBefore.custom },
      };

      // Interpolate position
      if (entityBefore.position && entityAfter.position) {
        interpolated.position = {
          x: this.lerp(entityBefore.position.x, entityAfter.position.x, t),
          y: this.lerp(entityBefore.position.y, entityAfter.position.y, t),
          z: this.lerp(entityBefore.position.z, entityAfter.position.z, t),
        };
      }

      // Interpolate rotation (simple lerp, should use slerp for proper quaternion interpolation)
      if (entityBefore.rotation && entityAfter.rotation) {
        interpolated.rotation = {
          x: this.lerp(entityBefore.rotation.x, entityAfter.rotation.x, t),
          y: this.lerp(entityBefore.rotation.y, entityAfter.rotation.y, t),
          z: this.lerp(entityBefore.rotation.z, entityAfter.rotation.z, t),
          w: this.lerp(entityBefore.rotation.w, entityAfter.rotation.w, t),
        };
      }

      result.push(interpolated);
    }

    return result;
  }

  /**
   * Linear interpolation
   */
  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * Math.max(0, Math.min(1, t));
  }

  /**
   * Dispose of synchronizer
   */
  dispose(): void {
    this.stopTickLoop();
    this.entities.clear();
    this.snapshotBuffer = [];
    this.pendingChanges = [];
    this.removeAllListeners();
  }
}

export default StateSynchronizer;
