/**
 * WEB_BOT_DATA layer: pure reads, caps, and privacy filters.
 *
 * Every suite here runs on fakes - no database, no disk (except doors.ts,
 * which gets a temp dir). A test that needs the real board is a test in
 * the wrong file.
 */
import { BOT_clampLimit, BOT_cut } from '../../../src/services/bot-data/caps';
import { BOT_userLookup, BOT_userSearch, BOT_topCallers } from '../../../src/services/bot-data/users';
import { BOT_recentMessages, BOT_searchMessages } from '../../../src/services/bot-data/messages';
import { BOT_listConferences, BOT_searchFiles, BOT_fileStats } from '../../../src/services/bot-data/files';
import { BOT_whipProjects, BOT_whipTasks, BOT_whipMyTasks, BOT_whipLeaderboard, BOT_whipAchievements } from '../../../src/services/bot-data/whip';
import { BOT_doorData, BOT_doorDataKeys } from '../../../src/services/bot-data/doors';
import { BOT_whoOnline, BOT_boardTotals, BOT_recentCallers } from '../../../src/services/bot-data/activity';
import { BOT_boardInfo, BOT_listDoors } from '../../../src/services/bot-data/board';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const actor = (secLevel: number, extra = {}) => ({ secLevel, ...extra });

const dbFake = (over: Record<string, any> = {}) => ({
  getUserByUsername: async () => null,
  getUsers: async () => [],
  getConferences: async () => [],
  getMessageBases: async () => [{ id: 1 }],
  getMessages: async () => [],
  getFileAreas: async () => [],
  getFileEntries: async () => [],
  getFileStatisticsByConference: async () => null,
  getActiveSessions: async () => [],
  query: async () => ({ rows: [] }),
  ...over,
});

describe('caps', () => {
  it('clamps limits to 1..50 with a chat-sized default', () => {
    expect(BOT_clampLimit(undefined)).toBe(10);
    expect(BOT_clampLimit(0)).toBe(10);
    expect(BOT_clampLimit(5)).toBe(5);
    expect(BOT_clampLimit(5000)).toBe(50);
    expect(BOT_clampLimit('abc')).toBe(10);
  });
  it('cuts long text and says so', () => {
    expect(BOT_cut('abc').truncated).toBe(false);
    const cut = BOT_cut('x'.repeat(2000));
    expect(cut.truncated).toBe(true);
    expect(cut.text.length).toBe(1800);
  });
});

describe('users: public facts only', () => {
  const users = [
    { username: 'spot', secLevel: 255, location: 'Stockholm', calls: 100, uploads: 5, downloads: 9 },
    { username: 'ann', secLevel: 30, location: '', calls: 3, uploads: 0, downloads: 1 },
    { username: 'ghost', secLevel: 10, deleted_at: '2026-01-01' },
  ];
  const db = dbFake({
    getUserByUsername: async (h: string) => users.find((u) => u.username === h) ?? null,
    getUsers: async () => users,
  });
  it('looks up a visible user, public fields only', async () => {
    const r = await BOT_userLookup(db, actor(255), 'ann');
    expect(r.text).toContain('ann (level 30)');
    expect(r.text).not.toContain('password');
    expect(r.text).not.toContain('email');
  });
  it('hides higher-level users and erased rows as "no such user"', async () => {
    expect((await BOT_userLookup(db, actor(30), 'spot')).text).toBe('No user called spot.');
    expect((await BOT_userLookup(db, actor(255), 'ghost')).text).toBe('No user called ghost.');
  });
  it('searches by fragment within the caller\'s level', async () => {
    const r = await BOT_userSearch(db, actor(30), 'a');
    expect(r.text).toContain('ann');
    expect(r.text).not.toContain('spot');
  });
  it('ranks top callers', async () => {
    const r = await BOT_topCallers(db, actor(30));
    expect(r.text).toMatch(/^1\. spot - 100 calls/);
  });
  it('refuses honestly without a database', async () => {
    expect((await BOT_userLookup(undefined, actor(30), 'ann')).text).toMatch(/cannot read accounts/);
  });
});

describe('messages: public mail in readable conferences', () => {
  const msgs = [
    { id: 1, subject: 'Hello', author: 'ann', body: 'Hello board' },
    { id: 2, subject: 'Secret', author: 'ann', body: 'For sysop', isprivate: 1 },
  ];
  const db = dbFake({ getMessages: async () => msgs });
  it('lists public messages, never private ones', async () => {
    const r = await BOT_recentMessages(db, actor(30), 1);
    expect(r.text).toContain('Hello');
    expect(r.text).not.toContain('Secret');
  });
  it('refuses unreadable conferences', async () => {
    const r = await BOT_recentMessages(db, actor(30, { confAccess: [2] }), 1);
    expect(r.text).toMatch(/not readable/);
  });
  it('search passes the query through and filters private', async () => {
    let seen: any = null;
    const sdb = dbFake({
      getMessages: async (_c: number, _b: number, o: any) => { seen = o; return msgs; },
    });
    const r = await BOT_searchMessages(sdb, actor(30), 1, 'hello');
    expect(seen.search).toBe('hello');
    expect(r.text).toContain('Hello');
    expect(r.text).not.toContain('Secret');
  });
});

describe('files and conferences', () => {
  const db = dbFake({
    getConferences: async () => [{ id: 1, name: 'Main' }, { id: 2, name: 'Hidden' }],
    getFileAreas: async () => [{ id: 7 }],
    getFileEntries: async () => [{ filename: 'COOL.LHA', size: 2048, description: 'A cool file' }],
    getFileStatisticsByConference: async () => ({ totalFiles: 3, totalBytes: 9999 }),
  });
  it('lists only readable conferences', async () => {
    const r = await BOT_listConferences(db, actor(30, { confAccess: [1] }));
    expect(r.text).toContain('Main');
    expect(r.text).not.toContain('Hidden');
  });
  it('searches files across areas', async () => {
    const r = await BOT_searchFiles(db, actor(30), 1, 'cool');
    expect(r.text).toContain('COOL.LHA');
    expect(r.text).toContain('2 KB');
  });
  it('reports file stats', async () => {
    const r = await BOT_fileStats(db, actor(30), 1);
    expect(r.text).toContain('3 files');
  });
});

describe('whip readers', () => {
  const whip = {
    listProjects: async () => [{ name: 'Board', id: 'p1' }],
    listTasks: async () => [{ title: 'Fix it', status: 'todo', assignee: 'ann' }],
    listUserTasks: async () => ({ tasks: [{ title: 'Mine', status: 'doing' }] }),
    leaderboard: async () => [{ handle: 'ann', points: 42 }],
    achievementsFor: async () => ({ achievements: [{ name: 'First' }] }),
    listParties: async () => [],
    listUsers: async () => [],
  };
  it('projects, tasks, mine, leaderboard, achievements', async () => {
    expect((await BOT_whipProjects(whip)).text).toContain('Board');
    expect((await BOT_whipTasks(whip, 'p1')).text).toContain('Fix it');
    expect((await BOT_whipMyTasks(whip, 'u1')).text).toContain('Mine');
    expect((await BOT_whipLeaderboard(whip)).text).toContain('ann - 42 pts');
    expect((await BOT_whipAchievements(whip, 'u1')).text).toContain('First');
  });
  it('refuses honestly without the service', async () => {
    expect((await BOT_whipProjects(undefined)).text).toMatch(/unreachable/);
  });
  it('plain lists carry no escape codes (the Discord/API surface)', async () => {
    expect((await BOT_whipTasks(whip, 'p1')).text).not.toContain('\x1b');
    expect((await BOT_whipMyTasks(whip, 'u1')).text).not.toContain('\x1b');
    expect((await BOT_whipLeaderboard(whip)).text).not.toContain('\x1b');
  });
  it('ansi lists color state, self-reset, plain bold never', async () => {
    const states = {
      listProjects: async () => [{ name: 'Board', id: 'p1' }],
      listTasks: async () => [
        { title: 'Open', status: 'todo' },
        { title: 'Busy', status: 'in-progress' },
        { title: 'Shipped', status: 'done' },
        { title: 'Stuck', status: 'blocked' },
      ],
      listUserTasks: async () => ({ tasks: [] }),
      leaderboard: async () => [],
      achievementsFor: async () => ({}),
      listParties: async () => [],
      listUsers: async () => [],
    };
    const text = (await BOT_whipTasks(states, 'p1', undefined, { ansi: true })).text;
    expect(text).toContain('\x1b[0;33m[todo]\x1b[0m');
    expect(text).toContain('\x1b[0;36m[in-progress]\x1b[0m');
    expect(text).toContain('\x1b[0;32m[done]\x1b[0m');
    expect(text).toContain('\x1b[0;31m[blocked]\x1b[0m');
    expect(text).not.toContain('\x1b[1;');
    const projects = (await BOT_whipProjects(states, { ansi: true })).text;
    expect(projects).toContain('\x1b[0;36mBoard (p1)\x1b[0m');
  });
  it('a cut never leaves half an escape sequence', async () => {
    const cut = BOT_cut('\x1b[0;33m[todo]\x1b[0m plenty more text here', 5);
    expect(cut.text).toBe('');
    expect(cut.truncated).toBe(true);
  });
});

describe('generic door data: allowlist, never per-door branches', () => {
  it('advertises the allowlist', () => {
    expect(Object.keys(BOT_doorDataKeys())).toContain('arkanoid');
  });
  it('refuses doors and keys off the list identically', async () => {
    const a = await BOT_doorData('/x', 'evil-door', 'passwd');
    const b = await BOT_doorData('/x', 'arkanoid', 'passwd');
    expect(a.text).toMatch(/not shared with chatbots/);
    expect(b.text).toMatch(/not shared with chatbots/);
    expect(a.text.replace('evil-door', 'DOOR')).toBe(b.text.replace('arkanoid', 'DOOR'));
  });
  it('reads an allowlisted key and summarizes scores', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'botdoors-'));
    const home = path.join(dir, 'Doors', 'arkanoid', 'data');
    fs.mkdirSync(home, { recursive: true });
    fs.writeFileSync(path.join(home, 'highscores.json'),
      JSON.stringify([{ handle: 'ann', score: 9000 }, { handle: 'bob', score: 100 }]));
    const r = await BOT_doorData(dir, 'arkanoid', 'highscores.json');
    expect(r.text).toContain('1. ann - 9000');
    fs.rmSync(dir, { recursive: true, force: true });
  });
  it('blocks path traversal', async () => {
    const r = await BOT_doorData('/x', 'arkanoid', '../whip/data/x.json');
    expect(r.text).toMatch(/not shared with chatbots/);
  });
});

describe('activity and board', () => {
  it('reports who is online from the same presence the board sees', async () => {
    const r = await BOT_whoOnline({ listOnlineNodes: () => [{ nodeNumber: 1, username: 'ann', location: 'Oslo' }] });
    expect(r.text).toContain('Node 1: ann (Oslo)');
  });
  it('totals users, messages, files, calls', async () => {
    const db = dbFake({
      query: async (sql: string) => {
        if (sql.includes('FROM users')) return { rows: [{ n: 5 }] };
        if (sql.includes('FROM messages')) return { rows: [{ n: 7 }] };
        if (sql.includes('FROM file_entries')) return { rows: [{ n: 3, bytes: 100 }] };
        return { rows: [{ username: 'ann', action: 'login' }] };
      },
    });
    expect((await BOT_boardTotals(db, actor(30))).text).toContain('5 users, 7 messages, 3 files');
    expect((await BOT_recentCallers(db)).text).toContain('ann: login');
  });
  it('names the board and lists runnable doors', async () => {
    const board = {
      getBoardConfig: () => ({ bbs_name: 'Up Rough', sysop_name: 'spot' }),
      commandsOnDisk: () => ({ external: ['WHIP', 'GAMES'] }),
      conferencesFromDisk: () => [{ id: 1, name: 'Main' }],
    };
    expect((await BOT_boardInfo(board, '/bbs')).text).toBe('Up Rough, run by spot.');
    expect((await BOT_listDoors(board, '/bbs', actor(30))).text).toContain('WHIP');
  });
});
