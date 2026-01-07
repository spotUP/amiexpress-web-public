/**
 * Storage - Persistent Data Storage API
 *
 * Provides clean API for saving/loading door data
 */
import * as fs from 'fs';
import * as path from 'path';
export class Storage {
    constructor(options, baseDir = process.cwd()) {
        const { doorName, userId, global } = options;
        // Build storage path
        let storagePath = path.join(baseDir, 'data', 'doors', doorName);
        if (!global && userId) {
            storagePath = path.join(storagePath, 'users', userId);
        }
        else if (!global) {
            throw new Error('Storage requires either userId or global flag');
        }
        this.storageDir = storagePath;
        // Ensure directory exists
        if (!fs.existsSync(this.storageDir)) {
            fs.mkdirSync(this.storageDir, { recursive: true });
        }
    }
    // ===== Core Methods =====
    async save(key, data) {
        const filePath = this.getFilePath(key);
        const json = JSON.stringify(data, null, 2);
        fs.writeFileSync(filePath, json, 'utf8');
    }
    async load(key) {
        const filePath = this.getFilePath(key);
        if (!fs.existsSync(filePath)) {
            return null;
        }
        try {
            const json = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(json);
        }
        catch (error) {
            console.error(`[Storage] Error loading ${key}:`, error);
            return null;
        }
    }
    async delete(key) {
        const filePath = this.getFilePath(key);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }
    async exists(key) {
        const filePath = this.getFilePath(key);
        return fs.existsSync(filePath);
    }
    async keys() {
        if (!fs.existsSync(this.storageDir)) {
            return [];
        }
        const files = fs.readdirSync(this.storageDir);
        return files
            .filter(f => f.endsWith('.json'))
            .map(f => f.replace(/\.json$/, ''));
    }
    async clear() {
        const allKeys = await this.keys();
        for (const key of allKeys) {
            await this.delete(key);
        }
    }
    // ===== Helper Methods =====
    getFilePath(key) {
        const filename = `${key}.json`;
        return path.join(this.storageDir, filename);
    }
    getStorageDir() {
        return this.storageDir;
    }
}
