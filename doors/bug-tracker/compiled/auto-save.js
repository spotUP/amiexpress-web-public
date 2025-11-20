"use strict";
/**
 * Auto-Save & Session Recovery
 *
 * Features:
 * - Auto-save drafts as users type
 * - Recover unsaved work on reconnect
 * - Multiple draft slots
 * - Draft management
 * - Auto-cleanup old drafts
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
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutoSaveManager = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class AutoSaveManager {
    constructor(dataDir) {
        this.drafts = new Map();
        this.maxDraftsPerUser = 5;
        this.draftExpiryDays = 7;
        this.draftsFile = path.join(dataDir, 'drafts.json');
        this.loadDrafts();
        this.cleanupOldDrafts();
    }
    /**
     * Load drafts from file
     */
    loadDrafts() {
        try {
            if (fs.existsSync(this.draftsFile)) {
                const data = fs.readFileSync(this.draftsFile, 'utf-8');
                const draftsArray = JSON.parse(data);
                draftsArray.forEach(draft => {
                    this.drafts.set(draft.id, draft);
                });
            }
        }
        catch (error) {
            console.error('Error loading drafts:', error);
        }
    }
    /**
     * Save drafts to file
     */
    saveDrafts() {
        try {
            const draftsArray = Array.from(this.drafts.values());
            fs.writeFileSync(this.draftsFile, JSON.stringify(draftsArray, null, 2));
        }
        catch (error) {
            console.error('Error saving drafts:', error);
        }
    }
    /**
     * Clean up old drafts
     */
    cleanupOldDrafts() {
        const now = Date.now();
        const expiryMs = this.draftExpiryDays * 24 * 60 * 60 * 1000;
        for (const [id, draft] of this.drafts.entries()) {
            if (now - draft.lastModified > expiryMs) {
                this.drafts.delete(id);
            }
        }
        this.saveDrafts();
    }
    /**
     * Create or update draft
     */
    saveDraft(userId, userName, data, formStep, draftId) {
        const id = draftId || `draft_${userId}_${Date.now()}`;
        const now = Date.now();
        const draft = {
            id,
            userId,
            userName,
            timestamp: this.drafts.get(id)?.timestamp || now,
            lastModified: now,
            data,
            formStep
        };
        this.drafts.set(id, draft);
        // Enforce max drafts per user
        this.enforceDraftLimit(userId);
        this.saveDrafts();
        return id;
    }
    /**
     * Enforce maximum drafts per user
     */
    enforceDraftLimit(userId) {
        const userDrafts = Array.from(this.drafts.values())
            .filter(d => d.userId === userId)
            .sort((a, b) => b.lastModified - a.lastModified);
        if (userDrafts.length > this.maxDraftsPerUser) {
            const toDelete = userDrafts.slice(this.maxDraftsPerUser);
            toDelete.forEach(draft => {
                this.drafts.delete(draft.id);
            });
        }
    }
    /**
     * Get user's drafts
     */
    getUserDrafts(userId) {
        return Array.from(this.drafts.values())
            .filter(d => d.userId === userId)
            .sort((a, b) => b.lastModified - a.lastModified);
    }
    /**
     * Get specific draft
     */
    getDraft(draftId) {
        return this.drafts.get(draftId);
    }
    /**
     * Delete draft
     */
    deleteDraft(draftId) {
        const deleted = this.drafts.delete(draftId);
        if (deleted) {
            this.saveDrafts();
        }
        return deleted;
    }
    /**
     * Check if user has unsaved drafts
     */
    hasUnsavedDrafts(userId) {
        return this.getUserDrafts(userId).length > 0;
    }
    /**
     * Get most recent draft for user
     */
    getMostRecentDraft(userId) {
        const drafts = this.getUserDrafts(userId);
        return drafts.length > 0 ? drafts[0] : undefined;
    }
    /**
     * Start auto-save for a session
     */
    startAutoSave(userId, userName, getData, getFormStep, intervalMs = 30000 // 30 seconds
    ) {
        // Create initial draft
        const draftId = this.saveDraft(userId, userName, getData(), getFormStep());
        // Set up auto-save interval
        this.autoSaveInterval = setInterval(() => {
            this.saveDraft(userId, userName, getData(), getFormStep(), draftId);
        }, intervalMs);
        return draftId;
    }
    /**
     * Stop auto-save
     */
    stopAutoSave() {
        if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval);
            this.autoSaveInterval = undefined;
        }
    }
    /**
     * Get draft summary for display
     */
    getDraftSummary(draft) {
        const age = Date.now() - draft.lastModified;
        const ageStr = this.formatAge(age);
        let summary = `Draft from ${ageStr} ago`;
        if (draft.data.title) {
            summary += ` - "${draft.data.title.substring(0, 30)}"`;
        }
        else if (draft.data.category) {
            summary += ` - ${draft.data.category}`;
        }
        return summary;
    }
    /**
     * Format age in human-readable form
     */
    formatAge(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        if (days > 0)
            return `${days}d`;
        if (hours > 0)
            return `${hours}h`;
        if (minutes > 0)
            return `${minutes}m`;
        return `${seconds}s`;
    }
    /**
     * Export draft as text
     */
    exportDraft(draft) {
        let text = `=== Bug Report Draft ===\n`;
        text += `Created: ${new Date(draft.timestamp).toISOString()}\n`;
        text += `Last Modified: ${new Date(draft.lastModified).toISOString()}\n`;
        text += `Reporter: ${draft.userName}\n`;
        text += `\n`;
        if (draft.data.title) {
            text += `Title: ${draft.data.title}\n\n`;
        }
        if (draft.data.category) {
            text += `Category: ${draft.data.category}\n`;
        }
        if (draft.data.subcategory) {
            text += `Subcategory: ${draft.data.subcategory}\n`;
        }
        if (draft.data.priority) {
            text += `Priority: ${draft.data.priority}\n`;
        }
        text += `\n`;
        if (draft.data.description) {
            text += `Description:\n${draft.data.description}\n\n`;
        }
        if (draft.data.stepsToReproduce) {
            text += `Steps to Reproduce:\n${draft.data.stepsToReproduce}\n\n`;
        }
        if (draft.data.expectedBehavior) {
            text += `Expected Behavior:\n${draft.data.expectedBehavior}\n\n`;
        }
        if (draft.data.actualBehavior) {
            text += `Actual Behavior:\n${draft.data.actualBehavior}\n\n`;
        }
        if (draft.data.tags && draft.data.tags.length > 0) {
            text += `Tags: ${draft.data.tags.join(', ')}\n`;
        }
        return text;
    }
}
exports.AutoSaveManager = AutoSaveManager;
