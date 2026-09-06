/**
 * The info editor answers in the shape its callers read.
 *
 * "Configuration Files has never shown any files." It never could: the route
 * replied `{ files }` while every caller types the result as ApiResponse and
 * reads `data.files`, so the list was always undefined and the page always
 * said "Showing 0 files".
 *
 * The same mismatch ran through the whole router - `/file` replied with the
 * metadata object itself while SystemFilesPage and DoorsPage both read
 * `response.data.tooltypes` - so the tooltype editor behind Configuration
 * Files AND the one behind a door's Edit .info were equally empty. Four
 * endpoints, one shape, nothing between them and the pages that call them.
 *
 * This is the same fault as the rest of the admin, one layer lower: the
 * server serves something its own client cannot read. It is invisible for
 * exactly the same reason - both halves work, on shapes that never meet.
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

import fs from 'fs';
import os from 'os';
import path from 'path';

import express from 'express';
import request from 'supertest';
import { config } from '../../src/config';
import { infoEditorRouter } from '../../src/api/info-editor-routes';

describe('the info editor response envelope', () => {
  let app: express.Application;
  let boardRoot: string;
  let previousDataDir: string;

  beforeAll(() => {
    // The walk starts at config.get('dataDir'). It used to start at the
    // repository, because that is what dataDir defaults to when BBS_DATA_DIR
    // is unset - which is the same default that let other suites post into
    // the sysop's Conf1. This suite builds the .info files it asserts on
    // instead of borrowing the live board's.
    boardRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'info-editor-envelope-'));
    fs.writeFileSync(path.join(boardRoot, 'Conf1.info'), 'NDIRS=1\nCONF=1\n');
    fs.mkdirSync(path.join(boardRoot, 'Commands', 'BBSCmd'), { recursive: true });
    fs.writeFileSync(
      path.join(boardRoot, 'Commands', 'BBSCmd', 'EXAMPLE.info'),
      'TYPE=XIM\nLOCATION=BBS:Doors/Example\n',
    );
    previousDataDir = config.get('dataDir');
    config.set('dataDir', boardRoot);

    app = express();
    app.use(express.json());
    app.use('/api/info-editor', infoEditorRouter);
  });

  afterAll(() => {
    config.set('dataDir', previousDataDir);
    fs.rmSync(boardRoot, { recursive: true, force: true });
  });

  it('wraps the file list the way the page unwraps it', async () => {
    const res = await request(app).get('/api/info-editor/files');

    expect(res.status).toBe(200);
    // SystemFilesPage reads filesData?.data?.files. Anything else is zero
    // files on screen, whatever the walk found.
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('data');
    expect(Array.isArray(res.body.data?.files)).toBe(true);
  }, 60000);

  it('finds the .info files the BBS actually has', async () => {
    // The walk starts at the BBS root - here, the temp board built above,
    // which carries one .info at the top and one nested two levels down. An
    // empty list means the walk is broken rather than the envelope.
    const res = await request(app).get('/api/info-editor/files');

    const found = (res.body.data.files as Array<{ relativePath: string }>).map(
      f => f.relativePath.split(path.sep).join('/'),
    );
    expect(found).toEqual(expect.arrayContaining(['Conf1.info', 'Commands/BBSCmd/EXAMPLE.info']));
    expect(res.body.data.files[0]).toHaveProperty('relativePath');
  }, 60000);

  it('reports a missing path as a failure the client can read', async () => {
    const res = await request(app).get('/api/info-editor/file');

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body).toHaveProperty('success', false);
    expect(typeof res.body.message).toBe('string');
  });

  it('refuses a path outside the BBS root, in the same shape', async () => {
    const res = await request(app)
      .get('/api/info-editor/file')
      .query({ path: '../../../etc/passwd' });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body).toHaveProperty('success', false);
  });
});
