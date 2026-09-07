/**
 * The AI co-sysop answers "how do I ..." from the board's own help.
 *
 * K2 of the plan: the user guide, express's BBSHelp.txt, the menu screen and
 * the caller's bulletins, chunked by heading and retrieved per question by
 * word overlap. The sysop guide only for level 100 and up. And the guides
 * must be IN the image, or live retrieves from an empty directory.
 */
process.env.SKIP_DB_INIT = '1';
jest.setTimeout(20000);

import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import { chunkMarkdown, chunkBbsHelp, retrieve, retrievedAsPrompt, RETRIEVAL_BUDGET_CHARS } from '../../../src/handlers/sysop-ai/corpus';
import { OperatorChatRepository } from '../../../src/database/operator-chat.repository';
import { registerConnectionEmitter } from '../../../src/server/session-emitter-registry';
import { userSessions } from '../../../src/server/session-manager';

jest.mock('axios');
import axios from 'axios';

const REPO = path.resolve(__dirname, '../../../../..');
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function fixture(): { bbsRoot: string; repoRoot: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'corpus-'));
  fs.mkdirSync(path.join(root, 'Documentation', '1-Users'), { recursive: true });
  fs.mkdirSync(path.join(root, 'Documentation', '2-Sysops'), { recursive: true });
  fs.mkdirSync(path.join(root, 'Screens'), { recursive: true });
  fs.mkdirSync(path.join(root, 'Conf1', 'Bulletins'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Documentation', '1-Users', 'USER_GUIDE.md'), [
    '# User Guide', '', '## Table of Contents', '- stuff', '',
    '## File Operations', '', '### Downloading Files (`D`)', 'Type D, then the filename. Flag files first with A. Zmodem is the default protocol.', '',
    '### Uploading Files (`U`)', 'Type U and start the transfer in your terminal.', '',
    '## Chat & Communication', '', '### Operator Page (`O`)', 'Press O to page the sysop. Wait for the dots.', '',
  ].join('\n'));
  fs.writeFileSync(path.join(root, 'Documentation', '2-Sysops', 'SYSOP_GUIDE.md'), [
    '# Sysop Guide', '', '## Editing Users', 'Use the admin to edit a user\'s security level and ratio.', '',
  ].join('\n'));
  fs.writeFileSync(path.join(root, 'BBSHelp.txt'), [
    '~', '    BBS commands:', '', "      \x1b[36m'Z' \x1b[35m- \x1b[33mZippy text search\x1b[0m", '             Searches every file description for a word you give it.', '',
    "      \x1b[36m'N' \x1b[35m- \x1b[33mNew files\x1b[0m", '             Lists files uploaded since a date.', '~',
  ].join('\n'), 'latin1');
  fs.writeFileSync(path.join(root, 'Screens', 'MENU.TXT'), '\x1b[36m[F]iles [R]ead [O]perator page [G]oodbye\x1b[0m\n', 'latin1');
  fs.writeFileSync(path.join(root, 'Conf1', 'Bulletins', 'bull1.txt'), '\x1b[1mDowntime Friday 22:00\x1b[0m\r\nThe disk swap takes an hour.\r\n', 'latin1');
  return { bbsRoot: root, repoRoot: root };
}

describe('chunking', () => {
  it('markdown by heading, without the table of contents', () => {
    const chunks = chunkMarkdown('User Guide', fs.readFileSync(path.join(fixture().repoRoot, 'Documentation/1-Users/USER_GUIDE.md'), 'utf8'), 0);
    expect(chunks.map((c) => c.title)).toEqual(['Downloading Files (`D`)', 'Uploading Files (`U`)', 'Operator Page (`O`)']);
  });
  it("BBSHelp.txt by its 'X' - headings, colour codes gone", () => {
    const chunks = chunkBbsHelp(fs.readFileSync(path.join(fixture().bbsRoot, 'BBSHelp.txt'), 'latin1'));
    const z = chunks.find((c) => c.title.startsWith('Z'));
    expect(z).toBeDefined();
    expect(z!.title).toBe('Z - Zippy text search');
    expect(z!.text).not.toContain('\x1b');
    expect(z!.text).toContain('Searches every file description');
  });
});

describe('retrieval', () => {
  it('a download question finds the download section first, a search question the Z help', () => {
    const f = fixture();
    const top = retrieve('how do I download a file?', f, 30, 1);
    expect(top[0]!.title).toBe('Downloading Files (`D`)');
    const z = retrieve('can I search the file descriptions for a word', f, 30, 1);
    expect(z[0]!.title).toBe('Z - Zippy text search');
  });
  it("a bulletin is retrievable, and the sysop guide only from level 100", () => {
    const f = fixture();
    expect(retrieve('when is the downtime', f, 30, 1)[0]!.source).toBe('bulletin bull1');
    expect(retrieve('how do I edit a user security level', f, 30, 1).some((c) => c.source === 'Sysop Guide')).toBe(false);
    expect(retrieve('how do I edit a user security level', f, 255, 1)[0]!.source).toBe('Sysop Guide');
  });
  it('nothing in common with the corpus means nothing retrieved, and the budget holds', () => {
    const f = fixture();
    expect(retrieve('zxq qwv', f, 30, 1)).toEqual([]);
    expect(retrieve('', f, 30, 1)).toEqual([]);
    const total = retrieve('download upload page files search', f, 30, 1).reduce((a, c) => a + c.text.length, 0);
    expect(total).toBeLessThanOrEqual(RETRIEVAL_BUDGET_CHARS + 700);
    expect(retrievedAsPrompt([])).toBeUndefined();
  });
  it('a bulletin written after the index was built is found', () => {
    const f = fixture();
    retrieve('anything', f, 30, 1);
    fs.writeFileSync(path.join(f.bbsRoot, 'Conf1', 'Bulletins', 'bull2.txt'), 'New door: Tetris Attack is installed.\r\n', 'latin1');
    expect(retrieve('is tetris attack installed', f, 30, 1)[0]!.source).toBe('bulletin bull2');
  });
});

describe('the guides ship in the image', () => {
  it('the Dockerfile copies both guides where the backend reads them', () => {
    const dockerfile = fs.readFileSync(path.join(REPO, 'Dockerfile'), 'utf8');
    expect(dockerfile).toMatch(/^COPY Documentation\/1-Users\/USER_GUIDE\.md \/app\/Documentation\/1-Users\/USER_GUIDE\.md$/m);
    expect(dockerfile).toMatch(/^COPY Documentation\/2-Sysops\/SYSOP_GUIDE\.md \/app\/Documentation\/2-Sysops\/SYSOP_GUIDE\.md$/m);
    expect(fs.existsSync(path.join(REPO, 'Documentation/1-Users/USER_GUIDE.md'))).toBe(true);
  });
});

describe('the retrieved help reaches the model', () => {
  it('a download question POSTs the download section of the real guide as a system message', async () => {
    const db = new Database(':memory:');
    const repo = new OperatorChatRepository(db);
    repo.updateConfig({
      enabled: true, pageTimeout: 1, aiEnabled: true, aiProvider: 'openrouter', aiModelName: 'test/free-model',
      openRouterApiKey: 'test-key', botThinkTime: 0, botTypingSpeed: 1, botTypoProbability: 0, allowedSecLevels: [], pageCooldown: 0,
    } as any);
    const io: any = { fetchSockets: async () => [], on() {}, emit() {}, to: () => ({ emit() {} }), in: () => ({ emit() {} }), sockets: { adapter: { rooms: new Map() }, sockets: new Map() } };
    io.of = () => io;
    const session: any = {
      user: { id: 'u-corpus', username: 'Knut', secLevel: 30, timeTotal: 3600, timeUsed: 0 }, nodeId: 4, connectionType: 'telnet',
      currentConf: 1, currentConfName: 'General', tempData: {}, subState: 'LOGGED_ON', inputBuffer: '',
    };
    registerConnectionEmitter(session, { emit() {}, on() {}, listenerCount: () => 0 } as any);
    userSessions.set('u-corpus', session);
    const posts: any[] = [];
    (axios.post as jest.Mock).mockImplementation(async (url: string, body: any) => {
      posts.push({ url, body });
      return { data: { choices: [{ message: { content: 'Type D, kid.' } }] } };
    });
    const H = require('../../../src/handlers/operator-chat.handler');
    H.initOperatorChatHandler(io, repo);
    try {
      await H.handlePageSysop({ id: 's', emit() {}, on() {}, join() {}, rooms: new Set(), session }, session, io, repo);
      await wait(3200);
      await H.handleUserChatMessage(io, repo, session, 'how do I download a file from here?');
      await wait(2500);
      const post = posts.find((p) => String(p.url).includes('openrouter.ai'));
      expect(post).toBeDefined();
      const help = post.body.messages.filter((m: any) => m.role === 'system').map((m: any) => String(m.content)).find((c: string) => c.startsWith("=== FROM THE BOARD'S OWN HELP"));
      expect(help).toBeDefined();
      expect(help).toMatch(/Downloading Files/);
    } finally {
      H.stopOperatorChatHandler();
    }
  });
});
