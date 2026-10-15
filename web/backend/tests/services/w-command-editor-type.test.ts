/**
 * W's editor setting writes a column that exists.
 *
 * Option 12 did `db.updateUser(id, { editorType })`, and there is no
 * editortype column: fieldToColumn falls back to the lower-cased field name
 * (user-repository.ts:51), so the UPDATE named a column SQLite does not have,
 * threw, and the W command answered "[ERROR] Command processing failed" -
 * reported from the board on 2026-09-01.
 *
 * The setting had never persisted either. `editorType` is a runtime-only
 * number; what is stored is `editor`, holding 'Prompt', 'Line' or 'Full' -
 * the same three the disk record encodes (UserFileManager.editorTypeToInt).
 * The display read the number, so every user was shown PROMPT whatever they
 * had chosen.
 *
 * Driven through the REAL W menu (info-commands.handler, mocked the way
 * tests/handlers/w-menu-settings-doors.test.ts mocks it): what option 12
 * hands db.updateUser, and what row 12 shows for a stored `editor`.
 */
jest.mock('../../src/index', () => {
  const states = require('../../src/constants/bbs-states');
  return { BBSState: states.BBSState, LoggedOnSubState: states.LoggedOnSubState, BBSSession: {} };
});
jest.mock('../../src/handlers/command-handler/dependency-injection', () => ({
  getDoors: () => [],
}));
const mockUpdateUser = jest.fn(async (..._args: unknown[]) => undefined);
jest.mock('../../src/database', () => ({ db: { updateUser: (...a: unknown[]) => mockUpdateUser(...a) } }));
jest.mock('../../src/utils/acs.util', () => ({
  ...jest.requireActual('../../src/utils/acs.util'),
  checkSecurity: () => true,
}));

import { LoggedOnSubState } from '../../src/constants/bbs-states';
import { flushOutput } from '../../src/utils/output.util';
import {
  handleWriteUserParamsCommand,
  handleWOptionSelectInput,
} from '../../src/handlers/commands/info-commands.handler';

let seq = 0;
function driver(user: Record<string, unknown> = {}) {
  const text: string[] = [];
  const session: any = { nodeId: 1, currentConf: 1, tempData: {}, user: { id: 'u12', username: 'SPOT', secLevel: 255, ...user } };
  const socket: any = {
    id: `w12-${seq++}`, session,
    emit(event: string, data: unknown) { if (event === 'ansi-output') text.push(String(data)); return true; },
    on() { return socket; },
  };
  const row12 = () => {
    flushOutput(socket);
    const plain = text.join('').replace(/\x1b\[[0-9;]*m/g, '');
    return plain.split(/\r?\n/).find((l) => /\b12\]/.test(l)) ?? '';
  };
  return { socket, session, row12 };
}

beforeEach(() => mockUpdateUser.mockClear());

describe("the W command's editor setting", () => {
  it('changes the editor field of the account in memory, never a field with no column', async () => {
    const d = driver({ editor: 'Prompt' });
    d.session.subState = LoggedOnSubState.W_OPTION_SELECT;
    await handleWOptionSelectInput(d.socket, d.session, '12');
    // The record's own field: in memory until W is left (express.e:25893).
    expect(d.session.user.editor).toBe('Line');
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('cycles the three editors the record can hold', async () => {
    const d = driver({ editor: 'Prompt' });
    d.session.subState = LoggedOnSubState.W_OPTION_SELECT;
    const written: unknown[] = [];
    for (let i = 0; i < 3; i++) {
      await handleWOptionSelectInput(d.socket, d.session, '12');
      written.push(d.session.user.editor);
    }
    expect(written).toEqual(['Line', 'Full', 'Prompt']);
  });

  it('shows what is stored rather than the runtime number', () => {
    // A stored `editor` with no runtime `editorType` beside it - a fresh login.
    const d = driver({ editor: 'Full', editorType: undefined });
    handleWriteUserParamsCommand(d.socket, d.session);
    expect(d.row12()).toMatch(/EDITOR TYPE\.*\s+FULL/);
  });
});
