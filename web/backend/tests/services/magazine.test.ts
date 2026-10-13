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
  refreshMagazine,
  readApproved,
  writeApproved,
  type IncomingItem,
} from '../../src/services/magazine';
import { classify, classifyFormat } from '../../src/services/magazine/classify';
import { isWorthReading, storyId, normaliseHeadline, type Story } from '../../src/services/magazine/story-store';
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
    expect(classify({ headline: 'New Detroit electro record from Channel Awesome', summary: '' })).toBe('music');
    expect(classify({ headline: 'New Amiga demo released', summary: 'a 68k intro' })).toBe('scene');
    expect(classify({ headline: 'New RCE in OpenSSL', summary: 'exploit available' })).toBe('hack');
    expect(classify({ headline: 'Wildstyle piece on a freight train', summary: 'graffiti crew' })).toBe('graffiti');
    expect(classify({ headline: 'Something happened', summary: '' })).toBe('general');
  });

  it('does not let the chattiest feed take a desk it does not own', () => {
    // A security headline that merely mentions a band name is still security.
    expect(classify({ headline: 'CVE in Acid CMS', summary: 'remote code execution, patch available' })).toBe('hack');
  });

  it('names the editorial format from the wording', () => {
    expect(classifyFormat({ headline: 'Foo EP out now', summary: '' })).toBe('RELEASE');
    expect(classifyFormat({ headline: 'A talk with Skaven', summary: 'an interview' })).toBe('INTERVIEW');
    expect(classifyFormat({ headline: 'How the Amiga coprocessor bug happened', summary: 'technique' })).toBe('TECHNIQUE');
    expect(classifyFormat({ headline: 'Lost tracker disk recovered from a hard drive', summary: '' })).toBe('ARCHIVE');
  });
});

describe('page allocation (§12)', () => {
  const mk = (n: number, desk: Story['desk']): Story => ({
    id: `s${n}`, headline: `Story number ${n}`, summary: 'x', format: 'NEWS',
    desk, date: '2026-10-13', source: 's', firstSeen: 'now', seenCount: 1,
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
    date: '2026-10-13', source: 's', firstSeen: 'now', seenCount: 1,
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
});