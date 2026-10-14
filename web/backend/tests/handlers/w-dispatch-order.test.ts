/**
 * W7: dispatch order for W. express.e processCommand (28229-28256) asks
 * BBSCMD (runBbsCommand, 28252-28253) before the internal commands
 * (processInternalCommand, 28256), so a Commands/BBSCmd/W.info registration
 * outranks the internal W and its absence brings the internal W back. The
 * board's processCommand (command.handler.ts) keeps that order; this pins it
 * through the real chain (tests/doors/dispatch-harness.ts).
 */
import {
  installDispatchHarness, doorOver, register, makeSocket, allOutput, flushedOutput, ansiSession,
  doorDropFileManager,
} from '../doors/dispatch-harness';
import { handleCommand } from '../../src/handlers/command.handler';

installDispatchHarness();

describe('W: a registered door outranks the internal W, as express.e:28252-28256 orders it', () => {
  test('with Commands/BBSCmd/W.info the door runs and the internal menu does not', async () => {
    await register(doorOver('W', { MIN_COLUMNS: '40' }));
    const socket = makeSocket();
    await handleCommand(socket as any, ansiSession('W'), '');
    expect(doorDropFileManager.createAllDropFiles).toHaveBeenCalledTimes(1);
    expect(flushedOutput(socket)).not.toContain('USER CONFIGURATION');
  });

  test('without it the internal W runs', async () => {
    await register();
    const socket = makeSocket();
    await handleCommand(socket as any, ansiSession('W'), '');
    expect(doorDropFileManager.createAllDropFiles).not.toHaveBeenCalled();
    expect(flushedOutput(socket)).toContain('USER CONFIGURATION');
  });
});
