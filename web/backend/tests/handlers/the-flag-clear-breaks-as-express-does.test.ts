/**
 * A's Clear (express.e flagFiles 12604-12621): a name typed at "Filename(s)
 * to Clear" is followed by aePuts('\b\n') (12619); "C name" typed at the
 * flag prompt itself prints nothing past lineInput's own break (12606). The
 * port had them the other way round.
 */
process.env.SKIP_DB_INIT = '1';

import { AlterFlagsHandler } from '../../src/handlers/operations/alter-flags.handler';

function caller(tempData: Record<string, unknown>) {
  const wire: string[] = [];
  const socket: any = { id: `af-${Math.random()}`, emit: (_e: string, d: unknown) => { wire.push(String(d)); return true; }, on: () => socket };
  const flagManager: any = {
    removeFlag: jest.fn(() => true), clearAll: jest.fn(), save: jest.fn(async () => undefined),
    getAll: () => [], getCount: () => 0, list: () => [], getFlags: () => [], isEmpty: () => true,
  };
  const session: any = { nodeId: 1, currentConf: 1, user: { secLevel: 10 }, tempData, flagManager };
  return { socket, session, flagManager, said: () => wire.join('') };
}

test('a name at the Clear prompt: express.e\'s line break first', async () => {
  const c = caller({ waitingForClear: true });
  await AlterFlagsHandler.handleFlagInput(c.socket, c.session, 'GAME.LHA');
  expect(c.flagManager.removeFlag).toHaveBeenCalledWith('GAME.LHA', 1);
  expect(c.said().startsWith('\r\n')).toBe(true);
});

test('"C name" at the flag prompt clears with no break of its own', async () => {
  const c = caller({ waitingForFlag: true });
  await AlterFlagsHandler.handleFlagInput(c.socket, c.session, 'C GAME.LHA');
  expect(c.flagManager.removeFlag).toHaveBeenCalledWith('GAME.LHA', 1);
  expect(c.said().startsWith('\r\n')).toBe(false);
});
