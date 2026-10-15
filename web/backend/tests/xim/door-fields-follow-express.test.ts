/**
 * Four XIM fields a door reads or sets, as express.e's processXimMsg has them.
 *
 * The parity survey (2026-09-29) found each one answering something else:
 *   - DT_ISANSI (3907) answers in msg.data, from the caller's colour mode.
 *     The port wrote '1' into the string for everyone (`user?.ansi || true`).
 *   - DT_ANSICOLOR (3904-3906) lets the door switch this call's colour; a
 *     duplicate case label swallowed every write.
 *   - DT_ADDBIT / DT_REMBIT (3853-3856, 8430-8442) set securityFlags[n] to
 *     "T"/"F" for the call. The port ORed n into userFlags as a bitmask: no
 *     grant, and unrelated user-flag bits flipped.
 *   - ACTIVE_NODES (3661-3666) is 32 characters with 'X' at index n for node
 *     n. The port gave 9 characters of '_' with node 1 at index 0.
 *   - DT_PASSWORD set with an empty string changes nothing (3508); the port
 *     set the caller's password to "".
 */
jest.mock('../../src/utils/acs-access-loader');
const activeNodes = new Set<number>();
jest.mock('../../src/services/NodeFileManager', () => ({
  nodeFileManager: { nodeUserFilesExist: (node: number) => activeNodes.has(node) },
}));

import { ACSPermission } from '../../src/constants/acs-permissions';
import { checkSecurity } from '../../src/utils/acs.util';
import { XIMDataQueryHandler } from '../../src/amiga-emulation/xim/data-query';
import { XIMCommand } from '../../src/amiga-emulation/xim/types';

function aDoor(user: Record<string, unknown>, session: Record<string, unknown> = {}, stringIn = '') {
  const strings: string[] = [];
  const replies: number[] = [];
  const messageParser = {
    writeCommand: jest.fn(),
    writeData: jest.fn((_addr: number, value: number) => replies.push(value)),
    writeString: jest.fn((_addr: number, value: string) => strings.push(value)),
    writeMessageString: jest.fn(),
    readString: jest.fn(() => stringIn),
    getCommandName: jest.fn(() => 'CMD'),
  } as any;
  const emulator = { readMemory32: () => 0, writeMemory32: () => undefined, writeMemory: () => undefined, readString: () => '' } as any;
  const bbsSession = { user, ...session } as any;
  const handler = new XIMDataQueryHandler(emulator, { replyMsg: jest.fn() } as any, messageParser, bbsSession, {} as any);
  const send = (command: XIMCommand, data: number) => handler.handleDataQuery({ command, data, string: '', msgAddr: 0x1000 } as any);
  return { send, strings, replies, bbsSession, messageParser };
}

describe('XIM door fields follow express.e', () => {
  test('DT_ISANSI answers the caller\'s colour mode in msg.data', () => {
    const plain = aDoor({ ansi: false }, { ansiMode: false });
    plain.send(XIMCommand.DT_ISANSI, 1);
    expect(plain.replies.at(-1)).toBe(0);

    const colour = aDoor({ ansi: true }, { ansiMode: true });
    colour.send(XIMCommand.DT_ISANSI, 1);
    expect(colour.replies.at(-1)).toBe(1);
  });

  test('DT_ANSICOLOR switches this call\'s colour, and 2 is RIP', () => {
    const door = aDoor({ ansi: true }, { ansiMode: true });
    door.send(XIMCommand.DT_ANSICOLOR, 0);
    expect(door.bbsSession.ansiMode).toBe(false);
    door.send(XIMCommand.DT_ANSICOLOR, 2);
    expect(door.bbsSession.ansiMode).toBe(true);
    expect(door.bbsSession.ripMode).toBe(true);
  });

  test('DT_ADDBIT grants the ACS for the call and leaves userFlags alone; DT_REMBIT takes it back', () => {
    const user: any = { secLevel: 10, securityFlags: '', secOverride: '', userFlags: 0x10 };
    const door = aDoor(user);
    expect(checkSecurity(user, ACSPermission.SYSOP_READ)).toBeFalsy();

    door.send(XIMCommand.DT_ADDBIT, ACSPermission.SYSOP_READ);
    expect(checkSecurity(user, ACSPermission.SYSOP_READ)).toBe(true);
    expect(user.userFlags).toBe(0x10);

    door.send(XIMCommand.DT_REMBIT, ACSPermission.SYSOP_READ);
    expect(checkSecurity(user, ACSPermission.SYSOP_READ)).toBeFalsy();
    expect(user.userFlags).toBe(0x10);
  });

  test('ACTIVE_NODES marks node n at character n, across 32 nodes', () => {
    activeNodes.clear();
    activeNodes.add(1);
    activeNodes.add(12);
    const door = aDoor({});
    door.send(XIMCommand.ACTIVE_NODES, 1);
    const answer = door.strings.at(-1)!;
    expect(answer).toHaveLength(32);
    expect(answer[1]).toBe('X');
    expect(answer[12]).toBe('X');
    expect(answer.replace(/X/g, '').trim()).toBe('');
  });

  test('DT_PASSWORD set to an empty string leaves the password', () => {
    const user: any = { passwordHash: 'KEEP-ME' };
    const door = aDoor(user, {}, '');
    door.send(XIMCommand.DT_PASSWORD, 0);
    expect(user.passwordHash).toBe('KEEP-ME');
  });
});
