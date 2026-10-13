/**
 * US (express.e:25660-25666 internalCommandUS):
 *
 *   IF checkSecurity(ACS_SYSOP_COMMANDS)=FALSE THEN RETURN RESULT_NOT_ALLOWED   25661
 *   setEnvStat(ENV_UPLOADING)                                                    25662
 *   sysopUpload()                                                                25664
 *
 * Pinned here: the gate. A caller without ACS_SYSOP_COMMANDS gets the
 * dispatcher's "Command requires higher access." and the node is NOT marked
 * Uploading (the allowed-side env mark is pinned by
 * every-command-sets-the-node-status-express-e-sets).
 *
 * KNOWN GAP, not pinned because it is wrong: sysopUpload (18789-18900) asks
 * "Destination path for upload? ", checks the device and free space, receives
 * into the node playpen with sysopUploading=TRUE (no file-area filing, no dupe
 * check) and then moves each file to that path. The port's US runs the
 * ordinary caller upload interface into the conference file area instead.
 *
 * Driven through processBBSCommand (the dispatcher of express.e:28289-28397).
 */
process.env.SKIP_DB_INIT = '1';

import { processBBSCommand } from '../../src/handlers/command.handler';
import { LoggedOnSubState } from '../../src/constants/bbs-states';
import { EnvStat } from '../../src/constants/env-codes';
import { flushOutput } from '../../src/utils/output.util';

test('US without sysop-command access says "Command requires higher access." and does not mark the node Uploading', async () => {
  const wire: string[] = [];
  const socket: any = {
    id: 'us-cmd',
    emit: (event: string, data: unknown) => { if (event === 'ansi-output') wire.push(String(data)); return true; },
    on: () => socket,
  };
  const session: any = {
    state: 'loggedon', subState: LoggedOnSubState.PROCESS_COMMAND, nodeId: 1, currentConf: 1, currentMsgBase: 1, tempData: {},
    user: { id: 1, username: 'caller', secLevel: 1, securityFlags: 'F'.repeat(100), confAccess: 'X' },
  };
  socket.session = session;
  await processBBSCommand(socket, session, 'US', '');
  flushOutput(socket);
  const out = wire.join('');
  expect(out).toContain('\r\nCommand requires higher access.\r\n');
  expect(out).not.toContain('Destination path');
  expect(session.currentStat).not.toBe(EnvStat.UPLOADING);
});
