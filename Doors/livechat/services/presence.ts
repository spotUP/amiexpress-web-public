import type { UserPresence, PresenceStatus } from '../types';
import { events } from './events';

/** User presence service */
export class PresenceService {
  private presence = new Map<number, UserPresence>();

  /** Set user status */
  setStatus(userId: number, status: PresenceStatus, custom?: string): void {
    const existing = this.presence.get(userId) || {
      userId,
      status: 'offline',
      lastActive: new Date()
    };
    existing.status = status;
    existing.customStatus = custom;
    existing.lastActive = new Date();
    this.presence.set(userId, existing);
    events.emit('presence:update', existing);
  }

  /** Set user activity */
  setActivity(userId: number, activity: string): void {
    const existing = this.presence.get(userId);
    if (existing) {
      existing.activity = activity;
      existing.lastActive = new Date();
      events.emit('presence:activity', existing);
    }
  }

  /** Get user presence */
  get(userId: number): UserPresence | undefined {
    return this.presence.get(userId);
  }

  /** Get all online users */
  getOnline(): UserPresence[] {
    const online: UserPresence[] = [];
    const now = Date.now();
    for (const p of this.presence.values()) {
      if (p.status !== 'offline' && now - p.lastActive.getTime() < 300000) {
        online.push(p);
      }
    }
    return online;
  }

  /** Update last active timestamp */
  touch(userId: number): void {
    const p = this.presence.get(userId);
    if (p) p.lastActive = new Date();
  }

  /** Set user offline */
  setOffline(userId: number): void {
    this.setStatus(userId, 'offline');
  }

  /** Count by status */
  countByStatus(): Record<PresenceStatus, number> {
    const counts: Record<PresenceStatus, number> = {
      online: 0, away: 0, dnd: 0, invisible: 0, offline: 0
    };
    for (const p of this.presence.values()) {
      counts[p.status]++;
    }
    return counts;
  }
}
