/**
 * The full-screen editor, as express.e's edit() runs it (10093-10141).
 *
 * With SysCmd FULLEDIT registered, ACS_FULL_EDIT, and a caller whose editor
 * is not Line, edit() asks "FullScreen Editor (y/N)?". Yes: what the caller
 * has so far goes to Node<n>/Work/msg.i, FULLEDIT runs, and whatever it left
 * in Node<n>/Work/msg IS the message - saved at once. Nothing in msg: the
 * caller left without saving. The port had no full-screen editor at all
 * (parity survey, 2026-09-29); the board's is ansi-edit.
 *
 * Driven through promptForMessageBody, the one entry every E, reply and EM
 * path takes, with the EM save (the lightest to observe) at the end.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let registered = true;
let editorWrites: string | null = null;
const seenInclude: Array<string | null> = [];
const runSysCommand = jest.fn(async () => {
  const work = path.join(root, 'Node3', 'Work');
  seenInclude.push(fs.existsSync(path.join(work, 'msg.i')) ? fs.readFileSync(path.join(work, 'msg.i'), 'latin1') : null);
  if (editorWrites !== null) fs.writeFileSync(path.join(work, 'msg'), editorWrites);
  return 0;
});
jest.mock('../../../src/handlers/command-execution.handler', () => ({
  hasSysCommand: (name: string) => registered && name === 'FULLEDIT',
  runSysCommand: (...args: unknown[]) => (runSysCommand as any)(...args),
}));
// What the entry hands back when it is saved (or abandoned, with null): the
// hook a caller outside the board's own E uses (door-edit-file, the reader).
const saved = jest.fn(async (_body: string[] | null) => undefined);

import { config } from '../../../src/config';
import { LoggedOnSubState } from '../../../src/constants/bbs-states';
import { handleFullEditConfirm, promptForMessageBody } from '../../../src/handlers/message/message-entry.handler';
import { flushOutput } from '../../../src/utils/output.util';

let root: string;
let spy: jest.SpyInstance;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'fulledit-'));
  const original = config.get.bind(config);
  spy = jest.spyOn(config, 'get').mockImplementation((key: string) => (key === 'dataDir' ? root : original(key as never)));
  registered = true;
  editorWrites = null;
  seenInclude.length = 0;
  runSysCommand.mockClear();
  saved.mockClear();
});

afterEach(() => {
  spy.mockRestore();
  fs.rmSync(root, { recursive: true, force: true });
});

function aCaller(editorType: number) {
  const out: string[] = [];
  const socket: any = {
    id: `fulledit-${Math.random()}`,
    emit: (event: string, payload: unknown) => { if (event === 'ansi-output') out.push(String(payload)); return true; },
    on: () => socket,
  };
  const session: any = {
    nodeId: 3,
    currentConf: 1,
    user: { id: 1, username: 'writer', secLevel: 20, securityFlags: 'T'.repeat(100), editorType },
    tempData: {
      messageEntry: { body: ['> the quoted line'], finishOutside: saved },
    },
  };
  return { socket, session, said: () => { flushOutput(socket); return out.join(''); } };
}

describe('the full-screen editor (express.e edit() 10093-10141)', () => {
  test('asks, hands the editor the quote, and saves what it wrote', async () => {
    const c = aCaller(0);
    editorWrites = 'my new text\r\nsecond line\r\n\r\n';
    await promptForMessageBody(c.socket, c.session);
    expect(c.said()).toContain('FullScreen Editor');
    expect(c.session.subState).toBe(LoggedOnSubState.POST_MESSAGE_FULLEDIT_CONFIRM);

    await handleFullEditConfirm(c.socket, c.session, 'y');
    expect(runSysCommand).toHaveBeenCalledWith(c.socket, c.session, 'FULLEDIT', '');
    expect(seenInclude).toEqual(['> the quoted line\n']);
    expect(saved).toHaveBeenCalledWith(['my new text', 'second line']);
    expect(fs.existsSync(path.join(root, 'Node3', 'Work', 'msg'))).toBe(false);
  });

  test('a caller who chose the full-screen editor (2) is not asked', async () => {
    const c = aCaller(2);
    editorWrites = 'straight in';
    await promptForMessageBody(c.socket, c.session);
    expect(c.said()).not.toContain('FullScreen Editor');
    expect(saved).toHaveBeenCalledWith(['straight in']);
  });

  test('leaving the editor without saving abandons the message', async () => {
    const c = aCaller(2);
    editorWrites = null;
    // The board's own E: nothing outside is waiting for the body.
    delete c.session.tempData.messageEntry.finishOutside;
    await promptForMessageBody(c.socket, c.session);
    expect(saved).not.toHaveBeenCalled();
    expect(c.session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
  });

  test('No, a Line-editor caller, or no FULLEDIT on the board: the line editor', async () => {
    const no = aCaller(0);
    await promptForMessageBody(no.socket, no.session);
    await handleFullEditConfirm(no.socket, no.session, '\r');
    expect(no.said()).toContain('Enter your text.');

    const line = aCaller(1);
    await promptForMessageBody(line.socket, line.session);
    expect(line.said()).not.toContain('FullScreen Editor');
    expect(line.said()).toContain('Enter your text.');

    registered = false;
    const none = aCaller(0);
    await promptForMessageBody(none.socket, none.session);
    expect(none.said()).toContain('Enter your text.');
    expect(runSysCommand).not.toHaveBeenCalled();
  });
});
