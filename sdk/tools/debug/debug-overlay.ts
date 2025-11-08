/**
 * Debug Overlay - Developer Tools
 *
 * Provides real-time debugging information and performance metrics.
 *
 * Features:
 * - FPS counter
 * - Memory usage
 * - Entity count tracking
 * - Performance profiler
 * - Console logger
 * - Variable inspector
 * - Hotkey toggling
 *
 * @example Basic Usage
 * ```typescript
 * const debug = new DebugOverlay({ enabled: true });
 *
 * // In game loop
 * debug.startFrame();
 * // ... game logic ...
 * debug.endFrame();
 *
 * // Render debug info
 * const overlay = debug.render();
 * console.log(overlay);
 * ```
 *
 * @example Performance Profiling
 * ```typescript
 * debug.startProfile('ai-update');
 * ai.update();
 * debug.endProfile('ai-update');
 *
 * debug.startProfile('render');
 * renderer.render();
 * debug.endProfile('render');
 * ```
 */

import { EventEmitter } from 'events';
import { AnsiColor } from '../../core/types';

/**
 * Debug overlay configuration
 */
export interface DebugConfig {
  /** Enable debug overlay */
  enabled?: boolean;
  /** Show FPS counter */
  showFPS?: boolean;
  /** Show memory usage */
  showMemory?: boolean;
  /** Show entity counts */
  showEntities?: boolean;
  /** Show performance profiler */
  showProfiler?: boolean;
  /** Show console logs */
  showLogs?: boolean;
  /** Max log entries */
  maxLogs?: number;
  /** Update frequency (ms) */
  updateInterval?: number;
  /** Position on screen */
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}

/**
 * Performance profile entry
 */
export interface ProfileEntry {
  /** Profile name */
  name: string;
  /** Start time */
  startTime: number;
  /** End time */
  endTime?: number;
  /** Duration (ms) */
  duration?: number;
  /** Average duration */
  avgDuration?: number;
  /** Sample count */
  samples: number;
}

/**
 * Log entry
 */
export interface LogEntry {
  /** Timestamp */
  timestamp: Date;
  /** Log level */
  level: 'log' | 'warn' | 'error' | 'debug';
  /** Message */
  message: string;
  /** Additional data */
  data?: any;
}

/**
 * Debug Overlay
 * Real-time debugging and performance monitoring
 */
export class DebugOverlay extends EventEmitter {
  private config: Required<DebugConfig>;
  private enabled: boolean;

  // FPS tracking
  private frames: number = 0;
  private lastFpsUpdate: number = Date.now();
  private fps: number = 0;
  private frameStartTime: number = 0;
  private frameTimes: number[] = [];

  // Memory tracking
  private memoryUsage: number = 0;

  // Entity tracking
  private entityCounts: Map<string, number> = new Map();

  // Performance profiling
  private profiles: Map<string, ProfileEntry> = new Map();
  private activeProfiles: Map<string, number> = new Map();

  // Logging
  private logs: LogEntry[] = [];

  // Variables to watch
  private watchedVars: Map<string, any> = new Map();

  constructor(config: DebugConfig = {}) {
    super();

    this.config = {
      enabled: config.enabled ?? process.env.NODE_ENV === 'development',
      showFPS: config.showFPS ?? true,
      showMemory: config.showMemory ?? true,
      showEntities: config.showEntities ?? true,
      showProfiler: config.showProfiler ?? true,
      showLogs: config.showLogs ?? true,
      maxLogs: config.maxLogs || 10,
      updateInterval: config.updateInterval || 1000,
      position: config.position || 'top-right'
    };

    this.enabled = this.config.enabled;

    // Intercept console methods if logging enabled
    if (this.config.showLogs) {
      this.interceptConsole();
    }
  }

  /**
   * Enable/disable debug overlay
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.emit('enabled-changed', enabled);
  }

  /**
   * Toggle debug overlay
   */
  toggle(): void {
    this.enabled = !this.enabled;
    this.emit('enabled-changed', this.enabled);
  }

  /**
   * Start frame timing
   */
  startFrame(): void {
    if (!this.enabled) return;

    this.frameStartTime = performance.now();
  }

  /**
   * End frame timing
   */
  endFrame(): void {
    if (!this.enabled) return;

    const frameTime = performance.now() - this.frameStartTime;
    this.frameTimes.push(frameTime);

    // Keep only last 60 frame times
    if (this.frameTimes.length > 60) {
      this.frameTimes.shift();
    }

    this.frames++;

    // Update FPS every second
    const now = Date.now();
    if (now - this.lastFpsUpdate >= this.config.updateInterval) {
      this.fps = Math.round(this.frames / ((now - this.lastFpsUpdate) / 1000));
      this.frames = 0;
      this.lastFpsUpdate = now;

      // Update memory
      this.updateMemory();
    }
  }

  /**
   * Start performance profile
   */
  startProfile(name: string): void {
    if (!this.enabled) return;

    this.activeProfiles.set(name, performance.now());
  }

  /**
   * End performance profile
   */
  endProfile(name: string): void {
    if (!this.enabled) return;

    const startTime = this.activeProfiles.get(name);
    if (!startTime) return;

    const endTime = performance.now();
    const duration = endTime - startTime;

    this.activeProfiles.delete(name);

    // Update profile stats
    let profile = this.profiles.get(name);
    if (!profile) {
      profile = {
        name,
        startTime,
        endTime,
        duration,
        avgDuration: duration,
        samples: 1
      };
      this.profiles.set(name, profile);
    } else {
      profile.samples++;
      profile.duration = duration;
      profile.avgDuration = ((profile.avgDuration! * (profile.samples - 1)) + duration) / profile.samples;
    }
  }

  /**
   * Set entity count
   */
  setEntityCount(type: string, count: number): void {
    if (!this.enabled) return;
    this.entityCounts.set(type, count);
  }

  /**
   * Watch variable
   */
  watch(name: string, value: any): void {
    if (!this.enabled) return;
    this.watchedVars.set(name, value);
  }

  /**
   * Log message
   */
  log(level: 'log' | 'warn' | 'error' | 'debug', message: string, data?: any): void {
    if (!this.enabled) return;

    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      message,
      data
    };

    this.logs.push(entry);

    // Trim logs
    if (this.logs.length > this.config.maxLogs) {
      this.logs.shift();
    }

    this.emit('log', entry);
  }

  /**
   * Get average frame time
   */
  getAverageFrameTime(): number {
    if (this.frameTimes.length === 0) return 0;
    return this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
  }

  /**
   * Get min/max frame times
   */
  getFrameTimeRange(): { min: number; max: number } {
    if (this.frameTimes.length === 0) return { min: 0, max: 0 };
    return {
      min: Math.min(...this.frameTimes),
      max: Math.max(...this.frameTimes)
    };
  }

  /**
   * Update memory usage
   */
  private updateMemory(): void {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const usage = process.memoryUsage();
      this.memoryUsage = Math.round(usage.heapUsed / 1024 / 1024);
    }
  }

  /**
   * Intercept console methods
   */
  private interceptConsole(): void {
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    console.log = (...args: any[]) => {
      this.log('log', args.join(' '));
      originalLog.apply(console, args);
    };

    console.warn = (...args: any[]) => {
      this.log('warn', args.join(' '));
      originalWarn.apply(console, args);
    };

    console.error = (...args: any[]) => {
      this.log('error', args.join(' '));
      originalError.apply(console, args);
    };
  }

  /**
   * Render debug overlay as ANSI text
   */
  render(): string {
    if (!this.enabled) return '';

    const lines: string[] = [];
    lines.push('=== DEBUG INFO ===');

    // FPS
    if (this.config.showFPS) {
      const avgFrameTime = this.getAverageFrameTime().toFixed(2);
      const range = this.getFrameTimeRange();
      lines.push(`FPS: ${this.fps} (${avgFrameTime}ms avg, ${range.min.toFixed(1)}-${range.max.toFixed(1)}ms)`);
    }

    // Memory
    if (this.config.showMemory) {
      lines.push(`Memory: ${this.memoryUsage} MB`);
    }

    // Entities
    if (this.config.showEntities && this.entityCounts.size > 0) {
      lines.push('Entities:');
      for (const [type, count] of this.entityCounts.entries()) {
        lines.push(`  ${type}: ${count}`);
      }
    }

    // Profiler
    if (this.config.showProfiler && this.profiles.size > 0) {
      lines.push('Profiler:');
      const sorted = Array.from(this.profiles.values())
        .sort((a, b) => (b.avgDuration || 0) - (a.avgDuration || 0));

      for (const profile of sorted.slice(0, 5)) {
        lines.push(`  ${profile.name}: ${profile.avgDuration?.toFixed(2)}ms (${profile.samples} samples)`);
      }
    }

    // Watched variables
    if (this.watchedVars.size > 0) {
      lines.push('Variables:');
      for (const [name, value] of this.watchedVars.entries()) {
        const valueStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
        lines.push(`  ${name}: ${valueStr}`);
      }
    }

    // Logs
    if (this.config.showLogs && this.logs.length > 0) {
      lines.push('Logs:');
      for (const log of this.logs.slice(-5)) {
        const time = log.timestamp.toLocaleTimeString();
        const level = log.level.toUpperCase().padEnd(5);
        lines.push(`  [${time}] ${level} ${log.message}`);
      }
    }

    lines.push('==================');

    return lines.join('\n');
  }

  /**
   * Get debug stats as object
   */
  getStats(): {
    fps: number;
    avgFrameTime: number;
    memory: number;
    entities: Record<string, number>;
    profiles: Record<string, number>;
  } {
    return {
      fps: this.fps,
      avgFrameTime: this.getAverageFrameTime(),
      memory: this.memoryUsage,
      entities: Object.fromEntries(this.entityCounts),
      profiles: Object.fromEntries(
        Array.from(this.profiles.values()).map(p => [p.name, p.avgDuration || 0])
      )
    };
  }

  /**
   * Clear all profiling data
   */
  clearProfiles(): void {
    this.profiles.clear();
    this.activeProfiles.clear();
  }

  /**
   * Clear all logs
   */
  clearLogs(): void {
    this.logs = [];
  }

  /**
   * Reset all stats
   */
  reset(): void {
    this.frames = 0;
    this.fps = 0;
    this.frameTimes = [];
    this.entityCounts.clear();
    this.clearProfiles();
    this.clearLogs();
    this.watchedVars.clear();
  }

  /**
   * Cleanup
   */
  dispose(): void {
    this.reset();
    this.removeAllListeners();
  }
}
