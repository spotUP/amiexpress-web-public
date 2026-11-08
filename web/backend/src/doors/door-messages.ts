/**
 * Private and public messages a door sends through BBSApi.
 *
 * Moved out of BBSApi.ts (file size); BBSApi keeps a one-line method for each, so
 * the door-facing surface is unchanged.
 */
import { db } from '../database';
import { getSystemTime } from '../utils/date-time.util';
import type { BBSSession } from '../index';


/**
 * Send private message to another user
 * Equivalent to AEDoor JH_PM command
 */
export async function doorSendMessage(session: BBSSession, toUsername: string, subject: string, body: string): Promise<boolean> {
  try {
    const messageData = {
      subject,
      body,
      author: session.user?.username || 'Unknown',
      timestamp: getSystemTime(),
      conferenceId: (session.currentConf || 1),
      messageBaseId: 1, // Default to first message base
      isPrivate: true,
      toUser: toUsername,
      parentId: undefined,
      attachments: [],
      edited: false,
      editedBy: undefined,
      editedAt: undefined
    };

    await db.createMessage(messageData);
console.log(`[BBSApi] Sent private message to ${toUsername}: ${subject}`);
    return true;
  } catch (error) {
console.error('[BBSApi] Error sending message:', error);
    return false;
  }
}

/**
 * Post message to current conference
 * Equivalent to AEDoor JH_SM command
 */
/**
 * Post a message, optionally TO SOMEBODY.
 *
 * The recipient is the third argument and used to be missing entirely, so
 * the mail composer - the one door that sends mail - called this with
 * `(to, subject, body)` and had its arguments read as `(subject, body)`:
 * the recipient became the SUBJECT, the subject became the BODY, and what
 * the caller actually wrote was dropped on the floor. It arrived as a
 * public message to ALL with the recipient's name as its title (the sysop,
 * 2026-09-23, reading back a message he had sent to dino).
 *
 * A message addressed to a name is PRIVATE, which is express.e's own rule;
 * `ALL` is the public case and the default when no name is given.
 */
export async function doorPostMessage(session: BBSSession, subject: string, body: string, to?: string): Promise<boolean> {
  try {
    const recipient = (to ?? '').trim();
    const addressed = recipient.length > 0 && recipient.toUpperCase() !== 'ALL';
    const messageData = {
      subject,
      body,
      author: session.user?.username || 'Unknown',
      timestamp: getSystemTime(),
      conferenceId: (session.currentConf || 1),
      messageBaseId: 1, // Default to first message base
      isPrivate: addressed,
      toUser: addressed ? recipient : undefined,
      parentId: undefined,
      attachments: [],
      edited: false,
      editedBy: undefined,
      editedAt: undefined
    };

    await db.createMessage(messageData);
console.log(`[BBSApi] Posted message to conference ${(session.currentConf || 1)}: ${subject}${addressed ? ` (to ${recipient})` : ''}`);
    return true;
  } catch (error) {
console.error('[BBSApi] Error posting message:', error);
    return false;
  }
}
