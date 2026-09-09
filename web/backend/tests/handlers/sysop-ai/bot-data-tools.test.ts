/**
 * The WEB_BOT_DATA chat tools: board reads and WHIP answers, by tier.
 *
 * The database is a rich fake (repositories the real Database offers);
 * the WHIP service is mocked (its readers are pinned in
 * tests/services/bot-data); the net is mocked through the fetcher seams.
 * Tool-name uniqueness is pinned here too: the search_files collision
 * (conference search vs listing search) must never return.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

jest.mock('../../../src/services/whip.service', () => ({
  whipService: {
    listProjects: async () => [{ name: 'Board', id: 'p1' }],
    listTasks: async () => [{ title: 'Fix it', status: 'todo', assignee: 'Knut' }],
    listUserTasks: async () => ({ tasks: [{ title: 'Mine', status: 'doing' }] }),
    leaderboard: async () => [{ handle: 'Knut', points: 42 }],
    achievementsFor: async () => ({ achievements: [{ name: 'First' }] }),
    listParties: async () => [],
    listUsers: async () => [],
  },
}));

import { runTool, toolsFor, ALL_TOOLS, type ToolContext } from '../../../src/handlers/sysop-ai/tools';
import { setWikipediaFetcher } from '../../../src/handlers/sysop-ai/external/wikipedia';
import { setTexttvFetcher } from '../../../src/handlers/sysop-ai/external/texttv';
import { setExternalFetcher } from '../../../src/handlers/sysop-ai/external/doorrepo';

afterAll(() => { setExternalFetcher(null); });

function fixtureBoard(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bottools-'));
  const data = path.join(root, 'Doors', 'arkanoid', 'data');
  fs.mkdirSync(data, { recursive: true });
  fs.writeFileSync(path.join(data, 'highscores.json'), JSON.stringify([{ handle: 'Knut', score: 9000 }]));
  return root;
}

function richDb() {
  return {
    async getUserByUsername(name: string) {
      return name.toLowerCase() === 'knut'
        ? { id: 'u1', username: 'Knut', secLevel: 30, location: 'Oslo', calls: 5, uploads: 1, downloads: 2 }
        : null;
    },
    async getUsers() {
      return [
        { username: 'Knut', secLevel: 30, calls: 5, uploads: 1, downloads: 2 },
        { username: 'Spot', secLevel: 255, calls: 99, uploads: 0, downloads: 0 },
      ];
    },
    async getMessageBases() { return [{ id: 7 }]; },
    async getMessages() {
      return [{ id: 1, subject: 'Hello', author: 'Knut', body: 'Hello board' }];
    },
    async getFileAreas() { return [{ id: 3 }]; },
    async getFileEntries() { return [{ filename: 'COOL.LHA', size: 2048, description: 'Cool' }]; },
    async getFileStatisticsByConference() { return { totalFiles: 3, totalBytes: 9999 }; },
    async query(sql: string) {
      if (sql.includes('FROM users')) return { rows: [{ n: 5 }] };
      if (sql.includes('FROM messages')) return { rows: [{ n: 7 }] };
      if (sql.includes('FROM file_entries')) return { rows: [{ n: 3, bytes: 100 }] };
      return { rows: [{ username: 'Knut', action: 'login' }] };
    },
  };
}

function ctxFor(level: number, db: any = richDb()): ToolContext {
  const session: any = { user: { id: 'u1', username: 'Knut', secLevel: level }, nodeId: 4, currentConf: 1, tempData: {} };
  return {
    io: { to: () => ({ emit() {} }) }, session,
    page: { id: 'p1', userId: 'u1', userHandle: 'Knut', nodeId: 4 } as any,
    chatSession: {} as any,
    bbsRoot: fixtureBoard(),
    execute: async () => {},
    db, caps: { grantTimeMinutesPerDay: 30 }, sysopName: 'Spot',
  };
}

describe('tool names stay unique', () => {
  it('no two tools share a name (the search_files collision stays fixed)', () => {
    const names = ALL_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });
  it('the listing search moved to search_listing; search_files is the conference search', async () => {
    setExternalFetcher(async () => ({ total: 5, hiddenCount: 0, bySystem: [], byGroup: [] }));
    const ctx = ctxFor(30);
    expect(ALL_TOOLS.some((t) => t.name === 'search_listing')).toBe(true);
    const r = await runTool(ctx, 'search_listing', { kind: 'stats' });
    expect(r.outcome).toBe('ok');
    expect(r.result.content).toContain('5 files');
    setExternalFetcher(null);
  });
  it('a level-30 caller may use every new read tool', () => {
    const names = toolsFor({ user: { secLevel: 30 } } as any).map((t) => t.name);
    for (const n of ['user_lookup', 'recent_messages', 'search_board_files', 'whip_projects',
      'whip_my_tasks', 'board_info', 'board_totals', 'door_data',
      'ask_wikipedia', 'wikidata_facts', 'weather_now', 'texttv_page',
      'openalex_search', 'recent_quakes', 'hn_search']) {
      expect(names).toContain(n);
    }
  });
});

describe('board reads', () => {
  it('user_lookup, user_search, top_callers', async () => {
    const ctx = ctxFor(30);
    expect((await runTool(ctx, 'user_lookup', { handle: 'Knut' })).result.content).toContain('Knut (level 30)');
    expect((await runTool(ctx, 'user_lookup', { handle: 'Spot' })).result.content).toBe('No user called Spot.');
    expect((await runTool(ctx, 'top_callers', {})).result.content).toMatch(/^1\. Spot - 99 calls/);
  });
  it('recent_messages and search_messages read public mail', async () => {
    const ctx = ctxFor(30);
    expect((await runTool(ctx, 'recent_messages', {})).result.content).toContain('Hello');
    expect((await runTool(ctx, 'search_messages', { query: 'hello' })).result.content).toContain('Hello');
  });
  it('search_board_files and stats read file entries', async () => {
    const ctx = ctxFor(30);
    expect((await runTool(ctx, 'search_board_files', { query: 'cool' })).result.content).toContain('COOL.LHA');
    expect((await runTool(ctx, 'board_files_stats', {})).result.content).toContain('3 files');
  });
  it('board_info, board_totals, recent_callers', async () => {
    const ctx = ctxFor(30);
    expect((await runTool(ctx, 'board_totals', {})).result.content).toContain('5 users, 7 messages');
    expect((await runTool(ctx, 'recent_callers', {})).result.content).toContain('Knut: login');
  });
  it('door_data reads allowlisted keys and names the shared set on refusal', async () => {
    const ctx = ctxFor(30);
    expect((await runTool(ctx, 'door_data', { door: 'arkanoid', key: 'highscores.json' })).result.content)
      .toContain('1. Knut - 9000');
    expect((await runTool(ctx, 'door_data', { door: 'nope', key: 'x' })).result.content)
      .toContain('Shared doors:');
  });
  it('without a database the reads refuse honestly', async () => {
    const ctx = ctxFor(30, null);
    expect((await runTool(ctx, 'user_lookup', { handle: 'Knut' })).result.content).toMatch(/cannot read accounts/);
    expect((await runTool(ctx, 'recent_messages', {})).result.content).toMatch(/cannot read messages/);
  });
});

describe('whip answers', () => {
  it('projects, tasks, mine, leaderboard, achievements', async () => {
    const ctx = ctxFor(30);
    expect((await runTool(ctx, 'whip_projects', {})).result.content).toContain('Board');
    expect((await runTool(ctx, 'whip_tasks', { project: 'p1' })).result.content).toContain('Fix it');
    expect((await runTool(ctx, 'whip_my_tasks', {})).result.content).toContain('Mine');
    expect((await runTool(ctx, 'whip_leaderboard', {})).result.content).toContain('Knut - 42 pts');
    expect((await runTool(ctx, 'whip_achievements', {})).result.content).toContain('First');
  });
});

describe('general knowledge', () => {
  it('answers from the net through the seams', async () => {
    setWikipediaFetcher(async () => ({ pages: [{ key: 'Amiga', title: 'Amiga' }] }));
    const ctx = ctxFor(30);
    const r = await runTool(ctx, 'ask_wikipedia', { query: 'amiga' });
    expect(r.result.content).toContain('Amiga');
    setWikipediaFetcher(null);
    setTexttvFetcher(async () => ([{ num: '100', title: 'Big news', content_plain: 'Big news happened' }]));
    const t = await runTool(ctx, 'texttv_page', { page: '100' });
    expect(t.result.content).toContain('Big news happened');
    setTexttvFetcher(null);
  });
});
