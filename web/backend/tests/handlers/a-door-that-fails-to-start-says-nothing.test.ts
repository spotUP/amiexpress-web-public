/**
 * A door that cannot be started fails without a word, as express.e's runDoor
 * does (4336-4343: doorLog and RETURN). The port printed "Error executing
 * command." on a throw and "Command execution not available." with no door
 * runner wired.
 */
process.env.SKIP_DB_INIT = '1';

import { runBbsCommand, commandCache, setCommandExecutionDependencies } from '../../src/handlers/command-execution.handler';

function socketSpy() {
  const out: string[] = [];
  const socket: any = {
    id: `fail-${Math.random().toString(36).slice(2)}`,
    emit: (event: string, payload: unknown) => { if (event === 'ansi-output') out.push(String(payload)); },
    on: () => socket, once: () => socket, off: () => socket, removeListener: () => socket,
  };
  return { socket, said: () => out.join('') };
}

test('a door whose start throws prints nothing invented', async () => {
  const executeDoor = jest.fn(async () => { throw new Error('boom'); });
  setCommandExecutionDependencies(executeDoor, null);
  commandCache.bbscmd.set('BROKEN', { name: 'BROKEN', access: 0, type: 'BBSCMD', location: 'Doors/broken', toolTypes: {} } as never);
  const { socket, said } = socketSpy();
  try {
    await runBbsCommand(socket, { user: { id: 'u1', username: 'sysop', secLevel: 255 }, tempData: {}, subState: '' } as any, 'BROKEN', '');
  } finally {
    commandCache.bbscmd.delete('BROKEN');
  }
  expect(executeDoor).toHaveBeenCalledTimes(1);
  expect(said()).not.toMatch(/Error executing command|Command execution not available/);
});
