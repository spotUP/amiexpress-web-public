/**
 * ZOOM puts another caller's private mail in nobody's packet - express.e
 * qwkZoomConf (26650-26651): a message goes in when it is to the caller,
 * from the caller, public, or the caller has ACS_SYSOP_READ; and only when it
 * is unreceived and not deleted.
 *
 * The packet was built from the SQL messages mirror with no private-mail
 * rule, so Bob's private mail to Carol went into anyone's QWK packet. Typed
 * as ZOOM through handleCommand, over a real HeaderFile, MailStats and body
 * files on disk; the caller is a browser, so the packet leaves through a
 * one-fetch download ticket, and is read back from what that ticket serves.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import express from 'express';
import request from 'supertest';

import { config } from '../../src/config';
import { handleCommand } from '../../src/handlers/command.handler';
import { messageIndexManager, MsgStatus } from '../../src/services/MessageIndexManager';
import { LoggedOnSubState } from '../../src/constants/bbs-states';
import { ACSPermission } from '../../src/constants/acs-permissions';
import { setConferences } from '../../src/handlers/screen.handler';

// The caller's read pointers and Zoom flag (conf_base). Everything else in
// the module is the real one.
jest.mock('../../src/utils/message-pointers.util', () => {
  const actual = jest.requireActual('../../src/utils/message-pointers.util');
  const mockRead = new Map<string, number>();
  return {
    ...actual,
    mockRead,
    getConferenceScanFlags: async () => 2, // ZOOM_SCAN_MASK
    loadMsgPointers: async (userId: string, conferenceId: number, messageBaseId: number) => ({
      userId, conferenceId, messageBaseId, lastNewReadConf: 0,
      lastMsgReadConf: mockRead.get(`${userId}:${conferenceId}`) ?? 0,
      scanFlags: 2, messagesPosted: 0, newSinceDate: new Date(0),
      bytesDownload: 0, bytesUpload: 0, upload: 0, downloads: 0,
    }),
    updateReadPointer: async (userId: string, conferenceId: number, _b: number, msgNum: number) => {
      const key = `${userId}:${conferenceId}`;
      mockRead.set(key, Math.max(mockRead.get(key) ?? 0, msgNum));
    },
  };
});

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zoom-private-'));
const savedData = process.env.BBS_DATA_DIR;
const realGet = config.get.bind(config);
jest.spyOn(config, 'get').mockImplementation(((key: string) => (key === 'dataDir' ? root : realGet(key as any))) as any);

const msgBase = () => path.join(root, 'Conf1', 'MsgBase');

function post(n: number, status: number, fromName: string, toName: string, subject: string, recv = 0): void {
  messageIndexManager.appendMessageHeader(1, {
    status, msgNumb: n, toName, fromName, subject, msgDate: 1_700_000_000 + n, recv, extMsgNum: 0,
  });
  fs.writeFileSync(path.join(msgBase(), String(n)), `body of ${subject}\n`, 'latin1');
}

beforeAll(() => {
  process.env.BBS_DATA_DIR = root;
  messageIndexManager.setBbsRoot(root);
  messageIndexManager.initializeMessageIndex(1);
  post(1, MsgStatus.NORMAL, 'Alice', 'ALL', 'pub-hello');
  post(2, MsgStatus.PRIVATE, 'Bob', 'Carol', 'secret-bob-carol');
  post(3, MsgStatus.PRIVATE, 'Dave', 'spot', 'private-to-spot');
  post(4, MsgStatus.PRIVATE, 'spot', 'Erin', 'private-from-spot');
  post(5, MsgStatus.DELETED, 'Alice', 'ALL', 'deleted-one');
  setConferences([{ id: 1, name: 'General', description: '', created: new Date(), updated: new Date() }] as any);
});

afterAll(() => {
  if (savedData === undefined) delete process.env.BBS_DATA_DIR;
  else process.env.BBS_DATA_DIR = savedData;
  fs.rmSync(root, { recursive: true, force: true });
});

/** ZOOM_MAIL yes, SYSOP_READ no - an ordinary caller. */
function flags(): string {
  const f = Array(64).fill('?');
  f[ACSPermission.ZOOM_MAIL] = 'T';
  f[ACSPermission.SYSOP_READ] = 'F';
  return f.join('');
}

describe('ZOOM', () => {
  it("packs the caller's own private mail and not other callers' private mail", async () => {
    const out: string[] = [];
    const downloads: any[] = [];
    const socket: any = {
      id: `zoom-${Math.random()}`,
      emit: (event: string, payload: any) => {
        if (event === 'download-file') downloads.push(payload);
        else out.push(String(payload));
      },
      on() {}, off() {}, once() {}, removeListener() {},
    };
    const session: any = {
      state: 'loggedon', subState: LoggedOnSubState.READ_COMMAND, nodeId: 1, currentConf: 1, currentMsgBase: 1,
      lastMsgReadConf: 0, screenWidth: 80, commandHistory: [], historyIndex: 0, historyCycle: 0,
      user: {
        id: 7, username: 'spot', slotNumber: 7, secLevel: 20, securityFlags: flags(), userFlags: 0,
        confAccess: 'X',
      },
      tempData: {},
    };
    for (const ch of 'ZOOM') await handleCommand(socket, session, ch);
    // ZOOM then waits on its own prompts (express.e 26244-26333): the pack
    // method and the pause before the transfer. The command's dispatch is
    // still running while they are answered.
    const zoom = handleCommand(socket, session, '\r');
    const settle = () => new Promise((r) => setTimeout(r, 60));
    await settle();
    for (const ch of ['2', '\r', ' ']) { await handleCommand(socket, session, ch); await settle(); }
    await zoom;

    expect(out.join('')).toContain('Zooming Conference');
    expect(downloads).toHaveLength(1);
    expect(downloads[0].filename).toBe('AE0007.QWK');

    const app = express();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('../../src/server/routes-setup').registerHttpRoutes(app, { emit: () => undefined });
    const got = await request(app).get(downloads[0].url).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (d: Buffer) => chunks.push(d));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(got.status).toBe(200);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const AdmZip = require('adm-zip');
    const messages = new AdmZip(got.body).readFile('MESSAGES.DAT').toString('latin1');

    expect(messages).not.toContain('secret-bob-carol');
    expect(messages).toContain('private-to-spot');
    expect(messages).toContain('private-from-spot');
    expect(messages).toContain('pub-hello');
    expect(messages).not.toContain('deleted-one');
    // The ticket serves this packet once, to the caller it was issued to.
    expect((await request(app).get(downloads[0].url)).status).toBe(404);
    // lastMsgReadConf:=msgNum (26725): past the last message.
    expect(session.lastMsgReadConf).toBe(6);
  });
});
