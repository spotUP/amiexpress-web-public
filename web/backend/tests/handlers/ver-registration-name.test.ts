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

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { config } from '../../src/config';
import { handleVersionCommand } from '../../src/handlers/commands/info-commands.handler';
import { invalidateBoardConfig } from '../../src/services/bbs-config-file.service';
import { applyTooltypes } from '../../src/utils/info-file.util';
import { flushOutput } from '../../src/utils/output.util';

let root = '';
let spy: jest.SpyInstance;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ver-regkey-'));
  const original = config.get.bind(config);
  spy = jest.spyOn(config, 'get').mockImplementation((key: string) => (key === 'dataDir' ? root : original(key as never)));
  invalidateBoardConfig();
});
afterEach(() => {
  spy.mockRestore();
  invalidateBoardConfig();
  fs.rmSync(root, { recursive: true, force: true });
});

/** The board's bbsConfig.info, carrying REGKEY or not. */
function boardWith(regKey?: string): void {
  applyTooltypes(path.join(root, 'bbsConfig.info'), regKey === undefined ? [['BBS_NAME', 'Test']] : [['REGKEY', regKey]]);
  invalidateBoardConfig();
}

function run(): string {
  const wire: string[] = [];
  const socket: any = {
    id: `ver-${Math.random().toString(36).slice(2)}`,
    emit: (event: string, payload?: unknown) => {
      if (event === 'ansi-output' && typeof payload === 'string') wire.push(payload);
      return true;
    },
    on: () => socket,
    once: () => socket,
    off: () => socket,
    removeListener: () => socket,
  };
  handleVersionCommand(socket, { subState: '' } as never);
  flushOutput(socket);
  return wire.join('');
}

describe('the registration line', () => {
  it('prints the board REGKEY when there is one', () => {
    boardWith('Up Rough');
    expect(run()).toContain('Registered to Up Rough.');
  });

  it("keeps this port's own line when the board sets nothing", () => {
    boardWith();
    expect(run()).toContain('Registered to Open Source Community.');
  });

  it('does not fail the command when there is no board file at all', () => {
    const said = run();
    expect(said).toContain('Registered to Open Source Community.');
    // ...and the rest of VER is still there.
    expect(said).toContain('Original Version:');
  });
});
