/**
 * The two admin domains the schema sweep cannot reach.
 *
 * config-round-trip-contract.test.ts hands each served record to the schema
 * its writer validates with. Users and Access Levels have no schema: the user
 * route maps field by field, and an access level is a set of tooltypes. So
 * the same question - can the admin save back what it just served? - has to
 * be asked differently for each.
 *
 * Users: the failure mode is not rejection but SILENCE. The route maps eight
 * fields explicitly, and anything else in the request body is ignored without
 * complaint. A form that offers a ninth would save it, report success, and
 * change nothing.
 *
 * Access Levels: a level is 87 ACS.* tooltypes, read into booleans and
 * written back out. A flag that does not survive that round trip is a
 * permission a sysop can tick and not grant.
 *
 * The route side is DRIVEN: the real config router on a temp board and a
 * temp database, an account created through it, and every field the form
 * offers PUT back by its disk id and read back from disk through GET /users.
 * Only the list of fields comes from the form's source (UsersPage.tsx lives
 * in web/config-app, a React page this node-env suite cannot mount).
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import request from 'supertest';
import { tooltypesToFlags, flagsToTooltypes } from '../../src/services/config-services/acs-level-file.service';
import { ACS_PERMISSION_NAMES } from '../../src/constants/acs-permissions';

const REPO_ROOT = path.join(__dirname, '..', '..', '..', '..');
const USERS_PAGE = path.join(REPO_ROOT, 'web', 'config-app', 'src', 'pages', 'UsersPage.tsx');

/**
 * Fields the users form holds that the route is not expected to write.
 *
 * Each is deliberate, and each has to stay deliberate - which is what this
 * list is for.
 */
const NOT_SAVED_BY_THE_ROUTE: Record<string, string> = {
  // Handled on its own, hashed rather than assigned.
  password: 'hashed separately, never assigned straight through',
  confirmPassword: 'never leaves the browser',
};

/** The real config router on a temp board and a temp database. */
const board: { app: any; db: any; root: string; dbDir: string } = { app: null, db: null, root: '', dbDir: '' };
const savedEnv: Record<string, string | undefined> = {};

beforeAll(async () => {
  for (const key of ['BBS_DATA_DIR', 'DATABASE_DIR', 'DATABASE_FILE']) savedEnv[key] = process.env[key];
  board.root = fs.mkdtempSync(path.join(os.tmpdir(), 'users-contract-'));
  board.dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'users-contract-db-'));
  process.env.BBS_DATA_DIR = board.root;
  process.env.DATABASE_DIR = board.dbDir;
  process.env.DATABASE_FILE = 'users-contract.db';
  jest.resetModules();
  /* eslint-disable @typescript-eslint/no-var-requires */
  const express = require('express');
  const { Database } = require('../../src/database');
  const { createConfigRouter } = require('../../src/api/config-routes');
  /* eslint-enable @typescript-eslint/no-var-requires */
  board.db = new Database();
  await board.db.init();
  board.app = express();
  board.app.use(express.json());
  board.app.use('/api/config', createConfigRouter(board.db));
}, 30000);

afterAll(async () => {
  if (board.db) await board.db.close();
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  fs.rmSync(board.root, { recursive: true, force: true });
  fs.rmSync(board.dbDir, { recursive: true, force: true });
});

let accounts = 0;
/** Create an account through the route and answer its disk record as GET /users lists it. */
async function newAccount(): Promise<any> {
  const username = `contract${++accounts}_${Date.now() % 100000}`;
  const created = await request(board.app).post('/api/config/users').send({ username, password: 'first-password', securityLevel: 10 });
  expect([200, 201]).toContain(created.status);
  return onDisk(username);
}

async function onDisk(username: string): Promise<any> {
  const listed = await request(board.app).get('/api/config/users');
  return (listed.body.data ?? []).find((u: { username?: string }) => u.username?.toLowerCase() === username.toLowerCase());
}

async function onDiskById(id: string): Promise<any> {
  const listed = await request(board.app).get('/api/config/users');
  return (listed.body.data ?? []).find((u: { id?: string }) => u.id === id);
}

/** A value for `field` that differs from what the record holds now. */
function changed(field: string, current: unknown): unknown {
  if (field === 'username') return `renamed${accounts}`;
  // Nine flags: the field is nine characters and a NUL, as express.e's
  // AstrCopy(..,10) writes it (848aa4329) - a tenth is not a value it holds.
  if (field === 'confAccess') return String(current ?? '').startsWith('X') ? '-'.repeat(9) : 'X'.repeat(9);
  if (typeof current === 'boolean' || field === 'accountLocked' || field === 'expert') return !current;
  if (typeof current === 'number') return current === 42 ? 43 : 42;
  // Short: the record's fields are fixed width (phone holds 12).
  return `Chg${field.slice(0, 5)}`;
}

const truthy = (v: unknown) => v === true || v === 1 || v === 'Y';

/** PUT one field by the disk id and answer what disk holds for it afterwards. */
async function roundTrip(field: string) {
  const before = await newAccount();
  const sent = changed(field, before[field]);
  const put = await request(board.app).put(`/api/config/users/${before.id}`).send({ [field]: sent });
  expect(put.status).toBe(200);
  const after = await onDiskById(before.id);
  const saved = typeof sent === 'boolean' ? truthy(after?.[field]) === sent : after?.[field] === sent;
  return { saved, before: before[field], sent, after: after?.[field] };
}

describe('Users: what the form can send, the route must write', () => {
  it('handles every field the form offers', async () => {
    // REASONABLE source read of the FORM only: which fields it can submit.
    const page = fs.readFileSync(USERS_PAGE, 'utf8');
    const offered = [...new Set([...page.matchAll(/formData\.([a-zA-Z_]+)/g)].map((m) => m[1]))]
      .filter((field) => !(field in NOT_SAVED_BY_THE_ROUTE));
    expect(offered.length).toBeGreaterThan(5);

    const ignored: string[] = [];
    for (const field of offered) {
      const result = await roundTrip(field);
      if (!result.saved) ignored.push(`${field}: sent ${JSON.stringify(result.sent)}, disk holds ${JSON.stringify(result.after)}`);
    }

    // Jest's expect takes no message, so the report goes in the value.
    expect(ignored.join('\n')).toBe('');
  }, 60000);

  it('still writes the fields it is meant to', async () => {
    for (const field of ['realname', 'location', 'email', 'secLevel', 'timeLimit']) {
      const result = await roundTrip(field);
      expect({ field, saved: result.saved }).toEqual({ field, saved: true });
    }
  }, 60000);
});

describe('Access Levels: every flag survives being written and read back', () => {
  /** A level file as parsed: one tooltype per ACS permission. */
  function levelTooltypes(granted: (name: string) => boolean) {
    return ACS_PERMISSION_NAMES.map((key) => ({
      key,
      value: '',
      commented: !granted(key),
      prefix: '',
      originalLine: key,
    }));
  }

  it('reads a granted flag as granted and a commented one as withheld', () => {
    const flags = tooltypesToFlags(levelTooltypes((name) => name.endsWith('_MESSAGE')));

    expect(flags['ACS.READ_MESSAGE']).toBe(true);
    expect(flags['ACS.ENTER_MESSAGE']).toBe(true);
    expect(flags['ACS.DOWNLOAD']).toBe(false);
  });

  it('round-trips all 87 in both states', () => {
    // Every permission on, written out, read back.
    const allOn: Record<string, boolean> = {};
    for (const name of ACS_PERMISSION_NAMES) allOn[name] = true;

    const writtenOn = flagsToTooltypes(levelTooltypes(() => false), allOn);
    const readOn = tooltypesToFlags(writtenOn);

    const lostOn = ACS_PERMISSION_NAMES.filter((name) => readOn[name] !== true);
    expect(lostOn.join('\n')).toBe('');

    // And every permission off again.
    const allOff: Record<string, boolean> = {};
    for (const name of ACS_PERMISSION_NAMES) allOff[name] = false;

    const writtenOff = flagsToTooltypes(writtenOn, allOff);
    const readOff = tooltypesToFlags(writtenOff);

    const stuckOn = ACS_PERMISSION_NAMES.filter((name) => readOff[name] !== false);
    expect(stuckOn.join('\n')).toBe('');
  });

  it('leaves tooltypes that are not permissions alone', () => {
    // A level file may carry more than ACS flags, and an edit to a permission
    // has no business rewriting the rest.
    const withExtra = [
      { key: 'NAME', value: 'Level 20', commented: false, prefix: '', originalLine: 'NAME=Level 20' },
      ...levelTooltypes(() => false),
    ];

    const written = flagsToTooltypes(withExtra, { 'ACS.DOWNLOAD': true });
    const name = written.find((t) => t.key === 'NAME');

    expect(name?.value).toBe('Level 20');
    expect(tooltypesToFlags(written)['NAME']).toBeUndefined();
  });

  it('grants nothing it was not asked to grant', () => {
    const written = flagsToTooltypes(levelTooltypes(() => false), { 'ACS.DOWNLOAD': true });
    const flags = tooltypesToFlags(written);

    const unexpectedlyGranted = Object.entries(flags)
      .filter(([, granted]) => granted)
      .map(([name]) => name);

    expect(unexpectedlyGranted).toEqual(['ACS.DOWNLOAD']);
  });
});

describe('renaming a user', () => {
  // The form disabled the field and said "Username cannot be changed". The
  // write path had always supported it - userToStruct puts `user.username`
  // into the record's name field - so what was missing was validation, not
  // the ability.
  it('is handled by the route', async () => {
    const before = await newAccount();
    const put = await request(board.app).put(`/api/config/users/${before.id}`).send({ username: 'RenamedByAdmin' });
    expect(put.status).toBe(200);
    expect((await onDiskById(before.id))?.username).toBe('RenamedByAdmin');
  }, 30000);

  it('refuses an empty name, an over-long one, and a name already taken', async () => {
    const taken = await newAccount();
    const target = await newAccount();
    const refusal = async (username: string) => {
      const put = await request(board.app).put(`/api/config/users/${target.id}`).send({ username });
      expect(put.status).toBeGreaterThanOrEqual(400);
      return JSON.stringify(put.body);
    };
    expect(await refusal('   ')).toContain('Username cannot be empty');
    expect(await refusal('x'.repeat(32))).toContain('Username cannot be longer than 31 characters');
    expect(await refusal(taken.username.toUpperCase())).toContain('already exists');
    // And none of the three renamed anything.
    expect((await onDiskById(target.id))?.username).toBe(target.username);
  }, 30000);

  it('is no longer disabled on the form, and warns about history', () => {
    // REASONABLE source read: UsersPage.tsx is a config-app React page this
    // node-env suite cannot mount; the wording is the thing under test.
    const page = fs.readFileSync(USERS_PAGE, 'utf8');
    expect(page).not.toContain('Username cannot be changed');
    // A rename does not rewrite messages or the callers log; saying so is the
    // difference between a feature and a surprise.
    expect(page).toContain('does NOT rewrite history');
  });
});
