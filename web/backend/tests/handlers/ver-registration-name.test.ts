/**
 * `VER` says who the board is registered to, and the sysop decides who.
 *
 * P3-4, setup-tool row. `REGKEY` (express.e:31991) is what express prints at
 * :25696 - `Registered to <regKey>.` - and in its connect banner at :29516.
 * This port had the sentence with the name welded into it, so the tooltype the
 * setup tool writes did nothing.
 *
 * express falls back to `NONE`, which means an unregistered shareware copy.
 * That is not a thing here, so the fallback is the line this port has always
 * printed - a board that sets nothing sees no change at all.
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/services/bbs-config-file.service', () => ({
  ...jest.requireActual('../../src/services/bbs-config-file.service'),
  getBoardConfig: jest.fn(() => ({})),
}));

import { handleVersionCommand } from '../../src/handlers/commands/info-commands.handler';
import { getBoardConfig } from '../../src/services/bbs-config-file.service';
import { flushOutput } from '../../src/utils/output.util';

const board = getBoardConfig as unknown as jest.Mock;

function run(): string {
  const wire: string[] = [];
  const socket: any = {
    id: `ver-${Math.random().toString(36).slice(2)}`,
    emit: (event: string, payload?: unknown) => {
      if (event === 'ansi-output' && typeof payload === 'string') wire.push(payload);
      return true;
    },
    // The output buffer registers a disconnect listener on whatever it is
    // handed; a socket without `on` throws before a byte is written.
    on: () => socket,
    once: () => socket,
    off: () => socket,
    removeListener: () => socket,
  };
  handleVersionCommand(socket, { subState: '' } as never);
  flushOutput(socket);
  return wire.join('');
}

beforeEach(() => board.mockReturnValue({}));
afterEach(() => jest.clearAllMocks());

describe('the registration line', () => {
  it('prints the board REGKEY when there is one', () => {
    board.mockReturnValue({ reg_key: 'Up Rough' });

    expect(run()).toContain('Registered to Up Rough.');
  });

  it("keeps this port's own line when the board sets nothing", () => {
    expect(run()).toContain('Registered to Open Source Community.');
  });

  it('ignores whitespace left in the tooltype', () => {
    board.mockReturnValue({ reg_key: '   ' });

    expect(run()).toContain('Registered to Open Source Community.');
  });

  it('does not fail the command when the board file cannot be read', () => {
    board.mockImplementation(() => { throw new Error('no bbsConfig.info'); });

    const said = run();
    expect(said).toContain('Registered to Open Source Community.');
    // ...and the rest of VER is still there.
    expect(said).toContain('Original Version:');
  });
});
