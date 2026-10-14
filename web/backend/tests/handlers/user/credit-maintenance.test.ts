/**
 * Credit Maintenance editor (express.e:21884-22042 creditMaintenance()).
 *
 * The account editor's `!` command used to emit "not implemented in web
 * version". This drives the ported editor: the numeric field edits, the
 * tracking toggles, U/R/T, and the ~ save through db.updateUser (which now
 * carries the credit fields, since the DB mirror was wired first).
 */

jest.mock('../../../src/index', () => {
  const states = require('../../../src/constants/bbs-states');
  return { BBSState: states.BBSState, LoggedOnSubState: states.LoggedOnSubState, BBSSession: {} };
});
jest.mock('../../../src/handlers/user/account.handler', () => ({
  displayAccount: jest.fn(),
  displayAccountInfo: jest.fn(),
}));
// Inline jest.fn()s: the account editor's import chain (w-password -> account.service)
// loads the database module while the imports below run, before any outer const exists.
jest.mock('../../../src/database', () => ({ db: { updateUser: jest.fn().mockResolvedValue(undefined), getConferences: jest.fn().mockResolvedValue([]) } }));
// checkSecurity gates entry (ACS_CREDIT_ACCESS); amigafs backs the LockAccounts
// allow-list and the CreditLog append. Both modules are imported at the top of
// the handler, so their mock factories must not reference outer consts (TDZ) -
// declare the jest.fn()s inline and retrieve them through the imports below.
jest.mock('../../../src/utils/acs.util', () => ({ checkSecurity: jest.fn().mockReturnValue(true) }));
jest.mock('../../../src/utils/amigafs', () => ({
  existsSync: jest.fn().mockReturnValue(false),
  readFileSync: jest.fn().mockReturnValue(''),
  appendFileSync: jest.fn(),
}));

import { LoggedOnSubState } from '../../../src/constants/bbs-states';
import { feedInputWaiter } from '../../../src/utils/await-input';
import { displayAccount as displayAccountImport } from '../../../src/handlers/user/account.handler';
import { ACSPermission } from '../../../src/constants/acs-permissions';
import { checkSecurity as checkSecurityImport } from '../../../src/utils/acs.util';
import * as amigafsImport from '../../../src/utils/amigafs';
import {
  displayCreditMaintenance,
  handleCreditMaintenanceInput,
  handleAccountEditInput,
  handleConferenceAccountingInput,
} from '../../../src/handlers/user/account-edit-input.handler';
import * as nodePath from 'path';
import { setBoardRoot } from '../../helpers/board-root';
import { db as mockedDb } from '../../../src/database';

const updateUser = mockedDb.updateUser as jest.Mock;

const checkSecurity = checkSecurityImport as jest.Mock;
const amigafs = {
  existsSync: amigafsImport.existsSync as jest.Mock,
  readFileSync: amigafsImport.readFileSync as jest.Mock,
  appendFileSync: amigafsImport.appendFileSync as jest.Mock,
};

function makeSocket() {
  const output: string[] = [];
  return {
    emit: jest.fn((_event: string, data: any) => output.push(String(data))),
    getOutput: () => output.join(''),
  } as any;
}

function makeSession(userOverrides: any = {}, tempOverrides: any = {}) {
  return {
    subState: LoggedOnSubState.CREDIT_MAINTENANCE_VIEW,
    inputBuffer: '',
    user: { username: 'sysop', secLevel: 255 },
    tempData: {
      accountEditing: true,
      page: 0,
      editingSlot: 3,
      creditEditable: true, // set by the ! entry after checkLockAccounts
      editingUser: {
        id: 'u1', username: 'CreditGuy', slotNumber: 3,
        creditDays: 0, creditAmount: 0, creditStartDate: 0,
        creditTotalToDate: 0, creditTotalDate: 0, creditTracking: 0,
        ...userOverrides,
      },
      ...tempOverrides,
    },
  } as any;
}

/** An exit runs checkChanges as its own pass; let it finish. */
const settle = () => new Promise((r) => setTimeout(r, 0));

/** Feed a string of single-char keys through the handler in order. */
async function type(socket: any, session: any, keys: string[]) {
  for (const k of keys) await handleCreditMaintenanceInput(socket, session, k);
}

beforeEach(() => {
  updateUser.mockClear();
  checkSecurity.mockClear().mockReturnValue(true);
  amigafs.existsSync.mockClear().mockReturnValue(false);
  amigafs.readFileSync.mockClear().mockReturnValue('');
  amigafs.appendFileSync.mockClear();
});

describe('displayCreditMaintenance', () => {
  it('renders the screen with status and the numbered fields', () => {
    const socket = makeSocket();
    displayCreditMaintenance(socket, makeSession({ creditDays: 30 }));
    const out = socket.getOutput();
    expect(out).toContain('ACCOUNT CREDIT MAINTENANCE');
    expect(out).toContain('Days Credited');
    expect(out).toContain('ACTIVE');
    expect(out).toContain('Track Uploads');
  });

  it('shows INACTIVE when creditDays is 0', () => {
    const socket = makeSocket();
    displayCreditMaintenance(socket, makeSession({ creditDays: 0 }));
    expect(socket.getOutput()).toContain('INACTIVE');
  });
});

describe('handleCreditMaintenanceInput', () => {
  it('field 1: buffered digits commit to creditDays on ENTER', async () => {
    const socket = makeSocket();
    const session = makeSession();
    await type(socket, session, ['1', '5', '0', '\r']);
    expect(session.tempData.editingUser.creditDays).toBe(50);
    expect(session.tempData.creditChanges).toBe(true);
  });

  it('field 3 commit also stamps creditTotalDate to now', async () => {
    const socket = makeSocket();
    const session = makeSession();
    await type(socket, session, ['3', '9', '9', '\r']);
    expect(session.tempData.editingUser.creditTotalToDate).toBe(99);
    expect(session.tempData.editingUser.creditTotalDate).toBeGreaterThan(0);
  });

  it('4 toggles the uploads tracking bit (2), 5 toggles downloads (1)', async () => {
    const session = makeSession({ creditTracking: 0 });
    await type(makeSocket(), session, ['4']);
    expect(session.tempData.editingUser.creditTracking).toBe(2);
    await type(makeSocket(), session, ['5']);
    expect(session.tempData.editingUser.creditTracking).toBe(3);
    await type(makeSocket(), session, ['4']);
    expect(session.tempData.editingUser.creditTracking).toBe(1);
  });

  it('U rolls Amount Paid into Amount Paid to Date', async () => {
    const session = makeSession({ creditAmount: 250, creditTotalToDate: 1000 });
    await type(makeSocket(), session, ['U']);
    expect(session.tempData.editingUser.creditTotalToDate).toBe(1250);
    expect(session.tempData.editingUser.creditTotalDate).toBeGreaterThan(0);
  });

  it('R sets the beginning date, T terminates (zeros the days)', async () => {
    const session = makeSession({ creditDays: 30 });
    await type(makeSocket(), session, ['R']);
    expect(session.tempData.editingUser.creditStartDate).toBeGreaterThan(0);
    await type(makeSocket(), session, ['T']);
    expect(session.tempData.editingUser.creditDays).toBe(0);
  });

  it('~ saves via db.updateUser and stamps a start date for a credited-but-unstarted account', async () => {
    const session = makeSession({ creditDays: 30, creditStartDate: 0 });
    await type(makeSocket(), session, ['~']);
    expect(updateUser).toHaveBeenCalledTimes(1);
    expect(updateUser).toHaveBeenCalledWith('u1', session.tempData.editingUser);
    // express.e:22005 - a credited account with no start date gets one now.
    expect(session.tempData.editingUser.creditStartDate).toBeGreaterThan(0);
    expect(session.tempData.creditChanges).toBe(false);
  });

  it('X with unsaved changes asked an invented "Save before exiting?"; express.e asks whether to lose them, and Y leaves unsaved', async () => {
    const socket = makeSocket();
    const session = makeSession();
    await type(socket, session, ['T']); // makes a change
    await handleCreditMaintenanceInput(socket, session, 'X');
    await settle();
    // checkChanges (express.e:21200-21209)
    expect(socket.getOutput()).toContain('You have unsaved changes. Do you wish to lose them (Y/N)? ');
    expect(socket.getOutput()).not.toContain('Save before exiting');
    expect(session.subState).toBe(LoggedOnSubState.CREDIT_MAINTENANCE_VIEW); // still here
    feedInputWaiter(socket, session, 'Y');
    await settle();
    expect(updateUser).not.toHaveBeenCalled();
    expect(session.subState).toBe(LoggedOnSubState.ACCOUNT_EDITOR_EDIT);
  });

  it('TAB with no changes exits straight to the account editor without saving', async () => {
    const session = makeSession();
    await handleCreditMaintenanceInput(makeSocket(), session, '\t');
    await settle();
    expect(updateUser).not.toHaveBeenCalled();
    expect(session.subState).toBe(LoggedOnSubState.ACCOUNT_EDITOR_EDIT);
  });

  it('a locked sysop (LockAccounts) may view and exit but cannot change or save', async () => {
    const session = makeSession({ creditDays: 30 }, { creditEditable: false });
    await handleCreditMaintenanceInput(makeSocket(), session, 'T'); // terminate
    await handleCreditMaintenanceInput(makeSocket(), session, '~'); // save
    expect(session.tempData.editingUser.creditDays).toBe(30); // unchanged
    expect(updateUser).not.toHaveBeenCalled();
    // exit still works
    await handleCreditMaintenanceInput(makeSocket(), session, '\t');
    await settle();
    expect(session.subState).toBe(LoggedOnSubState.ACCOUNT_EDITOR_EDIT);
  });
});

describe('express.e parity gates on the ! entry (handleAccountEditInput)', () => {
  function editSession() {
    return {
      subState: LoggedOnSubState.ACCOUNT_EDITOR_EDIT,
      inputBuffer: '',
      user: { username: 'sysop', secLevel: 255 },
      tempData: {
        accountEditing: true, page: 0, editingSlot: 3,
        editingUser: { id: 'u1', username: 'CreditGuy', slotNumber: 3, creditDays: 0, creditTracking: 0 },
      },
    } as any;
  }

  it('refuses entry without ACS_CREDIT_ACCESS (express.e:21892)', async () => {
    checkSecurity.mockReturnValue(false);
    const socket = makeSocket();
    const session = editSession();
    await handleAccountEditInput(socket, session, '!');
    expect(checkSecurity).toHaveBeenCalledWith(session.user, ACSPermission.CREDIT_ACCESS);
    expect(session.subState).not.toBe(LoggedOnSubState.CREDIT_MAINTENANCE_VIEW);
    // express.e:21893 `RETURN 0`, then editInfo draws the account (21312):
    // no "You do not have credit access." and no press-any-key.
    expect(socket.getOutput().toLowerCase()).not.toContain('credit access');
    expect(displayAccountImport as jest.Mock).toHaveBeenCalled();
  });

  it('enters and computes an editable (unlocked) state when no LockAccounts file exists', async () => {
    checkSecurity.mockReturnValue(true);
    amigafs.existsSync.mockReturnValue(false);
    const session = editSession();
    await handleAccountEditInput(makeSocket(), session, '!');
    expect(session.subState).toBe(LoggedOnSubState.CREDIT_MAINTENANCE_VIEW);
    expect(session.tempData.creditEditable).toBe(true);
  });

  it('LockAccounts present and NOT naming the sysop => not editable (express.e:21156)', async () => {
    checkSecurity.mockReturnValue(true);
    amigafs.existsSync.mockReturnValue(true);
    amigafs.readFileSync.mockReturnValue('someone\nanother\n');
    const session = editSession();
    await handleAccountEditInput(makeSocket(), session, '!');
    expect(session.tempData.creditEditable).toBe(false);
  });

  it('LockAccounts naming the sysop => editable', async () => {
    checkSecurity.mockReturnValue(true);
    amigafs.existsSync.mockReturnValue(true);
    amigafs.readFileSync.mockReturnValue('someone\nSYSOP\nanother\n');
    const session = editSession();
    await handleAccountEditInput(makeSocket(), session, '!');
    expect(session.tempData.creditEditable).toBe(true);
  });
});

describe('CreditLog (express.e:22013-22021)', () => {
  it('appends an active-account line naming DAYS and AMOUNT on save', async () => {
    const session = makeSession({ creditDays: 30, creditAmount: 2500, creditStartDate: 1_700_000_000 });
    await handleCreditMaintenanceInput(makeSocket(), session, '~');
    expect(amigafs.appendFileSync).toHaveBeenCalledTimes(1);
    const [, line] = amigafs.appendFileSync.mock.calls[0];
    expect(line).toContain('CreditGuy');
    expect(line).toContain('DAYS 30');
    expect(line).toContain('AMOUNT 2500');
  });

  it('logs INACTIVATED when the account has zero days', async () => {
    const session = makeSession({ creditDays: 0 });
    await handleCreditMaintenanceInput(makeSocket(), session, '~');
    const [, line] = amigafs.appendFileSync.mock.calls[0];
    expect(line).toContain('CREDIT ACCOUNT INACTIVATED');
  });
});

// express.e:22104 checkLock:=checkLockAccounts(f6), then 22227: G I K M O P L
// and ~ live inside `IF checkLock`. The port gated credit maintenance and the
// editor, not conference accounting - a sysop the list leaves out could edit
// and save every conference's figures.
describe('conference accounting under LockAccounts (express.e:22227)', () => {
  let restoreBoard: () => void;
  beforeEach(() => { restoreBoard = setBoardRoot('/the-board'); });
  afterEach(() => { restoreBoard(); });

  function accountingSession() {
    return {
      subState: LoggedOnSubState.ACCOUNT_EDITOR_EDIT,
      inputBuffer: '',
      user: { username: 'sysop', secLevel: 255 },
      tempData: {
        accountEditing: true, page: 0, editingSlot: 0,
        editingUser: { id: 'u1', username: 'ConfGuy', slotNumber: 0, confRJoin: 1 },
      },
    } as any;
  }

  it('a LockAccounts file that does not name the sysop refuses the edits and the save, silently', async () => {
    amigafs.existsSync.mockReturnValue(true);
    amigafs.readFileSync.mockReturnValue('someone\n');
    const session = accountingSession();
    await handleAccountEditInput(makeSocket(), session, '@');
    // `\sLockAccounts` with cmds.bbsLoc (21161): the board's own directory.
    expect(amigafs.existsSync).toHaveBeenCalledWith(nodePath.join('/the-board', 'LockAccounts'));
    expect(session.subState).toBe(LoggedOnSubState.CONF_ACCOUNTING_VIEW);

    const socket = makeSocket();
    await handleConferenceAccountingInput(socket, session, 'G');
    expect(session.tempData.confAcctFieldEdit).toBeUndefined();
    await handleConferenceAccountingInput(socket, session, '~');
    expect(socket.getOutput()).toBe('');
  });

  it('without a LockAccounts file the sysop edits and saves', async () => {
    amigafs.existsSync.mockReturnValue(false);
    const session = accountingSession();
    await handleAccountEditInput(makeSocket(), session, '@');

    const socket = makeSocket();
    await handleConferenceAccountingInput(socket, session, 'G');
    expect(session.tempData.confAcctFieldEdit).toBe('G');
    session.tempData.confAcctFieldEdit = undefined;
    await handleConferenceAccountingInput(socket, session, '~');
    expect(socket.getOutput()).toContain('\x1b[JSave\r\n');
  });
});
