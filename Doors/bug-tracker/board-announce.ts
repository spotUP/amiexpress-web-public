/**
 * Board announcements for BUGS: LiveChat + webhooks through the same bridge
 * grandmaster's score broadcast uses
 * (`session.bbs.emitCustomEvent`, routed by
 * web/backend/src/services/bbs-event-emitter.ts to the sysop's
 * door_announcement subscriptions).
 *
 * Lives apart from app.ts for one reason: app.ts has a 2000-line ceiling
 * and the announce calls plus their message wording do not need the screen.
 * Everything here is best-effort - a bug report is never worth a crash -
 * and the door's own per-door sendWebhook() calls stay untouched.
 */
import type { BugReport } from './storage';

function emit(bbs: any, eventType: string, message: string, data?: Record<string, unknown>): void {
  try {
    bbs?.emitCustomEvent?.(eventType, message, data);
  } catch (err) {
    console.error('[BugTracker] Failed to announce board event:', err);
  }
}

function facts(bug: BugReport): Record<string, unknown> {
  return {
    bugId: bug.id,
    title: bug.title,
    priority: bug.priority,
    status: bug.status,
    category: bug.category,
  };
}

export function announceBugCreated(bbs: any, bug: BugReport): void {
  emit(bbs, 'bug_created', `Reported bug #${bug.id} "${bug.title}" [${bug.priority}]`, facts(bug));
}

export function announceBugCommented(bbs: any, bug: BugReport, isInternal: boolean): void {
  // Internal sysop notes stay inside the door.
  if (isInternal) return;
  emit(bbs, 'bug_commented', `Commented on bug #${bug.id} "${bug.title}"`, facts(bug));
}

export function announceBugEdited(bbs: any, bug: BugReport): void {
  emit(bbs, 'bug_updated', `Updated bug #${bug.id} "${bug.title}"`, facts(bug));
}

export function announceStatusChanged(bbs: any, bug: BugReport, label: string): void {
  const boardEvent = bug.status === 'closed' || bug.status === 'fixed' ? 'bug_closed' : 'bug_updated';
  emit(bbs, boardEvent, `${label} bug #${bug.id} "${bug.title}"`, facts(bug));
}

export function announceAssigned(bbs: any, bug: BugReport, assignee: string | null): void {
  const message = assignee
    ? `Assigned bug #${bug.id} "${bug.title}" to ${assignee}`
    : `Unassigned bug #${bug.id} "${bug.title}"`;
  const data = assignee ? { ...facts(bug), assignee } : facts(bug);
  emit(bbs, 'bug_updated', message, data);
}

export function announceDeleted(bbs: any, bugId: number, title: string): void {
  emit(bbs, 'bug_updated', `Deleted bug #${bugId} "${title}"`, { bugId, title });
}
