/**
 * Regression tests for the GDPR consent gate in the new-user flow.
 *
 * Phase 1 of thoughts/shared/plans/2026-04-24-gdpr-hobby-baseline.md.
 * Covers:
 *   - handleGdprConsentInput: accept (y/yes/blank), decline (n/no), invalid.
 *   - users table has the three gdpr_* columns after migration.
 *   - createUser persists gdprConsentAt / gdprNoticeVersion / gdprConsentSource.
 */

import {
  handleGdprConsentInput,
  setNewUserDependencies,
} from '../src/handlers/user/new-user.handler';
import { LoggedOnSubState } from '../src/constants/bbs-states';

type Emit = { event: string; payload: any };

function makeSocket() {
  const emits: Emit[] = [];
  let disconnected = false;
  const socket: any = {
    id: 'test-socket',
    emit(event: string, payload: any) {
      emits.push({ event, payload });
    },
    disconnect() {
      disconnected = true;
    },
  };
  return {
    socket,
    emits,
    isDisconnected: () => disconnected,
  };
}

function makeSession(overrides: any = {}) {
  return {
    state: 'registering',
    subState: LoggedOnSubState.NEW_USER_GDPR_CONSENT,
    inputBuffer: '',
    newUserData: {
      username: 'testhandle',
      location: '',
      phone: '',
      email: '',
      password: '',
      linesPerScreen: 0,
      computerType: 'AMiGA 500',
      screenClear: true,
      retryCount: 0,
      accessPasswordTries: 0,
      introShown: false,
      autoValidationTries: 0,
      autoValidationComplete: true,
      autoValidated: false,
      linesCountdownShown: false,
      questionnaire: undefined,
      computerChoices: undefined,
      gdprConsentAt: undefined,
      gdprConsentSource: undefined,
    },
    ...overrides,
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

describe('GDPR consent gate (Phase 1)', () => {
  beforeAll(async () => {
    const db = await waitForTestDb();
    // ConfigService constructed inside setNewUserDependencies needs a real db
    // with getConfigRepository().
    setNewUserDependencies({
      db,
      sessions: new Map(),
      newUserPassword: '',
      autoValidationPassword: '',
    });
  }, 30000);

  describe('handleGdprConsentInput', () => {
    test('accepts on "y"', async () => {
      const { socket, emits, isDisconnected } = makeSocket();
      const session = makeSession();

      await handleGdprConsentInput(socket, session, 'y');

      expect(typeof session.newUserData.gdprConsentAt).toBe('string');
      expect(session.newUserData.gdprNoticeVersion).toBe('1.0');
      expect(session.newUserData.gdprConsentSource).toBe('registration');
      expect(isDisconnected()).toBe(false);
      // Should not emit the decline abort message.
      expect(emits.some(e => typeof e.payload === 'string' && e.payload.includes('Registration cancelled'))).toBe(false);
    });

    test('accepts on "yes"', async () => {
      const { socket } = makeSocket();
      const session = makeSession();
      await handleGdprConsentInput(socket, session, 'yes');
      expect(session.newUserData.gdprConsentAt).toBeDefined();
      expect(session.newUserData.gdprConsentSource).toBe('registration');
    });

    test('accepts on blank (Enter) — Y is the default', async () => {
      const { socket } = makeSocket();
      const session = makeSession();
      await handleGdprConsentInput(socket, session, '');
      expect(session.newUserData.gdprConsentAt).toBeDefined();
      expect(session.newUserData.gdprNoticeVersion).toBe('1.0');
    });

    test('decline on "n" cancels, wipes newUserData, and schedules disconnect', async () => {
      jest.useFakeTimers();
      const { socket, emits, isDisconnected } = makeSocket();
      const session = makeSession();

      await handleGdprConsentInput(socket, session, 'n');

      // abortNewUser clears newUserData so no PII lingers on the session.
      expect(session.newUserData).toBeUndefined();
      expect(session.state).toBe('await');
      expect(session.subState).toBeUndefined();
      expect(emits.some(e => typeof e.payload === 'string' && e.payload.includes('Registration cancelled'))).toBe(true);
      expect(emits.some(e => typeof e.payload === 'string' && e.payload.includes('NO CARRIER'))).toBe(true);

      jest.advanceTimersByTime(500);
      expect(isDisconnected()).toBe(true);
      jest.useRealTimers();
    });

    test('decline on "no" also cancels and disconnects', async () => {
      jest.useFakeTimers();
      const { socket, isDisconnected } = makeSocket();
      const session = makeSession();
      await handleGdprConsentInput(socket, session, 'no');
      expect(session.newUserData).toBeUndefined();
      jest.advanceTimersByTime(500);
      expect(isDisconnected()).toBe(true);
      jest.useRealTimers();
    });

    test('invalid input re-prompts without touching consent fields', async () => {
      const { socket, emits, isDisconnected } = makeSocket();
      const session = makeSession();

      await handleGdprConsentInput(socket, session, 'maybe');

      expect(session.newUserData.gdprConsentAt).toBeUndefined();
      expect(isDisconnected()).toBe(false);
      // Re-prompt emits a hint line.
      expect(emits.some(e => typeof e.payload === 'string' && e.payload.includes('Please answer Y or n'))).toBe(true);
    });
  });

  describe('users table migration', () => {
    test('has gdpr_consent_at, gdpr_notice_version, gdpr_consent_source', async () => {
      // Wait for the shared test db (spun up in tests/setup.ts).
      let attempts = 0;
      while (!(global as any).testDb && attempts < 30) {
        await new Promise(r => setTimeout(r, 500));
        attempts++;
      }
      const db = (global as any).testDb;
      if (!db) throw new Error('Test database not initialized');

      const info: any[] = (db as any).db.prepare('PRAGMA table_info(users)').all();
      const cols = info.map(c => c.name);
      expect(cols).toEqual(expect.arrayContaining([
        'gdpr_consent_at',
        'gdpr_notice_version',
        'gdpr_consent_source',
      ]));
    });

    test('createUser persists gdpr_* fields', async () => {
      const db = (global as any).testDb;
      if (!db) throw new Error('Test database not initialized');

      const ts = new Date().toISOString();
      const id = await db.createUser({
        username: `gdpr_test_${Date.now()}`,
        passwordHash: 'x',
        realname: 'gdpr',
        location: '',
        phone: '',
        email: 'a@b.c',
        secLevel: 10,
        uploads: 0,
        downloads: 0,
        bytesUpload: 0,
        bytesDownload: 0,
        ratio: 0,
        ratioType: 0,
        timeTotal: 0,
        timeLimit: 60,
        timeUsed: 0,
        chatLimit: 30,
        chatUsed: 0,
        firstLogin: new Date(),
        lastLogin: new Date(),
        calls: 1,
        callsToday: 1,
        newUser: true,
        expert: 'N',
        ansi: true,
        linesPerScreen: 23,
        computer: 'AMiGA 500',
        screenType: 'ANSI',
        protocol: 'ZMODEM',
        editor: 'FULL',
        zoomType: 'NONE',
        availableForChat: true,
        quietNode: false,
        autoRejoin: 1,
        confAccess: 'XXX',
        areaName: '',
        uuCP: false,
        topUploadCPS: 0,
        topDownloadCPS: 0,
        byteLimit: 0,
        userFlags: 0,
        gdprConsentAt: ts,
        gdprNoticeVersion: '1.0',
        gdprConsentSource: 'registration',
      } as any);

      expect(typeof id).toBe('string');

      const user = await db.getUserById(id);
      expect(user).not.toBeNull();
      expect(user.gdprConsentAt).toBe(ts);
      expect(user.gdprNoticeVersion).toBe('1.0');
      expect(user.gdprConsentSource).toBe('registration');
    });
  });
});
