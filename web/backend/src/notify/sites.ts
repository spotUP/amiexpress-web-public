/**
 * The notification sites: what each BBS action tells the outbox, in one place
 * each. The achievements pattern (achievements/sites.ts): a one-line call
 * beside the action, AFTER it committed, that never throws and does no I/O
 * except inserting outbox rows (synchronous). Who receives what is decided
 * HERE (poster excluded, follower without access excluded, ...); when and on
 * which channel is queueNotification's job (intake.ts) and nothing else.
 *
 * Every site takes `deps` so a test hands it a handle; the default reads the
 * Database singleton lazily (this file is imported from the data layer, and a
 * top-level import of '../database' would be a cycle).
 */
import type Database from 'better-sqlite3';
import { doorEventCommand, isDoorEventId, NOTIFY_CHANNELS } from '@amiexpress/bbs-door-sdk/formats/notify';
import type { NotifyItem } from '@amiexpress/bbs-door-sdk/formats/notify';
import { diskHasConfAccess, diskIsSysop } from './account';
import { queueNotification } from './intake';
import { followersOf, usersWanting } from './repository';

export interface SiteDeps {
  rawDb: () => Database.Database | undefined;
  /** Epoch milliseconds. */
  now: () => number;
  /** express.e checkConfAccess for this user, from the disk record (account.ts). */
  hasConfAccess: (db: Database.Database, userId: string, conferenceId: number) => boolean;
  /** The sysop test, from the disk record. */
  isSysop: (db: Database.Database, userId: string) => boolean;
}

export const defaultSiteDeps: SiteDeps = {
  rawDb: () => (require('../database').db as any).db as Database.Database | undefined,
  now: () => Date.now(),
  hasConfAccess: diskHasConfAccess,
  isSysop: diskIsSysop,
};

const seconds = (deps: SiteDeps): number => Math.floor(deps.now() / 1000);

function userByName(db: Database.Database, name: string): { id: string; username: string } | null {
  const row = db.prepare('SELECT id, username FROM users WHERE username = ? COLLATE NOCASE').get(name) as { id: string; username: string } | undefined;
  return row ?? null;
}

/** A user named by id or by name (a door says whichever it has). */
function userByIdOrName(db: Database.Database, who: string): { id: string; username: string } | null {
  const row = db.prepare('SELECT id, username FROM users WHERE id = ? OR username = ? COLLATE NOCASE ORDER BY (id = ?) DESC LIMIT 1').get(who, who, who) as { id: string; username: string } | undefined;
  return row ?? null;
}

/** Everyone who chose a delivering mode for `event` on any channel. */
function subscribersOf(db: Database.Database, event: string): string[] {
  const ids = new Set<string>();
  for (const channel of NOTIFY_CHANNELS) for (const u of usersWanting(db, event, channel)) ids.add(u.userId);
  return [...ids];
}

/** Run a site body: no handle means nothing to do, and nothing may throw out of it. */
function guarded(site: string, deps: SiteDeps, body: (db: Database.Database) => number): number {
  try {
    const db = deps.rawDb();
    return db ? body(db) : 0;
  } catch (err) {
    console.warn(`[WARN] notify: ${site} site failed: ${(err as Error).message}`);
    return 0;
  }
}

// ---------------------------------------------------------------- messages

export interface MessageFacts {
  author: string;
  subject: string;
  isPrivate?: boolean;
  toUser?: string | null;
  parentId?: number | null;
}

/**
 * After createMessage committed. A private message tells its addressee WHO
 * wrote (sysop decision 4: sender only, no subject, no body) and nothing
 * else - a private reply is mail, not a reply notice. A public reply tells
 * the parent's author, never the poster themself.
 */
export function notifyMessage(msg: MessageFacts, messageId: number, deps: SiteDeps = defaultSiteDeps): number {
  return guarded('message', deps, (db) => {
    const now = seconds(deps);
    if (msg.isPrivate) {
      if (!msg.toUser) return 0;
      const to = userByName(db, msg.toUser);
      if (!to || to.username.toLowerCase() === msg.author.toLowerCase()) return 0;
      return queueNotification(db, to.id, {
        event: 'mail.private', title: `New private mail from ${msg.author}`, body: '', at: now, objectId: String(messageId),
      }, now, undefined, deps.isSysop);
    }
    if (!msg.parentId) return 0;
    const parent = db.prepare('SELECT author FROM messages WHERE id = ?').get(msg.parentId) as { author: string } | undefined;
    if (!parent || parent.author.toLowerCase() === msg.author.toLowerCase()) return 0;
    const to = userByName(db, parent.author);
    if (!to) return 0;
    return queueNotification(db, to.id, {
      event: 'msg.reply', title: `Reply from ${msg.author}`, body: `Re: ${msg.subject}`, at: now, objectId: String(messageId),
    }, now, undefined, deps.isSysop);
  });
}

// ---------------------------------------------------------------- files

export interface FiledFileFacts {
  filename: string;
  description: string;
  conferenceId: number;
  uploader: string;
}

/**
 * A file went live in a conference: its followers, minus the uploader, who
 * can still enter that conference now (access is checked at queue time; the
 * follow was set when they may have had access).
 */
export function notifyFileFiled(file: FiledFileFacts, deps: SiteDeps = defaultSiteDeps): number {
  return guarded('file', deps, (db) => {
    const now = seconds(deps);
    const uploader = userByName(db, file.uploader);
    let added = 0;
    for (const userId of followersOf(db, file.conferenceId)) {
      if (uploader && userId === uploader.id) continue;
      if (!deps.hasConfAccess(db, userId, file.conferenceId)) continue;
      added += queueNotification(db, userId, {
        event: 'file.new', title: `New file in conference ${file.conferenceId}`, body: `${file.filename} - ${file.description}`.slice(0, 200),
        at: now, objectId: `${file.conferenceId}:${file.filename.toLowerCase()}`,
      }, now, undefined, deps.isSysop);
    }
    return added;
  });
}

// ---------------------------------------------------------------- sysop page

export interface PageFacts {
  id: string;
  userHandle: string;
  nodeId: number;
  conferenceName: string;
}

/** A caller paged the sysop: every user with a page.sysop cell; queueNotification refuses the non-sysops. */
export function notifySysopPage(page: PageFacts, deps: SiteDeps = defaultSiteDeps): number {
  return guarded('page', deps, (db) => {
    const now = seconds(deps);
    let added = 0;
    for (const userId of subscribersOf(db, 'page.sysop')) {
      added += queueNotification(db, userId, {
        event: 'page.sysop', title: `Operator page from ${page.userHandle}`, body: `Node ${page.nodeId}, ${page.conferenceName}`,
        at: now, objectId: page.id,
      }, now, undefined, deps.isSysop);
    }
    return added;
  });
}

// ---------------------------------------------------------------- unlock

export interface UnlockFacts { id: string; name: string; tier: string; points: number }

/**
 * An achievement unlocked for `userId`. The catalogue offers ach.unlock on
 * Email and Push only: the flusher draws its own toast on the board, so a
 * Board cell would show the caller the same unlock twice.
 */
export function notifyUnlock(userId: string, unlock: UnlockFacts, deps: SiteDeps = defaultSiteDeps): number {
  return guarded('unlock', deps, (db) => {
    const now = seconds(deps);
    return queueNotification(db, userId, {
      event: 'ach.unlock', title: `Achievement unlocked: ${unlock.name}`, body: `${unlock.tier} tier, ${unlock.points} points`,
      at: now, objectId: unlock.id,
    }, now, undefined, deps.isSysop);
  });
}

// ---------------------------------------------------------------- magazine

/** The news tick added stories: ONE summary item per tick to each mag.story subscriber. */
export function notifyMagazine(added: number, deps: SiteDeps = defaultSiteDeps): number {
  if (added <= 0) return 0;
  return guarded('magazine', deps, (db) => {
    const now = seconds(deps);
    let n = 0;
    for (const userId of subscribersOf(db, 'mag.story')) {
      n += queueNotification(db, userId, {
        event: 'mag.story', title: `${added} new magazine ${added === 1 ? 'story' : 'stories'}`, body: 'Read them in the board magazine.',
        at: now, objectId: `tick-${now}`,
      }, now, undefined, deps.isSysop);
    }
    return n;
  });
}

// ---------------------------------------------------------------- doors

/** `objectId` is REQUIRED: it is the outbox idempotency key, so a looping door cannot flood a user. */
export interface DoorNotifyItem { title: string; body: string; url?: string; objectId: string }

/**
 * bbs.notify: a door raises one of ITS OWN events (`door.<command>.<slug>`,
 * the running door's command - never another door's, never a board event) for
 * a named user (id or name). Returns true when a row was queued. A call with
 * no `objectId` is refused (one WARN): without the key the outbox cannot tell
 * a repeat from a new event.
 */
export function notifyFromDoor(command: string, type: string, toUser: string, item: DoorNotifyItem, deps: SiteDeps = defaultSiteDeps): boolean {
  const owner = doorEventCommand(type);
  if (!command || !isDoorEventId(type) || owner !== command.toUpperCase()) {
    console.warn(`[WARN] notify: door ${command || '?'} may not raise ${type}; only door.${command || '<command>'}.<slug>`);
    return false;
  }
  const objectId = typeof item?.objectId === 'string' ? item.objectId.trim() : '';
  if (!objectId) {
    console.warn(`[WARN] notify: door ${command} raised ${type} without an objectId; refused`);
    return false;
  }
  return guarded('door', deps, (db) => {
    const to = userByIdOrName(db, String(toUser ?? '').trim());
    if (!to) return 0;
    const now = seconds(deps);
    const nid: NotifyItem = {
      event: type, title: String(item.title ?? '').slice(0, 120), body: String(item.body ?? '').slice(0, 500),
      ...(item.url ? { url: String(item.url).slice(0, 300) } : {}),
      at: now, objectId: objectId.slice(0, 80),
    };
    return queueNotification(db, to.id, nid, now, undefined, deps.isSysop);
  }) > 0;
}
