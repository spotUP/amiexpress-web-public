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
  OWNED_BULLETIN_NUMBERS,
  parseFeed,
  parseJsonFeed,
  toBulletinText,
  sourceIsDue,
  resetNewsBulletinSchedule,
} from '../../src/services/news-bulletins';
import type { NewsBulletinDeps } from '../../src/services/news-bulletins';

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
  // Sources now hold to their own interval, so a suite that ran a source a
  // moment ago would see the next test skip it. Every test starts clean.
  beforeEach(() => resetNewsBulletinSchedule());

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
    // The second run must genuinely re-fetch, or "added once" would pass
    // because nothing was written at all.
    resetNewsBulletinSchedule();
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
  it('the two teletext pages are still the ones the door owns', () => {
    const teletext = NEWS_BULLETIN_SOURCES.filter((s) => s.kind === 'teletext').map((s) => s.file).sort();
    expect(teletext).toEqual(['bull7.txt', 'bull8.txt']);
  });

  it('every magazine page is a feed we can name and attribute', () => {
    const magazine = NEWS_BULLETIN_SOURCES.filter((s) => s.kind !== 'teletext');
    expect(magazine.length).toBeGreaterThan(20);
    for (const src of magazine) {
      expect(src.url).toMatch(/^https:\/\//);
      expect(src.source.length).toBeGreaterThan(0);
      expect(src.title.length).toBeGreaterThan(0);
    }
  });
});

/*
 * THE MAGAZINE. RSS and JSON sources, the same write path as SVT.
 */
const RSS = `<?xml version="1.0"?><rss version="2.0"><channel>
  <title>feed</title>
  <item><title>First headline</title><description>&lt;p&gt;A body with markup&lt;/p&gt;</description></item>
  <item><title>Second headline</title><description>Another body</description></item>
</channel></rss>`;

const ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
  <entry><title>Atom one</title><summary>summary text</summary></entry>
  <entry><title>Atom two</title><summary>more</summary></entry>
</feed>`;

function feedDeps(dir: string, body: string): NewsBulletinDeps {
  return {
    baseDir: () => dir,
    fetchPage: async () => null,
    fetchUrl: async () => ({ body }),
    now: () => new Date('2026-10-13T12:00:00Z'),
    log: () => {},
  };
}

describe('the underground magazine', () => {
  beforeEach(() => resetNewsBulletinSchedule());

  it('parses RSS 2.0 into title and body', async () => {
    const out = await parseFeed(RSS);
    expect(out).toContain('First headline');
    expect(out).toContain('A body with markup');
    expect(out).not.toContain('<p>');
    expect(out).toContain('Second headline');
  });

  it('parses Atom, which names its field summary not description', async () => {
    const out = await parseFeed(ATOM);
    expect(out).toContain('Atom one');
    expect(out).toContain('summary text');
  });

  it('parses a JSON endpoint through listPath and fields', () => {
    const src: any = { listPath: 'prod', fields: [{ label: '', path: 'name' }, { label: 'by', path: 'type' }] };
    const out = parseJsonFeed(JSON.stringify({ prod: { name: 'Copper Lights', type: 'intro' } }), src);
    expect(out).toBe('Copper Lights  by intro');
  });

  it('transliterates what a C64 caller has no glyph for', () => {
    // The board's own bulletin read "p?verkas" where the source said this.
    expect(toBulletinText('p\u00e5verkas inte')).toBe('paverkas inte');
    expect(toBulletinText('F\u00fcr die B\u00e4ume')).toBe('Fuer die Baeume');
    expect(toBulletinText('Stra\u00dfe')).toBe('Strasse');
    expect(toBulletinText('G\u0142\u00f3wne \u015b\u0105od\u0142')).toBe('Glowne szaodl');
  });

  it('a tick writes RSS pages as latin1 CRLF with the source attributed', async () => {
    const dir = mkBoard();
    const out = await refreshNewsBulletins(feedDeps(dir, RSS));
    expect(out).toBe('written');
    const raw = fs.readFileSync(path.join(dir, 'Bulletins', 'bull13.txt'), 'latin1');
    expect(raw).toContain('First headline');
    expect(raw).toContain('0x00sec.org');
    expect(raw).toContain('\r\n');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('leaves every owned number byte-identical', async () => {
    const dir = mkBoard();
    fs.writeFileSync(path.join(dir, 'Bulletins', 'bull11.txt'), 'checker\r\n', 'latin1');
    await refreshNewsBulletins(feedDeps(dir, RSS));
    for (const n of [1, 2, 3, 4, 5, 6, 9, 11]) {
      const f = path.join(dir, 'Bulletins', `bull${n}.txt`);
      if (fs.existsSync(f)) expect(fs.readFileSync(f, 'latin1')).toBe(n === 11 ? 'checker\r\n' : 'owned\r\n');
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('no source is aimed at a number another door owns', () => {
    for (const src of NEWS_BULLETIN_SOURCES) {
      const num = Number(/\d+/.exec(src.file)![0]);
      expect(OWNED_BULLETIN_NUMBERS.has(num)).toBe(false);
    }
  });

  it('a 304 keeps the file instead of rewriting it', async () => {
    const dir = mkBoard();
    fs.writeFileSync(path.join(dir, 'Bulletins', 'bull13.txt'), 'yesterday\r\n', 'latin1');
    const deps: NewsBulletinDeps = {
      baseDir: () => dir,
      fetchPage: async () => null,
      fetchUrl: async () => ({ body: null, notModified: true }),
      now: () => new Date(),
      log: () => {},
    };
    await refreshNewsBulletins(deps);
    expect(fs.readFileSync(path.join(dir, 'Bulletins', 'bull13.txt'), 'latin1')).toBe('yesterday\r\n');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('a source with its own interval waits for it', () => {
    const src: any = { file: 'bull33.txt', intervalMs: 30 * 60 * 1000 };
    const t0 = 1_000_000;
    expect(sourceIsDue(src, undefined, t0, 3600_000)).toBe(true);
    expect(sourceIsDue(src, t0, t0 + 60_000, 3600_000)).toBe(false);
    expect(sourceIsDue(src, t0, t0 + 31 * 60_000, 3600_000)).toBe(true);
  });

  it('two sources on one host are not fetched at the same moment', async () => {
    // Nine Reddit feeds at eight-second spacing returned one 200 and eight
    // 429s: the gate is why this magazine does not lock the board out of its
    // own sources. Asserted through the fetcher, which is what the gate wraps.
    const gaps: Record<string, number[]> = {};
    const dir = mkBoard();
    const deps: NewsBulletinDeps = {
      baseDir: () => dir,
      fetchPage: async () => null,
      fetchUrl: async (url) => {
        const host = new URL(url).host;
        gaps[host] = [...(gaps[host] ?? []), Date.now()];
        return { body: RSS };
      },
      now: () => new Date(),
      log: () => {},
    };
    await refreshNewsBulletins(deps);
    const reddit = gaps['www.reddit.com'] ?? [];
    expect(reddit.length).toBeGreaterThan(1);
    for (let i = 1; i < reddit.length; i++) expect(reddit[i] - reddit[i - 1]).toBeGreaterThan(0);
    fs.rmSync(dir, { recursive: true, force: true });
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
