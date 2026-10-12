/**
 * The account editor asked "You have unsaved changes. Save before exiting?
 * (Y/N)" and nothing read the answer: the next key went to the editor as a
 * command, so a caller with changes could not leave by TAB, + or -.
 *
 * express.e checkChanges (21200-21209): 'You have unsaved changes. Do you wish
 * to lose them (Y/N)? ', one key, the line erased, and only Y goes on.
 */
process.env.SKIP_DB_INIT = '1';

import { handleCommand } from '../../src/handlers/command.handler';
import { handleAccountEditInput, handleConferenceAccountingInput } from '../../src/handlers/user/account-edit-input.handler';
import { BBSState, LoggedOnSubState } from '../../src/index';

function editing() {
  const out: string[] = [];
  const socket: any = { id: `acct-${Math.random()}`, emit: (_e: string, t: any) => out.push(String(t)), on() {}, off() {}, removeListener() {} };
  const session: any = {
    state: BBSState.LOGGEDON,
    subState: LoggedOnSubState.ACCOUNT_EDITOR_EDIT,
    nodeId: 1,
    user: { id: 1, username: 'sysop', secLevel: 255 },
    tempData: { accountEditing: true, editingUser: { username: 'bob' }, editingSlot: 2, page: 0, changes: true },
  };
  const settle = () => new Promise((r) => setTimeout(r, 30));
  // An editor command, as the ACCOUNT_EDITOR_EDIT branch hands it over...
  const command = async (k: string) => { await handleAccountEditInput(socket, session, k); await settle(); };
  // ...and the answer to its question, which comes in through handleCommand.
  const type = async (k: string) => { await handleCommand(socket, session, k); await settle(); };
  return { out, session, command, type };
}

describe('leaving the account editor with unsaved changes', () => {
  it('asks express.e\'s question, stays on N, and leaves on Y', async () => {
    const e = editing();
    let returned = false;
    e.session.accountEditDone = () => { returned = true; };

    await e.command('\t');
    expect(e.out.join('')).toContain('You have unsaved changes. Do you wish to lose them (Y/N)? ');
    await e.type('n');
    expect(e.session.subState).toBe(LoggedOnSubState.ACCOUNT_EDITOR_EDIT);
    expect(returned).toBe(false);

    await e.command('\t');
    await e.type('y');
    expect(e.session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
    expect(returned).toBe(true);
  });

  it('X with changes asks too, then says No-Save', async () => {
    const e = editing();
    await e.command('X');
    await e.type('Y');
    expect(e.out.join('')).toContain('\x1b[JNo-Save\r\n');
    expect(e.session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
  });

  it('conference accounting asked an invented "Save before exiting? (Y/N)"; express.e asks checkChanges\' question and N stays', async () => {
    const e = editing();
    e.session.subState = LoggedOnSubState.CONF_ACCOUNTING_VIEW;
    e.session.tempData.confAcctChanges = true;
    await handleConferenceAccountingInput({ emit: (_e: string, t: any) => e.out.push(String(t)) }, e.session, '\t');
    await new Promise((r) => setTimeout(r, 30));
    // express.e:22223 checkChanges (21200-21209)
    expect(e.out.join('')).toContain('You have unsaved changes. Do you wish to lose them (Y/N)? ');
    expect(e.out.join('')).not.toContain('Save before exiting');
    await e.type('n');
    expect(e.session.subState).toBe(LoggedOnSubState.CONF_ACCOUNTING_VIEW);
  });
});
