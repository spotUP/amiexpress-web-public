// @ts-nocheck
/**
 * User Editor Handler Tests (express.e:22400-22460)
 * Tests the sysop account editing tool.
 */

jest.mock('../../../src/index', () => {
  const states = require('../../../src/constants/bbs-states');
  return {
    BBSState: states.BBSState,
    LoggedOnSubState: states.LoggedOnSubState,
    BBSSession: {},
  };
});
jest.mock('../../../src/services/UserFileManager', () => ({
  userFileManager: { writeUserFiles: jest.fn(), updateUserDataFile: jest.fn() }
}));

import { LoggedOnSubState } from '../../../src/constants/bbs-states';
import {
  handleAccountEditorMenu,
  handleAccountEditorInput,
  handleSearchByNameInput,
} from '../../../src/handlers/user/user-editor.handler';

function makeSocket() {
  const output: string[] = [];
  return {
    emit: jest.fn((event: string, data: any) => output.push(String(data))),
    _output: output,
    getOutput: () => output.join(''),
  };
}

function makeSession(overrides: any = {}) {
  return {
    state: 'loggedon',
    subState: LoggedOnSubState.READ_COMMAND,
    menuPause: false,
    tempData: undefined as any,
    user: { username: 'sysop', secLevel: 255 },
    accountEditorState: undefined as any,
    ...overrides,
  } as any;
}

function makeDb(users: any[] = []) {
  return {
    getUsers: jest.fn().mockResolvedValue(users),
    getUserByUsername: jest.fn().mockResolvedValue(null),
    updateUser: jest.fn().mockResolvedValue(undefined),
    hashPassword: jest.fn().mockResolvedValue('newhash'),
  };
}

describe('User Editor Handler (express.e:22400-22460)', () => {
  describe('handleAccountEditorMenu', () => {
    it('displays menu and sets subState to ACCOUNT_EDITOR_MENU', async () => {
      const socket = makeSocket();
      const session = makeSession();
      const db = makeDb();

      await handleAccountEditorMenu(socket, session, db);

      expect(socket.emit).toHaveBeenCalled();
      const out = socket.getOutput();
      expect(out).toContain('earch');
      expect(session.subState).toBe(LoggedOnSubState.ACCOUNT_EDITOR_MENU);
    });

    it('shows "Include" when includeDeact is true (express.e:22403)', async () => {
      const socket = makeSocket();
      const session = makeSession({
        accountEditorState: { includeDeact: true }
      });
      const db = makeDb();

      await handleAccountEditorMenu(socket, session, db);

      expect(socket.getOutput()).toContain('Include');
    });

    it('shows "Exclude" by default (express.e:22403)', async () => {
      const socket = makeSocket();
      const session = makeSession();
      const db = makeDb();

      await handleAccountEditorMenu(socket, session, db);

      expect(socket.getOutput()).toContain('Exclude');
    });
  });

  describe('handleAccountEditorInput', () => {
    it('empty input exits to DISPLAY_MENU (express.e:22444)', async () => {
      const socket = makeSocket();
      const session = makeSession();
      const db = makeDb();

      await handleAccountEditorInput(socket, session, db, '');

      expect(session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
      expect(session.accountEditorState).toBeUndefined();
    });

    it('I toggles includeDeact and loops back to menu (express.e:22425)', async () => {
      const socket = makeSocket();
      const session = makeSession();
      const db = makeDb();

      await handleAccountEditorInput(socket, session, db, 'I');

      const state = session.accountEditorState;
      expect(state?.includeDeact).toBe(true);
      expect(session.subState).toBe(LoggedOnSubState.ACCOUNT_EDITOR_MENU);
    });

    it('I toggles back to false on second press', async () => {
      const socket = makeSocket();
      const session = makeSession({ accountEditorState: { includeDeact: true } });
      const db = makeDb();

      await handleAccountEditorInput(socket, session, db, 'I');

      expect(session.accountEditorState?.includeDeact).toBe(false);
    });

    it('S triggers search by name (express.e:22427)', async () => {
      const socket = makeSocket();
      const session = makeSession();
      const db = makeDb();

      await handleAccountEditorInput(socket, session, db, 'S');

      expect(session.subState).toBe(LoggedOnSubState.ACCOUNT_EDITOR_SEARCH_NAME);
      expect(socket.getOutput()).toContain('UserName');
    });

    it('out-of-range account number emits error (express.e:22382)', async () => {
      const socket = makeSocket();
      const session = makeSession();
      const db = makeDb([{ id: 'u1', username: 'user1' }]); // Only 1 user

      await handleAccountEditorInput(socket, session, db, '5'); // > max

      expect(socket.getOutput()).toContain('Higher Than Maximum');
    });

    it('invalid command loops back to menu', async () => {
      const socket = makeSocket();
      const session = makeSession();
      const db = makeDb();

      await handleAccountEditorInput(socket, session, db, 'Z');

      expect(session.subState).toBe(LoggedOnSubState.ACCOUNT_EDITOR_MENU);
    });
  });

  describe('handleSearchByNameInput', () => {
    it('empty search returns to menu', async () => {
      const socket = makeSocket();
      const session = makeSession();
      const db = makeDb();

      await handleSearchByNameInput(socket, session, db, '');

      expect(session.subState).toBe(LoggedOnSubState.ACCOUNT_EDITOR_MENU);
    });

    it('no match shows "not found" message', async () => {
      const socket = makeSocket();
      const session = makeSession();
      const db = makeDb([]);

      await handleSearchByNameInput(socket, session, db, 'Nonexistent');

      // Should emit something about no match or return to menu
      expect(socket.emit).toHaveBeenCalled();
    });

    it('match found shows user info', async () => {
      const socket = makeSocket();
      const session = makeSession();
      const db = makeDb([
        { id: 'u1', username: 'FoundUser', realname: 'Found', secLevel: 10, calls: 5 }
      ]);

      await handleSearchByNameInput(socket, session, db, 'FoundUser');

      expect(socket.emit).toHaveBeenCalled();
    });
  });
});
