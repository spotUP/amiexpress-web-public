"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.DebugOverlay = void 0;
const events_1 = require("events");
/**
 * Debug Overlay
 * Real-time debugging and performance monitoring
 */
class DebugOverlay extends events_1.EventEmitter {
    constructor(config = {}) {
        super();
        // FPS tracking
        this.frames = 0;
        this.lastFpsUpdate = Date.now();
        this.fps = 0;
        this.frameStartTime = 0;
        this.frameTimes = [];
        // Memory tracking
        this.memoryUsage = 0;
        // Entity tracking
        this.entityCounts = new Map();
        // Performance profiling
        this.profiles = new Map();
        this.activeProfiles = new Map();
        // Logging
        this.logs = [];
        // Variables to watch
        this.watchedVars = new Map();
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
    setEnabled(enabled) {
        this.enabled = enabled;
        this.emit('enabled-changed', enabled);
    }
    /**
     * Toggle debug overlay
     */
    toggle() {
        this.enabled = !this.enabled;
        this.emit('enabled-changed', this.enabled);
    }
    /**
     * Start frame timing
     */
    startFrame() {
        if (!this.enabled)
            return;
        this.frameStartTime = performance.now();
    }
    /**
     * End frame timing
     */
    endFrame() {
        if (!this.enabled)
            return;
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
    startProfile(name) {
        if (!this.enabled)
            return;
        this.activeProfiles.set(name, performance.now());
    }
    /**
     * End performance profile
     */
    endProfile(name) {
        if (!this.enabled)
            return;
        const startTime = this.activeProfiles.get(name);
        if (!startTime)
            return;
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
        }
        else {
            profile.samples++;
            profile.duration = duration;
            profile.avgDuration = ((profile.avgDuration * (profile.samples - 1)) + duration) / profile.samples;
        }
    }
    /**
     * Set entity count
     */
    setEntityCount(type, count) {
        if (!this.enabled)
            return;
        this.entityCounts.set(type, count);
    }
    /**
     * Watch variable
     */
    watch(name, value) {
        if (!this.enabled)
            return;
        this.watchedVars.set(name, value);
    }
    /**
     * Log message
     */
    log(level, message, data) {
        if (!this.enabled)
            return;
        const entry = {
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
    getAverageFrameTime() {
        if (this.frameTimes.length === 0)
            return 0;
        return this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    }
    /**
     * Get min/max frame times
     */
    getFrameTimeRange() {
        if (this.frameTimes.length === 0)
            return { min: 0, max: 0 };
        return {
            min: Math.min(...this.frameTimes),
            max: Math.max(...this.frameTimes)
        };
    }
    /**
     * Update memory usage
     */
    updateMemory() {
        if (typeof process !== 'undefined' && process.memoryUsage) {
            const usage = process.memoryUsage();
            this.memoryUsage = Math.round(usage.heapUsed / 1024 / 1024);
        }
    }
    /**
     * Intercept console methods
     */
    interceptConsole() {
        const originalLog = console.log;
        const originalWarn = console.warn;
        const originalError = console.error;
        console.log = (...args) => {
            this.log('log', args.join(' '));
            originalLog.apply(console, args);
        };
        console.warn = (...args) => {
            this.log('warn', args.join(' '));
            originalWarn.apply(console, args);
        };
        console.error = (...args) => {
            this.log('error', args.join(' '));
            originalError.apply(console, args);
        };
    }
    /**
     * Render debug overlay as ANSI text
     */
    render() {
        if (!this.enabled)
            return '';
        const lines = [];
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
    getStats() {
        return {
            fps: this.fps,
            avgFrameTime: this.getAverageFrameTime(),
            memory: this.memoryUsage,
            entities: Object.fromEntries(this.entityCounts),
            profiles: Object.fromEntries(Array.from(this.profiles.values()).map(p => [p.name, p.avgDuration || 0]))
        };
    }
    /**
     * Clear all profiling data
     */
    clearProfiles() {
        this.profiles.clear();
        this.activeProfiles.clear();
    }
    /**
     * Clear all logs
     */
    clearLogs() {
        this.logs = [];
    }
    /**
     * Reset all stats
     */
    reset() {
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
    dispose() {
        this.reset();
        this.removeAllListeners();
    }
}
exports.DebugOverlay = DebugOverlay;
