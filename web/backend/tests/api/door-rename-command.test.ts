/**
 * Renaming a door's command has to move its registration.
 *
 * A command IS its file: `Commands/BBSCmd/REQ.info` is what makes REQ a
 * command. The update route looked the door up by the value in the admin's
 * Command box, so the moment a sysop typed a NEW name there the save went
 * looking for a door that does not exist yet and refused - the sysop renamed
 * REQUESTS to REQ, pressed save, and nothing happened on the board. Worse, a
 * new name that happened to match another door's file would have edited THAT
 * door's registration.
 *
 * The door is identified by the command the dialog opened on
 * (`original_command`); the Command box is the new name, and a change to it is
 * a file move plus the BBSCMD tooltype, which wins over the file name when a
 * door carries one.
 *
 * Every test runs against a board root of its own - dataDir defaults to the
 * sysop's real BBS root, where a rename would move a live command.
 */

jest.mock('../../src/services/UserFileManager', () => ({
  userFileManager: { writeUserFiles: jest.fn(), updateUserDataFile: jest.fn() }
}));
jest.mock('../../src/services/UserDatabaseManager', () => ({
  userDatabaseManager: {
    getUserCount: jest.fn().mockReturnValue(0),
    userToStruct: jest.fn().mockReturnValue({ slotNumber: 0 }),
    userToKeys: jest.fn().mockReturnValue({}),
    userToMisc: jest.fn().mockReturnValue({}),
    appendUser: jest.fn(),
  }
}));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import express from 'express';
import request from 'supertest';
import { createConfigRouter } from '../../src/api/config-routes';
import { config } from '../../src/config';

async function waitForTestDb(): Promise<any> {
  let attempts = 0;
  while (!(global as any).testDb && attempts < 30) {
    await new Promise(r => setTimeout(r, 500));
    attempts++;
  }
  const db = (global as any).testDb;
  if (!db) throw new Error('Test database not initialized');
  return db;
}

/** A door's registration, in the plain-text shape this board's .info files use. */
function writeRegistration(dir: string, command: string, extra: string[] = []): string {
  const file = path.join(dir, `${command}.info`);
  fs.writeFileSync(file, [
    `BBSCMD=${command}`,
    `NAME=${command} door`,
    'TYPE=XIM',
    `LOCATION=Doors/${command}/${command.toLowerCase()}`,
    'ACCESS=1',
    ...extra,
  ].join('\n') + '\n');
  return file;
}

describe('PUT /api/config/doors/:id - renaming a command', () => {
  let app: express.Application;
  let boardRoot: string;
  let cmdDir: string;

  beforeAll(async () => {
    const db = await waitForTestDb();
    app = express();
    app.use(express.json());
    app.use('/api/config', createConfigRouter(db));
  }, 30000);

  beforeEach(() => {
    boardRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'door-rename-'));
    cmdDir = path.join(boardRoot, 'Commands', 'BBSCmd');
    fs.mkdirSync(cmdDir, { recursive: true });

    const real = config.get.bind(config);
    jest.spyOn(config, 'get').mockImplementation((key: any) =>
      key === 'dataDir' ? boardRoot : real(key)
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(boardRoot, { recursive: true, force: true });
  });

  it('moves the registration to the new name and takes the old one away', async () => {
    writeRegistration(cmdDir, 'RENAMEME');

    const res = await request(app).put('/api/config/doors/1').send({
      original_command: 'RENAMEME',
      door_command: 'RENAMED',
      door_name: 'RENAMEME door',
    });

    expect(res.status).toBeLessThan(400);
    expect(fs.existsSync(path.join(cmdDir, 'RENAMED.info'))).toBe(true);
    expect(fs.existsSync(path.join(cmdDir, 'RENAMEME.info'))).toBe(false);
  });

  it('renames the BBSCMD tooltype too, because it beats the file name', async () => {
    writeRegistration(cmdDir, 'RENAMEME');

    await request(app).put('/api/config/doors/1').send({
      original_command: 'RENAMEME',
      door_command: 'RENAMED',
    });

    const written = fs.readFileSync(path.join(cmdDir, 'RENAMED.info'), 'utf8');

    // amiga-command-parser.util.ts asks the tooltype before the file name; a
    // file called RENAMED.info that still says BBSCMD=RENAMEME is registered
    // under the OLD command, which is the whole bug wearing a new name.
    expect(written).toContain('BBSCMD=RENAMED');
    expect(written).not.toContain('BBSCMD=RENAMEME');
  });

  it('refuses a name another door already answers to, and touches neither', async () => {
    writeRegistration(cmdDir, 'RENAMEME');
    writeRegistration(cmdDir, 'TAKEN');
    const takenBefore = fs.readFileSync(path.join(cmdDir, 'TAKEN.info'), 'utf8');

    const res = await request(app).put('/api/config/doors/1').send({
      original_command: 'RENAMEME',
      door_command: 'TAKEN',
      door_name: 'RENAMEME door',
    });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(res.body)).toContain('TAKEN');
    expect(fs.existsSync(path.join(cmdDir, 'RENAMEME.info'))).toBe(true);
    expect(fs.readFileSync(path.join(cmdDir, 'TAKEN.info'), 'utf8')).toBe(takenBefore);
  });

  it('refuses a command that would leave Commands/BBSCmd', async () => {
    writeRegistration(cmdDir, 'RENAMEME');

    const res = await request(app).put('/api/config/doors/1').send({
      original_command: 'RENAMEME',
      door_command: '../../escaped',
    });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(fs.existsSync(path.join(cmdDir, 'RENAMEME.info'))).toBe(true);
    expect(fs.existsSync(path.join(boardRoot, 'escaped.info'))).toBe(false);
  });

  it('still saves a door whose command did not change', async () => {
    writeRegistration(cmdDir, 'STAYS');

    const res = await request(app).put('/api/config/doors/1').send({
      original_command: 'STAYS',
      door_command: 'STAYS',
      min_security_level: 42,
    });

    expect(res.status).toBeLessThan(400);
    expect(fs.readFileSync(path.join(cmdDir, 'STAYS.info'), 'utf8')).toContain('ACCESS=42');
  });

  it('names the door the sysop opened when its registration is missing', async () => {
    const res = await request(app).put('/api/config/doors/1').send({
      original_command: 'NOT_A_DOOR_ON_THIS_BOARD',
      door_command: 'STILL_NOT',
    });

    expect(res.status).toBeGreaterThanOrEqual(400);
    // The old route reported the NEW name as the missing one, which is what
    // made a rename look like a door that had vanished.
    expect(JSON.stringify(res.body)).toContain('NOT_A_DOOR_ON_THIS_BOARD');
  });
});
