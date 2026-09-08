/**
 * Whether a stranger may open an account, and where that answer comes from.
 *
 * P2-13. The audit called the new-account policy "missing entirely - no code
 * anywhere"; what was actually there was all three gates and the wrong source
 * for two of them. `NoNewUsers` and `NoNewAtBaud` worked, but the new-user
 * password and the auto-validation password were read from ENVIRONMENT
 * VARIABLES and nowhere else - so `NEWUSER_PASSWORD` in `bbsConfig.info`, the
 * only place express looks (ACP.e:2632 -> `cmds.newUserPw` -> express.e:30013),
 * did nothing, and a sysop who had closed his board to applications through
 * the icon had an open board.
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/services/bbs-config-file.service', () => ({
  getBoardConfig: jest.fn(() => ({})),
}));
jest.mock('../../src/utils/node-tooltypes.util', () => ({
  nodeTooltype: jest.fn(() => undefined),
  nodeFlag: jest.fn(() => false),
}));

import {
  autoValidationPassword,
  newUserAccessPassword,
  newUserPolicy,
} from '../../src/services/new-user-policy.service';
import { getBoardConfig } from '../../src/services/bbs-config-file.service';
import { nodeTooltype } from '../../src/utils/node-tooltypes.util';
import { config } from '../../src/config';

const board = getBoardConfig as unknown as jest.Mock;
const tooltype = nodeTooltype as unknown as jest.Mock;
const realGet = config.get.bind(config);

/** `config.get`, with the two environment-backed keys under our control. */
function withEnv(values: Record<string, string>) {
  jest.spyOn(config, 'get').mockImplementation((key: never) => {
    const name = key as unknown as string;
    if (name in values) return values[name] as never;
    if (name === 'dataDir') return '/nowhere' as never;
    return realGet(key);
  });
}

beforeEach(() => {
  board.mockReturnValue({});
  tooltype.mockReturnValue(undefined);
  withEnv({ newUserPassword: '', autoValidationPassword: '' });
});

afterEach(() => jest.restoreAllMocks());

describe('the new-user password', () => {
  it('comes from bbsConfig.info, which is where express reads it', () => {
    board.mockReturnValue({ new_user_password: 'INVITE-ONLY' });

    expect(newUserAccessPassword()).toBe('INVITE-ONLY');
    expect(newUserPolicy()).toBe('by-application');
  });

  it('beats the environment variable this port used to read', () => {
    board.mockReturnValue({ new_user_password: 'FROM-THE-ICON' });
    withEnv({ newUserPassword: 'FROM-THE-ENV', autoValidationPassword: '' });

    expect(newUserAccessPassword()).toBe('FROM-THE-ICON');
  });

  it('falls back to the environment variable, so a board set up that way keeps its gate', () => {
    withEnv({ newUserPassword: 'FROM-THE-ENV', autoValidationPassword: '' });

    expect(newUserAccessPassword()).toBe('FROM-THE-ENV');
    expect(newUserPolicy()).toBe('by-application');
  });

  it('is empty on an open board, and says so', () => {
    expect(newUserAccessPassword()).toBe('');
    expect(newUserPolicy()).toBe('open');
  });

  it('ignores whitespace a sysop leaves in the tooltype', () => {
    board.mockReturnValue({ new_user_password: '   ' });

    expect(newUserAccessPassword()).toBe('');
    expect(newUserPolicy()).toBe('open');
  });
});

describe('the auto-validation password', () => {
  it("takes the NODE's icon first - express.e:30062", () => {
    tooltype.mockImplementation((_node: number, key: string) =>
      key === 'AUTOVAL_PASSWORD' ? 'NODE-ONE' : undefined);
    board.mockReturnValue({ autoval_password: 'BOARD-WIDE' });

    expect(autoValidationPassword(1)).toBe('NODE-ONE');
  });

  it("falls to the board's icon when the node has none - express.e:30063", () => {
    board.mockReturnValue({ autoval_password: 'BOARD-WIDE' });

    expect(autoValidationPassword(1)).toBe('BOARD-WIDE');
  });

  it('falls to the environment variable last', () => {
    withEnv({ newUserPassword: '', autoValidationPassword: 'FROM-THE-ENV' });

    expect(autoValidationPassword(1)).toBe('FROM-THE-ENV');
  });

  it('answers empty when nothing is set anywhere', () => {
    expect(autoValidationPassword(1)).toBe('');
  });
});

describe('a board whose config cannot be read', () => {
  it('keeps whatever the environment gave it rather than throwing', () => {
    board.mockImplementation(() => { throw new Error('bbsConfig.info is unreadable'); });
    withEnv({ newUserPassword: 'FROM-THE-ENV', autoValidationPassword: '' });

    expect(newUserAccessPassword()).toBe('FROM-THE-ENV');
  });
});
