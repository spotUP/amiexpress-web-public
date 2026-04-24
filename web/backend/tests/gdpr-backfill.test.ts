/**
 * Regression tests for GDPR Phase 2 — backfill consent for pre-GDPR users.
 *
 * On successful login, if the user row has no gdpr_consent_at, the auth
 * handler calls promptGdprBackfill(). Accepting stamps consent with
 * source='relogin' and resumes the bulletin flow; declining drops the
 * connection without touching the account.
 */

import {
  handleGdprBackfillInput,
} from '../src/handlers/user/gdpr.handler';
import { LoggedOnSubState } from '../src/constants/bbs-states';

let socketCounter = 0;
function makeSocket() {
  const emits: any[] = [];
  let disconnected = false;
  socketCounter++;
  const socket: any = {
    id: `bfill-sock-${socketCounter}-${Date.now()}`,
    emit(event: string, payload: any) {
      emits.push({ event, payload });
    },
    on(_event: string, _handler: any) {},
    disconnect() { disconnected = true; },
  };
  return { socket, emits, isDisconnected: () => disconnected };
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

async function createLegacyUser(db: any, username: string) {
  // Pre-GDPR user: no consent fields set.
  return db.createUser({
    username,
    passwordHash: 'h',
    realname: 'Legacy',
    location: 'x',
    phone: '',
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

describe('GDPR Phase 2 — backfill consent', () => {
  test('accepting with blank Enter stamps gdpr_consent_at with source=relogin', async () => {
    const db = await waitForTestDb();
    const id = await createLegacyUser(db, `legacy_accept_${Date.now()}`);
    const user = await db.getUserById(id);
    expect(user.gdprConsentAt).toBeUndefined();

    const { socket } = makeSocket();
    const session: any = {
      state: 'loggedon',
      subState: LoggedOnSubState.GDPR_BACKFILL,
      user,
      inputBuffer: '',
    };

    // Accept via blank Enter — Y is the default.
    // Don't care about the resume-into-bulletin-flow path for this test;
    // just assert the DB stamp lands.
    try {
      await handleGdprBackfillInput(socket, session, '');
    } catch {
      // handleCommand() invocation may throw in unit scope (no full wiring);
      // we only care about DB side effects up to that point.
    }

    const after = await db.getUserById(id);
    expect(after.gdprConsentAt).toBeDefined();
    expect(after.gdprNoticeVersion).toBe('1.0');
    expect(after.gdprConsentSource).toBe('relogin');
  });

  test('accepting on "y" stamps consent', async () => {
    const db = await waitForTestDb();
    const id = await createLegacyUser(db, `legacy_y_${Date.now()}`);
    const user = await db.getUserById(id);

    const { socket } = makeSocket();
    const session: any = {
      state: 'loggedon',
      subState: LoggedOnSubState.GDPR_BACKFILL,
      user,
      inputBuffer: '',
    };
    try {
      await handleGdprBackfillInput(socket, session, 'y');
    } catch { /* ignore downstream handleCommand */ }

    const after = await db.getUserById(id);
    expect(after.gdprConsentAt).toBeDefined();
    expect(after.gdprConsentSource).toBe('relogin');
  });

  test('declining on "n" drops the connection and leaves account untouched', async () => {
    jest.useFakeTimers();
    const db = await waitForTestDb();
    const id = await createLegacyUser(db, `legacy_no_${Date.now()}`);
    const userBefore = await db.getUserById(id);

    const { socket, isDisconnected } = makeSocket();
    const session: any = {
      state: 'loggedon',
      subState: LoggedOnSubState.GDPR_BACKFILL,
      user: userBefore,
      inputBuffer: '',
    };

    await handleGdprBackfillInput(socket, session, 'n');

    expect(session.user).toBeUndefined();
    expect(session.state).toBe('await');
    jest.advanceTimersByTime(500);
    expect(isDisconnected()).toBe(true);
    jest.useRealTimers();

    const userAfter = await db.getUserById(id);
    expect(userAfter.username).toBe(userBefore.username);
    expect(userAfter.gdprConsentAt).toBeUndefined();
  });

  test('unrecognised input re-prompts without touching consent fields', async () => {
    const db = await waitForTestDb();
    const id = await createLegacyUser(db, `legacy_wat_${Date.now()}`);
    const user = await db.getUserById(id);

    const { socket, emits, isDisconnected } = makeSocket();
    const session: any = {
      state: 'loggedon',
      subState: LoggedOnSubState.GDPR_BACKFILL,
      user,
      inputBuffer: '',
    };

    await handleGdprBackfillInput(socket, session, 'maybe later');

    expect(isDisconnected()).toBe(false);
    expect(emits.some(e => typeof e.payload === 'string' && e.payload.includes('Please answer Y or n'))).toBe(true);

    const after = await db.getUserById(id);
    expect(after.gdprConsentAt).toBeUndefined();
  });

  // Regression guard for 2026-04-24: the initial Phase 2 commit placed the
  // GDPR_BACKFILL case inside handleMessageEntryInput (POST_MESSAGE_*
  // dispatcher only), so the backfill handler was never reached on live
  // user Enter. This grep-style test pins the case inside the top-level
  // handleCommand function instead.
  test('command.handler.ts has the GDPR_BACKFILL branch inside handleCommand, not handleMessageEntryInput', () => {
    const fs = require('fs');
    const pathMod = require('path');
    const src: string = fs.readFileSync(
      pathMod.join(__dirname, '..', 'src', 'handlers', 'command.handler.ts'),
      'utf8'
    );

    const messageFnStart = src.indexOf('async function handleMessageEntryInput');
    const commandFnStart = src.indexOf('export async function handleCommand');
    expect(messageFnStart).toBeGreaterThan(0);
    expect(commandFnStart).toBeGreaterThan(messageFnStart);

    // GDPR_BACKFILL must NOT appear inside handleMessageEntryInput
    // (between its start and handleCommand's start).
    const messageEntrySlice = src.slice(messageFnStart, commandFnStart);
    expect(messageEntrySlice).not.toMatch(/GDPR_BACKFILL/);

    // And it MUST appear inside handleCommand (after its start).
    const commandSlice = src.slice(commandFnStart);
    expect(commandSlice).toMatch(/LoggedOnSubState\.GDPR_BACKFILL/);
    expect(commandSlice).toMatch(/handleGdprBackfillInput/);
  });
});
