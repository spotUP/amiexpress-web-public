/**
 * The web terminal switch, and everything it must not reach.
 *
 * `http_enabled` was schema (config.schemas.ts), column (database.ts) and a
 * checkbox on System Configuration, read by NOTHING: the one HTTP listener
 * started regardless, so unticking the box moved nothing. It now switches the
 * browser terminal off.
 *
 * The danger in making it real is that the same listener serves /admin - the
 * page holding the switch - and the Socket.IO connection the admin's live
 * node status and operator chat run on. A gate that reached those would let a
 * sysop lock themselves out with one click and no way back.
 */

process.env.SKIP_DB_INIT = '1';

import express from 'express';
import request from 'supertest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  webTerminalGate,
  isReservedPath,
  isWebTerminalEnabled,
  NOT_THE_WEB_TERMINAL,
} from '../../src/server/web-terminal-gate';
import {
  saveBBSConfig,
  loadBBSConfig,
  invalidateBoardConfig,
} from '../../src/services/bbs-config-file.service';
import { config as appConfig } from '../../src/config';

describe('the web terminal switch', () => {
  let root: string;
  let previousDataDir: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'web-terminal-'));
    previousDataDir = appConfig.get('dataDir');
    appConfig.set('dataDir', root);
    invalidateBoardConfig();
  });

  afterEach(() => {
    appConfig.set('dataDir', previousDataDir);
    invalidateBoardConfig();
    fs.rmSync(root, { recursive: true, force: true });
  });

  function appServing(body: string) {
    const app = express();
    app.use(webTerminalGate, (_req, res) => res.status(200).type('text/plain').send(body));
    return app;
  }

  it('serves the terminal when the box is ticked', async () => {
    saveBBSConfig(root, { http_enabled: true });

    const response = await request(appServing('terminal')).get('/');

    expect(response.status).toBe(200);
    expect(response.text).toBe('terminal');
  });

  it('answers 503 and names the switch when the box is unticked', async () => {
    saveBBSConfig(root, { http_enabled: false });

    const response = await request(appServing('terminal')).get('/');

    expect(response.status).toBe(503);
    // A sysop who finds the board dark has to be able to read their way back.
    expect(response.text).toContain('Web Terminal Enabled');
    expect(response.text).toContain('/admin');
    expect(response.text).toContain('Telnet and SSH are unaffected');
  });

  // The whole reason the handoff called gating the listener dangerous: the
  // admin, its API and its sockets are served by the same listener as the
  // terminal, so the switch has to pass them through even when it is off.
  it.each(NOT_THE_WEB_TERMINAL)('never switches off %s', async prefix => {
    saveBBSConfig(root, { http_enabled: false });

    const response = await request(appServing('admin')).get(`${prefix}/anything`);

    expect(response.status).toBe(200);
    expect(response.text).toBe('admin');
  });

  it('switches off a path that merely starts with a reserved word', async () => {
    saveBBSConfig(root, { http_enabled: false });

    // "/apidocs" is not "/api". Matching on a bare startsWith would have let
    // any path beginning with those five letters through the gate.
    const response = await request(appServing('terminal')).get('/apidocs');

    expect(response.status).toBe(503);
  });

  it('takes effect on the next request, with no restart', async () => {
    saveBBSConfig(root, { http_enabled: true });
    const app = appServing('terminal');

    expect((await request(app).get('/')).status).toBe(200);

    saveBBSConfig(root, { http_enabled: false });

    expect((await request(app).get('/')).status).toBe(503);
  });

  it('serves a board that has no configuration file at all', async () => {
    // A fresh install comes up on the web. The switch exists to turn that
    // off, and defaulting it off meant a new board was dark with no clue why.
    expect(isWebTerminalEnabled()).toBe(true);
  });

  it('serves a board whose configuration cannot be read', () => {
    // Failing closed here means the only way back in is the admin that the
    // same failure would have taken down with it.
    appConfig.set('dataDir', path.join(root, 'not-a-directory', 'deeper'));

    expect(isWebTerminalEnabled()).toBe(true);
  });

  // A gate nothing calls switches nothing off. This drives the real
  // registerHttpRoutes, which is what index.ts calls, and asks for the
  // terminal the way a browser does.
  it('is wired onto the terminal registerHttpRoutes actually serves', async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'web-terminal-root-'));
    const distPath = path.join(projectRoot, 'web', 'frontend', 'dist');
    fs.mkdirSync(distPath, { recursive: true });
    fs.writeFileSync(path.join(distPath, 'index.html'), '<title>THE TERMINAL</title>');

    const previousBbsRoot = process.env.BBS_ROOT;
    process.env.BBS_ROOT = projectRoot;

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { registerHttpRoutes } = require('../../src/server/routes-setup');
      const app = express();
      registerHttpRoutes(app, {} as never);

      saveBBSConfig(root, { http_enabled: true });
      const on = await request(app).get('/');
      expect(on.status).toBe(200);
      expect(on.text).toContain('THE TERMINAL');

      saveBBSConfig(root, { http_enabled: false });
      const off = await request(app).get('/');
      expect(off.status).toBe(503);
      expect(off.text).toContain('Web Terminal Enabled');

      // Still off, and the admin is still reachable through the same app.
      const admin = await request(app).get('/admin');
      expect(admin.status).not.toBe(503);
    } finally {
      if (previousBbsRoot === undefined) delete process.env.BBS_ROOT;
      else process.env.BBS_ROOT = previousBbsRoot;
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  // The reason the flag is stored as HTTP_DISABLED rather than HTTP_ENABLED.
  // Every board on the board's own live config was written before this field
  // meant anything, so its file has no key either way - and under plain
  // presence semantics that reads as OFF and takes the board off the web on
  // upgrade.
  it('serves a board whose config file predates the switch', async () => {
    // A real pre-upgrade file: settings, and nothing about the terminal.
    saveBBSConfig(root, { bbs_name: 'Uptown', sysop_name: 'Spot', http_port: 80 });
    const raw = fs.readFileSync(path.join(root, 'bbsConfig.info.txt'), 'utf8');
    expect(raw).not.toContain('HTTP_DISABLED');
    expect(raw).not.toContain('HTTP_ENABLED');

    expect((await request(appServing('terminal')).get('/')).status).toBe(200);
  });

  it('writes the key only to switch off, and removes it to switch back on', () => {
    saveBBSConfig(root, { http_enabled: false });
    expect(fs.readFileSync(path.join(root, 'bbsConfig.info.txt'), 'utf8')).toContain('HTTP_DISABLED');

    saveBBSConfig(root, { http_enabled: true });
    expect(fs.readFileSync(path.join(root, 'bbsConfig.info.txt'), 'utf8')).not.toContain('HTTP_DISABLED');
  });

  it('round-trips the switch through the file both ways', () => {
    saveBBSConfig(root, { http_enabled: false });
    invalidateBoardConfig();
    expect(loadBBSConfig(root).http_enabled).toBe(false);

    saveBBSConfig(root, { http_enabled: true });
    invalidateBoardConfig();
    expect(loadBBSConfig(root).http_enabled).toBe(true);
  });

  it('leaves a board carrying the retired HTTP_ENABLED key alone', () => {
    // No longer a known tooltype: preserved in the file, read by nothing, and
    // it must not be mistaken for the switch being off.
    saveBBSConfig(root, { bbs_name: 'Uptown' });
    const file = path.join(root, 'bbsConfig.info.txt');
    fs.appendFileSync(file, 'HTTP_ENABLED\n');
    invalidateBoardConfig();

    expect(loadBBSConfig(root).http_enabled).toBe(true);
  });

  it('reserves exactly the paths the SPA fallback skips', () => {
    // routes-setup.ts's fallback calls isReservedPath rather than repeating
    // the list; this pins what that list is.
    expect(NOT_THE_WEB_TERMINAL).toEqual(['/api', '/auth', '/socket.io', '/sdk', '/admin']);
    expect(isReservedPath('/api')).toBe(true);
    expect(isReservedPath('/api/config')).toBe(true);
    expect(isReservedPath('/apidocs')).toBe(false);
    expect(isReservedPath('/')).toBe(false);
  });
});
