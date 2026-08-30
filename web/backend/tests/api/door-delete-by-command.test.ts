/**
 * Deleting a door must name the door being deleted.
 *
 * The admin's door list is loaded from disk and numbered by POSITION
 * (`id: index + 1` in config-routes.ts). DELETE /api/config/doors/:id passed
 * that number to configService.deleteDoor(), which looked it up as a `doors`
 * TABLE row and then unlinked THAT row's Commands/BBSCmd/<command>.info.
 *
 * Two unrelated namespaces. Deleting the door at list position N either found
 * nothing, or found an unrelated database row and removed a DIFFERENT door's
 * registration from disk - the same shape as the DD failure, where a door
 * lost its files and kept its name, and the same shape as the DOORMAN
 * incident, where a delete trusted a value nobody had checked.
 *
 * The PUT route was already fixed this way: identify by command, because a
 * command is unique and is the name of the file that defines it. This is the
 * delete half, and it goes through the same manager path DOORMAN uses, which
 * carries the guards earned by that incident - every path resolved and
 * confined to Doors/ or Commands/ before anything is removed.
 *
 * These tests only ever name doors that cannot exist. dataDir defaults to the
 * real BBS root, so a test that named a real command would delete it.
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

import express from 'express';
import request from 'supertest';
import { createConfigRouter } from '../../src/api/config-routes';

/** A command no board has, so nothing on disk can be touched by these. */
const ABSENT = '__NO_SUCH_DOOR_FOR_TESTS__';

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

describe('DELETE /api/config/doors/:command', () => {
  let app: express.Application;

  beforeAll(async () => {
    const db = await waitForTestDb();
    app = express();
    app.use(express.json());
    app.use('/api/config', createConfigRouter(db));
  }, 30000);

  it('refuses a command that has no registration, and names it', async () => {
    const res = await request(app).delete(`/api/config/doors/${ABSENT}`);

    expect(res.status).toBeGreaterThanOrEqual(400);

    const body = JSON.stringify(res.body);
    expect(body).toContain(ABSENT);
    // The old route parsed the segment as an integer, so a command came back
    // as "Door NaN not found" - the door's name never reached the message
    // because the route was never looking at it.
    expect(body).not.toContain('NaN');
  });

  it('treats a bare number as a command name, not as a row to delete', async () => {
    // A list position is not an identity. "1" is what the frontend used to
    // send for the first door on screen; it must now find nothing rather
    // than resolve some unrelated database row and delete its .info.
    const res = await request(app).delete('/api/config/doors/1');

    expect(res.status).toBeGreaterThanOrEqual(400);

    // "1" is a command name now, and no door is called that. The refusal has
    // to come from looking for a REGISTRATION - a .info in Commands/BBSCmd
    // or a directory under Doors/ - which is the only thing that proves the
    // row lookup is gone. The old route answered "Door 1 not found" after
    // asking the database, and would have deleted a real door's .info had a
    // row happened to carry that id.
    expect(JSON.stringify(res.body)).toMatch(/registration/i);
  });
});
