/**
 * Global Wall answers in the shape its page reads.
 *
 * Two replies were bare while every caller unwraps `.data`:
 *
 *   GET /globalwall/config    replied the config object itself
 *   GET /globalwall/comments   forwarded the upstream array verbatim
 *
 * The comments list was therefore always empty, with no error - so Edit and
 * Delete were unreachable even though both routes work.
 *
 * The config is worse than empty. GlobalWallPage seeds its form with
 * hardcoded defaults - style 4, "AMI", "42626717772363" - and replaces them
 * in an effect guarded on `configData?.data`, which was never set. So the
 * Settings tab always showed those defaults whatever GWall.cfg held, and
 * pressing Save wrote them over the real style and colour string. Editing one
 * field silently reset the other two. Nothing failed; nothing said so.
 *
 * Same fault as the info editor, which showed zero files for the same reason.
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
import { createGlobalWallRouter } from '../../src/api/globalwall-routes';

describe('the Global Wall response envelope', () => {
  let app: express.Application;

  beforeAll(async () => {
    let attempts = 0;
    while (!(global as any).testDb && attempts < 30) {
      await new Promise((r) => setTimeout(r, 500));
      attempts++;
    }
    app = express();
    app.use(express.json());
    app.use('/api/globalwall', createGlobalWallRouter((global as any).testDb));
  }, 30000);

  it('wraps the configuration the way the settings form unwraps it', async () => {
    const res = await request(app).get('/api/globalwall/config');

    expect(res.status).toBe(200);
    // GlobalWallPage does `if (configData?.data) setConfigFormData(...)`.
    // Without this the form keeps its own defaults and saves them back over
    // whatever GWall.cfg actually holds.
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('data');
    expect(res.body.data).toHaveProperty('style');
    expect(res.body.data).toHaveProperty('mybbsshortcode');
    expect(res.body.data).toHaveProperty('coloursettings');
  });

  it('does not serve the config at the top level, where nothing reads it', async () => {
    const res = await request(app).get('/api/globalwall/config');

    expect((res.body as Record<string, unknown>).style).toBeUndefined();
  });
});
