/**
 * express.e checkFileExternal (18567-18581) starts the checker with
 * NP_STACKSIZE = the FCheck icon's STACK (4096 when absent). The port read
 * STACK and dropped it: the launcher had no stack option.
 *
 * NP_PRIORITY (18581) is not ported on purpose - the emulator runs one task,
 * so a priority has nothing to order.
 */
process.env.SKIP_DB_INIT = '1';

import { EventEmitter } from 'events';

jest.mock('../../src/database', () => ({ db: { query: async () => ({ rows: [] }) } }));

const spawned: string[][] = [];
jest.mock('child_process', () => {
  const actual = jest.requireActual('child_process');
  return {
    ...actual,
    spawn: jest.fn((_command: string, args: string[]) => {
      spawned.push(args);
      const child: any = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.stdin = { end: () => undefined };
      child.pid = undefined;
      setImmediate(() => child.emit('close', 0));
      return child;
    }),
  };
});

import { runAmigaProgram } from '../../src/utils/amiga-program-runner.util';
import { fileCheckerFromTooltypes } from '../../src/utils/file-test.util';

describe('a checker is started with the FCheck icon\'s STACK', () => {
  beforeEach(() => { spawned.length = 0; });

  it('the launcher passes the program a stack of the size asked for', async () => {
    await runAmigaProgram('/nonexistent/checker', { nodeId: 1, doorType: 'SIM', stackSize: 50000 });
    const args = spawned[0];
    expect(args[args.indexOf('--stack') + 1]).toBe('50000');
  });

  it('the launcher passes no stack when none is asked for', async () => {
    await runAmigaProgram('/nonexistent/checker', { nodeId: 1, doorType: 'SIM' });
    expect(spawned[0]).not.toContain('--stack');
  });

  it('STACK is read from the icon, 4096 when it has none (express.e:18567-18569)', () => {
    expect(fileCheckerFromTooltypes('LHA', new Map([['CHECKER', 'X:y'], ['STACK', '50000']]))?.stackSize).toBe(50000);
    expect(fileCheckerFromTooltypes('LHA', new Map([['CHECKER', 'X:y']]))?.stackSize).toBe(4096);
  });
});
