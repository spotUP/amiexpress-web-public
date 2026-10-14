/**
 * The Email channel: what a notification email says, and the sender the
 * dispatcher calls for it.
 *
 * Sent only to the address the caller VERIFIED, and only while that is still
 * their account address (notify_settings.email_verified equals users.email,
 * case-insensitive, trimmed). Anything else is held, not dropped: the rows
 * stay in the outbox with a retryable "not verified" error and go out once
 * the caller verifies; the fourteen-day purge ends the wait. Dropping would
 * lose a notice the caller asked for because of a step they have not got to
 * yet, and a held row costs one backoff-spaced UPDATE.
 *
 * Content rules live HERE, where the text is built, not at the sites:
 *   mail.private   the item's title ONLY ("New private mail from X"). Its
 *                  body, url and any subject a site put there are never read
 *                  (sysop decision 4).
 *   everything     plain text; the footer carries the unsubscribe link and the
 *                  same link goes in the List-Unsubscribe headers (RFC 8058).
 *
 * Decision 6: an INSTANT item for a caller who is logged on is suppressed (they
 * see it at the prompt). A DIGEST is not: it summarises a period, and the
 * caller being on at the digest hour does not mean they saw its contents.
 */
import type Database from 'better-sqlite3';
import { findEvent } from '@amiexpress/bbs-door-sdk/formats/notify';
import type { NotifyItem } from '@amiexpress/bbs-door-sdk/formats/notify';
import { db } from '../database';
import { adminBaseUrl } from '../utils/admin-base-url.util';
import { getBbsName, sendMailTo } from '../services/mail-notification.service';
import type { SendMailResult } from '../services/mail-notification.service';
import type { ChannelSender, SendResult } from './dispatcher';
import { isLoggedOn } from './presence';
import { accountEmail, getSettings, sameAddress } from './repository';
import { ALL_EVENTS, mintUnsubscribeToken, unsubscribeUrl } from './unsubscribe';

export const PRIVATE_MAIL_EVENT = 'mail.private';
const LINE_MAX = 200;

export interface EmailDeps {
  rawDb: () => Database.Database | undefined;
  send: (to: string, subject: string, text: string, headers?: Record<string, string>) => Promise<SendMailResult>;
  isOnline: (userId: string) => boolean;
  baseUrl: () => string;
  bbsName: () => Promise<string>;
}

const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim().slice(0, LINE_MAX);

/** The event the unsubscribe link switches off: the items' common event, else everything. */
export function unsubscribeScope(items: readonly NotifyItem[]): string {
  const first = items[0]?.event;
  return first && items.every((i) => i.event === first) ? first : ALL_EVENTS;
}

export interface BuiltEmail { subject: string; text: string; scope: string }

export function buildEmail(items: readonly NotifyItem[], digest: boolean, bbsName: string, baseUrl: string, unsubUrl: string): BuiltEmail {
  const scope = unsubscribeScope(items);
  const lines: string[] = [];
  let subject: string;
  if (!digest && items.length === 1) {
    const it = items[0];
    subject = `${bbsName}: ${oneLine(it.title)}`;
    lines.push(oneLine(it.title));
    if (it.event !== PRIVATE_MAIL_EVENT) {
      if (it.body.trim()) lines.push('', it.body.trim());
      if (it.url) lines.push('', it.url);
    }
  } else {
    subject = `${bbsName}: ${items.length} notification${items.length === 1 ? '' : 's'}`;
    for (const it of items) {
      lines.push(`- ${oneLine(it.title)}`);
      if (it.event !== PRIVATE_MAIL_EVENT && it.body.trim()) lines.push(`    ${oneLine(it.body)}`);
    }
  }
  lines.push('', `Log on at ${baseUrl}`, '', '--',
    scope === ALL_EVENTS
      ? 'You get these emails because you turned notifications on. To pause them all:'
      : `You get these emails because you turned on email for "${findEvent(scope)?.label ?? scope}". To turn it off:`,
    unsubUrl, '');
  return { subject, text: lines.join('\n'), scope };
}

export function makeEmailSender(deps: EmailDeps): ChannelSender {
  return async (userId, items, digest): Promise<SendResult> => {
    const handle = deps.rawDb();
    if (!handle) return { ok: false, error: 'no database', retry: true };
    if (!digest && deps.isOnline(userId)) return { ok: true, suppressed: true };

    const address = accountEmail(handle, userId);
    const verified = getSettings(handle, userId).emailVerified;
    if (!address || !sameAddress(verified, address)) {
      return { ok: false, error: 'email address not verified', retry: true };
    }

    const scope = unsubscribeScope(items);
    const url = unsubscribeUrl(deps.baseUrl(), mintUnsubscribeToken(userId, scope));
    const mail = buildEmail(items, digest, await deps.bbsName(), deps.baseUrl(), url);
    const res = await deps.send(address, mail.subject, mail.text, {
      'List-Unsubscribe': `<${url}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
    return res.ok ? { ok: true } : { ok: false, error: res.error, retry: true };
  };
}

export function productionEmailSender(): ChannelSender {
  return makeEmailSender({
    rawDb: () => (db as any).db as Database.Database | undefined,
    send: sendMailTo,
    isOnline: isLoggedOn,
    baseUrl: adminBaseUrl,
    bbsName: getBbsName,
  });
}
