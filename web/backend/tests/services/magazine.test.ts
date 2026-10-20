/**
 * THE EDITORIAL LAYER.
 *
 * The bulletins are a monitoring surface; this is the magazine that would be
 * forbidden to be one (§17: "Do not reduce it to a list of RSS headlines").
 * What is pinned: six feeds carrying one story is ONE story, a headline that is
 * only generic words is refused, a desk full of pages spills into the archive
 * instead of overwriting a neighbour, and the front page carries nothing that
 * a human did not approve.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  mergeIncoming,
  allocatePages,
  publishMagazine,
  purgeNeverArticles,
  republishMagazine,
  loadStories,
  refreshMagazine,
  readApproved,
  writeApproved,
  writeAtomic,
  watchFrontPage,
  type IncomingItem,
} from '../../src/services/magazine';
import { writeFrontFile } from '@amiexpress/bbs-door-sdk/formats/magazine-front-file';
import { classify, classifyFormat } from '../../src/services/magazine/classify';
import { isWorthReading, storyId, normaliseHeadline, type Story } from '../../src/services/magazine/story-store';
import { ARTICLE_MIN_BODY_CHARS, sidecarPath } from '@amiexpress/bbs-door-sdk/formats/magazine';
import { clipUrlHash } from '../../src/services/magazine/video-service';
import { loadIndex, loadFront } from '../../../../Doors/magazine/library';
import { composeStoryPage, wrap, toWidth, renderPage } from '../../src/services/magazine/compose';

function depsFor(dir: string) {
  return { rootDir: () => dir, now: () => new Date('2026-10-13T12:00:00Z'), log: () => {} };
}

function item(headline: string, summary = 'Some detail about it.', source = '0x00sec.org'): IncomingItem {
  return { headline, summary, source };
}

describe('the story store', () => {
  it('gives the same headline the same id whatever case or punctuation', () => {
    expect(storyId('Crackme Released!')).toBe(storyId('crackme released'));
    expect(normaliseHeadline('The Hacker News - A Thing')).toBe('the hacker news a thing');
  });

  it('refuses a headline that is only generic words (§15)', () => {
    expect(isWorthReading('New release out now')).toBe(false);
    expect(isWorthReading('Click here')).toBe(false);
    expect(isWorthReading('Skaven releases Copper Lights for Amiga')).toBe(true);
  });

  it('keeps a short real title when its summary says what it is about', () => {
    // datagubbe.se "New Pixel Art": 'Pixel Art' alone is two words.
    expect(isWorthReading('New Pixel Art', 'Some pixel art I made for the Amiga in Deluxe Paint')).toBe(true);
    expect(isWorthReading('New Pixel Art')).toBe(false);
    // A headline of only generic words stays out whatever the summary says.
    expect(isWorthReading('Click here', 'Some pixel art I made for the Amiga in Deluxe Paint')).toBe(false);
    expect(isWorthReading('New release', 'Read more')).toBe(false);
    expect(mergeIncoming([], [item('New Pixel Art', 'Some pixel art I made for the Amiga in Deluxe Paint')], '2026-10-20T12:00:00Z').added).toBe(1);
  });
});

describe('deduplication (§14 step 4)', () => {
  it('six feeds carrying one story produce one story', () => {
    const feeds = [
      'Skaven releases Copper Lights',
      'Skaven releases Copper Lights!',
      'SKAVEN RELEASES COPPER LIGHTS',
      'Skaven releases Copper Lights - The Hacker News',
      'Skaven releases Copper Lights (Amiga)',
    ];
    const { stories, added, duplicates } = mergeIncoming([], feeds.map((h) => item(h)), '2026-10-13T12:00:00Z');
    expect(added).toBe(1);
    expect(duplicates).toBe(feeds.length - 1);
    expect(stories).toHaveLength(1);
  });

  it('counts a repeat sighting rather than forgetting the story', () => {
    const first = mergeIncoming([], [item('Copper Lights ships')], '2026-10-13T12:00:00Z');
    const second = mergeIncoming(first.stories, [item('Copper Lights ships')], '2026-10-13T13:00:00Z');
    expect(second.stories[0].seenCount).toBe(2);
    expect(second.stories[0].firstSeen).toBe('2026-10-13T12:00:00Z');
  });

  it('keeps the longer summary when a fuller feed reports the same story', () => {
    const first = mergeIncoming([], [item('Copper Lights ships', 'short')], '2026-10-13T12:00:00Z');
    const second = mergeIncoming(first.stories, [item('Copper Lights ships', 'a much longer explanation of it')], '2026-10-13T12:00:00Z');
    expect(second.stories[0].summary).toContain('much longer');
  });

  it('refuses a headline with nothing in it', () => {
    const { stories, rejected } = mergeIncoming([], [item('   '), item('New release')], '2026-10-13T12:00:00Z');
    expect(stories).toHaveLength(0);
    expect(rejected).toBe(2);
  });
});

describe('classification (§3, §5)', () => {
  it('puts each story on the desk the brief gives it', () => {
    expect(classify({ headline: 'New Detroit electro record from Channel Awesome', summary: '', source: 'test' })).toBe('music');
    expect(classify({ headline: 'New Amiga demo released', summary: 'a 68k intro', source: 'test' })).toBe('scene');
    expect(classify({ headline: 'New RCE in OpenSSL', summary: 'exploit available', source: 'test' })).toBe('hack');
    // A source's home desk applies only when the words carry no signal of their own.
    expect(classify({ headline: 'Why I still like small computers', summary: 'a rant about nothing in particular', source: 'datagubbe.se' })).toBe('scene');
    expect(classify({ headline: 'Why I still like small computers', summary: 'a rant about nothing in particular', source: 'test' })).toBe('general');
    expect(classify({ headline: 'New RCE in OpenSSL', summary: 'exploit available', source: 'datagubbe.se' })).toBe('hack');
    expect(classify({ headline: 'Wildstyle piece on a freight train', summary: 'graffiti crew', source: 'test' })).toBe('graffiti');
    expect(classify({ headline: 'Something happened', summary: '', source: 'test' })).toBe('general');
  });

  it('does not let the chattiest feed take a desk it does not own', () => {
    // A security headline that merely mentions a band name is still security.
    expect(classify({ headline: 'CVE in Acid CMS', summary: 'remote code execution, patch available', source: 'test' })).toBe('hack');
  });

  it('names the editorial format from the wording', () => {
    expect(classifyFormat({ headline: 'Foo EP out now', summary: '' })).toBe('RELEASE');
    expect(classifyFormat({ headline: 'A talk with Skaven', summary: 'an interview' })).toBe('INTERVIEW');
    expect(classifyFormat({ headline: 'How the Amiga coprocessor bug happened', summary: 'technique' })).toBe('TECHNIQUE');
    expect(classifyFormat({ headline: 'Lost tracker disk recovered from a hard drive', summary: '' })).toBe('ARCHIVE');
  });
});

describe('story files round-trip', () => {
  it('keeps a story whose picture caption has an em dash', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mag-utf8-'));
    const story = { id: 'e1', headline: 'Dash', media: [{ kind: 'image', url: 'u', alt: 'one \u2014 two' }] };
    writeAtomic(path.join(dir, 'e1.json'), JSON.stringify(story, null, 2));
    const loaded = loadStories(dir) as unknown as Array<typeof story>;
    expect(loaded.map((s) => s.media[0].alt)).toEqual(['one \u2014 two']);
  });

  it('still writes Amiga page text as one byte per character', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mag-page-')), 'p101.txt');
    writeAtomic(file, 'caf\u00e9', 'latin1');
    expect([...fs.readFileSync(file)]).toEqual([0x63, 0x61, 0x66, 0xe9]);
  });
});

describe('page allocation (§12)', () => {
  const mk = (n: number, desk: Story['desk']): Story => ({
    id: `s${n}`, headline: `Story number ${n}`, summary: 'x', format: 'NEWS',
    desk, date: '2026-10-13', source: 's', firstSeen: 'now', seenCount: 1, origin: 'authored',
  });

  it('gives every story a page inside its own family', () => {
    const pages = allocatePages([mk(1, 'music'), mk(2, 'hack'), mk(3, 'scene')]);
    expect(pages.get('s1')).toBeGreaterThanOrEqual(400);
    expect(pages.get('s1')).toBeLessThanOrEqual(419);
    expect(pages.get('s2')).toBeGreaterThanOrEqual(120);
    expect(pages.get('s3')).toBeGreaterThanOrEqual(200);
  });

  it('spills into the archive rather than overwriting a neighbour', () => {
    const many = Array.from({ length: 40 }, (_, i) => mk(i, 'music'));
    const pages = allocatePages(many);
    const all = [...pages.values()];
    expect(new Set(all).size).toBe(all.length);
    // Nothing was silently dropped.
    expect(all.length).toBe(40);
    expect(Math.max(...all)).toBeGreaterThan(419);
  });

  it('gives a full desk to the stories the newest tick saw when they share a date', () => {
    const at = (n: number, seen: string): Story => ({ ...mk(n, 'general'), firstSeen: seen });
    const old = Array.from({ length: 80 }, (_, i) => at(i, '2026-10-13T08:00:00.000Z'));
    const fresh = Array.from({ length: 5 }, (_, i) => at(100 + i, '2026-10-13T22:00:00.000Z'));
    // Fresh stories last, so input order alone would leave them without a page.
    const pages = allocatePages([...old, ...fresh]);
    for (const s of fresh) {
      expect(pages.get(s.id)).toBeGreaterThanOrEqual(101);
      expect(pages.get(s.id)).toBeLessThanOrEqual(119);
    }
  });
});

describe('composing for forty columns (§6)', () => {
  it('never emits a row wider than the screen', () => {
    const page = composeStoryPage(
      { headline: 'A headline that is deliberately far too long to fit on one row of a teletext screen', summary: 'body', format: 'NEWS', source: 's' },
      400, 'MUSIC & RADIO', 24,
    );
    for (const row of page.rows) expect(row.text.length).toBeLessThanOrEqual(40);
  });

  it('cuts a word with nowhere to break, and marks that it did', () => {
    const rows = wrap('x'.repeat(95));
    expect(rows[0]).toHaveLength(40);
    expect(rows[0].endsWith('-')).toBe(true);
  });

  it('never overruns the row budget', () => {
    const page = composeStoryPage(
      { headline: 'Long story', summary: 'sentence. '.repeat(80), format: 'NEWS', source: 'src' },
      400, 'MUSIC & RADIO', 24,
    );
    expect(page.rows.length).toBeLessThanOrEqual(24);
  });

  it('renders CRLF rows so the page survives a 2400-baud caller', () => {
    const page = composeStoryPage({ headline: 'Hi', summary: 'Body.', format: 'NEWS', source: 's' }, 100, 'FRONT PAGE', 24);
    expect(renderPage(page).split('\r\n').length).toBe(page.rows.length);
  });

  it('pads every row to the grid so a rule is a full-width rule', () => {
    expect(toWidth('ab')).toBe('ab'.padEnd(40, ' '));
  });
});

describe('the front page is human-approved (§17)', () => {
  function board(stories: Story[], approved: string[] = []): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mag-'));
    fs.mkdirSync(path.join(dir, 'Magazine', 'stories'), { recursive: true });
    for (const s of stories) fs.writeFileSync(path.join(dir, 'Magazine', 'stories', `${s.id}.json`), JSON.stringify(s));
    writeApproved(dir, approved);
    return dir;
  }
  const mk = (id: string): Story => ({
    id, headline: `Story ${id}`, summary: 'body text', format: 'NEWS', desk: 'general',
    date: '2026-10-13', source: 's', firstSeen: 'now', seenCount: 1, origin: 'authored',
  });

  it('replaces index.json by rename, so a door reading it never sees half a file', () => {
    // A read-only target refuses an in-place write (EACCES) but not a rename
    // over it, so publishing beside one proves the swap.
    const dir = board([mk('a1')], ['a1']);
    publishMagazine([mk('a1')], readApproved(dir), depsFor(dir));
    fs.chmodSync(path.join(dir, 'Magazine', 'index.json'), 0o444);
    expect(() => publishMagazine([mk('a1')], readApproved(dir), depsFor(dir))).not.toThrow();
    expect(fs.readdirSync(path.join(dir, 'Magazine')).filter((f) => f.includes('.tmp-'))).toEqual([]);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('keeps a front page edit the editor saves while the magazine composes', () => {
    // The compose read ['a1']; the door saved ['b2'] before it finished.
    const dir = board([mk('a1'), mk('b2')], ['b2']);
    publishMagazine([mk('a1'), mk('b2')], ['a1'], depsFor(dir));
    expect(readApproved(dir)).toEqual(['b2']);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('redraws page 100 when the door edits the front page, without waiting for the news tick', async () => {
    const dir = board([mk('a1')]);
    republishMagazine(depsFor(dir));
    const p100 = () => fs.readFileSync(path.join(dir, 'Magazine', 'pages', 'p100.txt'), 'latin1');
    expect(p100()).not.toContain('Story a1');
    const watcher = watchFrontPage(depsFor(dir), 20);
    try {
      writeFrontFile(path.join(dir, 'Magazine'), ['a1']);
      for (let i = 0; i < 100 && !p100().includes('Story a1'); i++) await new Promise((r) => setTimeout(r, 20));
      expect(p100()).toContain('Story a1');
    } finally {
      watcher.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('says it is awaiting an editor when nothing is approved', () => {
    const dir = board([mk('a1'), mk('b2')]);
    publishMagazine([mk('a1'), mk('b2')], readApproved(dir), depsFor(dir));
    const front = fs.readFileSync(path.join(dir, 'Magazine', 'pages', 'p100.txt'), 'latin1');
    expect(front).toContain('AWAITING EDITOR');
    expect(front).not.toContain('Story a1');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('publishes exactly what was approved, and nothing else', () => {
    const dir = board([mk('a1'), mk('b2')], ['a1']);
    publishMagazine([mk('a1'), mk('b2')], readApproved(dir), depsFor(dir));
    const front = fs.readFileSync(path.join(dir, 'Magazine', 'pages', 'p100.txt'), 'latin1');
    expect(front).toContain('Story a1');
    expect(front).not.toContain('Story b2');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('still writes a story page for an unapproved story, on its desk', () => {
    const dir = board([mk('a1')]);
    publishMagazine([mk('a1')], readApproved(dir), depsFor(dir));
    expect(fs.existsSync(path.join(dir, 'Magazine', 'pages', 'p100.txt'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'Magazine', 'pages', 'p101.txt'))).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('one refresh pass', () => {
  it('ingests, archives and composes, and clears the inbox', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mag-'));
    fs.mkdirSync(path.join(dir, 'Magazine', 'incoming'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'Magazine', 'incoming', 'bull13.json'),
      JSON.stringify([item('Skaven ships a new Amiga intro'), item('New release')]),
    );
    const out = refreshMagazine(depsFor(dir));
    expect(out.added).toBe(1);
    expect(out.rejected).toBe(1);
    expect(fs.readdirSync(path.join(dir, 'Magazine', 'incoming'))).toHaveLength(0);
    expect(fs.readdirSync(path.join(dir, 'Magazine', 'stories'))).toHaveLength(1);
    expect(fs.existsSync(path.join(dir, 'Magazine', 'index.json'))).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('keeps the archive across runs - old stories stay reachable (§13)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mag-'));
    fs.mkdirSync(path.join(dir, 'Magazine', 'incoming'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'Magazine', 'incoming', 'a.json'), JSON.stringify([item('Skaven ships a new Amiga intro')]));
    refreshMagazine(depsFor(dir));
    fs.writeFileSync(path.join(dir, 'Magazine', 'incoming', 'b.json'), JSON.stringify([item('Phrack issue 74 goes online')]));
    refreshMagazine(depsFor(dir));
    const names = fs.readdirSync(path.join(dir, 'Magazine', 'stories'));
    expect(names).toHaveLength(2);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('reads a story picture sidecar as no story, so a refresh beside one still composes', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mag-'));
    fs.mkdirSync(path.join(dir, 'Magazine', 'incoming'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'Magazine', 'incoming', 'a.json'), JSON.stringify([item('Skaven ships a new Amiga intro')]));
    refreshMagazine(depsFor(dir));
    const storiesDir = path.join(dir, 'Magazine', 'stories');
    const [storyFile] = fs.readdirSync(storiesDir);
    fs.writeFileSync(sidecarPath(path.join(storiesDir, storyFile)), JSON.stringify({ version: 1, pictures: [] }));
    fs.writeFileSync(path.join(dir, 'Magazine', 'incoming', 'b.json'), JSON.stringify([item('Phrack issue 74 goes online')]));
    expect(refreshMagazine(depsFor(dir)).added).toBe(1);
    expect(loadStories(storiesDir).map((s) => s.headline).sort()).toEqual(['Phrack issue 74 goes online', 'Skaven ships a new Amiga intro']);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('a re-seen story gains what it lacked', () => {
  const NOW = '2026-10-13T00:00:00Z';
  it('fills an empty summary and url from a later sighting', () => {
    const first = mergeIncoming([], [{ headline: 'Skaven ships a new Amiga intro', summary: '', source: 'reddit.com' }], NOW);
    const second = mergeIncoming(first.stories, [
      { headline: 'Skaven ships a new Amiga intro', summary: 'Details here.', source: 'reddit.com', url: 'https://r.example/1' },
    ], NOW);
    expect(second.stories[0].summary).toBe('Details here.');
    expect(second.stories[0].url).toBe('https://r.example/1');
  });

  it('fills a missing url even when the new summary is not longer', () => {
    const first = mergeIncoming([], [{ headline: 'Skaven ships a new Amiga intro', summary: 'Long existing summary.', source: 'a' }], NOW);
    const second = mergeIncoming(first.stories, [
      { headline: 'Skaven ships a new Amiga intro', summary: 'Short', source: 'b', url: 'https://r.example/2' },
    ], NOW);
    expect(second.stories[0].summary).toBe('Long existing summary.');
    expect(second.stories[0].url).toBe('https://r.example/2');
  });

  it('never overwrites a non-empty url', () => {
    const first = mergeIncoming([], [{ headline: 'Skaven ships a new Amiga intro', summary: 'x', source: 'a', url: 'https://keep.example' }], NOW);
    const second = mergeIncoming(first.stories, [
      { headline: 'Skaven ships a new Amiga intro', summary: 'a much longer summary', source: 'b', url: 'https://other.example' },
    ], NOW);
    expect(second.stories[0].url).toBe('https://keep.example');
  });
});

describe('story origin and healing stored summaries', () => {
  it('the feed ingest writes origin "feed"', () => {
    const out = mergeIncoming([], [item('Skaven ships a new Amiga intro')], '2026-10-13T00:00:00Z');
    expect(out.stories[0].origin).toBe('feed');
  });

  it('the publish step re-cleans an old stored summary without a refetch, and is idempotent', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mag-'));
    const stories = path.join(dir, 'Magazine', 'stories');
    fs.mkdirSync(stories, { recursive: true });
    const old = {
      id: storyId('Skaven ships a new Amiga intro'),
      headline: 'Skaven ships a new Amiga intro',
      summary: 'A new intro for the Amiga lands today [...] Read more',
      format: 'NEWS', desk: 'scene', date: '2026-10-12', source: 'hackaday.com',
      firstSeen: '2026-10-12T00:00:00Z', seenCount: 1,
    };
    fs.writeFileSync(path.join(stories, `${old.id}.json`), JSON.stringify(old));
    refreshMagazine(depsFor(dir));
    const read = () => JSON.parse(fs.readFileSync(path.join(stories, `${old.id}.json`), 'utf8'));
    expect(read().summary).toBe('A new intro for the Amiga lands today');
    refreshMagazine(depsFor(dir));
    expect(read().summary).toBe('A new intro for the Amiga lands today');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('the magazine has one name', () => {
  it('the composed masthead row and the reader share THE UNKNOWN FREQUENCY, and it fits 40 columns', () => {
    const { MAGAZINE_TITLE } = require('@amiexpress/bbs-door-sdk/formats/magazine');
    const { masthead } = require('../../src/services/magazine/compose');
    expect(MAGAZINE_TITLE).toBe('THE UNKNOWN FREQUENCY');
    expect(MAGAZINE_TITLE.length).toBeLessThanOrEqual(40 - 4);
    expect(masthead(120, 'Hacking')[0].text).toContain('THE UNKNOWN FREQUENCY');
    expect(masthead(120, 'Hacking')[0].text).not.toContain('UNDERGROUND');
  });
});


// ---------------------------------------------------------------------------
// Articles only (sysop 2026-10-14): "either we get the full articles or dump them"
// ---------------------------------------------------------------------------

describe('only articles get a page', () => {
  const DAY = 24 * 3600 * 1000;
  const NOW = Date.parse('2026-10-14T12:00:00Z');
  const mkStory = (id: string, extra: Partial<Story> = {}): Story => ({
    id, headline: `Story ${id}`, summary: 'A teaser.', format: 'NEWS', desk: 'hack',
    date: '2026-10-13', source: 's', url: `https://example.org/${id}`, firstSeen: '2026-10-13T00:00:00Z', seenCount: 1,
    origin: 'feed', ...extra,
  });
  const article = (id: string) => mkStory(id, { body: 'b'.repeat(ARTICLE_MIN_BODY_CHARS) });
  const teaser = (id: string) => mkStory(id);
  const shortBody = (id: string) => mkStory(id, { body: 'b'.repeat(ARTICLE_MIN_BODY_CHARS - 1) });
  const authored = (id: string) => mkStory(id, { origin: 'authored', url: undefined });

  function board(stories: Story[], approved: string[] = []): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mag-art-'));
    fs.mkdirSync(path.join(dir, 'Magazine', 'stories'), { recursive: true });
    for (const s of stories) fs.writeFileSync(path.join(dir, 'Magazine', 'stories', `${s.id}.json`), JSON.stringify(s));
    writeApproved(dir, approved);
    return dir;
  }
  const storyFiles = (dir: string) => fs.readdirSync(path.join(dir, 'Magazine', 'stories')).sort();

  it('allocatePages gives a page to an article and an authored story, and none to a teaser or a short body', () => {
    const pages = allocatePages([article('a1'), teaser('t1'), shortBody('s1'), authored('h1')]);
    expect([...pages.keys()].sort()).toEqual(['a1', 'h1']);
  });

  it('writes pages and an index entry for articles only, and the reader lists exactly those', () => {
    const stories = [article('a1'), teaser('t1'), shortBody('s1'), authored('h1')];
    const dir = board(stories, ['t1', 'a1']);
    const layout = publishMagazine(stories, readApproved(dir), depsFor(dir));
    expect(layout.index.map((e) => e.storyId).sort()).toEqual(['a1', 'h1']);
    // The pages on disk: one per article, none for the teasers.
    const pages = fs.readdirSync(path.join(dir, 'Magazine', 'pages'));
    for (const e of layout.index) expect(pages).toContain(`p${e.page}.txt`);
    for (const n of pages) {
      const page = fs.readFileSync(path.join(dir, 'Magazine', 'pages', n), 'latin1');
      expect(page).not.toContain('Story t1');
      expect(page).not.toContain('Story s1');
    }
    // The front page page carries the article, not the approved teaser.
    const front = fs.readFileSync(path.join(dir, 'Magazine', 'pages', 'p100.txt'), 'latin1');
    expect(front).toContain('Story a1');
    expect(front).not.toContain('Story t1');
    // The MAG reader (Doors/magazine/library) lists the same stories the writer paged.
    const root = path.join(dir, 'Magazine');
    expect(loadIndex(root).map((e) => e.storyId).sort()).toEqual(layout.index.map((e) => e.storyId).sort());
    expect(loadFront(root)).toEqual(['a1']);
    expect(readApproved(dir)).toEqual(['t1', 'a1']); // the sysop's file is untouched
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('purges a story that never became an article after three days, whatever the reason', () => {
    const old = new Date(NOW - 3 * DAY - 1000).toISOString();
    const fresh = new Date(NOW - 3 * DAY + 60_000).toISOString();
    const dir = board([
      teaser('oldtea'),
      { ...teaser('oldtea'), id: 'oldfail', bodyFailed: { at: old, reason: 'HTTP 404' } },
      { ...teaser('oldnourl'), url: undefined },
      { ...article('oldart') },
      { ...authored('oldhum') },
      { ...teaser('newtea') },
      { ...teaser('newfail'), bodyFailed: { at: fresh, reason: 'HTTP 404' } },
    ].map((s) => (['oldtea', 'oldfail', 'oldnourl', 'oldart', 'oldhum'].includes(s.id) ? { ...s, firstSeen: old } : { ...s, firstSeen: fresh })));
    const gone = purgeNeverArticles(dir, NOW);
    expect(gone.sort()).toEqual(['oldfail', 'oldnourl', 'oldtea']);
    expect(storyFiles(dir)).toEqual(['newfail.json', 'newtea.json', 'oldart.json', 'oldhum.json']);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('a purged story takes its sidecar and its video cache; a clip another story still uses stays (M13)', () => {
    const old = new Date(NOW - 4 * DAY).toISOString();
    const clip = (url: string) => ({ url, kind: 'video' as const, alt: '', site: 'x.org', anchor: 0 });
    const dir = board([
      { ...teaser('gone1'), firstSeen: old, media: [clip('https://x.org/a.mp4'), clip('https://x.org/shared.mp4')] },
      { ...teaser('kept1'), media: [clip('https://x.org/shared.mp4')] },
    ]);
    const stories = path.join(dir, 'Magazine', 'stories');
    const video = path.join(dir, 'Magazine', 'video');
    fs.mkdirSync(video, { recursive: true });
    const frames = (url: string, size: string) => path.join(video, `${clipUrlHash(url)}-v1-${size}.frames`);
    for (const f of [frames('https://x.org/a.mp4', '80x24'), frames('https://x.org/a.mp4', '40x24'), frames('https://x.org/shared.mp4', '80x24')]) fs.writeFileSync(f, 'x');
    fs.writeFileSync(path.join(stories, 'gone1.media.json'), '{}');
    fs.writeFileSync(path.join(stories, 'kept1.media.json'), '{}');
    expect(purgeNeverArticles(dir, NOW)).toEqual(['gone1']);
    expect(fs.existsSync(path.join(stories, 'gone1.media.json'))).toBe(false);
    expect(fs.existsSync(path.join(stories, 'kept1.media.json'))).toBe(true);
    expect(fs.readdirSync(video)).toEqual([path.basename(frames('https://x.org/shared.mp4', '80x24'))]);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('refreshMagazine and republishMagazine purge with the injected clock', () => {
    const t0 = new Date(NOW - 4 * DAY).toISOString();
    const dir = board([{ ...teaser('t1'), firstSeen: t0 }, { ...article('a1'), firstSeen: t0 }]);
    fs.mkdirSync(path.join(dir, 'Magazine', 'incoming'), { recursive: true });
    const deps = { rootDir: () => dir, now: () => new Date(NOW), log: () => {} };
    refreshMagazine(deps);
    expect(storyFiles(dir)).toEqual(['a1.json']);
    fs.writeFileSync(path.join(dir, 'Magazine', 'stories', 't2.json'), JSON.stringify({ ...teaser('t2'), firstSeen: t0 }));
    const layout = republishMagazine(deps);
    expect(storyFiles(dir)).toEqual(['a1.json']);
    expect(layout.index.map((e) => e.storyId)).toEqual(['a1']);
    expect(loadStories(path.join(dir, 'Magazine', 'stories'))).toHaveLength(1);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('a purged story that its feed still carries is not added again, and not for 30 days only', () => {
    const t0 = new Date(NOW - 4 * DAY).toISOString();
    const headline = 'Skaven ships a teaser nobody could read';
    const dir = board([{ ...teaser('t1'), id: storyId(headline), headline, firstSeen: t0 }]);
    fs.mkdirSync(path.join(dir, 'Magazine', 'incoming'), { recursive: true });
    let now = NOW;
    const deps = { rootDir: () => dir, now: () => new Date(now), log: () => {} };
    const feedAgain = () => fs.writeFileSync(
      path.join(dir, 'Magazine', 'incoming', 'bull99.json'),
      JSON.stringify([{ headline, summary: 'Still in the feed.', source: 'x.org', url: 'https://x.org/a' }]),
    );
    refreshMagazine(deps);                       // purges it, writes the tombstone
    expect(storyFiles(dir)).toEqual([]);
    feedAgain();
    now = NOW + 10 * DAY;
    const r = refreshMagazine(deps);             // the feed still has it
    expect(r.added).toBe(0);
    expect(r.rejected).toBe(1);
    expect(storyFiles(dir)).toEqual([]);
    feedAgain();
    now = NOW + 31 * DAY;                        // tombstone expired: it is news again
    expect(refreshMagazine(deps).added).toBe(1);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('a pending story (fresh, no text yet) is kept but unpaged until its body lands', () => {
    const fresh = new Date(NOW - DAY).toISOString();
    const dir = board([{ ...teaser('p1'), firstSeen: fresh }]);
    const deps = { rootDir: () => dir, now: () => new Date(NOW), log: () => {} };
    expect(republishMagazine(deps).index).toEqual([]);
    expect(storyFiles(dir)).toEqual(['p1.json']);
    fs.writeFileSync(path.join(dir, 'Magazine', 'stories', 'p1.json'), JSON.stringify({ ...teaser('p1'), firstSeen: fresh, body: 'b'.repeat(ARTICLE_MIN_BODY_CHARS) }));
    expect(republishMagazine(deps).index.map((e) => e.storyId)).toEqual(['p1']);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
