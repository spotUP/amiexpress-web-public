/**
 * Replay System Module
 *
 * Game recording and playback with:
 * - Full game session recording
 * - Compressed replay storage
 * - Playback with speed control
 * - Seek to any point
 * - Export and share replays
 * - Spectator replay mode
 */

import { EventEmitter } from 'events';
import type {
  ReplayConfig,
  Replay,
  ReplayMetadata,
  ReplayFrame,
  ReplayPlayer,
  ReplayPlayback,
  ReplayEvent,
  PlayerInput,
  IReplaySystem,
} from '../types';
import type { ConnectionManager } from './connection';

// Default replay configuration
const DEFAULT_CONFIG: Required<ReplayConfig> = {
  enabled: true,
  compression: true,
  maxLength: 3600, // 1 hour in seconds
  keyframeInterval: 60, // Keyframe every 60 ticks
  saveLocally: true,
  autoSave: false,
  includeChat: true,
};

/**
 * Replay System
 *
 * Records game sessions and provides playback functionality.
 */
export class ReplaySystem extends EventEmitter implements IReplaySystem {
  readonly name = 'replay';

  private connection: ConnectionManager;
  private config: Required<ReplayConfig>;
  private currentReplay: Replay | null = null;
  private _playback: ReplayPlayback | null = null;
  private _isRecording = false;
  private recordStartTime = 0;
  private frameBuffer: ReplayFrame[] = [];
  private eventBuffer: ReplayEvent[] = [];
  private keyframes: Map<number, any> = new Map();
  private playbackTimer?: ReturnType<typeof setInterval>;
  private currentMetadata: ReplayMetadata | null = null;
  private players: ReplayPlayer[] = [];
  private gameId = '';
  private gameMode = '';
  private tickCounter = 0;

  constructor(connection: ConnectionManager, config: Partial<ReplayConfig> = {}) {
    super();
    this.connection = connection;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get recording state
   */
  get isRecording(): boolean {
    return this._isRecording;
  }

  /**
   * Get playback state
   */
  get playback(): ReplayPlayback | null {
    return this._playback;
  }

  /**
   * Initialize replay system
   */
  async init(): Promise<void> {
    this.setupEventHandlers();
  }

  /**
   * Configure replay system
   */
  configure(config: Partial<ReplayConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Setup socket event handlers
   */
  private setupEventHandlers(): void {
    const socket = this.connection.getSocket();
    if (!socket) return;

    socket.on('replay:loaded', (replay: Replay) => {
      this.currentReplay = replay;
      this.emit('replay:loaded', replay);
    });

    socket.on('replay:saved', (metadata: ReplayMetadata) => {
      this.emit('replay:saved', metadata);
    });

    socket.on('replay:shared', (data: { replayId: string; shareUrl: string }) => {
      this.emit('replay:shared', data);
    });
  }

  /**
   * Start recording a game session
   */
  startRecording(): void {
    if (!this.config.enabled || this._isRecording) return;

    this._isRecording = true;
    this.recordStartTime = Date.now();
    this.frameBuffer = [];
    this.eventBuffer = [];
    this.keyframes.clear();
    this.tickCounter = 0;

    this.emit('recording:started');
  }

  /**
   * Set game info for recording
   */
  setGameInfo(gameId: string, gameMode: string, players: ReplayPlayer[]): void {
    this.gameId = gameId;
    this.gameMode = gameMode;
    this.players = players;
  }

  /**
   * Record a frame of input
   */
  recordFrame(tick: number, inputs: Map<number, PlayerInput>, state?: any): void {
    if (!this._isRecording) return;

    const elapsed = (Date.now() - this.recordStartTime) / 1000;
    if (elapsed > this.config.maxLength) {
      this.stopRecording();
      return;
    }

    const isKeyframe = tick % this.config.keyframeInterval === 0;

    const frame: ReplayFrame = {
      tick,
      timestamp: Date.now(),
      inputs: new Map(inputs),
      isKeyframe,
      events: this.eventBuffer.filter(e => e.tick === tick),
    };

    // Store keyframe state if needed
    if (isKeyframe && state) {
      frame.state = this.config.compression ? this.compressState(state) : state;
      this.keyframes.set(tick, state);
    }

    this.frameBuffer.push(frame);
    this.tickCounter = tick;
  }

  /**
   * Record an event
   */
  recordEvent(type: string, playerId: number | undefined, data: any): void {
    if (!this._isRecording) return;

    this.eventBuffer.push({
      tick: this.tickCounter,
      type,
      playerId,
      data,
    });
  }

  /**
   * Stop recording and finalize replay
   */
  async stopRecording(): Promise<ReplayMetadata> {
    if (!this._isRecording) {
      throw new Error('Not recording');
    }

    this._isRecording = false;
    const endTime = new Date();
    const startTime = new Date(this.recordStartTime);

    const metadata: ReplayMetadata = {
      id: this.generateReplayId(),
      gameId: this.gameId,
      gameMode: this.gameMode,
      players: this.players,
      duration: (endTime.getTime() - startTime.getTime()) / 1000,
      ticks: this.tickCounter,
      startTime,
      endTime,
      version: '1.0.0',
      size: 0,
    };

    const frames = this.config.compression
      ? this.compressFrames(this.frameBuffer)
      : [...this.frameBuffer];

    this.currentReplay = {
      metadata,
      frames,
    };

    // Calculate size
    const json = JSON.stringify(this.currentReplay);
    metadata.size = json.length;

    if (this.config.autoSave) {
      await this.saveReplayToStorage(this.currentReplay);
    }

    this.emit('recording:stopped', metadata);
    return metadata;
  }

  /**
   * Get current recording duration
   */
  getRecordingDuration(): number {
    if (!this._isRecording) return 0;
    return (Date.now() - this.recordStartTime) / 1000;
  }

  /**
   * Load a replay by ID
   */
  async loadReplay(replayId: string): Promise<Replay> {
    return new Promise((resolve, reject) => {
      const socket = this.connection.getSocket();
      if (!socket?.connected) {
        // Try loading from local storage
        const local = this.loadLocalReplay(replayId);
        if (local) {
          this.currentReplay = local;
          resolve(local);
        } else {
          reject(new Error('Replay not found'));
        }
        return;
      }

      socket.emit('replay:load', { replayId }, (response: { success: boolean; replay?: Replay; error?: string }) => {
        if (response.success && response.replay) {
          this.currentReplay = response.replay;
          if (this.config.compression) {
            this.currentReplay.frames = this.decompressFrames(response.replay.frames);
          }
          resolve(this.currentReplay);
        } else {
          // Fallback to local
          const local = this.loadLocalReplay(replayId);
          if (local) {
            this.currentReplay = local;
            resolve(local);
          } else {
            reject(new Error(response.error || 'Replay not found'));
          }
        }
      });
    });
  }

  /**
   * Save replay to server
   */
  private async saveReplayToStorage(replay: Replay): Promise<void> {
    // Save locally if enabled
    if (this.config.saveLocally) {
      this.saveLocalReplay(replay);
    }

    const socket = this.connection.getSocket();
    if (socket?.connected) {
      const compressed = this.config.compression
        ? { ...replay, frames: this.compressFrames(replay.frames) }
        : replay;

      socket.emit('replay:save', compressed);
    }
  }

  /**
   * Delete a replay
   */
  async deleteReplay(replayId: string): Promise<void> {
    this.deleteLocalReplay(replayId);

    const socket = this.connection.getSocket();
    if (socket?.connected) {
      socket.emit('replay:delete', { replayId });
    }
  }

  /**
   * Start playback of loaded replay
   */
  play(): void {
    if (!this.currentReplay || this.currentReplay.frames.length === 0) return;

    if (!this._playback) {
      this._playback = {
        replayId: this.currentReplay.metadata.id,
        isPlaying: true,
        isPaused: false,
        currentTick: 0,
        currentTime: 0,
        speed: 1,
      };
    } else {
      this._playback.isPlaying = true;
      this._playback.isPaused = false;
    }

    this.startPlaybackLoop();
    this.emit('playback:started');
  }

  /**
   * Pause playback
   */
  pause(): void {
    if (!this._playback) return;

    this._playback.isPaused = true;
    this.stopPlaybackLoop();
    this.emit('playback:paused');
  }

  /**
   * Resume playback
   */
  resume(): void {
    if (!this._playback || !this._playback.isPaused) return;

    this._playback.isPaused = false;
    this.startPlaybackLoop();
    this.emit('playback:resumed');
  }

  /**
   * Stop playback
   */
  stop(): void {
    if (!this._playback) return;

    this.stopPlaybackLoop();
    this._playback = null;
    this.emit('playback:stopped');
  }

  /**
   * Seek to specific tick
   */
  seek(tick: number): void {
    if (!this._playback || !this.currentReplay) return;

    const maxTick = this.currentReplay.frames[this.currentReplay.frames.length - 1]?.tick || 0;
    this._playback.currentTick = Math.max(0, Math.min(tick, maxTick));

    // Calculate current time based on tick
    const frame = this.currentReplay.frames.find(f => f.tick >= tick);
    if (frame && this.currentReplay.frames[0]) {
      this._playback.currentTime = (frame.timestamp - this.currentReplay.frames[0].timestamp) / 1000;
    }

    // Find nearest keyframe and emit state
    const keyframeTick = this.findNearestKeyframe(tick);
    if (keyframeTick !== null) {
      const keyframeState = this.keyframes.get(keyframeTick);
      if (keyframeState) {
        this.emit('playback:keyframe', keyframeState, keyframeTick);
      }
    }

    this.emit('playback:seek', tick);
  }

  /**
   * Set playback speed
   */
  setSpeed(speed: number): void {
    if (!this._playback) return;

    // Clamp speed between 0.25x and 4x
    this._playback.speed = Math.max(0.25, Math.min(4, speed));
    this.emit('playback:speed', this._playback.speed);

    // Restart playback loop with new speed
    if (this._playback.isPlaying && !this._playback.isPaused) {
      this.stopPlaybackLoop();
      this.startPlaybackLoop();
    }
  }

  /**
   * Get frame at specific tick
   */
  getFrameAtTick(tick: number): ReplayFrame | null {
    if (!this.currentReplay) return null;
    return this.currentReplay.frames.find(f => f.tick === tick) || null;
  }

  /**
   * Get frames in range
   */
  getFramesInRange(fromTick: number, toTick: number): ReplayFrame[] {
    if (!this.currentReplay) return [];
    return this.currentReplay.frames.filter(f => f.tick >= fromTick && f.tick <= toTick);
  }

  /**
   * Get current replay
   */
  getCurrentReplay(): Replay | null {
    return this.currentReplay;
  }

  /**
   * Export replay to file format
   */
  async exportReplay(format: 'json' | 'binary'): Promise<Blob> {
    if (!this.currentReplay) {
      throw new Error('No replay loaded');
    }

    const json = JSON.stringify(this.currentReplay, (key, value) => {
      if (value instanceof Map) {
        return { __type: 'Map', entries: Array.from(value.entries()) };
      }
      return value;
    });

    if (format === 'json') {
      return new Blob([json], { type: 'application/json' });
    }

    // Binary format (compressed JSON for now)
    const data = new TextEncoder().encode(json);
    return new Blob([data], { type: 'application/octet-stream' });
  }

  /**
   * Import replay from file
   */
  importReplay(data: Uint8Array | string): Replay | null {
    try {
      let json: string;
      if (data instanceof Uint8Array) {
        json = new TextDecoder().decode(data);
      } else {
        json = data;
      }

      const replay = JSON.parse(json, (key, value) => {
        if (value && value.__type === 'Map') {
          return new Map(value.entries);
        }
        return value;
      });

      this.currentReplay = replay;
      return replay;
    } catch {
      return null;
    }
  }

  /**
   * Get list of saved replays
   */
  async getReplayList(limit: number = 20): Promise<ReplayMetadata[]> {
    return new Promise((resolve) => {
      const socket = this.connection.getSocket();
      if (!socket?.connected) {
        resolve(this.getLocalReplayList());
        return;
      }

      socket.emit('replay:list', { limit }, (response: { success: boolean; replays?: ReplayMetadata[]; error?: string }) => {
        if (response.success && response.replays) {
          resolve(response.replays);
        } else {
          resolve(this.getLocalReplayList());
        }
      });
    });
  }

  // Private helper methods

  private startPlaybackLoop(): void {
    if (this.playbackTimer) return;

    const frameTime = 1000 / 60 / (this._playback?.speed || 1);

    this.playbackTimer = setInterval(() => {
      if (!this._playback || !this.currentReplay || this._playback.isPaused) return;

      const frame = this.currentReplay.frames.find(f => f.tick === this._playback!.currentTick);
      if (frame) {
        this.emit('playback:frame', frame);

        if (frame.state) {
          const state = this.config.compression ? this.decompressState(frame.state) : frame.state;
          this.keyframes.set(frame.tick, state);
          this.emit('playback:keyframe', state, frame.tick);
        }

        // Update current time
        if (this.currentReplay.frames[0]) {
          this._playback.currentTime = (frame.timestamp - this.currentReplay.frames[0].timestamp) / 1000;
        }
      }

      this._playback.currentTick++;

      // Check if reached end
      const lastFrame = this.currentReplay.frames[this.currentReplay.frames.length - 1];
      if (lastFrame && this._playback.currentTick > lastFrame.tick) {
        this.stop();
        this.emit('playback:ended');
      }
    }, frameTime);
  }

  private stopPlaybackLoop(): void {
    if (this.playbackTimer) {
      clearInterval(this.playbackTimer);
      this.playbackTimer = undefined;
    }
  }

  private generateReplayId(): string {
    return `replay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private findNearestKeyframe(tick: number): number | null {
    let nearest: number | null = null;
    let minDiff = Infinity;

    for (const [keyframeTick] of this.keyframes) {
      const diff = Math.abs(keyframeTick - tick);
      if (diff < minDiff && keyframeTick <= tick) {
        minDiff = diff;
        nearest = keyframeTick;
      }
    }

    return nearest;
  }

  private compressState(state: any): any {
    return JSON.stringify(state);
  }

  private decompressState(compressed: any): any {
    if (typeof compressed === 'string') {
      return JSON.parse(compressed);
    }
    return compressed;
  }

  private compressFrames(frames: ReplayFrame[]): ReplayFrame[] {
    return frames.map(frame => ({
      ...frame,
      state: frame.state ? this.compressState(frame.state) : undefined,
    }));
  }

  private decompressFrames(frames: ReplayFrame[]): ReplayFrame[] {
    return frames.map(frame => ({
      ...frame,
      state: frame.state ? this.decompressState(frame.state) : undefined,
    }));
  }

  // Local storage methods

  private saveLocalReplay(replay: Replay): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const key = `replay_${replay.metadata.id}`;
      const data = JSON.stringify(replay, (k, v) => {
        if (v instanceof Map) {
          return { __type: 'Map', entries: Array.from(v.entries()) };
        }
        return v;
      });
      localStorage.setItem(key, data);

      // Update replay list
      const list = this.getLocalReplayIds();
      if (!list.includes(replay.metadata.id)) {
        list.push(replay.metadata.id);
        localStorage.setItem('replay_list', JSON.stringify(list));
      }
    } catch {
      // Local storage not available or full
    }
  }

  private loadLocalReplay(replayId: string): Replay | null {
    try {
      if (typeof localStorage === 'undefined') return null;
      const data = localStorage.getItem(`replay_${replayId}`);
      if (!data) return null;
      return JSON.parse(data, (k, v) => {
        if (v && v.__type === 'Map') {
          return new Map(v.entries);
        }
        return v;
      });
    } catch {
      return null;
    }
  }

  private deleteLocalReplay(replayId: string): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.removeItem(`replay_${replayId}`);

      const list = this.getLocalReplayIds().filter(id => id !== replayId);
      localStorage.setItem('replay_list', JSON.stringify(list));
    } catch {
      // Ignore
    }
  }

  private getLocalReplayIds(): string[] {
    try {
      if (typeof localStorage === 'undefined') return [];
      const list = localStorage.getItem('replay_list');
      return list ? JSON.parse(list) : [];
    } catch {
      return [];
    }
  }

  private getLocalReplayList(): ReplayMetadata[] {
    const ids = this.getLocalReplayIds();
    const metadataList: ReplayMetadata[] = [];

    for (const id of ids) {
      const replay = this.loadLocalReplay(id);
      if (replay) {
        metadataList.push(replay.metadata);
      }
    }

    return metadataList;
  }

  /**
   * Dispose of replay system
   */
  dispose(): void {
    this.stopPlaybackLoop();
    this.currentReplay = null;
    this._playback = null;
    this.frameBuffer = [];
    this.eventBuffer = [];
    this.keyframes.clear();
    this.removeAllListeners();
  }
}

export default ReplaySystem;
