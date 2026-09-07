/**
 * The W menu lists the doors that registered as settings, and opening one
 * runs it.
 *
 * "settings like this should live under W - can we make it possible for doors
 * to register under W?" (sysop, 2026-09-07). This is that, end to end: the
 * rows the caller reads, the number he types, and the door the board runs.
 */
jest.mock('../../src/index', () => {
  const states = require('../../src/constants/bbs-states');
  return { BBSState: states.BBSState, LoggedOnSubState: states.LoggedOnSubState, BBSSession: {} };
});

const executeDoor = jest.fn(async (_socket: unknown, _session: unknown, _door: unknown) => undefined);
jest.mock('../../src/handlers/door.handler', () => ({ executeDoor }));

const doors: any[] = [];
jest.mock('../../src/handlers/command-handler/dependency-injection', () => ({
  getDoors: () => doors,
}));

jest.mock('../../src/database', () => ({ db: { updateUser: jest.fn(async () => undefined) } }));

/**
 * The W menu is behind EDIT_USER_INFO, which real callers get from the
 * board's ACS files. Those are not what this suite is about: it asks what the
 * menu LISTS and what choosing a row DOES, for a caller who is allowed in.
 */
jest.mock('../../src/utils/acs.util', () => {
  const actual = jest.requireActual('../../src/utils/acs.util');
  return { ...actual, checkSecurity: () => true };
});

import { LoggedOnSubState } from '../../src/constants/bbs-states';
import { flushOutput } from '../../src/utils/output.util';
import {
  handleWriteUserParamsCommand,
  handleWOptionSelectInput,
  FIRST_SETTINGS_DOOR_OPTION,
} from '../../src/handlers/commands/info-commands.handler';

let seq = 0;

function driver(userOverrides: Record<string, unknown> = {}) {
  const emitted: string[] = [];
  const session: any = {
    nodeId: 1,
    currentConf: 1,
    tempData: {},
    user: {
      id: 'u1', username: 'SPOT', secLevel: 255, email: 'spot@example.com',
      ...userOverrides,
    },
  };
  const socket: any = {
    id: `w-menu-${seq++}`,
    session,
    emit(event: string, data: unknown) {
      if (event === 'ansi-output') emitted.push(String(data));
      if (event === 'petscii-palette') emitted.push(`[palette:${(data as { palette: string }).palette}]`);
      return true;
    },
    on() { return socket; },
  };
  const output = () => { flushOutput(socket); return emitted.join(''); };
  return { socket, session, output };
}

const settingsDoor = (command: string, label: string, over: Record<string, unknown> = {}) => ({
  id: command.toLowerCase(), command, name: command, description: `${command} door`,
  path: `Doors/${command.toLowerCase()}`, accessLevel: 1, enabled: true, type: 'typescript',
  toolTypes: { SETTINGS: 'YES', SETTINGS_LABEL: label }, ...over,
});

beforeEach(() => {
  doors.length = 0;
  executeDoor.mockClear();
});

describe('the W menu', () => {
  it('lists each registered settings door, numbered after the built-in options', () => {
    doors.push(settingsDoor('SCREENTHEME', 'Screen artwork'), settingsDoor('THEME', 'Door colours'));
    const d = driver();

    handleWriteUserParamsCommand(d.socket, d.session);
    const out = d.output();

    // Alphabetical by label: Door colours, then Screen artwork.
    expect(out).toContain('DOOR COLOURS');
    expect(out).toContain('SCREEN ARTWORK');
    expect(out).toContain(String(FIRST_SETTINGS_DOOR_OPTION));
    expect(out.indexOf('DOOR COLOURS')).toBeLessThan(out.indexOf('SCREEN ARTWORK'));
  });

  it('lists nothing extra when no door has registered', () => {
    const d = driver();
    handleWriteUserParamsCommand(d.socket, d.session);
    expect(d.output()).not.toContain('SCREEN ARTWORK');
  });

  it('opens the door whose number the caller typed', async () => {
    doors.push(settingsDoor('THEME', 'Door colours'), settingsDoor('SCREENTHEME', 'Screen artwork'));
    const d = driver();
    d.session.subState = LoggedOnSubState.W_OPTION_SELECT;

    await handleWOptionSelectInput(d.socket, d.session, String(FIRST_SETTINGS_DOOR_OPTION + 1));

    expect(executeDoor).toHaveBeenCalledTimes(1);
    expect(executeDoor.mock.calls[0][2]).toMatchObject({ command: 'SCREENTHEME' });
  });

  it('ignores a number past the end of the list', async () => {
    doors.push(settingsDoor('THEME', 'Door colours'));
    const d = driver();
    d.session.subState = LoggedOnSubState.W_OPTION_SELECT;

    await handleWOptionSelectInput(d.socket, d.session, String(FIRST_SETTINGS_DOOR_OPTION + 5));

    expect(executeDoor).not.toHaveBeenCalled();
    // ...and redraws the menu rather than leaving him at a dead prompt.
    expect(d.output()).toContain('USER CONFIGURATION');
  });
});

describe('the PETSCII palette row', () => {
  it('shows which colours he reads with, and toggles when chosen', async () => {
    const d = driver({ petsciiPalette: 'vdc' });
    handleWriteUserParamsCommand(d.socket, d.session);
    expect(d.output()).toContain('C128 (VDC)');

    d.session.subState = LoggedOnSubState.W_OPTION_SELECT;
    await handleWOptionSelectInput(d.socket, d.session, '21');

    expect(d.session.user.petsciiPalette).toBe('vic');
    // The terminal is told at once, so the screen changes under him.
    expect(d.output()).toContain('[palette:vic]');
    expect(d.output()).toContain('C64 (VIC-II)');
  });
});
