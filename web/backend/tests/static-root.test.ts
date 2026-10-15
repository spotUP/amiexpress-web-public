/**
 * Static file serving root regression test.
 *
 * The backend resolved its project root as `join(process.cwd(), '..', '..')`,
 * which assumes it was launched from web/backend. The BBS data paths are
 * relative to the REPO ROOT - launching from web/backend gives
 * "ENOENT: data/bbs/node1.user.tmp" on login - so the two assumptions were
 * in direct conflict. Started the documented way, the root resolved to the
 * PARENT of the repo, no frontend dist was found there, and the terminal
 * answered 404 at / and on every asset.
 *
 * DRIVEN: the real registerHttpRoutes (what index.ts calls) on an express
 * app, asked for / the way a browser asks, from a working directory that has
 * a decoy terminal exactly where the old cwd-derived root would look.
 */
process.env.SKIP_DB_INIT = '1';

import express from 'express';
import request from 'supertest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { config as appConfig } from '../src/config';
import { invalidateBoardConfig } from '../src/services/bbs-config-file.service';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

/** A directory holding a built terminal whose index.html says `marker`. */
function terminalAt(root: string, marker: string): void {
  const dist = path.join(root, 'web', 'frontend', 'dist');
  fs.mkdirSync(dist, { recursive: true });
  fs.writeFileSync(path.join(dist, 'index.html'), `<title>${marker}</title>`);
}

describe('static serving root', () => {
  let scratch: string;
  let board: string;
  let previousDataDir: string;
  let previousBbsRoot: string | undefined;
  let previousCwd: string;
  let logged: string[];
  let quiet: jest.SpyInstance[];

  beforeEach(() => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'static-root-'));
    // An empty board: no config, so the web terminal switch reads as on.
    board = path.join(scratch, 'board');
    fs.mkdirSync(board);
    previousDataDir = appConfig.get('dataDir');
    appConfig.set('dataDir', board);
    invalidateBoardConfig();
    previousBbsRoot = process.env.BBS_ROOT;
    delete process.env.BBS_ROOT;
    previousCwd = process.cwd();
    logged = [];
    quiet = [
      jest.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logged.push(a.join(' ')); }),
      jest.spyOn(console, 'warn').mockImplementation(() => {}),
    ];
  });

  afterEach(() => {
    process.chdir(previousCwd);
    for (const q of quiet) q.mockRestore();
    if (previousBbsRoot === undefined) delete process.env.BBS_ROOT;
    else process.env.BBS_ROOT = previousBbsRoot;
    appConfig.set('dataDir', previousDataDir);
    invalidateBoardConfig();
    fs.rmSync(scratch, { recursive: true, force: true });
  });

  function serve() {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { registerHttpRoutes } = require('../src/server/routes-setup');
    const app = express();
    registerHttpRoutes(app, {} as never);
    return app;
  }

  const projectRootLogged = () =>
    logged.find((line) => line.startsWith('[Static] Project root:'))?.replace('[Static] Project root:', '').trim();

  it('does not derive the project root from the working directory', async () => {
    // Launched from <scratch>/a/b, the old `join(cwd, '..', '..')` is
    // <scratch> - and a decoy terminal is waiting there.
    terminalAt(scratch, 'DECOY FROM THE WORKING DIRECTORY');
    const cwd = path.join(scratch, 'a', 'b');
    fs.mkdirSync(cwd, { recursive: true });
    process.chdir(cwd);

    const response = await request(serve()).get('/');

    expect(response.text ?? '').not.toContain('DECOY FROM THE WORKING DIRECTORY');
    expect(projectRootLogged()).not.toBe(fs.realpathSync(scratch));
  });

  it('derives it from this file\'s location, so cwd cannot change it', () => {
    process.chdir(os.tmpdir());
    serve();
    expect(projectRootLogged()).toBe(REPO_ROOT);
  });

  it('lets BBS_ROOT override it', async () => {
    const override = path.join(scratch, 'checkout');
    terminalAt(override, 'THE OVERRIDDEN ROOT');
    process.env.BBS_ROOT = override;

    const response = await request(serve()).get('/');

    expect(response.status).toBe(200);
    expect(response.text).toContain('THE OVERRIDDEN ROOT');
  });
});
