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

import * as fs from 'fs';
import * as path from 'path';

export interface Draft {
  id: string;
  userId: number;
  userName: string;
  timestamp: number;
  lastModified: number;
  data: {
    title?: string;
    category?: string;
    subcategory?: string;
    description?: string;
    stepsToReproduce?: string;
    expectedBehavior?: string;
    actualBehavior?: string;
    priority?: string;
    tags?: string[];
  };
  formStep: number;
}

export class AutoSaveManager {
  private draftsFile: string;
  private drafts: Map<string, Draft> = new Map();
  private autoSaveInterval?: NodeJS.Timeout;
  private maxDraftsPerUser: number = 5;
  private draftExpiryDays: number = 7;

  constructor(dataDir: string) {
    this.draftsFile = path.join(dataDir, 'drafts.json');
    this.loadDrafts();
    this.cleanupOldDrafts();
  }

  /**
   * Load drafts from file
   */
  private loadDrafts(): void {
    try {
      if (fs.existsSync(this.draftsFile)) {
        const data = fs.readFileSync(this.draftsFile, 'utf-8');
        const draftsArray: Draft[] = JSON.parse(data);
        draftsArray.forEach(draft => {
          this.drafts.set(draft.id, draft);
        });
      }
    } catch (error) {
      console.error('Error loading drafts:', error);
    }
  }

  /**
   * Save drafts to file
   */
  private saveDrafts(): void {
    try {
      const draftsArray = Array.from(this.drafts.values());
      fs.writeFileSync(this.draftsFile, JSON.stringify(draftsArray, null, 2));
    } catch (error) {
      console.error('Error saving drafts:', error);
    }
  }

  /**
   * Clean up old drafts
   */
  private cleanupOldDrafts(): void {
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
  saveDraft(
    userId: number,
    userName: string,
    data: Draft['data'],
    formStep: number,
    draftId?: string
  ): string {
    const id = draftId || `draft_${userId}_${Date.now()}`;
    const now = Date.now();

    const draft: Draft = {
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
  private enforceDraftLimit(userId: number): void {
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
  getUserDrafts(userId: number): Draft[] {
    return Array.from(this.drafts.values())
      .filter(d => d.userId === userId)
      .sort((a, b) => b.lastModified - a.lastModified);
  }

  /**
   * Get specific draft
   */
  getDraft(draftId: string): Draft | undefined {
    return this.drafts.get(draftId);
  }

  /**
   * Delete draft
   */
  deleteDraft(draftId: string): boolean {
    const deleted = this.drafts.delete(draftId);
    if (deleted) {
      this.saveDrafts();
    }
    return deleted;
  }

  /**
   * Check if user has unsaved drafts
   */
  hasUnsavedDrafts(userId: number): boolean {
    return this.getUserDrafts(userId).length > 0;
  }

  /**
   * Get most recent draft for user
   */
  getMostRecentDraft(userId: number): Draft | undefined {
    const drafts = this.getUserDrafts(userId);
    return drafts.length > 0 ? drafts[0] : undefined;
  }

  /**
   * Start auto-save for a session
   */
  startAutoSave(
    userId: number,
    userName: string,
    getData: () => Draft['data'],
    getFormStep: () => number,
    intervalMs: number = 30000  // 30 seconds
  ): string {
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
  stopAutoSave(): void {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = undefined;
    }
  }

  /**
   * Get draft summary for display
   */
  getDraftSummary(draft: Draft): string {
    const age = Date.now() - draft.lastModified;
    const ageStr = this.formatAge(age);

    let summary = `Draft from ${ageStr} ago`;
    if (draft.data.title) {
      summary += ` - "${draft.data.title.substring(0, 30)}"`;
    } else if (draft.data.category) {
      summary += ` - ${draft.data.category}`;
    }

    return summary;
  }

  /**
   * Format age in human-readable form
   */
  private formatAge(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d`;
    if (hours > 0) return `${hours}h`;
    if (minutes > 0) return `${minutes}m`;
    return `${seconds}s`;
  }

  /**
   * Export draft as text
   */
  exportDraft(draft: Draft): string {
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
