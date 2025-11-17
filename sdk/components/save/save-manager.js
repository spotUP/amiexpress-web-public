"use strict";
/**
 * Save Manager - Game State Persistence
 *
 * Handles saving and loading game state for BBS doors.
 *
 * Features:
 * - Multiple save slots
 * - Auto-save functionality
 * - State compression
 * - Save validation
 * - Cloud sync (optional)
 * - Import/export saves
 *
 * @example Basic Usage
 * ```typescript
 * const saveMgr = new SaveManager({ userId: 123 });
 *
 * // Save game state
 * await saveMgr.save(1, {
 *   level: 5,
 *   score: 1000,
 *   inventory: ['sword', 'shield'],
 *   position: { x: 10, y: 20 }
 * });
 *
 * // Load game state
 * const data = await saveMgr.load(1);
 * console.log(data.level); // 5
 * ```
 *
 * @example Auto-save
 * ```typescript
 * saveMgr.enableAutoSave(60000); // Auto-save every minute
 *
 * saveMgr.onAutoSave(() => {
 *   console.log('Game auto-saved!');
 * });
 * ```
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SaveManager = void 0;
const events_1 = require("events");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * Save Manager
 * Handles game state persistence
 */
class SaveManager extends events_1.EventEmitter {
    constructor(config) {
        super();
        this.saves = new Map();
        this.autoSaveInterval = 0;
        this.config = {
            userId: config.userId,
            gameId: config.gameId || 'default',
            saveDir: config.saveDir || './saves',
            maxSlots: config.maxSlots || 10,
            compression: config.compression ?? false,
            cloudSync: config.cloudSync
        };
        this.ensureSaveDirectory();
        this.loadAllSaves();
    }
    /**
     * Save game state to slot
     */
    async save(slot, state, metadata) {
        if (slot < 1 || slot > this.config.maxSlots) {
            throw new Error(`Invalid save slot: ${slot} (must be 1-${this.config.maxSlots})`);
        }
        const saveData = {
            slot,
            timestamp: new Date(),
            state,
            progress: metadata?.progress || 0,
            metadata: {
                name: metadata?.name,
                playtime: metadata?.playtime || 0,
                location: metadata?.location,
                preview: metadata?.preview,
                ...metadata
            }
        };
        this.saves.set(slot, saveData);
        this.currentSlot = slot;
        await this.writeSaveFile(saveData);
        this.emit('save-created', saveData);
        if (this.config.cloudSync) {
            await this.syncToCloud(saveData);
        }
    }
    /**
     * Load game state from slot
     */
    async load(slot) {
        const saveData = this.saves.get(slot);
        if (!saveData) {
            // Try loading from file
            const loaded = await this.readSaveFile(slot);
            if (loaded) {
                this.saves.set(slot, loaded);
                this.currentSlot = slot;
                this.emit('save-loaded', loaded);
                return loaded;
            }
            return null;
        }
        this.currentSlot = slot;
        this.emit('save-loaded', saveData);
        return saveData;
    }
    /**
     * Delete save slot
     */
    async delete(slot) {
        this.saves.delete(slot);
        await this.deleteSaveFile(slot);
        this.emit('save-deleted', slot);
    }
    /**
     * Get save metadata
     */
    getMetadata(slot) {
        const saveData = this.saves.get(slot);
        if (!saveData)
            return null;
        return {
            slot: saveData.slot,
            name: saveData.metadata.name,
            timestamp: saveData.timestamp,
            progress: saveData.progress,
            playtime: saveData.metadata.playtime || 0,
            location: saveData.metadata.location,
            preview: saveData.metadata.preview
        };
    }
    /**
     * List all save slots with metadata
     */
    listSaves() {
        const metadata = [];
        for (let slot = 1; slot <= this.config.maxSlots; slot++) {
            const meta = this.getMetadata(slot);
            if (meta) {
                metadata.push(meta);
            }
        }
        return metadata.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    }
    /**
     * Check if slot has save
     */
    hasSave(slot) {
        return this.saves.has(slot);
    }
    /**
     * Get current save slot
     */
    getCurrentSlot() {
        return this.currentSlot;
    }
    /**
     * Quick save to current slot
     */
    async quickSave(state) {
        if (!this.currentSlot) {
            this.currentSlot = this.findNextFreeSlot();
        }
        await this.save(this.currentSlot, state, { name: 'Quick Save' });
    }
    /**
     * Auto-save to dedicated slot
     */
    async autoSave(state) {
        const autoSaveSlot = this.config.maxSlots; // Use last slot for auto-save
        await this.save(autoSaveSlot, state, { name: 'Auto Save' });
        this.emit('auto-save', autoSaveSlot);
    }
    /**
     * Enable auto-save with interval
     */
    enableAutoSave(intervalMs, getState) {
        this.disableAutoSave();
        this.autoSaveInterval = intervalMs;
        this.autoSaveTimer = setInterval(async () => {
            try {
                const state = getState();
                await this.autoSave(state);
            }
            catch (error) {
                this.emit('auto-save-error', error);
            }
        }, intervalMs);
        this.emit('auto-save-enabled', intervalMs);
    }
    /**
     * Disable auto-save
     */
    disableAutoSave() {
        if (this.autoSaveTimer) {
            clearInterval(this.autoSaveTimer);
            this.autoSaveTimer = undefined;
            this.emit('auto-save-disabled');
        }
    }
    /**
     * Export save to file
     */
    async exportSave(slot, filePath) {
        const saveData = this.saves.get(slot);
        if (!saveData)
            throw new Error(`No save in slot ${slot}`);
        const json = JSON.stringify(saveData, null, 2);
        await fs.promises.writeFile(filePath, json, 'utf8');
        this.emit('save-exported', slot, filePath);
    }
    /**
     * Import save from file
     */
    async importSave(filePath, slot) {
        const json = await fs.promises.readFile(filePath, 'utf8');
        const saveData = JSON.parse(json);
        const targetSlot = slot || saveData.slot || this.findNextFreeSlot();
        saveData.slot = targetSlot;
        this.saves.set(targetSlot, saveData);
        await this.writeSaveFile(saveData);
        this.emit('save-imported', targetSlot, filePath);
        return targetSlot;
    }
    /**
     * Copy save to another slot
     */
    async copySave(fromSlot, toSlot) {
        const saveData = this.saves.get(fromSlot);
        if (!saveData)
            throw new Error(`No save in slot ${fromSlot}`);
        const copy = JSON.parse(JSON.stringify(saveData));
        copy.slot = toSlot;
        copy.timestamp = new Date();
        await this.save(toSlot, copy.state, copy.metadata);
        this.emit('save-copied', fromSlot, toSlot);
    }
    /**
     * Validate save data integrity
     */
    validateSave(slot) {
        const saveData = this.saves.get(slot);
        if (!saveData)
            return false;
        // Basic validation
        if (!saveData.state || typeof saveData.state !== 'object') {
            return false;
        }
        if (!saveData.timestamp || !(saveData.timestamp instanceof Date)) {
            return false;
        }
        // Could add checksum validation here
        return true;
    }
    /**
     * Find next available save slot
     */
    findNextFreeSlot() {
        for (let slot = 1; slot <= this.config.maxSlots; slot++) {
            if (!this.saves.has(slot)) {
                return slot;
            }
        }
        return 1; // Overwrite first slot if all full
    }
    /**
     * Ensure save directory exists
     */
    ensureSaveDirectory() {
        const dir = this.getSaveDirectory();
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }
    /**
     * Get save directory path
     */
    getSaveDirectory() {
        return path.join(this.config.saveDir, this.config.gameId, String(this.config.userId));
    }
    /**
     * Get save file path
     */
    getSaveFilePath(slot) {
        return path.join(this.getSaveDirectory(), `save_${slot}.json`);
    }
    /**
     * Write save to file
     */
    async writeSaveFile(saveData) {
        const filePath = this.getSaveFilePath(saveData.slot);
        let data = JSON.stringify(saveData, null, 2);
        if (this.config.compression) {
            // In production, use actual compression (zlib, etc.)
            // For now, just write as-is
        }
        await fs.promises.writeFile(filePath, data, 'utf8');
    }
    /**
     * Read save from file
     */
    async readSaveFile(slot) {
        const filePath = this.getSaveFilePath(slot);
        if (!fs.existsSync(filePath)) {
            return null;
        }
        try {
            const data = await fs.promises.readFile(filePath, 'utf8');
            const saveData = JSON.parse(data);
            // Convert timestamp string to Date
            if (typeof saveData.timestamp === 'string') {
                saveData.timestamp = new Date(saveData.timestamp);
            }
            return saveData;
        }
        catch (error) {
            this.emit('load-error', slot, error);
            return null;
        }
    }
    /**
     * Delete save file
     */
    async deleteSaveFile(slot) {
        const filePath = this.getSaveFilePath(slot);
        if (fs.existsSync(filePath)) {
            await fs.promises.unlink(filePath);
        }
    }
    /**
     * Load all saves from disk
     */
    loadAllSaves() {
        const dir = this.getSaveDirectory();
        if (!fs.existsSync(dir))
            return;
        const files = fs.readdirSync(dir);
        for (const file of files) {
            if (file.startsWith('save_') && file.endsWith('.json')) {
                const slot = parseInt(file.match(/save_(\d+)\.json/)?.[1] || '0');
                if (slot > 0 && slot <= this.config.maxSlots) {
                    this.readSaveFile(slot).then(saveData => {
                        if (saveData) {
                            this.saves.set(slot, saveData);
                        }
                    });
                }
            }
        }
    }
    /**
     * Sync save to cloud (placeholder)
     */
    async syncToCloud(saveData) {
        // In production, implement actual cloud sync
        // For now, just emit event
        this.emit('cloud-sync', saveData);
    }
    /**
     * Event: Auto-save triggered
     */
    onAutoSave(callback) {
        this.on('auto-save', callback);
    }
    /**
     * Cleanup
     */
    dispose() {
        this.disableAutoSave();
        this.saves.clear();
        this.removeAllListeners();
    }
}
exports.SaveManager = SaveManager;
