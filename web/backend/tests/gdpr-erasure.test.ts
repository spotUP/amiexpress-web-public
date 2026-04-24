/**
 * Regression tests for the GDPR erasure service and the W-option flow
 * (Phase 3 of thoughts/shared/plans/2026-04-24-gdpr-hobby-baseline.md).
 */

import { eraseUserData } from '../src/services/gdpr-erasure.service';
import {
  handleForgetMeConfirmInput,
  handleForgetMePasswordInput,
  handleForgetMeUsernameInput,
} from '../src/handlers/user/gdpr.handler';
import { LoggedOnSubState } from '../src/constants/bbs-states';

let socketCounter = 0;
function makeSocket() {
  const emits: any[] = [];
  let disconnected = false;
  let passwordMode: boolean | undefined;
  socketCounter++;
  const socket: any = {
    // Unique id per socket so the module-level ANSI buffer map (keyed by
    // socket.id) doesn't reuse state across tests.
    id: `test-socket-${socketCounter}-${Date.now()}`,
    emit(event: string, payload: any) {
      if (event === 'password-mode') passwordMode = payload;
      emits.push({ event, payload });
    },
    on(_event: string, _handler: (...args: any[]) => void) { /* no-op */ },
    disconnect() { disconnected = true; },
  };
  return {
    socket,
    emits,
    isDisconnected: () => disconnected,
    getPasswordMode: () => passwordMode,
  };
}

async function waitForTestDb(): Promise<any> {
  let attempts = 0;
  while (!(global as any).testDb && attempts < 30) {
    await new Promise(r => setTimeout(r, 500));
    attempts++;
  }
  const db = (global as any).testDb;
  if (!db) throw new Error('Test database not initialized');
  return db;
}

async function createTestUser(db: any, username: string, passwordHash: string) {
  return db.createUser({
    username,
    passwordHash,
    realname: 'Test Real',
    location: 'Testville',
    phone: '555-0100',
    email: `${username}@test.local`,
    secLevel: 10,
    uploads: 0, downloads: 0, bytesUpload: 0, bytesDownload: 0,
    ratio: 0, ratioType: 0, timeTotal: 0, timeLimit: 60, timeUsed: 0,
    chatLimit: 30, chatUsed: 0,
    firstLogin: new Date(), lastLogin: new Date(),
    calls: 1, callsToday: 1, newUser: false, expert: 'N', ansi: true,
    linesPerScreen: 23, computer: 'AMiGA 500', screenType: 'ANSI',
    protocol: 'ZMODEM', editor: 'FULL', zoomType: 'NONE',
    availableForChat: true, quietNode: false, autoRejoin: 1,
    confAccess: 'XXX', areaName: '', uuCP: false,
    topUploadCPS: 0, topDownloadCPS: 0, byteLimit: 0, userFlags: 0,
  } as any);
}

describe('GDPR erasure service + W-flow handlers (Phase 3)', () => {
  describe('eraseUserData', () => {
    test('scrubs user row PII and stamps deleted_at/erased_at', async () => {
      const db = await waitForTestDb();
      const id = await createTestUser(db, `erase_victim_${Date.now()}`, 'hash');
      expect(typeof id).toBe('string');

      const before = await db.getUserById(id);
      const originalUsername = before.username;

      const result = await eraseUserData(db, id);
      expect(result.erasedHandle).toMatch(/^erased_/);
      expect(result.originalUsername).toBe(originalUsername);

      const after = await db.getUserById(id);
      expect(after.username).toMatch(/^erased_/);
      expect(after.realname).toMatch(/^erased_/);
      expect(after.location).toBe('');
      expect(after.phone).toBe('');
      expect(after.email).toBe('');
      expect(after.secLevel).toBe(0);
      expect(after.deletedAt).toBeDefined();
      expect(after.erasedAt).toBeDefined();
    });

    test('replaces authored message bodies with *** erased ***', async () => {
      const db = await waitForTestDb();
      const id = await createTestUser(db, `author_${Date.now()}`, 'hash');
      const user = await db.getUserById(id);

      // Post two messages authored by this user.
      const m1 = await db.createMessage({
        subject: 'hello',
        body: 'this is private',
        author: user.username,
        timestamp: new Date(),
        conferenceId: 1,
        messageBaseId: 1,
        isPrivate: false,
        toUser: undefined,
        parentId: undefined,
        attachments: [],
        edited: false,
        editedBy: undefined,
      } as any);
      const m2 = await db.createMessage({
        subject: 'secret',
        body: 'do not share',
        author: user.username,
        timestamp: new Date(),
        conferenceId: 1,
        messageBaseId: 1,
        isPrivate: true,
        toUser: 'sysop',
        parentId: undefined,
        attachments: [],
        edited: false,
        editedBy: undefined,
      } as any);

      await eraseUserData(db, id);

      const after1 = await db.getMessageById?.(m1) ?? await (db as any).db?.prepare?.('SELECT * FROM messages WHERE id=?').get?.(m1);
      const after2 = await db.getMessageById?.(m2) ?? await (db as any).db?.prepare?.('SELECT * FROM messages WHERE id=?').get?.(m2);

      expect(after1?.body).toBe('*** erased ***');
      expect(after2?.body).toBe('*** erased ***');
      expect(after1?.author).toMatch(/^erased_/);
      expect(after2?.author).toMatch(/^erased_/);
    });
  });

  describe('W option 20 — 3-step confirm', () => {
    test('mistyped "YES ERASE" cancels cleanly (no erasure, returns to W)', async () => {
      const db = await waitForTestDb();
      const id = await createTestUser(db, `cancel_1_${Date.now()}`, 'hash');
      const user = await db.getUserById(id);

      const { socket } = makeSocket();
      const session: any = {
        state: 'loggedon',
        subState: LoggedOnSubState.W_FORGETME_CONFIRM,
        user,
        inputBuffer: '',
      };

      await handleForgetMeConfirmInput(socket, session, 'yes erase');

      const stillThere = await db.getUserById(id);
      expect(stillThere.username).toBe(user.username);
      expect(stillThere.deletedAt).toBeUndefined();
    });

    test('wrong password cancels cleanly', async () => {
      const db = await waitForTestDb();
      const bcrypt: any = require('bcryptjs');
      const hash = await bcrypt.hash('correct', 4);
      const id = await createTestUser(db, `cancel_2_${Date.now()}`, hash);
      const user = await db.getUserById(id);

      const { socket } = makeSocket();
      const session: any = {
        state: 'loggedon',
        subState: LoggedOnSubState.W_FORGETME_PASSWORD,
        user,
        inputBuffer: '',
      };

      await handleForgetMePasswordInput(socket, session, 'wrong');

      const stillThere = await db.getUserById(id);
      expect(stillThere.username).toBe(user.username);
      expect(stillThere.deletedAt).toBeUndefined();
    });

    test('username mismatch at final step cancels cleanly', async () => {
      const db = await waitForTestDb();
      const id = await createTestUser(db, `cancel_3_${Date.now()}`, 'hash');
      const user = await db.getUserById(id);

      const { socket } = makeSocket();
      const session: any = {
        state: 'loggedon',
        subState: LoggedOnSubState.W_FORGETME_USERNAME,
        user,
        inputBuffer: '',
      };

      await handleForgetMeUsernameInput(socket, session, 'not-my-handle');

      const stillThere = await db.getUserById(id);
      expect(stillThere.username).toBe(user.username);
      expect(stillThere.deletedAt).toBeUndefined();
    });

    test('happy path: YES ERASE + password + username → erasure + disconnect', async () => {
      jest.useFakeTimers();
      const db = await waitForTestDb();
      const bcrypt: any = require('bcryptjs');
      const hash = await bcrypt.hash('password', 4);
      const id = await createTestUser(db, `happy_${Date.now()}`, hash);
      const user = await db.getUserById(id);
      const originalUsername = user.username;

      const { socket, isDisconnected } = makeSocket();
      const session: any = {
        state: 'loggedon',
        subState: LoggedOnSubState.W_FORGETME_CONFIRM,
        user,
        inputBuffer: '',
      };

      await handleForgetMeConfirmInput(socket, session, 'YES ERASE');
      expect(session.subState).toBe(LoggedOnSubState.W_FORGETME_PASSWORD);

      await handleForgetMePasswordInput(socket, session, 'password');
      expect(session.subState).toBe(LoggedOnSubState.W_FORGETME_USERNAME);

      await handleForgetMeUsernameInput(socket, session, originalUsername);
      expect(session.state).toBe('await');
      expect(session.user).toBeUndefined();

      jest.advanceTimersByTime(500);
      expect(isDisconnected()).toBe(true);
      jest.useRealTimers();

      const scrubbed = await db.getUserById(id);
      expect(scrubbed.username).toMatch(/^erased_/);
      expect(scrubbed.email).toBe('');
      expect(scrubbed.deletedAt).toBeDefined();
    });
  });
});
