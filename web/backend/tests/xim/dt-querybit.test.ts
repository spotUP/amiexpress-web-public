/**
 * Regression test for DT_QUERYBIT XIM handler.
 *
 * Bug: data-query.ts was checking (user.userFlags & bitMask) — treating
 * msg.data as a bitmask into a raw flags field. msg.data is an ACS permission
 * INDEX (not a bit position), so the check always returned 0 for normal
 * permission values like ENTER_MESSAGE=5 because userFlags never had bit 5
 * set. Sysop users with full ACS access were denied E (post message) and any
 * other door that called DT_QUERYBIT.
 *
 * Fix: replace the bitmask check with checkSecurity(user, permIndex).
 */

jest.mock('../../src/utils/acs-access-loader');
jest.mock('../../src/utils/acs.util', () => {
  const actual = jest.requireActual('../../src/utils/acs.util');
  return { ...actual, checkSecurity: jest.fn() };
});

import { checkSecurity } from '../../src/utils/acs.util';
import { ACSPermission } from '../../src/constants/acs-permissions';
import { XIMDataQueryHandler } from '../../src/amiga-emulation/xim/data-query';
import { XIMCommand } from '../../src/amiga-emulation/xim/types';

const mockCheckSecurity = checkSecurity as jest.MockedFunction<typeof checkSecurity>;

function makeHandler(userOverrides: Record<string, unknown> = {}) {
  // Minimal emulator stub — just track writeMemory32 calls
  const written: Array<{ addr: number; value: number }> = [];
  const emulator = {
    readMemory32: jest.fn().mockReturnValue(0),
    readMemory16: jest.fn().mockReturnValue(0),
    writeMemory32: jest.fn((addr: number, value: number) => written.push({ addr, value })),
    writeMemory8: jest.fn(),
    readMemory8: jest.fn().mockReturnValue(0),
    readString: jest.fn().mockReturnValue(''),
    writeString: jest.fn(),
  } as any;

  const messageParser = {
    parseMessage: jest.fn().mockReturnValue({ command: XIMCommand.DT_QUERYBIT, data: 5, string: '', msgAddr: 0x1000 }),
    writeCommand: jest.fn((msgAddr: number, value: number) => written.push({ addr: msgAddr, value })),
    writeData: jest.fn(),
    writeString: jest.fn(),
    getCommandName: jest.fn().mockReturnValue('DT_QUERYBIT'),
  } as any;

  const user = {
    secLevel: 255,
    secOverride: '',
    securityFlags: '',
    userFlags: 0,
    ...userOverrides,
  } as any;

  const bbsSession = { user } as any;
  const state = {} as any;

  const handler = new XIMDataQueryHandler(emulator, {} as any, messageParser, bbsSession, state);
  return { handler, messageParser, written, user };
}

describe('DT_QUERYBIT handler', () => {
  beforeEach(() => {
    mockCheckSecurity.mockReset();
  });

  it('calls checkSecurity with the permission index, not a bitmask', () => {
    mockCheckSecurity.mockReturnValue(true);
    const { handler, messageParser } = makeHandler();

    const msg = {
      command: XIMCommand.DT_QUERYBIT,
      data: ACSPermission.ENTER_MESSAGE, // = 5
      string: '',
      msgAddr: 0x1000,
    } as any;

    handler.handleDataQuery(msg);

    expect(mockCheckSecurity).toHaveBeenCalledWith(
      expect.objectContaining({ secLevel: 255 }),
      ACSPermission.ENTER_MESSAGE
    );
  });

  it('returns 1 when checkSecurity grants permission', () => {
    mockCheckSecurity.mockReturnValue(true);
    const { handler, messageParser, written } = makeHandler();

    const msg = { command: XIMCommand.DT_QUERYBIT, data: ACSPermission.ENTER_MESSAGE, string: '', msgAddr: 0x1000 } as any;
    handler.handleDataQuery(msg);

    // writeCommand should have been called with 1 (permission granted)
    expect(messageParser.writeCommand).toHaveBeenCalledWith(0x1000, 1);
  });

  it('returns 0 when checkSecurity denies permission', () => {
    mockCheckSecurity.mockReturnValue(false);
    const { handler, messageParser } = makeHandler();

    const msg = { command: XIMCommand.DT_QUERYBIT, data: ACSPermission.ENTER_MESSAGE, string: '', msgAddr: 0x1000 } as any;
    handler.handleDataQuery(msg);

    expect(messageParser.writeCommand).toHaveBeenCalledWith(0x1000, 0);
  });

  it('old bitmask check would have returned 0 for permission index 5 (regression guard)', () => {
    // The old code: (user.userFlags & bitMask) !== 0
    // For ENTER_MESSAGE=5 and userFlags=0: (0 & 5) = 0 → denied.
    // Even with userFlags=255 (all low bits set): (255 & 5) = 5 ≠ 0 → granted only if
    // the raw flag happened to have those bits — completely unrelated to ACS.
    // This test documents that the OLD approach was wrong.
    const userFlags = 0; // typical user with no raw flags
    const bitMask = ACSPermission.ENTER_MESSAGE; // = 5
    const oldResult = (userFlags & bitMask) !== 0 ? 1 : 0;
    expect(oldResult).toBe(0); // old code always denied sysop with userFlags=0
  });
});
