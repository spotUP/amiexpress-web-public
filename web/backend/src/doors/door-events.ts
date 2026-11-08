/**
 * Custom door events, achievements and notifications a door raises through BBSApi.
 *
 * Moved out of BBSApi.ts (file size); BBSApi keeps a one-line method for each, so
 * the door-facing surface is unchanged.
 */
import type { Socket } from 'socket.io';

import type { BBSSession } from '../index';


/**
 * Emit a custom door event that will be broadcast to LiveChat and webhooks
 *
 * @param eventType - Type of event (e.g., 'project_created', 'task_completed', 'achievement_unlocked')
 * @param message - Human-readable message for display in LiveChat
 * @param data - Optional additional data to include with the event
 *
 * @example
 * ```typescript
 * ctx.bbs.emitCustomEvent('project_created', 'Created new demo project "Revision 2025"', {
 *   projectName: 'Revision 2025',
 *   projectType: 'demo'
 * });
 * ```
 */
export function doorEmitCustomEvent(session: BBSSession, eventType: string, message: string, data?: Record<string, any>): void {
  try {
    const { emitCustomDoorEvent } = require('../services/bbs-event-emitter');

    emitCustomDoorEvent({
      username: session.user?.username || 'Unknown',
      // Identity for the webhook PII policy. Without these two, every door
      // event was anonymised to the bare string "anon": applyPiiPolicy()
      // strips the username unless the user consented (or the board opts
      // in system-wide), and with no userId it cannot even fall back to
      // "User #12". Door score posts therefore never named the scorer.
      // Same shape the file/chat/message emitters already use.
      userId: (session.user as any)?.id,
      gdprConsented: !!(session.user as any)?.gdprConsentAt,
      nodeId: session.nodeId || 0,
      // The door's REGISTERED command. commandText is the raw input line -
      // it carries arguments ("GMASTER -X") and whatever alias or menu
      // command was used to launch, none of which a per-door webhook
      // filter can match. Falls back to the first word of the input.
      doorName: session.currentDoorName
        || session.commandText?.split(' ')[0]
        || 'Door',
      eventType,
      message,
      data,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('[BBSApi.emitCustomEvent] Failed to emit event:', error);
    // Don't throw - event emission failures should not crash the door
  }
}

/**
 * Achievements (SP2, S10): report one of THIS door's own achievement
 * events. The type must be `door.<command>.<slug>` for the running door -
 * a door cannot report into another door's namespace or into a BBS
 * family - and it goes through the same reporter and the same outbox as
 * every BBS event. There is no direct HTTP call from a door. Returns
 * true when a row was written; false (with one WARN) otherwise, and it
 * never throws.
 *
 * @example
 * ```typescript
 * bbs.achievement('door.gmaster.win', { key: 'fast' });
 * ```
 */
export function doorAchievement(session: BBSSession, type: string, opts: { value?: number; key?: string } = {}): boolean {
  try {
    const command = String(session.currentDoorName || session.commandText?.split(' ')[0] || '').toLowerCase();
    const ns = new RegExp(`^door\\.${command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.[a-z0-9_]+$`);
    if (!command || !ns.test(type)) {
      console.warn(`[WARN] achievements: door ${command || '?'} may not report ${type}; only door.${command || '<command>'}.<slug>`);
      return false;
    }
    const { report } = require('../achievements/reporter');
    return report(session, type, { value: opts.value, key: opts.key, door: command.toUpperCase() }) !== null;
  } catch (error) {
    console.warn(`[WARN] achievements: door report failed: ${(error as Error).message}`);
    return false;
  }
}

/**
 * Notifications (NOTIFY door): raise one of THIS door's own events for a
 * user. The type must be `door.<command>.<slug>` for the running door - the
 * same namespace rule as achievement() - and `toUser` is a user id or a
 * name. `objectId` is required (it dedupes repeats); a call without one is
 * refused. It only queues an outbox row: whether and where the user hears
 * about it is their own NOTIFY choice. Returns true when a row was queued;
 * false (one WARN when the namespace is refused) otherwise. Never throws.
 *
 * @example
 * ```typescript
 * bbs.notify('door.tetris.your-turn', 'dino', { title: 'Your turn', body: 'bob moved' });
 * ```
 */
export function doorNotify(session: BBSSession, type: string, toUser: string, item: { title: string; body: string; url?: string; objectId: string }): boolean {
  try {
    const command = String(session.currentDoorName || session.commandText?.split(' ')[0] || '').toLowerCase();
    const { notifyFromDoor } = require('../notify/sites');
    return notifyFromDoor(command, type, toUser, item) === true;
  } catch (error) {
    console.warn(`[WARN] notify: door notify failed: ${(error as Error).message}`);
    return false;
  }
}

/**
 * Notifications (NOTIFY door): the caller's own choices - catalogue, get/set,
 * follow, email verification, test. Acts on this session's user only. See
 * notify/door-api.ts.
 */
export function doorNotifications(socket: Socket, session: BBSSession): import('@amiexpress/bbs-door-sdk/formats/notify').DoorNotificationsApi {
  const { doorNotificationsApi } = require('../notify/door-api');
  return doorNotificationsApi(session, undefined, socket);
}

/**
 * Achievements (SP3): the server, through the board. The door gets the
 * answers; the board key stays here. See achievements/door-api.ts.
 */
export function doorAchievements(): import('../achievements/door-api').DoorAchievementsApi {
  const { doorAchievementsApi } = require('../achievements/door-api');
  return doorAchievementsApi();
}
