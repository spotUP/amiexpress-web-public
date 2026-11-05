/**
 * The AI co-sysop is told what THIS board is, and who it is talking to.
 *
 * Until 2026-09-08 it was told a stock /X command list and nothing else, and
 * invented the rest ("Docs are in ^"). The board card is built from the same
 * places the board reads: the command icons, the door registry, the
 * conference list, the bulletin files, bbsConfig, the caller's own record.
 *
 * Two layers: the card as a pure build over a fixture board, and the card
 * reaching the model - the bytes actually POSTed to the provider, through
 * the real chat handler, contain it.
 */
process.env.SKIP_DB_INIT = '1';
jest.setTimeout(20000);

import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import { parseInfoFile, writeInfoFile, updateTooltype } from '../../../src/utils/info-file.util';
import { buildBoardCard, BOARD_CARD_MAX_CHARS } from '../../../src/handlers/sysop-ai/board-card';
import { OperatorChatRepository } from '../../../src/database/operator-chat.repository';
import { registerConnectionEmitter } from '../../../src/server/session-emitter-registry';
import { userSessions } from '../../../src/server/session-manager';

jest.mock('axios');
import axios from 'axios';

const REPO = path.resolve(__dirname, '../../../../..');
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A board root with two command icons, a conference with a bulletin. */
function fixtureBoard(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'board-card-'));
  const cmdDir = path.join(root, 'Commands', 'BBSCmd');
  fs.mkdirSync(cmdDir, { recursive: true });
  const templates = fs.readdirSync(path.join(REPO, 'board', 'Commands', 'BBSCmd')).filter((f) => f.endsWith('.info'));
  const template = path.join(REPO, 'board', 'Commands', 'BBSCmd', templates[0]!);
  for (const [name, access, type] of [['F', '10', 'BBS'], ['D', '10', 'BBS'], ['DEL', '255', 'BBS'], ['TA', '10', 'XIM']] as const) {
    const target = path.join(cmdDir, `${name}.info`);
    fs.copyFileSync(template, target);
    let info = parseInfoFile(target);
    info = updateTooltype(info, 'ACCESS', access, false);
    info = updateTooltype(info, 'TYPE', type, false);
    if (type === 'XIM') info = updateTooltype(info, 'LOCATION', 'Doors:TetrisAttack/ta', false);
    writeInfoFile(info);
  }
  // The board's own `^` help, with the meaning of each command.
  fs.writeFileSync(path.join(root, 'BBSHelp.txt'), [
    '~', "      \x1b[36m'D' \x1b[35m- \x1b[33mDownload a file\x1b[0m", '             Enter filenames to download.', '',
    "      \x1b[36m'F' \x1b[35m- \x1b[33mFile listings\x1b[0m", '             View the files in this conference.', '~',
  ].join('\n'), 'latin1');
  const bulls = path.join(root, 'Conf1', 'Bulletins');
  fs.mkdirSync(bulls, { recursive: true });
  fs.writeFileSync(path.join(bulls, 'bull1.txt'), '\x1b[1;33mDowntime Friday 22:00 for the disk swap\x1b[0m\r\nMore text\r\n', 'latin1');
  fs.writeFileSync(path.join(bulls, 'bull2.txt'), '\r\n  New: the Tetris Attack door\r\n', 'latin1');
  return root;
}

function caller(level: number): any {
  return {
    user: {
      id: 'u-card', username: 'Knut', secLevel: level, location: 'Oslo', calls: 41, callsToday: 2,
      uploads: 3, bytesUpload: 5 * 1048576, downloads: 12, bytesDownload: 40 * 1048576, ratio: 3,
      messagesPosted: 7, timeTotal: 3600, timeUsed: 900, firstLogin: new Date('2025-11-02'),
    },
    nodeId: 4, connectionType: 'telnet', currentConf: 1, currentConfName: 'General', tempData: {}, subState: 'LOGGED_ON', inputBuffer: '',
  };
}

const conferences = () => [
  { id: 1, name: 'General', description: 'the main area' },
  { id: 2, name: 'Amiga Demoscene', description: 'prods and parties' },
] as any[];
const online = () => [{ nodeNumber: 4, username: 'Knut', location: 'Oslo', ipAddress: '', status: 'active' }] as any[];

describe('the board card', () => {
  it('names this board, its conferences, doors, commands and bulletins, and the caller in front of it', async () => {
    const root = fixtureBoard();
    const card = await buildBoardCard(caller(30), { bbsRoot: root, conferences, online, now: () => new Date('2026-09-08T00:30:00Z') });

    expect(card.length).toBeLessThanOrEqual(BOARD_CARD_MAX_CHARS + 200);   // the fixture is far under it
    expect(card).toContain('you are the co-sysop, not the sysop');
    expect(card).toContain('callers online now: 1 - Knut@Node4');
    // The caller's own record.
    expect(card).toContain('handle: Knut');
    expect(card).toContain('security level: 30');
    expect(card).toContain('uploads: 3 files, 5.0 MB; downloads: 12 files, 40.0 MB');
    expect(card).toContain('time left today: 45 min');
    // Conferences, with where the caller is.
    expect(card).toContain('1: General - the main area (the caller is here)');
    expect(card).toContain('2: Amiga Demoscene - prods and parties');
    // Bulletins: first non-empty line, ANSI stripped.
    expect(card).toContain('bull1: Downtime Friday 22:00 for the disk swap');
    expect(card).toContain('bull2: New: the Tetris Attack door');
    // Commands and doors from the icons on disk (live, unlike the boot-time
    // registry), within the caller's level; the icon's TYPE sorts them.
    // Each built-in with its meaning from the board's own help - so D is
    // "Download a file" and F is "File listings", never the other way round.
    expect(card).toContain('D (Download a file)');
    expect(card).toContain('F (File listings)');
    expect(card).toMatch(/doors and programs \(1\)[^\n]*:\nTA\b/);
    expect(card).not.toMatch(/\bDEL\b/);
  });

  it('a sysop-level caller sees the sysop-only door and command too', async () => {
    const root = fixtureBoard();
    const card = await buildBoardCard(caller(255), { bbsRoot: root, conferences, online });
    expect(card).toMatch(/\bDEL\b/);
  });

  it('a board with nothing readable still yields a card with the caller on it', async () => {
    const card = await buildBoardCard(caller(30), { bbsRoot: '/nonexistent/board', conferences: () => [], online: () => [] });
    expect(card).toContain('handle: Knut');
    expect(card).not.toContain('== MENU COMMANDS');
  });
});

describe('the card reaches the model', () => {
  it('is a system message in what the chat handler POSTs to OpenRouter, naming the caller and a door', async () => {
    const db = new Database(':memory:');
    const repo = new OperatorChatRepository(db);
    repo.updateConfig({
      enabled: true, pageTimeout: 1, aiEnabled: true, aiProvider: 'openrouter', aiModelName: 'test/free-model',
      openRouterApiKey: 'test-key', botThinkTime: 0, botTypingSpeed: 1, botTypoProbability: 0, allowedSecLevels: [], pageCooldown: 0,
    } as any);
    const rooms = new Map<string, Set<string>>();
    const io: any = { fetchSockets: async () => [], on() {}, emit() {}, to: () => ({ emit() {} }), in: () => ({ emit() {} }), sockets: { adapter: { rooms }, sockets: new Map() } };
    io.of = () => io;
    const session = caller(30);
    const seen: string[] = [];
    registerConnectionEmitter(session, { emit: (e: string, d: unknown) => { if (e === 'ansi-output') seen.push(String(d)); }, on() {}, listenerCount: () => 0 } as any);
    userSessions.set('u-card', session);

    const posts: any[] = [];
    (axios.post as jest.Mock).mockImplementation(async (url: string, body: any) => {
      posts.push({ url, body });
      return { data: { choices: [{ message: { content: 'Read the card, kid.' } }] } };
    });

    // The fixture board jest hands the backend has the icons but no
    // BBSHelp.txt; the live board carries it on its volume. Seed it, so the
    // meanings are on the card the way they are live.
    const boardRoot = process.env.BBS_ROOT;
    if (boardRoot && !fs.existsSync(path.join(boardRoot, 'BBSHelp.txt'))) {
      fs.copyFileSync(path.join(REPO, 'board', 'BBSHelp.txt'), path.join(boardRoot, 'BBSHelp.txt'));
    }

    const H = require('../../../src/handlers/operator-chat.handler');
    H.initOperatorChatHandler(io, repo);
    try {
      await H.handlePageSysop({ id: 's', emit() {}, on() {}, join() {}, rooms: new Set(), session }, session, io, repo);
      await wait(3200);
      await H.handleUserChatMessage(io, repo, session, 'what doors do you have?');
      await wait(2500);

      const post = posts.find((p) => String(p.url).includes('openrouter.ai'));
      expect(post).toBeDefined();
      const systems = post.body.messages.filter((m: any) => m.role === 'system').map((m: any) => String(m.content));
      const card = systems.find((c: string) => c.startsWith('=== FACTS ABOUT THIS BOARD'));
      expect(card).toBeDefined();
      expect(card).toContain('handle: Knut');
      // Built from the repo's own board files: a conference list with the
      // caller's marked, and the command icons' door list.
      expect(card).toMatch(/^1: .*\(the caller is here\)$/m);
      expect(card).toMatch(/doors and programs \(\d+\)/);
      // The real board's help gives the real meanings; the stock list is gone.
      // On this board F is the AquaScan door (icon `f`); the letter still means what the help says.
      expect(card).toMatch(/\bf \(File listings\)/i);
      // (this board has no D icon - its downloads run through the lister doors - so D is pinned on the fixture above)
      expect(systems.some((c: string) => c.includes('=== AMIEXPRESS BBS COMMANDS ==='))).toBe(false);
      // And the reply came back to the caller.
      expect(seen.join('')).toContain('Read the card, kid.');
    } finally {
      H.stopOperatorChatHandler();
    }
  });
});
