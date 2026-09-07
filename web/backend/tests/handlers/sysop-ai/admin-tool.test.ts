/**
 * The sysop's admin tool: the whole admin surface, as the sysop, writes
 * held until the sysop types `yes`.
 *
 * K3c of the plan. The fence is the level (255 only), the path (under
 * /api/config, no way out), and the two-step: a write is HELD by the tool,
 * and only the sysop's own next line, exactly `yes`, runs it - in the chat
 * handler, before the model sees the line. Anything else cancels it.
 */
process.env.SKIP_DB_INIT = '1';
process.env.SKIP_SERVER_START = '1';
jest.setTimeout(30000);

import Database from 'better-sqlite3';
import { OperatorChatRepository } from '../../../src/database/operator-chat.repository';
import { registerConnectionEmitter } from '../../../src/server/session-emitter-registry';
import { userSessions } from '../../../src/server/session-manager';
import { runTool, toolsFor, type ToolContext } from '../../../src/handlers/sysop-ai/tools';
import { ADMIN_TOOL, adminPathOk, confirmPendingAdmin, setAdminTransport } from '../../../src/handlers/sysop-ai/admin-tool';
import { primeModelCatalogue } from '../../../src/handlers/grumpy-sysop-bot.handler';

jest.mock('axios');
import axios from 'axios';
jest.mock('../../../src/server/database-helpers', () => ({
  callersLog: jest.fn(async () => undefined),
  searchFilesAdvanced: jest.fn(async () => []),
}));

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function fakeTransport() {
  const calls: Array<{ method: string; path: string; body: unknown; token: string }> = [];
  setAdminTransport({
    async request(method, path, body, token) {
      calls.push({ method, path, body, token });
      return { status: method === 'GET' ? 200 : 204, data: method === 'GET' ? { bbs_name: 'Up Rough', sysop_name: 'Spot' } : '' };
    },
  });
  return calls;
}

function ctxFor(level: number): ToolContext {
  const session: any = { user: { id: 'u-sysop', username: 'Spot', secLevel: level, timeTotal: 3600, timeUsed: 0 }, nodeId: 1, currentConf: 1, tempData: {} };
  return {
    io: { to: () => ({ emit() {} }) }, session,
    page: { id: 'p-admin', userId: 'u-sysop', userHandle: 'Spot', nodeId: 1 } as any,
    chatSession: {} as any, bbsRoot: '/nonexistent',
    execute: async () => undefined,
    db: { generateAccessToken: async (u: any) => `jwt-for-${u.username}-${u.secLevel}` } as any,
    caps: { grantTimeMinutesPerDay: 30 }, sysopName: 'Spot',
  };
}

afterEach(() => setAdminTransport(null));

describe('the admin tool', () => {
  it('is offered to the sysop only', () => {
    expect(toolsFor({ user: { secLevel: 255 } } as any).map((t) => t.name)).toContain('admin');
    expect(toolsFor({ user: { secLevel: 254 } } as any).map((t) => t.name)).not.toContain('admin');
  });
  it('paths stay under /api/config', () => {
    expect(adminPathOk('/api/config/system')).toBe(true);
    expect(adminPathOk('/api/config/users/42')).toBe(true);
    expect(adminPathOk('/api/auth/login')).toBe(false);
    expect(adminPathOk('/api/config/../auth')).toBe(false);
    expect(adminPathOk('api/config/system')).toBe(false);
  });
  it('a GET runs at once, over loopback, with a token minted for the sysop', async () => {
    const calls = fakeTransport();
    const ctx = ctxFor(255);
    const r = await runTool(ctx, 'admin', { method: 'GET', path: '/api/config/system' });
    expect(r.outcome).toBe('ok');
    expect(r.result.content).toContain('HTTP 200');
    expect(r.result.content).toContain('Up Rough');
    expect(calls).toEqual([{ method: 'GET', path: '/api/config/system', body: undefined, token: 'jwt-for-Spot-255' }]);
    expect((await runTool(ctx, 'admin', { method: 'GET', path: '/api/auth/me' })).result.content).toContain('must be under /api/config');
    expect((await runTool(ctxFor(100), 'admin', { method: 'GET', path: '/api/config/system' })).outcome).toBe('refused');
  });
  it('a write is HELD; the sysop\'s "yes" runs it, anything else cancels it', async () => {
    const calls = fakeTransport();
    const ctx = ctxFor(255);
    const held = await runTool(ctx, 'admin', { method: 'PUT', path: '/api/config/nodes/3', body: { ftp_enabled: false } });
    expect(held.result.content).toMatch(/^HELD, not run: PUT \/api\/config\/nodes\/3 \{"ftp_enabled":false\}/);
    expect(calls).toEqual([]);
    expect((ctx.chatSession as any).pendingAdmin).toMatchObject({ method: 'PUT', path: '/api/config/nodes/3' });

    expect(await confirmPendingAdmin(ctx, 'no way')).toMatch(/^Cancelled: PUT \/api\/config\/nodes\/3/);
    expect(calls).toEqual([]);
    expect((ctx.chatSession as any).pendingAdmin).toBeUndefined();
    expect(await confirmPendingAdmin(ctx, 'yes')).toBeNull();     // nothing held any more

    await runTool(ctx, 'admin', { method: 'DELETE', path: '/api/config/doors/OLDDOOR' });
    expect(await confirmPendingAdmin(ctx, '  YES ')).toMatch(/^Done: DELETE \/api\/config\/doors\/OLDDOOR -> HTTP 204/);
    expect(calls).toEqual([{ method: 'DELETE', path: '/api/config/doors/OLDDOOR', body: undefined, token: 'jwt-for-Spot-255' }]);
  });
});

describe('through the real chat', () => {
  it('the sysop\'s "yes" runs the held call and the co-sysop reports, with no model call', async () => {
    const db = new Database(':memory:');
    const repo = new OperatorChatRepository(db);
    repo.updateConfig({
      enabled: true, pageTimeout: 1, aiEnabled: true, aiProvider: 'openrouter', aiModelName: 'free/tools-large',
      openRouterApiKey: 'test-key', botThinkTime: 0, botTypingSpeed: 1, botTypoProbability: 0, allowedSecLevels: [], pageCooldown: 0,
    } as any);
    primeModelCatalogue([{ id: 'free/tools-large', name: 'L', pricing: { prompt: '0', completion: '0' }, supported_parameters: ['tools'], context_length: 262144 }] as any);
    const io: any = { fetchSockets: async () => [], on() {}, emit() {}, to: () => ({ emit() {} }), in: () => ({ emit() {} }), sockets: { adapter: { rooms: new Map() }, sockets: new Map() } };
    io.of = () => io;
    const session: any = {
      user: { id: 'u-sysop-chat', username: 'Spot', secLevel: 255, timeTotal: 3600, timeUsed: 0 }, nodeId: 1, connectionType: 'telnet',
      currentConf: 1, currentConfName: 'General', tempData: {}, subState: 'LOGGED_ON', inputBuffer: '',
    };
    const seen: string[] = [];
    registerConnectionEmitter(session, { emit: (e: string, d: unknown) => { if (e === 'ansi-output') seen.push(String(d)); }, on() {}, listenerCount: () => 0 } as any);
    userSessions.set('u-sysop-chat', session);
    const calls = fakeTransport();

    // The board's database facade the chat hands the tools: only the token minter matters here.
    const { container, DI_TOKENS } = require('../../../src/container');
    let hadDb = false;
    try { container.resolve(DI_TOKENS.Database); hadDb = true; } catch { /* none registered */ }
    if (!hadDb) container.register(DI_TOKENS.Database, { useValue: { generateAccessToken: async (u: any) => `jwt-${u.username}` } });

    let posts = 0;
    (axios.post as jest.Mock).mockImplementation(async () => {
      posts++;
      if (posts === 1) return { data: { choices: [{ message: { content: null, tool_calls: [{ id: 'c1', function: { name: 'admin', arguments: JSON.stringify({ method: 'PUT', path: '/api/config/system', body: { bbs_name: 'Uptown' } }) } }] } }] } };
      return { data: { choices: [{ message: { content: 'Holding PUT /api/config/system {"bbs_name":"Uptown"}. Type yes to run it.' } }] } };
    });

    const H = require('../../../src/handlers/operator-chat.handler');
    H.initOperatorChatHandler(io, repo);
    try {
      await H.handlePageSysop({ id: 's', emit() {}, on() {}, join() {}, rooms: new Set(), session }, session, io, repo);
      await wait(3200);
      await H.handleUserChatMessage(io, repo, session, 'rename the board to Uptown');
      await wait(3000);
      expect(posts).toBe(2);
      expect(calls).toEqual([]);                     // held, not run
      const before = seen.length;
      await H.handleUserChatMessage(io, repo, session, 'yes');
      await wait(2500);
      expect(posts).toBe(2);                         // the model was not asked about "yes"
      expect(calls).toEqual([{ method: 'PUT', path: '/api/config/system', body: { bbs_name: 'Uptown' }, token: 'jwt-Spot' }]);
      const wire = seen.slice(before).join('').replace(/\x1b\[[0-9;]*m/g, '');
      expect(wire).toContain('Done: PUT /api/config/system -> HTTP 204');
    } finally {
      H.stopOperatorChatHandler();
    }
  });
});
