/**
 * A browser download of a file that lives outside the file areas.
 *
 * The browser fetches what `deliverFilesToCaller` hands it from a URL, and
 * `/api/download/:conf/:dir/:name` only looks inside a conference's file
 * directories - by design, since that route is unauthenticated and must not
 * serve arbitrary paths. express.e's downloadFile (14957) takes any path,
 * though: a message's attached files (checkAttachedFile, 9746) sit wherever
 * the writer named them, or in the message base's F<n> directory.
 *
 * So the board, which has already decided this caller may have this file,
 * issues a ticket for exactly that path: an unguessable token, good for one
 * fetch within a few minutes. The route redeems it and serves nothing else.
 */
import { randomBytes } from 'crypto';

/** How long a ticket waits for the browser to fetch it. */
const TICKET_LIFETIME_MS = 10 * 60 * 1000;

interface Ticket {
  path: string;
  expires: number;
}

const tickets = new Map<string, Ticket>();

function sweep(now: number): void {
  for (const [token, ticket] of tickets) {
    if (ticket.expires <= now) tickets.delete(token);
  }
}

/** The URL the browser fetches `hostPath` from - once. */
export function issueDownloadTicket(hostPath: string): string {
  const now = Date.now();
  sweep(now);
  const token = randomBytes(24).toString('hex');
  tickets.set(token, { path: hostPath, expires: now + TICKET_LIFETIME_MS });
  return `/api/download/ticket/${token}`;
}

/** The path a ticket was issued for, and the ticket is spent; null when there is none. */
export function redeemDownloadTicket(token: string): string | null {
  const now = Date.now();
  sweep(now);
  const ticket = tickets.get(token);
  if (!ticket) return null;
  tickets.delete(token);
  return ticket.path;
}
