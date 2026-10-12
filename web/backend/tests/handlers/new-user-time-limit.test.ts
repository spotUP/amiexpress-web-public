/**
 * New user time limits.
 *
 * Reported live: "regular users - their time limit runs out fast".
 *
 * The cause was a unit mismatch. `system_config.new_user_time_limit` is in
 * MINUTES (its CHECK constraint is 1..1440), while `users.timelimit` is read
 * as SECONDS everywhere - see utils/time-tracking.util.ts, which divides it
 * by 60 to display minutes. Writing the config value straight into the
 * column turned a "60 minute" default into sixty SECONDS, which is what the
 * reporting user's own account had.
 *
 * These tests drive every place a time limit is written or shown, through the
 * real code: the admin API's user create, the BBS's own sign-up, a fresh and
 * a migrated database, the account statistics screen and the sysop's bulk
 * editor. What is asserted is the number stored or the text shown.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import request from 'supertest';
import BetterSqlite3 from 'better-sqlite3';

// The account and editor handlers import session types and sub-states from
// index.ts; the three-export stub is all they touch.
jest.mock('../../src/index', () => {
  const states = require('../../src/constants/bbs-states');
  return { BBSState: states.BBSState, LoggedOnSubState: states.LoggedOnSubState, LOCALHOST_IPS: [] };
});

/** A board whose sysop set the new-user time limit to 90 MINUTES. */
const CONFIGURED_MINUTES = 90;

describe('the configured default', () => {
  let app: any;
  let db: any;
  let AuthHandler: any;
  let bbsRoot: string;
  let dbDir: string;
  let previousDataDir: string | undefined;
  let previousDbDir: string | undefined;
  let previousDbFile: string | undefined;

  beforeAll(async () => {
    previousDataDir = process.env.BBS_DATA_DIR;
    previousDbDir = process.env.DATABASE_DIR;
    previousDbFile = process.env.DATABASE_FILE;
    bbsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-time-limit-'));
    dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-time-limit-db-'));
    process.env.BBS_DATA_DIR = bbsRoot;
    process.env.DATABASE_DIR = dbDir;
    process.env.DATABASE_FILE = 'time-limit.db';

    // Env first, modules after (same shape as user-password-change-reaches-login).
    jest.resetModules();
    /* eslint-disable @typescript-eslint/no-var-requires */
    const express = require('express');
    const { saveBBSConfig, invalidateBoardConfig } = require('../../src/services/bbs-config-file.service');
    const { Database } = require('../../src/database');
    const { createConfigRouter } = require('../../src/api/config-routes');
    AuthHandler = require('../../src/handlers/user/auth.handler').AuthHandler;
    /* eslint-enable @typescript-eslint/no-var-requires */

    // The sysop's setting, where the board keeps it: bbsConfig.info.
    saveBBSConfig(bbsRoot, { new_user_time_limit: CONFIGURED_MINUTES });
    invalidateBoardConfig();

    db = new Database();
    await db.init();
    app = express();
    app.use(express.json());
    app.use('/api/config', createConfigRouter(db));
  }, 30000);

  afterAll(async () => {
    if (db) await db.close();
    const restore = (key: string, value: string | undefined) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    };
    restore('BBS_DATA_DIR', previousDataDir);
    restore('DATABASE_DIR', previousDbDir);
    restore('DATABASE_FILE', previousDbFile);
    fs.rmSync(bbsRoot, { recursive: true, force: true });
    fs.rmSync(dbDir, { recursive: true, force: true });
  });

  it('is expressed in minutes and converted to seconds when a user is created', async () => {
    const username = `tl_admin_${Date.now()}`;
    const res = await request(app)
      .post('/api/config/users')
      .send({ username, password: 'hunter2xyz', securityLevel: 10 });
    expect([200, 201]).toContain(res.status);

    const user = await db.getUserByUsername(username);
    expect(user.timeLimit).toBe(CONFIGURED_MINUTES * 60);
  }, 30000);

  it('reaches users who sign up through the BBS itself', async () => {
    // This path used to hardcode 3600, so raising the configured limit had no
    // effect on anyone registering through the BBS - which is everyone.
    const username = `tl_bbs_${Date.now()}`;
    const res: any = { status: jest.fn(() => res), json: jest.fn(() => res) };
    await new AuthHandler(db).register(
      { body: { username, realname: 'Time Limit', location: 'Uprough', password: 'hunter2xyz' } } as any,
      res,
    );
    expect(res.status).not.toHaveBeenCalledWith(500);

    const user = await db.getUserByUsername(username);
    expect(user).toBeTruthy();
    expect(user.timeLimit).toBe(CONFIGURED_MINUTES * 60);
  }, 30000);

  it('defaults to the maximum the schema allows on a fresh database', () => {
    // 1440 minutes = 24 hours, the ceiling of the column's CHECK constraint.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { ConfigRepository } = require('../../src/database/config-repository');
    const raw = new BetterSqlite3(':memory:');
    try {
      // The real table, as the fresh database created it.
      const ddl = db.db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'system_config'").get().sql;
      raw.exec(ddl);
      const created = new ConfigRepository(raw).getSystemConfig();
      expect(created.new_user_time_limit).toBe(1440);
    } finally {
      raw.close();
    }
  });
});

describe('a board upgraded from before the column existed', () => {
  it('gets the 24 hour default, not whatever the column would otherwise hold', async () => {
    const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-time-limit-legacy-'));
    const previousDbDir = process.env.DATABASE_DIR;
    const previousDbFile = process.env.DATABASE_FILE;
    process.env.DATABASE_DIR = dbDir;
    process.env.DATABASE_FILE = 'legacy.db';
    // A system_config row written before new_user_time_limit was a column.
    const legacy = new BetterSqlite3(path.join(dbDir, 'legacy.db'));
    legacy.exec('CREATE TABLE system_config (id INTEGER PRIMARY KEY, bbs_name TEXT)');
    legacy.exec("INSERT INTO system_config (id, bbs_name) VALUES (1, 'Legacy')");
    legacy.close();

    let db: any;
    try {
      jest.resetModules();
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Database } = require('../../src/database');
      db = new Database();
      await db.init();
      const row = db.db.prepare('SELECT new_user_time_limit AS m FROM system_config WHERE id = 1').get();
      expect(row.m).toBe(1440);
    } finally {
      if (db) await db.close();
      if (previousDbDir === undefined) delete process.env.DATABASE_DIR;
      else process.env.DATABASE_DIR = previousDbDir;
      if (previousDbFile === undefined) delete process.env.DATABASE_FILE;
      else process.env.DATABASE_FILE = previousDbFile;
      fs.rmSync(dbDir, { recursive: true, force: true });
    }
  }, 30000);
});

describe('showing and editing a limit', () => {
  function recordingSocket() {
    const out: string[] = [];
    return { socket: { emit: (_event: string, data: unknown) => { out.push(String(data)); } }, text: () => out.join('') };
  }

  it('converts to minutes for display rather than printing raw seconds', async () => {
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const account = require('../../src/handlers/user/account.handler');
    const { socket, text } = recordingSocket();
    // The account editor's U> Time_Limit (express.e:23108 Div(timeLimit,60)).
    account.displayAccountPage0(socket, {
      username: 'Spot', realname: 'Spot', location: 'Uprough', secLevel: 255,
      timeTotal: 0, timeUsed: 0, timeLimit: 86400, uploads: 0, downloads: 0,
    }, 1);

    expect(text()).toContain('Time_Limit\x1b[36m:\x1b[0m \x1b[36m[\x1b[0m1440    \x1b[36m]');
    expect(text()).not.toContain('86400');
  });

  it('converts the sysop editor back to seconds on the way in', async () => {
    // The editor's field is labelled "mins", so a sysop typing 60 must get an
    // hour, not a minute. Driven as the sysop types it: B (bulk editor),
    // U (Time Limit), 60, ~ (apply).
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const editor = require('../../src/handlers/user/user-editor.handler');
    const updateUser = jest.fn(async () => undefined);
    const db: any = {
      getUsers: async () => [{ id: 'u1', username: 'Spot', slotNumber: 1, secLevel: 10, location: '' }],
      getUserById: async () => null,
      updateUser,
    };
    const session: any = { state: 'loggedon', user: { username: 'sysop', secLevel: 255 }, tempData: undefined };
    const { socket } = recordingSocket();

    await editor.handleAccountEditorInput(socket, session, db, 'B');
    for (const key of ['U', '60', '~']) await session.inputCallback(key);

    expect(updateUser).toHaveBeenCalledWith('u1', expect.objectContaining({ timeLimit: 3600 }));
  });
});
