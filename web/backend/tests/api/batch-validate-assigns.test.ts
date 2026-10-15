/**
 * The batch editor resolves DOORS: the way the board does.
 *
 * `resolveAssign` mapped `doors:` to BBS_ROOT/Doors, and BBS_ROOT is empty in
 * the container - the fallback was cwd/.., which is /app/web on the board, a
 * directory with no Doors in it. Every doors: line in a batch file was
 * reported as "Program not found" while the identical bbs:Doors/... line
 * resolved. Verified on the live board with one file and both spellings:
 *
 *   bbs:Doors/telnet-front/package.json    -> resolved
 *   doors:telnet-front/package.json        -> Program not found
 *
 * Same defect as the user files written to /app/user.data: BBS_ROOT read where
 * BBS_DATA_DIR is what exists.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import request from 'supertest';

describe('POST /api/batches/validate', () => {
  let app: any;
  let bbsRoot: string;
  let previousDataDir: string | undefined;
  let previousBbsRoot: string | undefined;

  beforeAll(() => {
    previousDataDir = process.env.BBS_DATA_DIR;
    previousBbsRoot = process.env.BBS_ROOT;
    bbsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-batch-'));
    fs.mkdirSync(path.join(bbsRoot, 'Doors', 'a-door'), { recursive: true });
    fs.writeFileSync(path.join(bbsRoot, 'Doors', 'a-door', 'runme'), '#!/bin/sh\n');

    process.env.BBS_DATA_DIR = bbsRoot;
    // Empty, exactly as the container has it - the variable the old code read.
    delete process.env.BBS_ROOT;

    jest.resetModules();
    /* eslint-disable @typescript-eslint/no-var-requires */
    const express = require('express');
    const { createBatchRouter } = require('../../src/api/batch-routes');
    /* eslint-enable @typescript-eslint/no-var-requires */

    app = express();
    app.use(express.json());
    app.use('/api/batches', createBatchRouter());
  });

  afterAll(() => {
    if (previousDataDir === undefined) delete process.env.BBS_DATA_DIR;
    else process.env.BBS_DATA_DIR = previousDataDir;
    if (previousBbsRoot !== undefined) process.env.BBS_ROOT = previousBbsRoot;
    fs.rmSync(bbsRoot, { recursive: true, force: true });
  });

  const validate = (content: string) =>
    request(app).post('/api/batches/validate').send({ name: 'batch9', content });

  it('resolves a doors: program under the BBS root', async () => {
    const res = await validate('doors:a-door/runme');

    expect(res.status).toBe(200);
    expect(res.body.summary.errors).toBe(0);
    expect(res.body.issues[0].message).toContain(path.join(bbsRoot, 'Doors', 'a-door', 'runme'));
  });

  it('agrees with the bbs: spelling of the same file', async () => {
    const res = await validate('doors:a-door/runme\nbbs:Doors/a-door/runme');

    expect(res.status).toBe(200);
    expect(res.body.summary.errors).toBe(0);
    const [viaDoors, viaBbs] = res.body.issues;
    expect(viaDoors.message).toBe(viaBbs.message);
  });

  it('still reports a program that really is missing', async () => {
    const res = await validate('doors:a-door/not-here');

    expect(res.body.summary.errors).toBe(1);
    expect(res.body.issues[0].message).toContain('Program not found');
  });
});
