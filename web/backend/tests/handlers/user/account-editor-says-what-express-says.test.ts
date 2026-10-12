/**
 * The account editor draws what express.e draws - tier-5 invented-text audit,
 * account.handler.ts (thoughts/spot/notes/2026-10-12_tier5-account-handler.md).
 *
 *   editInfo          express.e:21211-21222
 *   displayAccount    express.e:22952-23174
 *   displayAccountActions express.e:23176-23186
 *
 * Each `it` is named after what the sysop saw before the fix.
 */
process.env.SKIP_DB_INIT = '1';
process.env.SKIP_SERVER_START = '1';

jest.mock('../../../src/database', () => ({
  db: { getConfigRepository: () => ({}) },
}));

import { displayAccountPage0, displayAccountPage1, handleEditUserAccount, setDatabase } from '../../../src/handlers/user/account.handler';
import { LoggedOnSubState } from '../../../src/index';

function socketSpy() {
  const out: string[] = [];
  const socket: any = {
    id: `acct-${Math.random().toString(36).slice(2)}`,
    emit: (event: string, payload: unknown) => {
      if (event === 'ansi-output') out.push(String(payload));
      return true;
    },
  };
  return { socket, text: () => out.join('') };
}

const ACCOUNT = {
  username: 'SPOT', realname: 'Johan', location: 'Uprough', phone: '555-1234',
  confAccess: 'XXX', ratio: 3, secLevel: 255, ratioType: 1, autoRejoin: 4, confRJoin: 4,
  uploads: 12, messagesPosted: 34, downloads: 56, newUser: false, calls: 78, callsToday: 0,
  bytesUpload: 1234567, bytesDownload: 7654321, computer: 'AMiGA 1200', byteLimit: 0,
  screenType: '', timeTotal: 3600, topUploadCPS: 1500, topDownloadCPS: 2500,
  timeLimit: 5400, timeUsed: 600, uuCP: true, chatLimit: 1800, chatUsed: 600,
  baud: 57600, forcePwdReset: 1, accountLocked: 0, invalidAttempts: 2, pwdLastUpdated: 0,
};

describe('the account editor (displayAccount)', () => {
  it('drew "Account Editor: Page 1 of 2" and "Slot #7" instead of the status line', () => {
    const { socket, text } = socketSpy();
    displayAccountPage0(socket, ACCOUNT, 7);
    const out = text();
    expect(out).toContain('\x1b[0;0H\x1b[33m  ACTIVE\x1b[0m [7]   \x1b[32mBAUD\x1b[36m:\x1b[0m 57600\r\n');
    expect(out).not.toContain('Account Editor');
    expect(out).not.toContain('Slot #');
  });

  it('a deleted account read ACTIVE', () => {
    const { socket, text } = socketSpy();
    displayAccountPage0(socket, { ...ACCOUNT, accountDeleted: true }, 7);
    expect(text()).toContain('\x1b[0;0H\x1b[37mINACTIVE\x1b[0m [7]');
  });

  it('the account page labels were invented ("Name......:", "Group.....:", "Ratio Type...:") and in the wrong places', () => {
    const { socket, text } = socketSpy();
    displayAccountPage0(socket, ACCOUNT, 7);
    const out = text();
    expect(out).toContain(`\x1b[2;1H\x1b[33mA> \x1b[32mName\x1b[36m:\x1b[0m ${'SPOT'.padEnd(32)} `);
    expect(out).toContain(`\x1b[2;42H\x1b[33mB> \x1b[32mReal Name\x1b[36m:\x1b[0m ${'Johan'.padEnd(25)}`);
    expect(out).toContain(`\x1b[3;1H\x1b[33mC> \x1b[32mLoc.\x1b[36m:\x1b[0m ${'Uprough'.padEnd(29)}`);
    expect(out).toContain('\x1b[3;42H\x1b[33mD> \x1b[32mPass ....\x1b[36m: \x1b[44mENCRYPTED\x1b[0m');
    expect(out).toContain('\x1b[5;1H\x1b[33mG> \x1b[32mRatio .........\x1b[36m:\x1b[0m 3      ');
    expect(out).toContain('\x1b[6;1H\x1b[33mI> \x1b[32mRatio Type ....\x1b[36m:\x1b[0m 1     \x1b[32m<-\x1b[33mB/F\x1b[32m)\x1b[0m ');
    expect(out).toContain('\x1b[6;36H\x1b[33mJ> \x1b[32mAutoReJoin ....\x1b[36m:\x1b[0m 4      ');
    expect(out).toContain('\x1b[6;63H\x1b[33m#\x1b[32mCalls\x1b[36m: \x1b[0m78    ');
    expect(out).toContain('\x1b[8;1H\x1b[33mM> \x1b[32mDownloads .....\x1b[36m:\x1b[0m 56        \r\n');
    expect(out).toContain('\x1b[11;1H\x1b[33mQ> \x1b[32mByte Limit ....\x1b[36m:\x1b[0m Infinite  ');
    expect(out).toContain('\x1b[12;1H\x1b[33mR> \x1b[32mTime_Total\x1b[36m:\x1b[0m \x1b[36m[\x1b[0m60      \x1b[36m]\x1b[0m mins    ');
    expect(out).not.toContain('Group.....');
    expect(out).not.toContain('min  ');
  });

  it('Area Name, CPS, UUCP and Chat Used read blank or 0 for every account', () => {
    const { socket, text } = socketSpy();
    displayAccountPage0(socket, ACCOUNT, 7);
    const out = text();
    expect(out).toContain('\x1b[4;36H\x1b[33mF> \x1b[32mArea Name......\x1b[36m:\x1b[0m XXX');
    expect(out).toContain(`\x1b[9;1H\x1b[33mO> \x1b[32mBytes Uled ....\x1b[36m:\x1b[0m ${'1234567'.padEnd(14)}`);
    expect(out).toContain(`\x1b[12;36H\x1b[33mS> \x1b[32mCps UP\x1b[36m:\x1b[0m ${'1500'.padEnd(10)}`);
    expect(out).toContain(`\x1b[12;58H\x1b[33mT> \x1b[32mCps DN\x1b[36m:\x1b[0m ${'2500'.padEnd(10)}`);
    expect(out).toContain('\x1b[33mW> \x1b[32mUUCP\x1b[36m: \x1b[0m1  ');
    expect(out).toContain(' \x1b[33mZ> \x1b[32mChat_Used\x1b[36m:\x1b[0m \x1b[36m[\x1b[0m10      \x1b[36m]\x1b[0m mins    ');
  });

  it('page 2 had no Last Pwd Reset, Pwd Type or Last IP Addr', () => {
    const { socket, text } = socketSpy();
    displayAccountPage1(socket, ACCOUNT, 7);
    const out = text();
    expect(out).toContain('\x1b[3;1H\x1b[33mB> \x1b[32mForce Pwd Reset\x1b[36m:\x1b[0m Yes');
    expect(out).toContain('\x1b[3;36H\x1b[33mC> \x1b[32mAccount Locked \x1b[36m:\x1b[0m No');
    expect(out).toContain('\x1b[4;1H\x1b[33mD> \x1b[32mInvalid Pwd Att\x1b[36m:\x1b[0m 2  ');
    expect(out).toContain('\x1b[4;39H\x1b[32mLast Pwd Reset \x1b[36m:\x1b[0m ');
    expect(out).toContain('\x1b[5;4H\x1b[32mPwd Type ......\x1b[36m:\x1b[0m BCRYPT       ');
    expect(out).toContain('\x1b[5;39H\x1b[32mLast IP Addr ..\x1b[36m:\x1b[0m 0.0.0.0');
    expect(out).not.toContain('Page 2 of 2');
  });

  it('the key lines offered "<SPACE>=Page 2" and "+/-=Next/Prev User" instead of express.e\'s actions', () => {
    const { socket, text } = socketSpy();
    displayAccountPage0(socket, ACCOUNT, 0);
    const out = text();
    expect(out).toContain('\x1b[16;1H\x1b[33mX  \x1b[36m=\x1b[0mEXIT-NOSAVE \x1b[33m~\x1b[36m=\x1b[0mSAVE  \x1b[33m1-8\x1b[36m=\x1b[0mPRESETS  \x1b[33m9\x1b[36m=\x1b[0mRE-ACTIVATE  \x1b[33m<DEL>\x1b[36m=\x1b[0mDELETE  \x1b[33m*\x1b[36m=\x1b[0mUSER NOTES\r\n');
    // Slot 0 has no answers file: fourteen spaces where `?` would be.
    expect(out).toContain('\x1b[33m<TAB>\x1b[36m=\x1b[0mCONT \x1b[33m@\x1b[36m=\x1b[0mCONFERENCE ACCOUNTING \x1b[33m!\x1b[36m=\x1b[0mCREDIT ACCOUNT MAINTENANCE               \r\n');
    expect(out).not.toContain('=Page');
    expect(out).not.toContain('Next/Prev');
  });
});

describe('opening the editor from the message reader (editInfo)', () => {
  it('an account with no database row printed "User not found." and left the reader waiting', async () => {
    setDatabase({ getUserByUsername: async () => null });
    const { socket, text } = socketSpy();
    const done = jest.fn();
    const session: any = { accountEditDone: done, subState: LoggedOnSubState.ACCOUNT_EDITOR_EDIT, tempData: { x: 1 } };
    handleEditUserAccount(socket, session, 'GHOST');
    await new Promise((resolve) => setImmediate(resolve));
    expect(text()).toBe('');
    expect(done).toHaveBeenCalledTimes(1);
    expect(session.accountEditDone).toBeUndefined();
    expect(session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
  });

  it('a failed lookup printed "Error loading user data." and left the reader waiting', async () => {
    setDatabase({ getUserByUsername: async () => { throw new Error('db down'); } });
    const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { socket, text } = socketSpy();
    const done = jest.fn();
    const session: any = { accountEditDone: done };
    handleEditUserAccount(socket, session, 'SPOT');
    await new Promise((resolve) => setImmediate(resolve));
    errors.mockRestore();
    expect(text()).toBe('');
    expect(done).toHaveBeenCalledTimes(1);
  });
});
