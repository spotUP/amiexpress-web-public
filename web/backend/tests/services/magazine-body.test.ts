/**
 * FULL TEXT FOR THE MAGAZINE.
 *
 * Feeds that carry whole articles in `content:encoded` / Atom `<content>` used
 * to lose all but the teaser. Pinned here: the ingest keeps the text as plain
 * paragraphs, the prefetch asks a story page ONCE and politely (robots.txt, the
 * host gate, an honest agent, failures recorded), and the teletext page prints
 * the site name, never the address.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  ARTICLE_MIN_BODY_CHARS,
  MAGAZINE_DIR,
  MAGAZINE_STORIES_DIR,
  STORY_BODY_CAP,
  type Story,
} from '@amiexpress/bbs-door-sdk/formats/magazine';
import { FEED_BODY_MIN_CHARS, parseFeedItems } from '../../src/services/news-bulletins';
import { mergeIncoming } from '../../src/services/magazine';
import { composeStoryPage } from '../../src/services/magazine/compose';
import {
  ARTICLE_HOST_GAP_MS,
  BOARD_USER_AGENT,
  createRobotsCache,
  EXTRACT_REVISION,
  extractArticleText,
  parseRobots,
  prefetchBodies,
  robotsAllows,
  startBodyPrefetch,
  type HttpResult,
  type PrefetchDeps,
} from '../../src/services/magazine/body-prefetch';

const PARA = 'The relay chassis hums while the old contacts click through their sequence and the clock finds its second tick.';
const manyParagraphs = (n: number): string =>
  Array.from({ length: n }, (_, i) => `<p>${PARA} Number ${i}.</p>`).join('\n');

const RSS_FULL = `<?xml version="1.0"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>x</title>
<item>
  <title>A relay clock from the junk drawer</title>
  <link>https://example.org/relay-clock</link>
  <description><![CDATA[<p>We rebuild a clock from relays. [&#8230;]</p><p>The post A relay clock appeared first on Example.</p>]]></description>
  <content:encoded><![CDATA[<h2>Intro</h2>${manyParagraphs(8)}<figure><img src="a.png"></figure><script>alert(1)</script><p>The post A relay clock appeared first on Example.</p>]]></content:encoded>
</item>
<item>
  <title>Teaser only item</title>
  <link>https://example.org/teaser</link>
  <description>Just a sentence.</description>
</item>
</channel></rss>`;

const ATOM_FULL = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>x</title>
<entry>
  <title type="html">Zero day in a chip</title>
  <link rel="alternate" href="https://example.org/zero-day"/>
  <link rel="replies" href="https://example.org/zero-day#c"/>
  <content type="html">&lt;p&gt;${PARA} One.&lt;/p&gt;&lt;p&gt;${PARA} Two.&lt;/p&gt;&lt;p&gt;${PARA} Three.&lt;/p&gt;&lt;p&gt;${PARA} Four.&lt;/p&gt;</content>
</entry>
<entry>
  <title>Same teaser twice</title>
  <link href="https://example.org/same"/>
  <summary>A short teaser.</summary>
  <content type="html">A short teaser.</content>
</entry>
</feed>`;

describe('the ingest keeps a feed\'s full text', () => {
  it('turns content:encoded into plain paragraphs and leaves the teaser a teaser', async () => {
    const { items } = await parseFeedItems(RSS_FULL, 'example.org');
    const full = items[0];
    expect(full.summary).toBe('We rebuild a clock from relays.');
    expect(full.body).toBeDefined();
    const paragraphs = full.body!.split('\n\n');
    expect(paragraphs[0]).toBe('Intro');
    expect(paragraphs).toHaveLength(9);
    expect(paragraphs[1]).toBe(`${PARA} Number 0.`);
    expect(full.body).not.toMatch(/[<>]|alert|appeared first on|img/);
    expect(items[1].body).toBeUndefined();
  });

  it('turns an Atom <content> into the body and its first paragraph into the teaser', async () => {
    const { items } = await parseFeedItems(ATOM_FULL, 'example.org');
    expect(items[0].url).toBe('https://example.org/zero-day');
    expect(items[0].body!.split('\n\n')).toHaveLength(4);
    expect(items[0].body!.length).toBeGreaterThanOrEqual(FEED_BODY_MIN_CHARS);
    expect(items[0].summary).toBe(`${PARA} One.`);
  });

  it('does not call an Atom content that repeats the teaser a body', async () => {
    const { items } = await parseFeedItems(ATOM_FULL, 'example.org');
    expect(items[1].body).toBeUndefined();
    expect(items[1].summary).toBe('A short teaser.');
  });

  it('caps the body at the paragraph break under STORY_BODY_CAP', async () => {
    const huge = `<?xml version="1.0"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><item>
      <title>Long read</title><link>https://example.org/long</link><description>Teaser.</description>
      <content:encoded><![CDATA[${manyParagraphs(400)}]]></content:encoded></item></channel></rss>`;
    const { items } = await parseFeedItems(huge, 'example.org');
    const body = items[0].body!;
    expect(body.length).toBeLessThanOrEqual(STORY_BODY_CAP);
    expect(body.length).toBeGreaterThan(STORY_BODY_CAP - 300);
    expect(body.endsWith('.')).toBe(true);
    expect(body.split('\n\n').every((p) => p.startsWith('The relay chassis'))).toBe(true);
  });

  it('stores the body on a new story and completes a teased one from a later sighting', () => {
    const nowIso = '2026-10-14T10:00:00Z';
    const first = mergeIncoming([], [{ headline: 'Relay clocks are back', summary: 'Teaser.', source: 'a.org', url: 'https://a.org/1' }], nowIso);
    expect(first.stories[0].body).toBeUndefined();
    const second = mergeIncoming(first.stories, [{ headline: 'Relay clocks are back', summary: 'Teaser.', source: 'b.org', body: 'Full text. '.repeat(50).trim() }], nowIso);
    expect(second.stories[0].body).toMatch(/^Full text\./);
    const fresh = mergeIncoming([], [{ headline: 'Skaven ships a new Amiga intro', summary: 'T.', source: 'a.org', body: 'B '.repeat(300).trim() }], nowIso);
    expect(fresh.stories[0].body).toHaveLength(599);
  });
});

describe('robots.txt', () => {
  const txt = `User-agent: *\nDisallow: /private/\nAllow: /private/open/\nDisallow: /*.pdf$\n\nUser-agent: AmiExpress-BBS-Magazine\nDisallow: /news/secret\n`;
  it('prefers the group that names the board, else the * group', () => {
    const named = parseRobots(txt);
    expect(robotsAllows(named, '/news/secret/1')).toBe(false);
    expect(robotsAllows(named, '/private/x')).toBe(true); // the * group does not apply to a named agent
    const star = parseRobots(txt, 'SomeoneElse');
    expect(robotsAllows(star, '/private/x')).toBe(false);
    expect(robotsAllows(star, '/private/open/x')).toBe(true); // longest match wins
    expect(robotsAllows(star, '/a/b.pdf')).toBe(false);
    expect(robotsAllows(star, '/a/b.pdf?x=1')).toBe(true);
  });
});

describe('extracting the article from a page', () => {
  it('keeps the article paragraphs and drops navigation and scripts', () => {
    const page = `<html><head><title>t</title></head><body>
      <nav><a href="/">Home</a><a href="/about">About us</a><a href="/x">Shop</a></nav>
      <article><h1>A relay clock</h1>${manyParagraphs(10)}</article>
      <footer>Copyright someone <a href="/privacy">Privacy</a></footer><script>var x=1</script></body></html>`;
    const text = extractArticleText(page, 'https://example.org/a')!;
    expect(text).toContain(`${PARA} Number 3.`);
    expect(text).not.toMatch(/About us|Copyright|var x/);
    expect(text.split('\n\n').length).toBeGreaterThanOrEqual(10);
  });
  it('returns null for a page with no article', () => {
    expect(extractArticleText('<html><body><p>Hi.</p></body></html>', 'https://example.org/')).toBeNull();
  });
});

describe('the body prefetch', () => {
  let root: string;
  const NOW = new Date('2026-10-14T12:00:00Z');

  const story = (id: string, url: string, extra: Partial<Story> = {}): Story => ({
    id, headline: `Headline ${id}`, summary: 'Teaser.', format: 'NEWS', desk: 'hack', date: '2026-10-14',
    source: 'example.org', url, firstSeen: '2026-10-14T10:00:00Z', seenCount: 1, origin: 'feed', ...extra,
  });
  const write = (st: Story): void => {
    fs.writeFileSync(path.join(root, MAGAZINE_DIR, MAGAZINE_STORIES_DIR, `${st.id}.json`), JSON.stringify(st));
  };
  const read = (id: string): Story => JSON.parse(fs.readFileSync(path.join(root, MAGAZINE_DIR, MAGAZINE_STORIES_DIR, `${id}.json`), 'utf8'));

  const PAGE = `<html><body><article><h1>T</h1>${manyParagraphs(14)}</article></body></html>`;

  function deps(respond: (url: string) => HttpResult) {
    const http = jest.fn(async (url: string) => respond(url));
    const gate = jest.fn(async () => {});
    const d: PrefetchDeps = {
      rootDir: () => root, now: () => NOW, log: () => {},
      http, gate, extract: extractArticleText, robots: createRobotsCache(),
    };
    return { d, http, gate };
  }
  const robots200 = (body = 'User-agent: *\nDisallow:\n'): HttpResult => ({ status: 200, body, contentType: 'text/plain' });
  const html200 = (): HttpResult => ({ status: 200, body: PAGE, contentType: 'text/html; charset=utf-8' });

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'mag-body-'));
    fs.mkdirSync(path.join(root, MAGAZINE_DIR, MAGAZINE_STORIES_DIR), { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('gives the story its page as soon as its text lands (startBodyPrefetch republishes)', async () => {
    write(story('s1', 'https://example.org/a/1'));
    const { d } = deps((u) => (u.endsWith('/robots.txt') ? robots200() : html200()));
    startBodyPrefetch({ rootDir: d.rootDir, now: d.now, log: d.log }, d);
    const indexFile = path.join(root, MAGAZINE_DIR, 'index.json');
    for (let i = 0; i < 100 && !fs.existsSync(indexFile); i++) await new Promise((r) => setTimeout(r, 20));
    expect(JSON.parse(fs.readFileSync(indexFile, 'utf8')).map((e: { storyId: string }) => e.storyId)).toEqual(['s1']);
  });

  it('fetches a new teaser-only story once and stores its text as the body', async () => {
    write(story('s1', 'https://example.org/a/1'));
    const { d, http } = deps((u) => (u.endsWith('/robots.txt') ? robots200() : html200()));
    const out = await prefetchBodies(d);
    expect(out.fetched).toBe(1);
    const saved = read('s1');
    expect(saved.body!.length).toBeGreaterThanOrEqual(ARTICLE_MIN_BODY_CHARS);
    expect(saved.bodyFailed).toBeUndefined();
    expect(saved.summary).toBe('Teaser.');
    // The honest agent, on the robots request and the page request.
    expect(http).toHaveBeenCalledTimes(2);
    for (const call of http.mock.calls as unknown as Array<[string, { userAgent: string; timeoutMs: number }]>) {
      expect(call[1].userAgent).toBe(BOARD_USER_AGENT);
      expect(call[1].userAgent).toMatch(/AmiExpress-BBS-Magazine.*bbs\.uprough\.net/);
      expect(call[1].timeoutMs).toBe(15000);
    }
  });

  it('goes through the host gate for robots.txt and for the page', async () => {
    write(story('s1', 'https://example.org/a/1'));
    const { d, gate } = deps((u) => (u.endsWith('/robots.txt') ? robots200() : html200()));
    await prefetchBodies(d);
    expect(gate.mock.calls.map((c) => (c as unknown as [string, number])[0])).toEqual([
      'https://example.org/robots.txt',
      'https://example.org/a/1',
    ]);
    for (const c of gate.mock.calls as unknown as Array<[string, number]>) expect(c[1]).toBeGreaterThanOrEqual(ARTICLE_HOST_GAP_MS);
  });

  it('does not fetch the page when robots.txt disallows it, and does not ask again', async () => {
    write(story('s1', 'https://example.org/private/1'));
    const { d, http } = deps((u) => (u.endsWith('/robots.txt') ? robots200('User-agent: *\nDisallow: /private/\n') : html200()));
    const out = await prefetchBodies(d);
    expect(out.failed).toBe(1);
    expect(http.mock.calls.map((c) => c[0])).toEqual(['https://example.org/robots.txt']);
    expect(read('s1').body).toBeUndefined();
    expect(read('s1').bodyFailed!.reason).toMatch(/robots/);
    http.mockClear();
    await prefetchBodies(d);
    expect(http).not.toHaveBeenCalled();
  });

  it('keeps the teaser on a 403 and never retries it', async () => {
    write(story('s1', 'https://example.org/a/1'));
    const { d, http } = deps((u) => (u.endsWith('/robots.txt') ? robots200() : { status: 403, body: 'no' }));
    await prefetchBodies(d);
    const saved = read('s1');
    expect(saved.body).toBeUndefined();
    expect(saved.summary).toBe('Teaser.');
    expect(saved.bodyFailed).toEqual({ at: NOW.toISOString(), reason: 'HTTP 403' });
    http.mockClear();
    const again = await prefetchBodies({ ...d, robots: createRobotsCache() });
    expect(http).not.toHaveBeenCalled();
    expect(again).toEqual({ fetched: 0, pictured: 0, failed: 0, deferred: 0, reextracted: 0 });
  });

  it('records a timeout as a failure too', async () => {
    write(story('s1', 'https://example.org/a/1'));
    const { d } = deps((u) => (u.endsWith('/robots.txt') ? robots200() : { status: 0, body: null, error: 'timeout of 15000ms exceeded' }));
    await prefetchBodies(d);
    expect(read('s1').bodyFailed!.reason).toMatch(/timeout/);
  });

  it('never refetches a story that already has a body read by the current extractor', async () => {
    write(story('s1', 'https://example.org/a/1', { body: 'Already here. '.repeat(100).trim(), extracted: EXTRACT_REVISION }));
    const { d, http } = deps(() => html200());
    const out = await prefetchBodies(d);
    expect(http).not.toHaveBeenCalled();
    expect(out.fetched).toBe(0);
    expect(read('s1').body).toMatch(/^Already here/);
  });

  it('asks each host for robots.txt once, however many stories it holds', async () => {
    write(story('s1', 'https://example.org/a/1'));
    write(story('s2', 'https://example.org/a/2', { firstSeen: '2026-10-14T09:00:00Z' }));
    const { d, http } = deps((u) => (u.endsWith('/robots.txt') ? robots200() : html200()));
    const out = await prefetchBodies(d);
    expect(out.fetched).toBe(2);
    expect(http.mock.calls.filter((c) => c[0].endsWith('/robots.txt'))).toHaveLength(1);
  });

  it('defers, without recording a failure, when robots.txt itself cannot be read', async () => {
    write(story('s1', 'https://example.org/a/1'));
    const { d, http } = deps((u) => (u.endsWith('/robots.txt') ? { status: 503, body: null } : html200()));
    const out = await prefetchBodies(d);
    expect(out.deferred).toBe(1);
    expect(http).toHaveBeenCalledTimes(1);
    expect(read('s1').bodyFailed).toBeUndefined();
  });

  it('skips old stories, authored stories and stories with no address', async () => {
    write(story('old', 'https://example.org/old', { firstSeen: '2026-09-01T00:00:00Z' }));
    write(story('auth', 'https://example.org/auth', { origin: 'authored' }));
    write(story('nourl', ''));
    const { d, http } = deps(() => html200());
    await prefetchBodies(d);
    expect(http).not.toHaveBeenCalled();
  });
});

describe('the teletext story page', () => {
  it('names the site and prints no address', () => {
    const page = composeStoryPage(
      { headline: 'A relay clock', summary: 'We rebuild a clock.', format: 'NEWS', source: 'www.hackaday.com', date: '2026-10-14' },
      120, 'HACKING & PHREAKING', 22,
    );
    const text = page.rows.map((r) => r.text).join('\n');
    expect(text).toContain('Source: hackaday.com');
    expect(text).not.toMatch(/https?:|www\./);
  });
});
