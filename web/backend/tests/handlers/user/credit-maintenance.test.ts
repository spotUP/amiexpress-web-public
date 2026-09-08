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
  displayAccountPage0: jest.fn(),
  displayAccountPage1: jest.fn(),
}));
const updateUser = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../src/database', () => ({ db: { updateUser } }));

import { LoggedOnSubState } from '../../../src/constants/bbs-states';
import {
  displayCreditMaintenance,
  handleCreditMaintenanceInput,
} from '../../../src/handlers/user/account-edit-input.handler';

function makeSocket() {
  const output: string[] = [];
  return {
    emit: jest.fn((_event: string, data: any) => output.push(String(data))),
    getOutput: () => output.join(''),
  } as any;
}

function makeSession(userOverrides: any = {}) {
  return {
    subState: LoggedOnSubState.CREDIT_MAINTENANCE_VIEW,
    inputBuffer: '',
    tempData: {
      accountEditing: true,
      page: 0,
      editingSlot: 3,
      editingUser: {
        id: 'u1', username: 'CreditGuy', slotNumber: 3,
        creditDays: 0, creditAmount: 0, creditStartDate: 0,
        creditTotalToDate: 0, creditTotalDate: 0, creditTracking: 0,
        ...userOverrides,
      },
    },
  } as any;
}

/** Feed a string of single-char keys through the handler in order. */
async function type(socket: any, session: any, keys: string[]) {
  for (const k of keys) await handleCreditMaintenanceInput(socket, session, k);
}

beforeEach(() => updateUser.mockClear());

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

  it('X with unsaved changes prompts, then Y saves and returns to the account editor', async () => {
    const socket = makeSocket();
    const session = makeSession();
    await type(socket, session, ['T']); // makes a change
    await handleCreditMaintenanceInput(socket, session, 'X');
    expect(socket.getOutput()).toContain('Save before exiting');
    expect(session.subState).toBe(LoggedOnSubState.CREDIT_MAINTENANCE_VIEW); // still here
    await handleCreditMaintenanceInput(socket, session, 'Y');
    expect(updateUser).toHaveBeenCalledTimes(1);
    expect(session.subState).toBe(LoggedOnSubState.ACCOUNT_EDITOR_EDIT);
  });

  it('TAB with no changes exits straight to the account editor without saving', async () => {
    const session = makeSession();
    await handleCreditMaintenanceInput(makeSocket(), session, '\t');
    expect(updateUser).not.toHaveBeenCalled();
    expect(session.subState).toBe(LoggedOnSubState.ACCOUNT_EDITOR_EDIT);
  });
});
