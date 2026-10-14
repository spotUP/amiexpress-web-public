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
  parseFeedItems,
  jsonItems,
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


describe('feed items keep their summary and url', () => {
  const REDDIT_ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>r/amiga</title>
  <entry>
    <author><name>/u/zed</name><uri>https://www.reddit.com/user/zed</uri></author>
    <content type="html">&lt;!-- SC_OFF --&gt;&lt;div class="md"&gt;&lt;p&gt;My A1200 &amp;amp; its new 68060 board boots&lt;/p&gt;&lt;/div&gt;&lt;!-- SC_ON --&gt;</content>
    <id>t3_abc</id>
    <link rel="self" href="https://www.reddit.com/r/amiga/comments/abc/feed.rss"/>
    <link href="https://www.reddit.com/r/amiga/comments/abc/a1200_boots/" rel="alternate"/>
    <title>A1200 boots</title>
  </entry>
</feed>`;

  it('reads Atom content text and the alternate link of a reddit feed', async () => {
    const { items } = await parseFeedItems(REDDIT_ATOM, 'reddit.com');
    expect(items).toHaveLength(1);
    expect(items[0].summary).toBe('My A1200 & its new 68060 board boots');
    expect(items[0].url).toBe('https://www.reddit.com/r/amiga/comments/abc/a1200_boots/');
  });

  it('reads a single Atom link and an html-typed summary', async () => {
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Fix</title>
      <link href="https://gitlab.com/x/-/commit/1"/><summary type="html">&lt;p&gt;Adds exploit&lt;/p&gt;</summary></entry></feed>`;
    const { items } = await parseFeedItems(xml, 'x');
    expect(items[0].summary).toBe('Adds exploit');
    expect(items[0].url).toBe('https://gitlab.com/x/-/commit/1');
  });

  it('still reads RSS 2.0 text links and descriptions', async () => {
    const xml = `<rss><channel><item><title>T</title><link>https://e.org/1</link><description>Plain text</description></item></channel></rss>`;
    const { items } = await parseFeedItems(xml, 'x');
    expect(items[0]).toMatchObject({ headline: 'T', summary: 'Plain text', url: 'https://e.org/1' });
  });

  it('gives a Hacker News row its own url, else its item page', () => {
    const src = NEWS_BULLETIN_SOURCES.find((s) => s.file === 'bull24.txt')!;
    const raw = JSON.stringify({ hits: [
      { title: 'With url', url: 'https://example.com/a', objectID: '11', points: 3 },
      { title: 'Ask HN: x', url: null, objectID: '22', points: 1 },
    ] });
    const items = jsonItems(raw, src);
    expect(items[0].url).toBe('https://example.com/a');
    expect(items[1].url).toBe('https://news.ycombinator.com/item?id=22');
  });
});

describe('feed teasers lose the source furniture (toBulletinText)', () => {
  const clean = (s: string) => toBulletinText(s);

  it.each([
    ['A tidy sentence about a board. [...]', 'A tidy sentence about a board.'],
    ['A tidy sentence about a board. […]', 'A tidy sentence about a board.'],
    ['A tidy sentence about a board …', 'A tidy sentence about a board'],
    ['A tidy sentence about a board...', 'A tidy sentence about a board'],
    ['A tidy sentence about a board. Read more', 'A tidy sentence about a board.'],
    ['A tidy sentence about a board. Continue reading →', 'A tidy sentence about a board.'],
    ['A tidy sentence about a board. [...] Read more', 'A tidy sentence about a board.'],
    [
      'A tidy sentence about a board. The post Amiga Thing appeared first on Hackaday.',
      'A tidy sentence about a board.',
    ],
    [
      'Body text [&#8230;] The post A Title. With Dots appeared first on Krebs on Security.',
      'Body text',
    ],
  ])('strips the tail of %j', (raw, want) => {
    expect(clean(raw)).toBe(want);
  });

  it('strips hackaday\'s glued "...read more" tail', () => {
    expect(clean('We build a clock from relays and a lot of patience...read more'))
      .toBe('We build a clock from relays and a lot of patience');
    expect(clean('A clock from relays…read more')).toBe('A clock from relays');
  });

  it('removes reddit\'s whole footer from real escaped content, mid-text after an image post', () => {
    // xml2js hands the parser the html below (one level of escaping removed).
    const html =
      '<table> <tr><td> <a href="https://www.reddit.com/r/amiga/comments/x/y/"> ' +
      '<img src="https://i.redd.it/abc.jpg" alt="A500 recap" /> </a> </td><td>&#32; ' +
      'submitted by &#32; <a href="https://www.reddit.com/user/zed"> /u/zed </a> ' +
      '<br/> <span><a href="https://i.redd.it/abc.jpg">[link]</a></span> &#32; ' +
      '<span><a href="https://www.reddit.com/r/amiga/comments/x/y/">[comments]</a></span> ' +
      '</td></tr></table>';
    expect(clean(html)).toBe('');
    // The same footer escaped twice, with text before and after it.
    const twice =
      'My A500 recap &lt;table&gt;&lt;tr&gt;&lt;td&gt;&#32; submitted by &#32; ' +
      '&lt;a href="x"&gt; /u/zed &lt;/a&gt; &lt;span&gt;&lt;a href="y"&gt;[link]&lt;/a&gt;&lt;/span&gt;' +
      '&#32; &lt;span&gt;[comments]&lt;/span&gt;&lt;/td&gt;&lt;/tr&gt;&lt;/table&gt; and more words';
    const out = clean(twice);
    expect(out).toBe('My A500 recap and more words');
    expect(out).not.toMatch(/submitted|\[link\]|\[comments\]|\/u\/|&#/);
  });

  it('leaves a normal sentence untouched, and cleaning twice changes nothing', () => {
    const s = 'Skaven released Copper Lights for the Amiga; read more about it in the readme, then ask u/someone.';
    expect(clean(s)).toBe(s);
    const dirty = 'text [...] Read more';
    expect(clean(clean(dirty))).toBe(clean(dirty));
  });
});


describe('a feed yields its newest items, whatever order it lists them in', () => {
  const rss = (rows: Array<[string, string | null]>): string =>
    `<rss><channel>${rows.map(([t, d]) => `<item><title>${t}</title><description>teaser ${t}</description>${d ? `<pubDate>${d}</pubDate>` : ''}</item>`).join('')}</channel></rss>`;
  const D = (n: number): string => new Date(Date.UTC(2020, 0, n)).toUTCString();

  it('an oldest-first feed (datagubbe.se) gives the newest items, not the oldest', async () => {
    const xml = rss([1, 2, 3, 4, 5, 6].map((n) => [`post${n}`, D(n)] as [string, string]));
    const { items } = await parseFeedItems(xml, 'x', 3);
    expect(items.map((i) => i.headline)).toEqual(['post6', 'post5', 'post4']);
  });

  it('a newest-first feed comes out unchanged', async () => {
    const xml = rss([6, 5, 4, 3, 2, 1].map((n) => [`post${n}`, D(n)] as [string, string]));
    const { items } = await parseFeedItems(xml, 'x', 3);
    expect(items.map((i) => i.headline)).toEqual(['post6', 'post5', 'post4']);
  });

  it('undated items keep document order, after the dated ones', async () => {
    const xml = rss([['undatedA', null], ['old', D(1)], ['undatedB', null], ['new', D(9)]]);
    const { items } = await parseFeedItems(xml, 'x', 10);
    expect(items.map((i) => i.headline)).toEqual(['new', 'old', 'undatedA', 'undatedB']);
  });

  it('an entirely undated feed is untouched, and an unreadable date counts as undated', async () => {
    const xml = rss([['a', null], ['b', 'not a date'], ['c', null]]);
    const { items } = await parseFeedItems(xml, 'x', 2);
    expect(items.map((i) => i.headline)).toEqual(['a', 'b']);
  });

  it('reads Atom published and updated dates too', async () => {
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom">
      <entry><title>older</title><summary>s</summary><updated>2021-01-01T00:00:00Z</updated></entry>
      <entry><title>newer</title><summary>s</summary><published>2024-05-01T00:00:00Z</published></entry></feed>`;
    const { items } = await parseFeedItems(xml, 'x', 1);
    expect(items[0].headline).toBe('newer');
  });

  it('datagubbe.se is on bull30 with a polite gap and a long interval', () => {
    const src = NEWS_BULLETIN_SOURCES.find((x) => x.source === 'datagubbe.se')!;
    expect(src).toMatchObject({ file: 'bull30.txt', url: 'https://www.datagubbe.se/atom.xml', title: 'datagubbe - old fogey computing' });
    expect(src.hostGapMs).toBeGreaterThanOrEqual(10000);
    expect(src.intervalMs).toBeGreaterThanOrEqual(6 * 60 * 60 * 1000);
    const help = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'Bulletins', 'BullHelp.txt'), 'latin1');
    expect(help).toContain('#30    datagubbe - old fogey computing');
  });
});
