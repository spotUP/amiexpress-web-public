/**
 * FM's prompts are dispatched from a Map of STATIC methods, and pulling one
 * out of the Map drops its receiver.
 *
 * Reported 2026-09-06: `fm`, then a filename, then Enter answered
 * "[ERROR] Command processing failed". The stack was
 *
 *     TypeError: Cannot read properties of undefined (reading 'parseList')
 *       at handler (file-maintenance.handler.ts:186)
 *       at handleFileMaintInput (file-maintenance-states.ts)
 *
 * `handleFilenameInput` is `FileMaintenanceHandler.handleFilenameInput`, and
 * `FM_HANDLERS.get(subState)` hands back the bare function - so `this` was
 * undefined and `this.parseList(trimmed)` threw. 41 `this.` uses across the
 * class mean every FM step past the first prompt was unreachable.
 *
 * The trap this test exists to avoid: calling `FileMaintenanceHandler.
 * handleFilenameInput(...)` directly passes whether or not the dispatcher is
 * fixed, because that form keeps the receiver. It must go through
 * `handleFileMaintInput`, one character at a time, the way
 * server/socket-handlers.ts feeds it.
 */
process.env.SKIP_DB_INIT = '1';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
/* eslint-disable @typescript-eslint/no-explicit-any */

const out: string[] = [];
const socket: any = {
  id: 's',
  emit: (e: string, p: unknown) => { if (e === 'ansi-output') out.push(String(p)); },
  on: () => socket, off: () => socket, once: () => socket, removeListener: () => socket,
  connected: true, disconnected: false,
};

it('gets a typed filename through FM without losing the handler receiver', async () => {
  const board = fs.mkdtempSync(path.join(os.tmpdir(), 'fm2-board-'));
  const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fm2-db-'));
  process.env.BBS_DATA_DIR = board;
  process.env.BBS_ROOT = board;
  process.env.DATABASE_DIR = dbDir;
  process.env.DATABASE_FILE = 'fm2.db';

  jest.resetModules();
  jest.doMock('../../src/index', () => {
    const states = require('../../src/constants/bbs-states');
    return { BBSState: states.BBSState, LoggedOnSubState: states.LoggedOnSubState, LOCALHOST_IPS: ['127.0.0.1', '::1'] };
  });

  const { initializeData } = require('../../src/server/initialization');
  await initializeData();

  const { getConferenceDir } = require('../../src/utils/file-hold.util');
  for (const conf of [0, 1]) {
    const d = getConferenceDir(conf, board);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'DIR1'), 'TESTFILE.LHA  1024  01-01-26  a test file\n');
    console.log('CONF', conf, '->', d);
  }

  const fm = require('../../src/handlers/file/file-maintenance.handler');
  const states = require('../../src/handlers/command-handler/file-maintenance-states');

  const session: any = {
    user: { id: 1, username: 'sysop', securityFlags: 'T'.repeat(60) },
    currentConf: 0, nodeId: 1, tempData: {},
  };

  await fm.FileMaintenanceHandler.handleFileMaintenanceCommand(socket, session, '');
  console.log('AFTER FM:', JSON.stringify(out.join('')).slice(0, 200), 'SUB:', session.subState);

  for (const ch of ['t', 'e', 's', 't']) {
    await states.handleFileMaintInput(socket, session, ch);
  }
  expect(session.subState).toBe('fm_filename_input');

  // Enter: the step that threw. A bare `handler(...)` call cannot survive it.
  await expect(
    states.handleFileMaintInput(socket, session, '\r')
  ).resolves.toBe(true);

  // Past parseList and into getDirSpan - FM's next prompt.
  expect(session.subState).toBe('fm_dirspan_input');
  expect(out.join('')).toContain('Directories:');
}, 120000);
