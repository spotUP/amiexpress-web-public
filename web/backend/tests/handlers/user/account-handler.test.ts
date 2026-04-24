/**
 * Account Handler Tests
 * Tests account editing menu dispatch and user management operations.
 */

jest.mock('../../../src/index', () => {
  const states = require('../../../src/constants/bbs-states');
  return {
    BBSState: states.BBSState,
    LoggedOnSubState: states.LoggedOnSubState,
    BBSSession: {},
  };
});

import { LoggedOnSubState } from '../../../src/constants/bbs-states';
import {
  setDatabase,
  displayAccountEditingMenu,
  handleAccountEditing,
} from '../../../src/handlers/user/account.handler';

function makeSocket() {
  const emits: string[] = [];
  return {
    emit: jest.fn((event: string, data: any) => emits.push(String(data))),
    _emits: emits,
  };
}

function makeSession(overrides: any = {}) {
  return {
    state: 'loggedon',
    subState: LoggedOnSubState.READ_COMMAND,
    menuPause: false,
    tempData: undefined as any,
    user: { username: 'sysop', secLevel: 255 },
    ...overrides,
  } as any;
}

describe('Account Handler', () => {
  beforeAll(() => {
    setDatabase({
      getUserByUsername: jest.fn(),
      updateUser: jest.fn(),
      getUsers: jest.fn().mockResolvedValue([]),
      deleteUser: jest.fn(),
    });
  });

  describe('displayAccountEditingMenu', () => {
    it('emits menu text and sets subState', () => {
      const socket = makeSocket();
      const session = makeSession();

      displayAccountEditingMenu(socket, session);

      expect(socket.emit).toHaveBeenCalled();
      const allOutput = socket.emit.mock.calls.map((c: any[]) => String(c[1])).join('');
      expect(allOutput).toContain('Account Editing');
      expect(session.tempData).toBeDefined();
    });
  });

  describe('handleAccountEditing', () => {
    it('invalid option emits error and returns to menu', () => {
      const socket = makeSocket();
      const session = makeSession({ tempData: { accountEditingMenu: true } });

      handleAccountEditing(socket, session, 'X');

      const allOutput = socket.emit.mock.calls.map((c: any[]) => String(c[1])).join('');
      expect(allOutput).toMatch(/Invalid|invalid/);
      expect(session.tempData).toBeUndefined();
    });

    it('option 0 emits error', () => {
      const socket = makeSocket();
      const session = makeSession();

      handleAccountEditing(socket, session, '0');

      const allOutput = socket.emit.mock.calls.map((c: any[]) => String(c[1])).join('');
      expect(allOutput).toMatch(/Invalid|invalid/);
    });

    it('option 1 prompts for username to edit', () => {
      const socket = makeSocket();
      const session = makeSession();

      handleAccountEditing(socket, session, '1');

      const allOutput = socket.emit.mock.calls.map((c: any[]) => String(c[1])).join('');
      expect(allOutput).toMatch(/Edit User Account|username to edit/i);
      expect(session.tempData).toMatchObject({ editUserAccount: true });
    });

    it('option 2 prompts for username to view stats', () => {
      const socket = makeSocket();
      const session = makeSession();

      handleAccountEditing(socket, session, '2');

      expect(session.tempData).toMatchObject({ viewUserStats: true });
    });

    it('option 3 prompts for security level change', () => {
      const socket = makeSocket();
      const session = makeSession();

      handleAccountEditing(socket, session, '3');

      expect(session.tempData).toMatchObject({ changeSecLevel: true });
    });

    it('option 4 prompts for flag toggle', () => {
      const socket = makeSocket();
      const session = makeSession();

      handleAccountEditing(socket, session, '4');

      expect(session.tempData).toMatchObject({ toggleUserFlags: true });
    });

    it('option 6 triggers user list', () => {
      const socket = makeSocket();
      const session = makeSession();

      handleAccountEditing(socket, session, '6');

      // Should emit some output
      expect(socket.emit).toHaveBeenCalled();
    });
  });
});
