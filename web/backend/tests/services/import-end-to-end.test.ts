/**
 * Importing an Amiga BBS, all the way through, into a sandbox.
 *
 * Nothing had ever run this pipeline. It is eleven endpoints and three
 * services, and the first time it was pointed at a real board it produced
 * zero users, three file areas where the board declares one, and node
 * configuration read out of the middle of another tooltype's value.
 *
 * Everything here happens in a temporary directory with its own database.
 * An importer that writes is exactly the thing you do not point at a working
 * board to find out whether it works.
 */

import AdmZip from 'adm-zip';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'amiga-board');

let sandbox: string;
let archive: string;

/**
 * A board archive, from the real user records in the fixture.
 *
 * A .info here is written as plain text, which is a real form this codebase
 * reads and writes; the format owner handles it and a binary icon alike.
 */
function buildArchive(): string {
  const zip = new AdmZip();

  for (const name of ['User.data', 'User.keys', 'user.misc']) {
    zip.addFile(`board/${name}`, fs.readFileSync(path.join(FIXTURE, name)));
  }
  zip.addFile('board/ConfConfig.info', Buffer.from('NCONFS=1\nNAME.1=Lamer Zone\nLOCATION.1=BBS:Conf1/\n'));
  zip.addFile('board/Conf1.info', Buffer.from('NDIRS=1\n'));
  zip.addFile('board/Conf1/Dir1.info', Buffer.from('NAME=Uploads\n'));
  // Dir2 exists on disk and is NOT declared - the board ignores it, and so
  // must the import.
  zip.addFile('board/Conf1/Dir2.info', Buffer.from('NAME=Left over\n'));

  const out = path.join(sandbox, 'board.zip');
  zip.writeZip(out);
  return out;
}

/** The services, wired the way the route wires them, against the sandbox db. */
async function pipeline() {
  const { Database } = require('../../src/database');
  const { ImportTransactionService } = require('../../src/services/import-transaction.service');
  const { AmigaParserService } = require('../../src/services/amiga-parser.service');
  const { ImportValidationService } = require('../../src/services/import-validation.service');
  const { ImportMappingService } = require('../../src/services/import-mapping.service');

  const db = new Database();
  await db.init();

  return {
    db,
    service: new ImportTransactionService(
      db,
      new AmigaParserService(),
      new ImportValidationService(db),
      new ImportMappingService(db),
    ),
  };
}

beforeEach(() => {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'import-e2e-'));
  fs.mkdirSync(path.join(sandbox, 'db'), { recursive: true });
  fs.mkdirSync(path.join(sandbox, 'bbs'), { recursive: true });

  // Everything this test touches lives under the sandbox. Set before the
  // Database module is required, because it reads these at construction.
  process.env.DATABASE_DIR = path.join(sandbox, 'db');
  process.env.DATABASE_FILE = 'sandbox.db';
  process.env.BBS_DATA_DIR = path.join(sandbox, 'bbs');
  jest.resetModules();

  archive = buildArchive();
});

afterEach(() => fs.rmSync(sandbox, { recursive: true, force: true }));

const OPTIONS = {
  userConflictStrategy: 'skip' as const,
  conferenceConflictStrategy: 'skip' as const,
  commandConflictStrategy: 'skip' as const,
  createBackup: false,
  forcePasswordReset: true,
  importUsers: true,
  importConferences: true,
  importCommands: false,
  importConfig: false,
  importBulletins: false,
  importScreens: false,
};

test('a dry run reports what is there and writes nothing', async () => {
  const { db, service } = await pipeline();

  const session = await service.createSession(archive);
  const before = (await db.getUsers()).length;

  const validation = await service.validateSession(session.id);

  expect(validation.valid).toBe(true);
  expect(validation.summary.users).toBe(2);
  expect((await db.getUsers()).length).toBe(before);
});

test('the callers reach the board', async () => {
  const { db, service } = await pipeline();

  const session = await service.createSession(archive);
  await service.validateSession(session.id);
  const result = await service.executeImport(session.id, OPTIONS);

  expect(result.success).toBe(true);
  expect(result.usersImported).toBe(2);

  const names = (await db.getUsers()).map((u: { username: string }) => u.username);
  expect(names).toContain('Xavier Madison');
});

test('an import reports its own failures rather than claiming success', async () => {
  const { service } = await pipeline();

  const session = await service.createSession(archive);
  await service.validateSession(session.id);
  const result = await service.executeImport(session.id, OPTIONS);

  expect(result.errors).toEqual([]);
});

test('executing without validating first is refused', async () => {
  const { service } = await pipeline();

  const session = await service.createSession(archive);

  await expect(service.executeImport(session.id, OPTIONS)).rejects.toThrow(/not validated/i);
});
