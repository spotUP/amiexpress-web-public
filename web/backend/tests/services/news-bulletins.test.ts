/**
 * WEB_NEWS_BULLETINS: Text-TV pages become root bulletins, on disk.
 *
 * Everything runs against a temp dir with an injected fetcher - no net,
 * no board. What is pinned: the owned numbers (1-6, 9) are never touched,
 * a dead fetch keeps yesterday's file, BullHelp lines are added once, the
 * file is latin1 CRLF, and overlapping ticks never stack.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  refreshNewsBulletins,
  ensureBullHelpLine,
  NEWS_BULLETIN_SOURCES,
  type NewsBulletinDeps,
} from '../../src/services/news-bulletins';

function depsFor(dir: string, fetch: (page: string) => Promise<string | null>): NewsBulletinDeps {
  return {
    baseDir: () => dir,
    fetchPage: fetch,
    now: () => new Date('2026-09-10T12:00:00Z'),
    log: () => {},
  };
}

function mkBoard(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'newsbull-'));
  fs.mkdirSync(path.join(dir, 'Bulletins'), { recursive: true });
  // Owned numbers the poster must never touch.
  fs.writeFileSync(path.join(dir, 'Bulletins', 'bull1.txt'), 'owned\r\n', 'latin1');
  fs.writeFileSync(path.join(dir, 'Bulletins', 'bull9.txt'), 'owned\r\n', 'latin1');
  return dir;
}

describe('news bulletins', () => {
  it('writes bull7 (news) and bull8 (sport) as latin1 CRLF', async () => {
    const dir = mkBoard();
    const seen: string[] = [];
    const out = await refreshNewsBulletins(depsFor(dir, async (page) => {
      seen.push(page);
      return `--- page ${page}: Headline ---\nBody line`;
    }));
    expect(out).toBe('written');
    expect(seen).toEqual(['100', '300']);
    for (const f of ['bull7.txt', 'bull8.txt']) {
      const raw = fs.readFileSync(path.join(dir, 'Bulletins', f), 'latin1');
      expect(raw).toContain('Headline');
      expect(raw).toContain('texttv.nu');
      expect(raw).toContain('\r\n');
    }
    expect(fs.readFileSync(path.join(dir, 'Bulletins', 'bull1.txt'), 'latin1')).toBe('owned\r\n');
    expect(fs.readFileSync(path.join(dir, 'Bulletins', 'bull9.txt'), 'latin1')).toBe('owned\r\n');
    fs.rmSync(dir, { recursive: true, force: true });
  });
  it('a dead fetch keeps yesterday\'s file', async () => {
    const dir = mkBoard();
    fs.writeFileSync(path.join(dir, 'Bulletins', 'bull7.txt'), 'yesterday\r\n', 'latin1');
    const out = await refreshNewsBulletins(depsFor(dir, async () => null));
    expect(out).toBe('kept');
    expect(fs.readFileSync(path.join(dir, 'Bulletins', 'bull7.txt'), 'latin1')).toBe('yesterday\r\n');
    fs.rmSync(dir, { recursive: true, force: true });
  });
  it('a throwing fetch keeps yesterday\'s file too', async () => {
    const dir = mkBoard();
    const out = await refreshNewsBulletins(depsFor(dir, async () => { throw new Error('socket hang up'); }));
    expect(out).toBe('kept');
    fs.rmSync(dir, { recursive: true, force: true });
  });
  it('BullHelp lines are added once, never duplicated', async () => {
    const dir = mkBoard();
    await refreshNewsBulletins(depsFor(dir, async () => 'Body'));
    await refreshNewsBulletins(depsFor(dir, async () => 'Body'));
    const help = fs.readFileSync(path.join(dir, 'Bulletins', 'BullHelp.txt'), 'latin1');
    expect(help.match(/^#7\b/gm)?.length).toBe(1);
    expect(help.match(/^#8\b/gm)?.length).toBe(1);
    fs.rmSync(dir, { recursive: true, force: true });
  });
  it('ensureBullHelpLine leaves an existing entry alone', () => {
    const dir = mkBoard();
    fs.writeFileSync(path.join(dir, 'Bulletins', 'BullHelp.txt'), '#7    My title\n', 'latin1');
    ensureBullHelpLine(path.join(dir, 'Bulletins'), 7, 'Other title');
    expect(fs.readFileSync(path.join(dir, 'Bulletins', 'BullHelp.txt'), 'latin1')).toBe('#7    My title\n');
    fs.rmSync(dir, { recursive: true, force: true });
  });
  it('the sources are exactly the free live numbers', () => {
    expect(NEWS_BULLETIN_SOURCES.map((s) => s.file).sort()).toEqual(['bull7.txt', 'bull8.txt']);
  });
});

/*
 * The board's bulletin menu is the list of its bulletins, in the one format
 * the news tick also writes - so the tick finds its own lines and leaves the
 * menu alone. It shipped as a Card Lobby leftover with the tick's two lines
 * appended under it (sysop, 2026-10-06: "fix it").
 */
describe('the shipped BullHelp.txt', () => {
  const shipped = require('path').join(__dirname, '..', '..', '..', '..', 'Bulletins', 'BullHelp.txt');

  it('lists the board\'s bulletins, not the Card Lobby\'s', () => {
    const text = require('fs').readFileSync(shipped, 'latin1');
    expect(text).not.toContain('CARD LOBBY');
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) expect(text).toMatch(new RegExp(`^#${n}\\b`, 'm'));
  });

  it('is left unchanged by the news tick', () => {
    const fsMod = require('fs');
    const os = require('os');
    const pathMod = require('path');
    const dir = fsMod.mkdtempSync(pathMod.join(os.tmpdir(), 'bullhelp-'));
    fsMod.copyFileSync(shipped, pathMod.join(dir, 'BullHelp.txt'));
    const before = fsMod.readFileSync(pathMod.join(dir, 'BullHelp.txt'), 'latin1');
    const { ensureBullHelpLine, NEWS_BULLETIN_SOURCES } = require('../../src/services/news-bulletins');
    NEWS_BULLETIN_SOURCES.forEach((src: { file: string; title: string }) => {
      ensureBullHelpLine(dir, parseInt(/\d+/.exec(src.file)![0], 10), src.title);
    });
    expect(fsMod.readFileSync(pathMod.join(dir, 'BullHelp.txt'), 'latin1')).toBe(before);
  });
});
