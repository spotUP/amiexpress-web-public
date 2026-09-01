/**
 * BUGS: its data, and the webhooks that announce changes to it.
 *
 * Types, the category and priority tables, the JSON-file storage and the
 * webhook sender. None of it touches the screen, which is why it can live
 * apart from the views - and why app.ts was carrying 350 lines that had
 * nothing to do with drawing anything.
 *
 * Extracted because app.ts stood at 2506 lines against a 2000-line ceiling.
 */
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

export interface DoorSession {
  socket: any;
  user: any;
  bbsSession: any;
  bbs: any;
  params?: string[];
  args?: string[];
}

export type BugCategory = 'system-commands' | 'doors' | 'general' | 'ui' | 'network' | 'security';
export type BugPriority = 'low' | 'medium' | 'high' | 'critical';
export type BugStatus = 'new' | 'acknowledged' | 'in-progress' | 'fixed' | 'closed' | 'wont-fix';

export interface BugComment {
  id: number;
  bugId: number;
  author: string;
  content: string;
  timestamp: number;
  isInternal: boolean; // Sysop-only notes
}

export interface BugReport {
  id: number;
  title: string;
  description: string;
  category: BugCategory;
  priority: BugPriority;
  status: BugStatus;
  reporter: string;
  assignee: string | null;
  createdAt: number;
  updatedAt: number;
  closedAt: number | null;
  stepsToReproduce: string;
  expectedBehavior: string;
  actualBehavior: string;
  systemInfo: string;
  comments: BugComment[];
  tags: string[];
  attachments: string[];
  votes: string[]; // usernames who voted for this bug
}

export interface WebhookConfig {
  enabled: boolean;
  url: string;
  type: 'discord' | 'slack' | 'generic';
  events: ('create' | 'update' | 'close' | 'comment')[];
}

export interface BugTrackerData {
  bugs: BugReport[];
  nextBugId: number;
  nextCommentId: number;
  webhooks: WebhookConfig[];
  settings: {
    allowAnonymous: boolean;
    requireApproval: boolean;
    notifyOnNew: boolean;
  };
}

// ============================================================================
// Constants
// ============================================================================

export const CATEGORIES: { value: BugCategory; label: string }[] = [
  { value: 'system-commands', label: 'System Commands' },
  { value: 'doors', label: 'Doors/Games' },
  { value: 'general', label: 'General System' },
  { value: 'ui', label: 'User Interface' },
  { value: 'network', label: 'Network/Connectivity' },
  { value: 'security', label: 'Security' },
];

export const PRIORITIES: { value: BugPriority; label: string; color: string }[] = [
  { value: 'low', label: 'Low', color: 'gray' },
  { value: 'medium', label: 'Medium', color: 'yellow' },
  { value: 'high', label: 'High', color: 'red' },
  { value: 'critical', label: 'Critical', color: 'magenta' },
];

export const STATUSES: { value: BugStatus; label: string; color: string }[] = [
  { value: 'new', label: 'New', color: 'white' },
  { value: 'acknowledged', label: 'Acknowledged', color: 'cyan' },
  { value: 'in-progress', label: 'In Progress', color: 'yellow' },
  { value: 'fixed', label: 'Fixed', color: 'green' },
  { value: 'closed', label: 'Closed', color: 'gray' },
  { value: 'wont-fix', label: "Won't Fix", color: 'red' },
];

// ============================================================================
// Data Storage
// ============================================================================

export class BugStorage {
  private dataPath: string;
  private data: BugTrackerData;

  constructor(doorPath: string) {
    this.dataPath = path.join(doorPath, 'data', 'bugs.json');
    this.data = this.load();
  }

  private load(): BugTrackerData {
    try {
      if (fs.existsSync(this.dataPath)) {
        const content = fs.readFileSync(this.dataPath, 'utf-8');
        return JSON.parse(content);
      }
    } catch (err) {
      console.error('[BugTracker] Error loading data:', err);
    }

    return {
      bugs: [],
      nextBugId: 1,
      nextCommentId: 1,
      webhooks: [],
      settings: {
        allowAnonymous: false,
        requireApproval: false,
        notifyOnNew: true,
      },
    };
  }

  save(): void {
    try {
      const dir = path.dirname(this.dataPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.dataPath, JSON.stringify(this.data, null, 2));
    } catch (err) {
      console.error('[BugTracker] Error saving data:', err);
    }
  }

  getBugs(): BugReport[] {
    return this.data.bugs;
  }

  getBug(id: number): BugReport | undefined {
    return this.data.bugs.find(b => b.id === id);
  }

  createBug(bug: Omit<BugReport, 'id' | 'createdAt' | 'updatedAt' | 'closedAt' | 'comments' | 'votes'>): BugReport {
    const newBug: BugReport = {
      ...bug,
      id: this.data.nextBugId++,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      closedAt: null,
      comments: [],
      votes: [],
    };
    this.data.bugs.push(newBug);
    this.save();
    return newBug;
  }

  updateBug(id: number, updates: Partial<BugReport>): BugReport | undefined {
    const bug = this.data.bugs.find(b => b.id === id);
    if (bug) {
      Object.assign(bug, updates, { updatedAt: Date.now() });
      if (updates.status === 'closed' || updates.status === 'fixed') {
        bug.closedAt = Date.now();
      }
      this.save();
    }
    return bug;
  }

  deleteBug(id: number): boolean {
    const idx = this.data.bugs.findIndex(b => b.id === id);
    if (idx !== -1) {
      this.data.bugs.splice(idx, 1);
      this.save();
      return true;
    }
    return false;
  }

  addComment(bugId: number, comment: Omit<BugComment, 'id' | 'bugId' | 'timestamp'>): BugComment | undefined {
    const bug = this.data.bugs.find(b => b.id === bugId);
    if (bug) {
      const newComment: BugComment = {
        ...comment,
        id: this.data.nextCommentId++,
        bugId,
        timestamp: Date.now(),
      };
      bug.comments.push(newComment);
      bug.updatedAt = Date.now();
      this.save();
      return newComment;
    }
    return undefined;
  }

  voteBug(bugId: number, username: string): boolean {
    const bug = this.data.bugs.find(b => b.id === bugId);
    if (bug && !bug.votes.includes(username)) {
      bug.votes.push(username);
      this.save();
      return true;
    }
    return false;
  }

  unvoteBug(bugId: number, username: string): boolean {
    const bug = this.data.bugs.find(b => b.id === bugId);
    if (bug) {
      const idx = bug.votes.indexOf(username);
      if (idx !== -1) {
        bug.votes.splice(idx, 1);
        this.save();
        return true;
      }
    }
    return false;
  }

  getStats(): {
    total: number;
    byStatus: Record<BugStatus, number>;
    byPriority: Record<BugPriority, number>;
    byCategory: Record<BugCategory, number>;
    recentlyCreated: number;
    recentlyClosed: number;
  } {
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

    const stats = {
      total: this.data.bugs.length,
      byStatus: {} as Record<BugStatus, number>,
      byPriority: {} as Record<BugPriority, number>,
      byCategory: {} as Record<BugCategory, number>,
      recentlyCreated: 0,
      recentlyClosed: 0,
    };

    // Initialize counts
    STATUSES.forEach(s => stats.byStatus[s.value] = 0);
    PRIORITIES.forEach(p => stats.byPriority[p.value] = 0);
    CATEGORIES.forEach(c => stats.byCategory[c.value] = 0);

    for (const bug of this.data.bugs) {
      stats.byStatus[bug.status]++;
      stats.byPriority[bug.priority]++;
      stats.byCategory[bug.category]++;

      if (bug.createdAt >= weekAgo) {
        stats.recentlyCreated++;
      }
      if (bug.closedAt && bug.closedAt >= weekAgo) {
        stats.recentlyClosed++;
      }
    }

    return stats;
  }

  getWebhooks(): WebhookConfig[] {
    return this.data.webhooks;
  }

  addWebhook(webhook: WebhookConfig): void {
    this.data.webhooks.push(webhook);
    this.save();
  }

  removeWebhook(index: number): void {
    this.data.webhooks.splice(index, 1);
    this.save();
  }
}

// ============================================================================
// Webhook Notifications
// ============================================================================

export async function sendWebhook(storage: BugStorage, event: string, bug: BugReport): Promise<void> {
  const webhooks = storage.getWebhooks();

  for (const webhook of webhooks) {
    if (!webhook.enabled) continue;
    if (!webhook.events.includes(event as any)) continue;

    try {
      let payload: any;

      if (webhook.type === 'discord') {
        payload = {
          embeds: [{
            title: `[${event.toUpperCase()}] Bug #${bug.id}: ${bug.title}`,
            description: bug.description.substring(0, 200),
            color: bug.priority === 'critical' ? 0xFF0000 :
                   bug.priority === 'high' ? 0xFF8800 :
                   bug.priority === 'medium' ? 0xFFFF00 : 0x888888,
            fields: [
              { name: 'Status', value: bug.status, inline: true },
              { name: 'Priority', value: bug.priority, inline: true },
              { name: 'Category', value: bug.category, inline: true },
              { name: 'Reporter', value: bug.reporter, inline: true },
            ],
            timestamp: new Date().toISOString(),
          }],
        };
      } else if (webhook.type === 'slack') {
        payload = {
          text: `*[${event.toUpperCase()}]* Bug #${bug.id}: ${bug.title}`,
          attachments: [{
            color: bug.priority === 'critical' ? 'danger' :
                   bug.priority === 'high' ? 'warning' : 'good',
            fields: [
              { title: 'Status', value: bug.status, short: true },
              { title: 'Priority', value: bug.priority, short: true },
              { title: 'Reporter', value: bug.reporter, short: true },
            ],
          }],
        };
      } else {
        payload = { event, bug };
      }

      // Use dynamic import for fetch (Node 18+)
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        console.error(`[BugTracker] Webhook failed: ${response.status}`);
      }
    } catch (err) {
      console.error('[BugTracker] Webhook error:', err);
    }
  }
}

