/**
 * DT_ADDBIT / DT_REMBIT set securityFlags[n] to "T" / "F" for the call and
 * checkSecurity reads them first: setTempSecurityFlags (express.e 8430-8436)
 * and clearTempSecurityFlags (8437-8443), reached from processXimMsg
 * (3853-3856). DoorMessageHandler's no-XIMProtocol fallback OR-ed 1<<n into
 * session.tempSecurityFlags, which nothing reads: no grant, no revoke. The
 * live XIMProtocol route (xim/data-query.ts) is driven in
 * door-fields-follow-express.test.ts.
 */
jest.mock('../../src/utils/acs-access-loader');

import { ACSPermission } from '../../src/constants/acs-permissions';
import { checkSecurity } from '../../src/utils/acs.util';
import { XIMCommand } from '../../src/amiga-emulation/XIMProtocol';

async function send(user: any, command: number, data: number): Promise<void> {
  const { DoorMessageHandler } = require('../../src/amiga-emulation/session/DoorMessageHandler');
  const emulator: any = {
    writeMemory32: () => {}, writeMemory16: () => {}, writeMemory: () => {},
    readMemory32: () => 0, readMemory16: () => 0, readMemory: () => 0, readString: () => '',
  };
  const socket: any = { emit: () => true, on: () => {}, off: () => {} };
  const handler = new DoorMessageHandler(emulator, socket, { replyMessage: () => {}, putMsg: () => {} } as any, {
    executablePath: '/nowhere/door', bbsSession: { user },
  });
  await (handler as any).processCommand(command, data, '', 0x1000, 0);
}

test('the fallback DT_ADDBIT grants the ACS for the call and DT_REMBIT takes it back', async () => {
  const user: any = { secLevel: 10, securityFlags: '', secOverride: '', userFlags: 0x10 };
  expect(checkSecurity(user, ACSPermission.SYSOP_READ)).toBeFalsy();

  await send(user, XIMCommand.DT_ADDBIT, ACSPermission.SYSOP_READ);
  expect(checkSecurity(user, ACSPermission.SYSOP_READ)).toBe(true);
  expect(user.userFlags).toBe(0x10);

  await send(user, XIMCommand.DT_REMBIT, ACSPermission.SYSOP_READ);
  expect(checkSecurity(user, ACSPermission.SYSOP_READ)).toBeFalsy();
});
