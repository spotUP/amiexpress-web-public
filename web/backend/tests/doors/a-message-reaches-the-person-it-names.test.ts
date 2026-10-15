/**
 * A MESSAGE REACHES THE PERSON IT NAMES, AND CARRIES WHAT WAS WRITTEN.
 *
 * The sysop sent a PETSCII message to dino, read it back, and found a PUBLIC
 * message to ALL whose SUBJECT was "dino" and whose body was the subject line
 * he had typed. The drawing itself was nowhere: "i only see the dino message
 * with no petscii in it and all fields seem wrong, topic is dino not
 * recipiemt" (2026-09-23).
 *
 * One cause, and it had been there since the composer was written:
 * `BBSApi.postMessage` took `(subject, body)` - it had no way to name a
 * recipient at all - and the composer called it `(to, subject, body)`. So the
 * recipient became the subject, the subject became the body, the body was
 * dropped, and with no `toUser` the board filed it as public mail to ALL.
 *
 * The API names a recipient now, and a message addressed to somebody is
 * private, which is express.e's own rule. `ALL` stays public.
 */

jest.mock('../../src/services/bbs-event-emitter', () => ({
  emitCustomDoorEvent: jest.fn(),
  emitDoorEvent: jest.fn(),
}));

const created: any[] = [];
jest.mock('../../src/database', () => ({
  db: { createMessage: jest.fn(async (message: any) => { created.push(message); return 1; }) },
}));

import { createBBSApi } from '../../src/doors/BBSApi';

function api(): any {
  const socket: any = { id: 'sock-1', emit: () => {}, on: () => {} };
  return createBBSApi(socket, {
    user: { id: 7, username: 'sysop' },
    nodeId: 1,
    currentConference: 1,
  } as any);
}

/** A body with PETSCII in it: a glyph marker and a pen, as the editor writes them. */
const PETSCII_BODY = `${String.fromCodePoint(0xe200 + 2)}petscii ${String.fromCodePoint(0xe100 + 0x53)}`;

describe('a message a door sends', () => {
  beforeEach(() => { created.length = 0; });

  it('goes to the person it is addressed to', async () => {
    await api().postMessage('a subject', 'a body', 'dino');

    expect(created).toHaveLength(1);
    expect(created[0].toUser).toBe('dino');
  });

  it('keeps the subject as the subject and the body as the body', async () => {
    await api().postMessage('a subject', PETSCII_BODY, 'dino');

    expect(created[0].subject).toBe('a subject');
    expect(created[0].body).toBe(PETSCII_BODY);
  });

  it('carries the PETSCII the caller drew, marker for marker', async () => {
    await api().postMessage('art', PETSCII_BODY, 'dino');

    expect(created[0].body).toContain(String.fromCodePoint(0xe100 + 0x53));
    expect(created[0].body).toContain(String.fromCodePoint(0xe200 + 2));
  });

  it('is private when it names somebody', async () => {
    await api().postMessage('a subject', 'a body', 'dino');

    expect(created[0].isPrivate).toBe(true);
  });

  it('is public when it is to ALL, or to nobody in particular', async () => {
    await api().postMessage('a subject', 'a body', 'ALL');
    await api().postMessage('a subject', 'a body');

    expect(created[0].isPrivate).toBe(false);
    expect(created[0].toUser).toBeUndefined();
    expect(created[1].isPrivate).toBe(false);
  });

  it('is still the two-argument call every other door makes', async () => {
    await api().postMessage('just a subject', 'just a body');

    expect(created[0].subject).toBe('just a subject');
    expect(created[0].body).toBe('just a body');
  });
});
