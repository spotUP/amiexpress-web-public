/**
 * ACS.MAX_PAGES, which this port read nowhere and enforced nowhere.
 *
 * express.e:28540 sets `pagesAllowed := readToolTypeInt(TOOLTYPE_ACCESS,
 * acsLevel, 'ACS.MAX_PAGES')` once per logon, and internalCommandO()
 * (express.e:25372-25404) spends it:
 *
 *     IF pagesAllowed = 0
 *       IF checkSecurity(ACS_COMMENT_TO_SYSOP) = FALSE THEN RETURN NOT_ALLOWED
 *       RETURN commentToSYSOP()
 *     ENDIF
 *     IF pagesAllowed <> -1 THEN pagesAllowed--
 *     IF checkSecurity(ACS_PAGE_SYSOP) = FALSE THEN RETURN NOT_ALLOWED
 *
 * Three things were wrong at once. Nothing ever read ACS.MAX_PAGES, so
 * `session.pagesAllowed` was permanently undefined. The live O handler did no
 * budget check at all, though its own comment claimed one. And a correct copy
 * of the gate sat in `chat/preference-chat-commands.handler.ts` under the SAME
 * exported name, shadowed by an import one line later in command.handler.ts,
 * so it never ran.
 *
 * Net effect: a caller whose ACS level allowed ZERO pages could page the sysop
 * as often as he liked, and the stats screen's "Sysop Pages Remaining" had
 * nothing behind it.
 */
process.env.SKIP_DB_INIT = '1';

const handlePageSysop = jest.fn(async () => ({ success: true, message: '' }));
jest.mock('../../src/handlers/operator-chat.handler', () => ({ handlePageSysop }));

const handleCommentToSysopCommand = jest.fn();
jest.mock('../../src/handlers/chat/preference-chat-commands.handler', () => ({
  handleCommentToSysopCommand,
}));

const checkSecurity = jest.fn((_user: unknown, _perm: unknown) => true);
jest.mock('../../src/utils/acs.util', () => ({
  ...jest.requireActual('../../src/utils/acs.util'),
  checkSecurity,
}));

jest.mock('../../src/database', () => ({
  db: { getOperatorChatRepository: () => ({}) },
}));

import { ACSPermission } from '../../src/constants/acs-permissions';

function socket() {
  return { emit: jest.fn(), server: {} } as any;
}

function session(pagesAllowed?: number): any {
  return { nodeId: 1, pagesAllowed, user: { username: 'spot', securityLevel: 30 }, tempData: {} };
}

beforeEach(() => {
  jest.clearAllMocks();
  checkSecurity.mockReturnValue(true);
});

describe('the page budget', () => {
  it('sends a caller with no pages left to the comment editor instead', async () => {
    const { handlePageSysopCommand } = require('../../src/handlers/command-handler/page-sysop-command');
    const s = session(0);

    await handlePageSysopCommand(socket(), s, {});

    expect(handleCommentToSysopCommand).toHaveBeenCalledTimes(1);
    expect(handlePageSysop).not.toHaveBeenCalled();
  });

  it('refuses that redirect to a caller who may not comment either', async () => {
    // express.e:25378 - the redirect is itself behind ACS_COMMENT_TO_SYSOP.
    checkSecurity.mockImplementation((_u: unknown, perm: unknown) => perm !== ACSPermission.COMMENT_TO_SYSOP);
    const { handlePageSysopCommand } = require('../../src/handlers/command-handler/page-sysop-command');

    await handlePageSysopCommand(socket(), session(0), {});

    expect(handleCommentToSysopCommand).not.toHaveBeenCalled();
    expect(handlePageSysop).not.toHaveBeenCalled();
  });

  it('spends one page per page', async () => {
    const { handlePageSysopCommand } = require('../../src/handlers/command-handler/page-sysop-command');
    const s = session(3);

    await handlePageSysopCommand(socket(), s, {});

    expect(s.pagesAllowed).toBe(2);
    expect(handlePageSysop).toHaveBeenCalledTimes(1);
  });

  it('never spends an unlimited budget', async () => {
    // -1 is what an absent ACS.MAX_PAGES yields, so this is the default board.
    const { handlePageSysopCommand } = require('../../src/handlers/command-handler/page-sysop-command');
    const s = session(-1);

    await handlePageSysopCommand(socket(), s, {});

    expect(s.pagesAllowed).toBe(-1);
    expect(handlePageSysop).toHaveBeenCalledTimes(1);
  });

  it('still refuses a caller without ACS_PAGE_SYSOP, after the budget', async () => {
    checkSecurity.mockImplementation((_u: unknown, perm: unknown) => perm !== ACSPermission.PAGE_SYSOP);
    const { handlePageSysopCommand } = require('../../src/handlers/command-handler/page-sysop-command');

    await handlePageSysopCommand(socket(), session(3), {});

    expect(handlePageSysop).not.toHaveBeenCalled();
  });
});

describe('reading the budget from the ACS level', () => {
  it('returns -1 for a level that does not set ACS.MAX_PAGES', () => {
    // tooltypes.e:176-181 - readToolTypeInt yields -1 when the key is absent,
    // and every caller reads -1 as "unlimited".
    const { getAcsValueInt, resetAcsLoader } = require('../../src/utils/acs-access-loader');
    resetAcsLoader();

    expect(getAcsValueInt(30, 'ACS.MAX_PAGES')).toBe(-1);
  });

  it('returns -1 for an unknown level rather than zero pages', () => {
    const { getAcsValueInt } = require('../../src/utils/acs-access-loader');

    expect(getAcsValueInt(-1, 'ACS.MAX_PAGES')).toBe(-1);
  });
});
