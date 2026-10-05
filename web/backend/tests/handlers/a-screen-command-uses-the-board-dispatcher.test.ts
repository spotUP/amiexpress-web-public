/**
 * A command a screen runs goes through the board's ONE dispatcher.
 *
 * Screen commands collected outside inline mode (`~CC_x|`, `~XC_x||`) ran
 * through command-handler/core.ts into command-execution.ts - a second copy of
 * the command set that cleared the screen first, never searched SYSCMD, had no
 * WHO and read the wrong base in custom-msgbase conferences (express.e parity
 * survey, 2026-09-29). express.e:5561 runs them with processSysCommand(cmd,
 * TRUE). Driven through the real runScreenCommands.
 */
process.env.SKIP_DB_INIT = '1';

const processCommand = jest.fn(async () => 'SUCCESS');
const handleCommand = jest.fn(async () => undefined);
jest.mock('../../src/handlers/command.handler', () => ({ processCommand, handleCommand }));

import { runScreenCommands } from '../../src/handlers/screen.handler';

const socket: any = { id: 'screen-cmd', emit: () => true, on: () => socket };

beforeEach(() => { processCommand.mockClear(); handleCommand.mockClear(); });

it('runs WHO, with parameters, through processCommand with the SYSCMD tier on', async () => {
  const session: any = { nodeId: 1, tempData: {} };
  await runScreenCommands(socket, session, ['who', 'ctop now']);

  expect(processCommand).toHaveBeenNthCalledWith(1, socket, session, 'WHO', '', true);
  expect(processCommand).toHaveBeenNthCalledWith(2, socket, session, 'CTOP', 'NOW', true);
  expect(handleCommand).not.toHaveBeenCalled();
});

it('hands a DOORS: helper path to the board\'s handleCommand, which runs WHO2\'s NI/NO', async () => {
  const session: any = { nodeId: 1, tempData: {} };
  await runScreenCommands(socket, session, ['DOORS:who/NI']);

  expect(handleCommand).toHaveBeenCalledWith(socket, session, 'DOORS:who/NI');
  expect(processCommand).not.toHaveBeenCalled();
});
