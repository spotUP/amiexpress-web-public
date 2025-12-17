/**
 * Operator Chat Repository
 *
 * Database operations for operator pages and chat sessions.
 * Stores page requests, chat messages, and sysop status.
 */

import type Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import {
  PageRequest,
  PageStatus,
  ChatMessage,
  CreatePageRequest,
  SysopAvailability,
  OperatorChatConfig
} from '../types/operator-chat.types';

export class OperatorChatRepository {
  constructor(private db: any) {
    this.initTables();
  }

  /**
   * Initialize database tables
   */
  private initTables(): void {
    // Page requests table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS operator_pages (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        user_handle TEXT NOT NULL,
        node_id INTEGER NOT NULL,
        conference_id INTEGER NOT NULL,
        conference_name TEXT NOT NULL,
        time_online INTEGER NOT NULL,
        last_command TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at INTEGER NOT NULL,
        accepted_at INTEGER,
        ended_at INTEGER,
        sysop_id TEXT,
        sysop_handle TEXT,
        cooldown_until INTEGER,
        socketio_sent INTEGER DEFAULT 0,
        discord_sent INTEGER DEFAULT 0,
        discord_message_id TEXT,
        push_sent INTEGER DEFAULT 0,
        push_results TEXT,
        token TEXT,
        token_expires_at INTEGER
      )
    `);

    // Chat messages table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS operator_chat_messages (
        id TEXT PRIMARY KEY,
        page_id TEXT NOT NULL,
        sender_id TEXT NOT NULL,
        sender_handle TEXT NOT NULL,
        sender_type TEXT NOT NULL,
        message TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        node_id INTEGER NOT NULL,
        FOREIGN KEY (page_id) REFERENCES operator_pages(id) ON DELETE CASCADE
      )
    `);

    // Sysop status table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS operator_sysop_status (
        sysop_id TEXT PRIMARY KEY,
        availability TEXT NOT NULL DEFAULT 'offline',
        status_message TEXT,
        last_seen INTEGER,
        updated_at INTEGER NOT NULL
      )
    `);

    // Operator chat config table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS operator_chat_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        enabled INTEGER DEFAULT 1,
        require_carrier INTEGER DEFAULT 0,
        quiet_hours_enabled INTEGER DEFAULT 0,
        quiet_hours_start_hour INTEGER DEFAULT 22,
        quiet_hours_start_minute INTEGER DEFAULT 0,
        quiet_hours_end_hour INTEGER DEFAULT 8,
        quiet_hours_end_minute INTEGER DEFAULT 0,
        quiet_hours_timezone TEXT DEFAULT 'America/New_York',
        page_cooldown INTEGER DEFAULT 300,
        page_timeout INTEGER DEFAULT 120,
        max_active_pages INTEGER DEFAULT 1,
        sound_enabled INTEGER DEFAULT 1,
        vibrate_enabled INTEGER DEFAULT 1,
        discord_webhook TEXT,
        allowed_sec_levels TEXT DEFAULT '[]',
        notify_on_page INTEGER DEFAULT 1,
        notify_discord INTEGER DEFAULT 1,
        discord_user_id TEXT
      )
    `);

    // Add new columns to existing tables (migrations for existing DBs)
    try {
      this.db.exec(`ALTER TABLE operator_chat_config ADD COLUMN notify_on_page INTEGER DEFAULT 1`);
    } catch (e) { /* Column already exists */ }
    try {
      this.db.exec(`ALTER TABLE operator_chat_config ADD COLUMN notify_discord INTEGER DEFAULT 1`);
    } catch (e) { /* Column already exists */ }
    try {
      this.db.exec(`ALTER TABLE operator_chat_config ADD COLUMN discord_user_id TEXT`);
    } catch (e) { /* Column already exists */ }

    // Push notification subscriptions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS operator_push_subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sysop_id TEXT NOT NULL,
        endpoint TEXT NOT NULL UNIQUE,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        user_agent TEXT,
        created_at INTEGER NOT NULL,
        last_used INTEGER
      )
    `);

    // Create indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_operator_pages_user_id ON operator_pages(user_id);
      CREATE INDEX IF NOT EXISTS idx_operator_pages_status ON operator_pages(status);
      CREATE INDEX IF NOT EXISTS idx_operator_pages_created_at ON operator_pages(created_at);
      CREATE INDEX IF NOT EXISTS idx_operator_chat_messages_page_id ON operator_chat_messages(page_id);
      CREATE INDEX IF NOT EXISTS idx_operator_chat_messages_timestamp ON operator_chat_messages(timestamp);
      CREATE INDEX IF NOT EXISTS idx_operator_push_subscriptions_sysop_id ON operator_push_subscriptions(sysop_id);
    `);

    // Insert default config if not exists
    const configExists = this.db.prepare('SELECT id FROM operator_chat_config WHERE id = 1').get();
    if (!configExists) {
      this.db.prepare(`
        INSERT INTO operator_chat_config (id) VALUES (1)
      `).run();
    }

    // Ensure at least one sysop status exists (default "sysop") so availability checks pass
    const defaultSysop = this.db.prepare('SELECT sysop_id FROM operator_sysop_status WHERE sysop_id = ?').get('sysop');
    if (!defaultSysop) {
      this.db.prepare(`
        INSERT INTO operator_sysop_status (sysop_id, availability, status_message, last_seen, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run('sysop', SysopAvailability.AVAILABLE, 'Online', Date.now(), Date.now());
    }
  }

  /**
   * Create a new page request
   */
  createPageRequest(data: CreatePageRequest): PageRequest {
    const pageId = randomUUID();
    const now = Date.now();
    const token = randomUUID(); // One-time token for Discord link
    const tokenExpiresAt = now + (15 * 60 * 1000); // 15 minutes

    this.db.prepare(`
      INSERT INTO operator_pages (
        id, user_id, user_handle, node_id, conference_id, conference_name,
        time_online, last_command, status, created_at, token, token_expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      pageId,
      data.userId,
      data.userHandle,
      data.nodeId,
      data.conferenceId,
      data.conferenceName,
      data.timeOnline,
      data.lastCommand,
      PageStatus.PENDING,
      now,
      token,
      tokenExpiresAt
    );

    return this.getPageRequest(pageId)!;
  }

  /**
   * Get page request by ID
   */
  getPageRequest(pageId: string): PageRequest | null {
    const row = this.db.prepare(`
      SELECT * FROM operator_pages WHERE id = ?
    `).get(pageId) as any;

    if (!row) return null;

    return this.mapPageRow(row);
  }

  /**
   * Get page request by token
   */
  getPageRequestByToken(token: string): PageRequest | null {
    const now = Date.now();
    const row = this.db.prepare(`
      SELECT * FROM operator_pages
      WHERE token = ? AND token_expires_at > ?
    `).get(token, now) as any;

    if (!row) return null;

    return this.mapPageRow(row);
  }

  /**
   * Get pending pages
   */
  getPendingPages(): PageRequest[] {
    const rows = this.db.prepare(`
      SELECT * FROM operator_pages
      WHERE status = ?
      ORDER BY created_at DESC
    `).all(PageStatus.PENDING) as any[];

    return rows.map(row => this.mapPageRow(row));
  }

  /**
   * Get user's recent pages (for cooldown check)
   */
  getUserRecentPages(userId: string, sinceTimestamp: number): PageRequest[] {
    const rows = this.db.prepare(`
      SELECT * FROM operator_pages
      WHERE user_id = ? AND created_at > ?
      ORDER BY created_at DESC
    `).all(userId, sinceTimestamp) as any[];

    return rows.map(row => this.mapPageRow(row));
  }

  /**
   * Update page status
   */
  updatePageStatus(pageId: string, status: PageStatus, sysopId?: string, sysopHandle?: string): void {
    const now = Date.now();

    if (status === PageStatus.ACCEPTED && sysopId) {
      this.db.prepare(`
        UPDATE operator_pages
        SET status = ?, accepted_at = ?, sysop_id = ?, sysop_handle = ?
        WHERE id = ?
      `).run(status, now, sysopId, sysopHandle, pageId);
    } else if (status === PageStatus.ENDED || status === PageStatus.TIMEOUT) {
      this.db.prepare(`
        UPDATE operator_pages
        SET status = ?, ended_at = ?
        WHERE id = ?
      `).run(status, now, pageId);
    } else {
      this.db.prepare(`
        UPDATE operator_pages
        SET status = ?
        WHERE id = ?
      `).run(status, pageId);
    }
  }

  /**
   * Update page notification status
   */
  updateNotificationStatus(pageId: string, updates: {
    socketIO?: boolean;
    discord?: boolean;
    discordMessageId?: string;
    browserPush?: boolean;
    pushResults?: string[];
  }): void {
    const page = this.getPageRequest(pageId);
    if (!page) return;

    const stmt = this.db.prepare(`
      UPDATE operator_pages
      SET socketio_sent = ?, discord_sent = ?, discord_message_id = ?,
          push_sent = ?, push_results = ?
      WHERE id = ?
    `);

    stmt.run(
      updates.socketIO ?? page.notificationsSent.socketIO ? 1 : 0,
      updates.discord ?? page.notificationsSent.discord ? 1 : 0,
      updates.discordMessageId ?? page.notificationsSent.discordMessageId ?? null,
      updates.browserPush ?? page.notificationsSent.browserPush ? 1 : 0,
      updates.pushResults ? JSON.stringify(updates.pushResults) : page.notificationsSent.pushResults ? JSON.stringify(page.notificationsSent.pushResults) : null,
      pageId
    );
  }

  /**
   * Set cooldown for user
   */
  setUserCooldown(userId: string, cooldownSeconds: number): void {
    const cooldownUntil = Date.now() + (cooldownSeconds * 1000);

    // Update most recent page for this user
    this.db.prepare(`
      UPDATE operator_pages
      SET cooldown_until = ?
      WHERE user_id = ? AND id = (
        SELECT id FROM operator_pages WHERE user_id = ? ORDER BY created_at DESC LIMIT 1
      )
    `).run(cooldownUntil, userId, userId);
  }

  /**
   * Add chat message
   */
  addChatMessage(message: Omit<ChatMessage, 'id'>): ChatMessage {
    const messageId = randomUUID();

    this.db.prepare(`
      INSERT INTO operator_chat_messages (
        id, page_id, sender_id, sender_handle, sender_type, message, timestamp, node_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      messageId,
      message.pageId,
      message.senderId,
      message.senderHandle,
      message.senderType,
      message.message,
      message.timestamp.getTime(),
      message.nodeId
    );

    return {
      id: messageId,
      ...message
    };
  }

  /**
   * Get chat messages for a page
   */
  getChatMessages(pageId: string): ChatMessage[] {
    const rows = this.db.prepare(`
      SELECT * FROM operator_chat_messages
      WHERE page_id = ?
      ORDER BY timestamp ASC
    `).all(pageId) as any[];

    return rows.map(row => ({
      id: row.id,
      pageId: row.page_id,
      senderId: row.sender_id,
      senderHandle: row.sender_handle,
      senderType: row.sender_type as 'user' | 'sysop',
      message: row.message,
      timestamp: new Date(row.timestamp),
      nodeId: row.node_id
    }));
  }

  /**
   * Get or create sysop status
   */
  getSysopStatus(sysopId: string): { availability: SysopAvailability; statusMessage?: string; lastSeen?: Date } {
    const row = this.db.prepare(`
      SELECT * FROM operator_sysop_status WHERE sysop_id = ?
    `).get(sysopId) as any;

    if (!row) {
      // Create default status (AVAILABLE so paging works by default)
      this.db.prepare(`
        INSERT INTO operator_sysop_status (sysop_id, availability, updated_at)
        VALUES (?, ?, ?)
      `).run(sysopId, SysopAvailability.AVAILABLE, Date.now());

      return { availability: SysopAvailability.AVAILABLE };
    }

    return {
      availability: row.availability as SysopAvailability,
      statusMessage: row.status_message,
      lastSeen: row.last_seen ? new Date(row.last_seen) : undefined
    };
  }

  /**
   * Update sysop status
   */
  updateSysopStatus(sysopId: string, availability: SysopAvailability, statusMessage?: string): void {
    const now = Date.now();

    this.db.prepare(`
      INSERT INTO operator_sysop_status (sysop_id, availability, status_message, last_seen, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(sysop_id) DO UPDATE SET
        availability = excluded.availability,
        status_message = excluded.status_message,
        last_seen = excluded.last_seen,
        updated_at = excluded.updated_at
    `).run(sysopId, availability, statusMessage ?? null, now, now);
  }

  /**
   * Get operator chat config
   */
  getConfig(): OperatorChatConfig {
    const row = this.db.prepare(`
      SELECT * FROM operator_chat_config WHERE id = 1
    `).get() as any;

    return {
      enabled: row.enabled === 1,
      requireCarrier: row.require_carrier === 1,
      quietHours: {
        enabled: row.quiet_hours_enabled === 1,
        startHour: row.quiet_hours_start_hour,
        startMinute: row.quiet_hours_start_minute,
        endHour: row.quiet_hours_end_hour,
        endMinute: row.quiet_hours_end_minute,
        timezone: row.quiet_hours_timezone
      },
      pageCooldown: row.page_cooldown,
      pageTimeout: row.page_timeout,
      maxActivePages: row.max_active_pages,
      soundEnabled: row.sound_enabled === 1,
      vibrateEnabled: row.vibrate_enabled === 1,
      discordWebhook: row.discord_webhook,
      discordUserId: row.discord_user_id,
      allowedSecLevels: JSON.parse(row.allowed_sec_levels || '[]'),
      notifyOnPage: row.notify_on_page !== 0, // Default true if null
      notifyDiscord: row.notify_discord !== 0  // Default true if null
    };
  }

  /**
   * Update operator chat config
   */
  updateConfig(config: Partial<OperatorChatConfig>): void {
    const current = this.getConfig();
    const merged = { ...current, ...config };

    this.db.prepare(`
      UPDATE operator_chat_config SET
        enabled = ?,
        require_carrier = ?,
        quiet_hours_enabled = ?,
        quiet_hours_start_hour = ?,
        quiet_hours_start_minute = ?,
        quiet_hours_end_hour = ?,
        quiet_hours_end_minute = ?,
        quiet_hours_timezone = ?,
        page_cooldown = ?,
        page_timeout = ?,
        max_active_pages = ?,
        sound_enabled = ?,
        vibrate_enabled = ?,
        discord_webhook = ?,
        discord_user_id = ?,
        allowed_sec_levels = ?,
        notify_on_page = ?,
        notify_discord = ?
      WHERE id = 1
    `).run(
      merged.enabled ? 1 : 0,
      merged.requireCarrier ? 1 : 0,
      merged.quietHours.enabled ? 1 : 0,
      merged.quietHours.startHour,
      merged.quietHours.startMinute,
      merged.quietHours.endHour,
      merged.quietHours.endMinute,
      merged.quietHours.timezone,
      merged.pageCooldown,
      merged.pageTimeout,
      merged.maxActivePages,
      merged.soundEnabled ? 1 : 0,
      merged.vibrateEnabled ? 1 : 0,
      merged.discordWebhook ?? null,
      merged.discordUserId ?? null,
      JSON.stringify(merged.allowedSecLevels),
      merged.notifyOnPage ? 1 : 0,
      merged.notifyDiscord ? 1 : 0
    );
  }

  /**
   * Map database row to PageRequest
   */
  private mapPageRow(row: any): PageRequest {
    return {
      id: row.id,
      userId: row.user_id,
      userHandle: row.user_handle,
      nodeId: row.node_id,
      conferenceId: row.conference_id,
      conferenceName: row.conference_name,
      timeOnline: row.time_online,
      lastCommand: row.last_command,
      status: row.status as PageStatus,
      createdAt: new Date(row.created_at),
      acceptedAt: row.accepted_at ? new Date(row.accepted_at) : undefined,
      endedAt: row.ended_at ? new Date(row.ended_at) : undefined,
      sysopId: row.sysop_id,
      sysopHandle: row.sysop_handle,
      cooldownUntil: row.cooldown_until ? new Date(row.cooldown_until) : undefined,
      notificationsSent: {
        socketIO: row.socketio_sent === 1,
        discord: row.discord_sent === 1,
        discordMessageId: row.discord_message_id,
        browserPush: row.push_sent === 1,
        pushResults: row.push_results ? JSON.parse(row.push_results) : undefined
      },
      token: row.token,
      tokenExpiresAt: row.token_expires_at ? new Date(row.token_expires_at) : undefined
    };
  }

  // ============================================
  // Push Subscription Management
  // ============================================

  /**
   * Save or update a push subscription for a sysop
   */
  savePushSubscription(
    sysopId: string,
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    userAgent?: string
  ): void {
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO operator_push_subscriptions (sysop_id, endpoint, p256dh, auth, user_agent, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET
        sysop_id = excluded.sysop_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_agent = excluded.user_agent
    `).run(sysopId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth, userAgent ?? null, now);
  }

  /**
   * Remove a push subscription by endpoint
   */
  removePushSubscription(endpoint: string): void {
    this.db.prepare('DELETE FROM operator_push_subscriptions WHERE endpoint = ?').run(endpoint);
  }

  /**
   * Remove all push subscriptions for a sysop
   */
  removePushSubscriptionsForSysop(sysopId: string): void {
    this.db.prepare('DELETE FROM operator_push_subscriptions WHERE sysop_id = ?').run(sysopId);
  }

  /**
   * Get all push subscriptions (for sending notifications to all sysops)
   */
  getAllPushSubscriptions(): Array<{
    sysopId: string;
    endpoint: string;
    keys: { p256dh: string; auth: string };
  }> {
    const rows = this.db.prepare('SELECT * FROM operator_push_subscriptions').all() as any[];
    return rows.map(row => ({
      sysopId: row.sysop_id,
      endpoint: row.endpoint,
      keys: {
        p256dh: row.p256dh,
        auth: row.auth
      }
    }));
  }

  /**
   * Get push subscriptions for a specific sysop
   */
  getPushSubscriptionsForSysop(sysopId: string): Array<{
    endpoint: string;
    keys: { p256dh: string; auth: string };
  }> {
    const rows = this.db.prepare(
      'SELECT * FROM operator_push_subscriptions WHERE sysop_id = ?'
    ).all(sysopId) as any[];
    return rows.map(row => ({
      endpoint: row.endpoint,
      keys: {
        p256dh: row.p256dh,
        auth: row.auth
      }
    }));
  }

  /**
   * Update last_used timestamp for a subscription
   */
  updatePushSubscriptionLastUsed(endpoint: string): void {
    this.db.prepare(
      'UPDATE operator_push_subscriptions SET last_used = ? WHERE endpoint = ?'
    ).run(Date.now(), endpoint);
  }

  /**
   * Check if a sysop has any push subscriptions
   */
  hasPushSubscriptions(sysopId: string): boolean {
    const row = this.db.prepare(
      'SELECT COUNT(*) as count FROM operator_push_subscriptions WHERE sysop_id = ?'
    ).get(sysopId) as any;
    return row.count > 0;
  }
}
