/**
 * The doors adapted in Task 6 are marked MIN_COLUMNS=40 IN THEIR REAL
 * Commands/BBSCmd/<CMD>.info BYTES, and a C64 session really launches them.
 *
 * This is deliberately not a source pin and not a fabricated tooltype map:
 * the .info file on disk is parsed by the same parser registration uses, the
 * resulting toolTypes go onto a Door, and the door goes through the REAL
 * executeDoor gate. createAllDropFiles is the "launch proceeded" sentinel,
 * exactly as in door-min-columns-gate.test.ts.
 */
import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';

jest.mock('../../../src/index', () => ({
  BBSState: { LOGGEDON: 'loggedon', AWAIT: 'await' },
  LoggedOnSubState: {},
}));
jest.mock('../../../src/services/DoorDropFileManager');
jest.mock('../../../src/services/CallersLogManager');

import { executeDoor, setHelpers } from '../../../src/handlers/door.handler';
import { doorDropFileManager } from '../../../src/services/DoorDropFileManager';
import { parseInfoFile } from '../../../src/utils/info-file.util';
import { LoggedOnSubState } from '../../../src/constants/bbs-states';
import type { Door } from '../../../src/types';

setHelpers({
  callersLog: async () => undefined,
  getRecentCallerActivity: async () => [],
});

const BBSCMD = path.resolve(__dirname, '../../../../../Commands/BBSCmd');

/** Commands whose doors Task 6 adapted to 40 columns, in plan order. */
const ADAPTED = ['THEME'];

const UNROUTED = 'unrouted-gate-test-type' as unknown as Door['type'];

function toolTypesFromDisk(command: string): Record<string, string> {
  const info = parseInfoFile(path.join(BBSCMD, `${command}.info`));
  const map: Record<string, string> = {};
  for (const tt of info.tooltypes) map[tt.key] = tt.value ?? '';
  return map;
}

function c64Session(): any {
  return {
    state: 'loggedon', subState: LoggedOnSubState.PROCESS_COMMAND,
    user: { id: 'u1', username: 'C64USER', secLevel: 255 },
    nodeId: 1, terminalType: 'c64', petsciiMode: true,
    screenWidth: 40, screenHeight: 25, tempData: {}, menuPause: true,
  };
}

function makeSocket() {
  const emitted: Array<{ event: string; data: unknown }> = [];
  return {
    id: 'marked-doors-socket',
    emitted,
    emit(event: string, data?: unknown) { emitted.push({ event, data }); return true; },
    on() { return this; },
  };
}

describe('Task 6 adapted doors are 40-ok on disk and launch on a C64', () => {
  beforeEach(() => (doorDropFileManager.createAllDropFiles as jest.Mock).mockClear());

  it.each(ADAPTED)('%s.info exists and carries MIN_COLUMNS=40', (command) => {
    expect(fs.existsSync(path.join(BBSCMD, `${command}.info`))).toBe(true);
    expect(toolTypesFromDisk(command).MIN_COLUMNS).toBe('40');
  });

  it.each(ADAPTED)('a C64 session launches %s through the real gate', async (command) => {
    const socket = makeSocket();
    const door = {
      id: command.toLowerCase(), name: command, description: '', command,
      path: `Doors/${command}`, accessLevel: 0, enabled: true, type: UNROUTED,
      toolTypes: toolTypesFromDisk(command),
    } as unknown as Door;
    await executeDoor(socket as any, c64Session(), door);
    const out = socket.emitted.filter(e => e.event === 'ansi-output').map(e => e.data).join('');
    expect(out).not.toContain('THIS DOOR NEEDS AN 80 COLUMN SCREEN');
    expect(doorDropFileManager.createAllDropFiles).toHaveBeenCalledTimes(1);
  });
});
