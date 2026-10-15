/**
 * A message with attached files asks whether to download them, and Y sends
 * them - express.e checkAttachedFile(msgnumb,1) (9746-9800) at the end of
 * displayMessage (8964).
 *
 * The reader printed "Files attached:" and the names, and nothing could fetch
 * them (audit item D5). Driven through handleCommand into the R reader, over a
 * real HeaderFile / body file / A<n> list and F<n> directory on disk; the
 * caller is a browser, so the files leave as the board's `download-file`
 * hand-off.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { config } from '../../src/config';
import { handleCommand } from '../../src/handlers/command.handler';
import { handleReadMessagesFullCommand, setMessagingDependencies } from '../../src/handlers/message/messaging.handler';
import { messageIndexManager, MsgStatus } from '../../src/services/MessageIndexManager';
import { LoggedOnSubState } from '../../src/constants/bbs-states';
import { setConferences } from '../../src/handlers/screen.handler';
import express from 'express';
import request from 'supertest';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'read-attach-'));
const savedData = process.env.BBS_DATA_DIR;
const realGet = config.get.bind(config);
jest.spyOn(config, 'get').mockImplementation(((key: string) => (key === 'dataDir' ? root : realGet(key as any))) as any);

const msgBase = () => path.join(root, 'Conf1', 'MsgBase');

function post(n: number, body: string): void {
  messageIndexManager.appendMessageHeader(1, {
    status: MsgStatus.NORMAL, msgNumb: n, toName: 'ALL', fromName: 'Alice', subject: `m${n}`,
    msgDate: 1_700_000_000 + n, recv: 0, extMsgNum: 0,
  });
  fs.writeFileSync(path.join(msgBase(), String(n)), body, 'latin1');
}

beforeAll(() => {
  process.env.BBS_DATA_DIR = root;
  // The board's access files: this board is the one the reader asks.
  fs.cpSync(path.join(savedData!, 'Access'), path.join(root, 'Access'), { recursive: true });
  messageIndexManager.setBbsRoot(root);
  messageIndexManager.initializeMessageIndex(1);
  fs.writeFileSync(path.join(root, 'song.mod'), 'MOD');
  // 1: named with F - the A<n> list, delete flag first (saveAttachList).
  post(1, 'one\n');
  fs.writeFileSync(path.join(msgBase(), 'A1'), 'N\nBBS:song.mod\n');
  // 2: sent with X - the files sit in F<n>.
  post(2, 'two\n');
  fs.mkdirSync(path.join(msgBase(), 'F2'));
  fs.writeFileSync(path.join(msgBase(), 'F2', 'demo.lha'), 'LHA');
  // 3: nothing attached.
  post(3, 'three\n');
  // 4: its list names a file that is gone.
  post(4, 'four\n');
  fs.writeFileSync(path.join(msgBase(), 'A4'), 'N\nBBS:gone.mod\n');
  setConferences([{ id: 1, name: 'General', description: '', created: new Date(), updated: new Date() }] as any);
  setMessagingDependencies({ db: { updateReadPointer: async () => undefined } });
});

afterAll(() => {
  if (savedData === undefined) delete process.env.BBS_DATA_DIR;
  else process.env.BBS_DATA_DIR = savedData;
  fs.rmSync(root, { recursive: true, force: true });
});

function caller() {
  const out: string[] = [];
  const downloads: any[] = [];
  const socket: any = {
    id: `attach-${Math.random()}`,
    emit: (event: string, payload: any) => {
      if (event === 'download-file') downloads.push(payload);
      else out.push(String(payload));
    },
    on() {}, off() {}, once() {}, removeListener() {},
  };
  const session: any = {
    state: 'loggedon', subState: LoggedOnSubState.READ_COMMAND, nodeId: 1, currentConf: 1, currentMsgBase: 1,
    lastMsgReadConf: 0, screenWidth: 80,
    user: { id: 1, username: 'spot', secLevel: 20, securityFlags: '', userFlags: 0 },
    tempData: {},
  };
  const settle = () => new Promise((r) => setTimeout(r, 40));
  const type = async (text: string) => {
    for (const ch of text) await handleCommand(socket, session, ch);
    await settle();
  };
  const take = () => { const t = out.join(''); out.length = 0; return t; };
  return { socket, session, downloads, type, take, settle };
}

const PROMPT = '...This message has an attached file(s), Download? (y/N/goodbye)? ';

describe('a message with attached files', () => {
  it('asks to download them, and Y sends the file its list names', async () => {
    const c = caller();
    await handleReadMessagesFullCommand(c.socket, c.session, '1');
    await c.settle();
    const shown = c.take();
    expect(shown).toContain('one\r\n');
    expect(shown.endsWith(PROMPT)).toBe(true);
    expect(shown).not.toContain('Files attached');

    await c.type('y');
    const after = c.take();
    expect(after.startsWith('Yes\r\n\r\n')).toBe(true);
    expect(c.downloads).toHaveLength(1);
    expect(c.downloads[0].filename).toBe('song.mod');
    // The browser fetches it through a ticket for exactly that path, once.
    const app = express();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('../../src/server/routes-setup').registerHttpRoutes(app, { emit: () => undefined });
    const got = await request(app).get(c.downloads[0].url).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (d: Buffer) => chunks.push(d));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(got.status).toBe(200);
    expect(got.body.toString()).toBe('MOD');
    expect((await request(app).get(c.downloads[0].url)).status).toBe(404);
    // The reader goes on: `\b\n` (9790), then its prompt.
    expect(after).toContain('\x1b[32mMsg. Options: ');
  });

  it('N takes nothing and says No', async () => {
    const c = caller();
    await handleReadMessagesFullCommand(c.socket, c.session, '1');
    await c.settle();
    c.take();
    await c.type('n');
    expect(c.take().startsWith('No\r\n\r\n')).toBe(true);
    expect(c.downloads).toHaveLength(0);
  });

  it('flags each file in the message\'s F<n> directory as it sends them', async () => {
    const c = caller();
    await handleReadMessagesFullCommand(c.socket, c.session, '2');
    await c.settle();
    expect(c.take().endsWith(PROMPT)).toBe(true);
    await c.type('Y');
    expect(c.take().startsWith('Yes\r\n\r\n\r\nFlagging >:demo.lha\r\n')).toBe(true);
    expect(c.downloads.map((d) => d.filename)).toEqual(['demo.lha']);
  });

  it('G sends them, then counts down to logoff; Enter keeps the caller in the reader', async () => {
    const c = caller();
    await handleReadMessagesFullCommand(c.socket, c.session, '1');
    await c.settle();
    c.take();
    await c.type('g');
    const goodbye = c.take();
    expect(goodbye.startsWith('Goodbye\r\n\r\n')).toBe(true);
    expect(goodbye).toContain('\r\n\x1b[ALast chance!  Auto LOGOFF in 10 SECS.  Abort: (Enter)=yes? ');
    expect(c.downloads).toHaveLength(1);
    await c.type('\r');
    const after = c.take();
    expect(after.startsWith('Yes\r\n\r\n')).toBe(true);
    expect(after).toContain('\x1b[32mMsg. Options: ');
  });

  it('over telnet the reader waits for the transfer and carries on in its own state', async () => {
    const c = caller();
    c.session.connectionType = 'telnet';
    await handleReadMessagesFullCommand(c.socket, c.session, '4');
    await c.settle();
    c.take();
    const before = c.session.subState;
    await c.type('y');
    const after = c.take();
    expect(after).toContain('files not found: gone.mod');
    expect(after).not.toContain('File transfer Completed');
    expect(after).toContain('\x1b[32mMsg. Options: ');
    expect(c.session.subState).toBe(before);
  });

  it('a message with nothing attached asks nothing', async () => {
    const c = caller();
    await handleReadMessagesFullCommand(c.socket, c.session, '3');
    await c.settle();
    expect(c.take()).not.toContain('attached');
  });
});
