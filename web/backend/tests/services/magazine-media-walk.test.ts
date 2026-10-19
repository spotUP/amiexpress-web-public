/**
 * MEDIA FOUND BY THE ONE WALK (plan 2026-10-19-mag-linked-media-ascii, M1 + M3).
 *
 * The article's text and the position of each picture come from one pass over
 * the HTML (`toBulletinWalk`). Pinned: anchors equal paragraph positions, media
 * after the body cap are dropped, the text is byte for byte what the old
 * text-only function produced, and the prefetch stores `media` on the story.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  MAGAZINE_DIR,
  MAGAZINE_STORIES_DIR,
  STORY_BODY_CAP,
  type Story,
} from '@amiexpress/bbs-door-sdk/formats/magazine';
import { toBulletinParagraphs, toBulletinText, toBulletinWalk } from '../../src/services/news-bulletins';
import { loadStories, writeAtomic } from '../../src/services/magazine';
import {
  createRobotsCache,
  defaultPrefetchDeps,
  extractArticleText,
  prefetchBodies,
} from '../../src/services/magazine/body-prefetch';

const URL_A = 'https://www.example.org/news/2026/story.html';
const PARA = 'The relay chassis hums while the old contacts click through their sequence and the clock finds its second tick.';

describe('toBulletinWalk', () => {
  it('anchors each media element to the paragraph it follows (0 = before the first)', () => {
    const html = [
      '<figure><img src="/lead.jpg" alt="Lead &amp; cover"></figure>',
      '<p>First.</p>',
      '<p>Second.</p>',
      '<p><img src="mid.png" alt="mid"> Third with a leading picture.</p>',
      '<p>Fourth <img src="tail.gif"> ends in one.</p>',
    ].join('\n');
    const w = toBulletinWalk(html, STORY_BODY_CAP, URL_A);
    expect(w.text.split('\n\n')).toEqual(['First.', 'Second.', 'Third with a leading picture.', 'Fourth ends in one.']);
    expect(w.media.map((m) => [m.url, m.anchor])).toEqual([
      ['https://www.example.org/lead.jpg', 0],
      ['https://www.example.org/news/2026/mid.png', 2],
      ['https://www.example.org/news/2026/tail.gif', 4],
    ]);
    expect(w.media[0]).toMatchObject({ kind: 'image', alt: 'Lead & cover', site: 'example.org' });
  });

  it('finds picture, video (src, source, poster) and YouTube/Vimeo iframes; ignores other iframes', () => {
    const html = [
      '<p>One.</p>',
      '<picture><source srcset="/a-1x.webp 1x, /a-2x.webp 2x"><img src="/a.jpg" alt="pic"></picture>',
      '<video poster="/p.jpg"><source src="/clip.mp4" type="video/mp4">Your browser cannot play this.</video>',
      '<iframe src="https://www.youtube.com/embed/abc123" title="Demo"></iframe>',
      '<iframe src="//player.vimeo.com/video/99"></iframe>',
      '<iframe src="https://ads.example.net/frame"></iframe>',
      '<p>Two.</p>',
    ].join('\n');
    const w = toBulletinWalk(html, STORY_BODY_CAP, URL_A);
    expect(w.media.map((m) => [m.kind, m.url, m.anchor])).toEqual([
      ['image', 'https://www.example.org/a.jpg', 1],
      ['video', 'https://www.example.org/clip.mp4', 1],
      // The video's fallback text is a paragraph of its own (as it always was), so these follow it.
      ['embed', 'https://www.youtube.com/embed/abc123', 2],
      ['embed', 'https://player.vimeo.com/video/99', 2],
    ]);
    expect(w.media[1].poster).toBe('https://www.example.org/p.jpg');
    // Iframes stay out of the text (NON_TEXT), the video's fallback text stays as it always did.
    expect(w.text).not.toMatch(/youtube|vimeo/i);
  });

  it('drops media anchored after the body cap with the text they belonged to', () => {
    const html = `<p>${PARA}</p><img src="/in.jpg"><p>${PARA} two.</p><img src="/after.jpg"><p>${PARA} three.</p><img src="/last.jpg">`;
    const cap = PARA.length * 2 + 20; // room for paragraph one and two, not three
    const w = toBulletinWalk(html, cap, URL_A);
    expect(w.text.split('\n\n')).toHaveLength(2);
    expect(w.media.map((m) => [m.url.split('/').pop(), m.anchor])).toEqual([['in.jpg', 1], ['after.jpg', 2]]);
    // A picture before the cut paragraph's text is kept only when it follows a kept paragraph.
    const tight = toBulletinWalk(html, PARA.length + 5, URL_A);
    expect(tight.text.split('\n\n')).toHaveLength(1);
    expect(tight.media.map((m) => m.url.split('/').pop())).toEqual(['in.jpg']);
  });

  it('keeps the old text-only output byte for byte (and toBulletinParagraphs is that text)', () => {
    // The previous implementation, verbatim, as the reference.
    const BLOCK = /<\/?(?:p|div|br|hr|h[1-6]|li|ul|ol|blockquote|pre|tr|table|section|article|header|footer|figure|figcaption|aside|dd|dt|dl)\b[^>]*>/gi;
    const NON = /<(script|style|noscript|svg|iframe|form|button|nav)\b[\s\S]*?<\/\1>/gi;
    const old = (html: string, cap: number): string => {
      const paragraphs = html.replace(NON, ' ').split(BLOCK)
        .map((c) => toBulletinText(c).replace(/\s*\n\s*/g, ' ').trim()).filter((p) => p.length > 0);
      const out: string[] = [];
      let used = 0;
      for (const p of paragraphs) {
        const next = used + (out.length ? 2 : 0) + p.length;
        if (next > cap) {
          if (out.length === 0) { const cut = p.slice(0, cap); const at = cut.lastIndexOf(' '); out.push((at > cap / 2 ? cut.slice(0, at) : cut).trim()); }
          break;
        }
        out.push(p); used = next;
      }
      return out.join('\n\n');
    };
    const fixtures = [
      `<h1>Head</h1><p>Intro with<img src="a.jpg">glued<img src="b.jpg"> words &amp; <b>bold</b>.</p><figure><img src="/f.jpg"><figcaption>Cap tion</figcaption></figure><div>Plain div text<br>after break</div><ul><li>one</li><li>two</li></ul>`,
      `<p>Before</p><iframe src="https://www.youtube.com/embed/x">fallback</iframe><p>After</p><script>var s = "<img src=x>";</script><noscript><img src="n.gif"></noscript><p>End.</p>`,
      `<video poster="p.jpg" src="v.mp4">No video support here.</video><picture><source srcset="a.webp"><img src="a.jpg" alt="x"></picture><p>Tail</p>`,
      `<p>${PARA}</p><p><img src="1.jpg"></p><p>${PARA}</p><p>${PARA}</p>`,
      `no markup at all, just a sentence<img src="z.png">and more`,
    ];
    for (const f of fixtures) {
      for (const cap of [STORY_BODY_CAP, 60, 140]) {
        expect(toBulletinParagraphs(f, cap)).toBe(old(f, cap));
        expect(toBulletinWalk(f, cap, URL_A).text).toBe(old(f, cap));
      }
    }
  });

  it('skips data: addresses and elements without an address', () => {
    const w = toBulletinWalk('<p>x</p><img src="data:image/gif;base64,AAAA"><img alt="none"><img data-src="/lazy.jpg">', STORY_BODY_CAP, URL_A);
    expect(w.media.map((m) => m.url)).toEqual(['https://www.example.org/lazy.jpg']);
  });
});

describe('the prefetch stores media on the story (round trip through the store)', () => {
  let root: string;
  const NOW = new Date('2026-10-14T12:00:00Z');
  const dir = (): string => path.join(root, MAGAZINE_DIR, MAGAZINE_STORIES_DIR);
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'mag-media-'));
    fs.mkdirSync(dir(), { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  const base: Story = {
    id: 's1', headline: 'Headline s1', summary: 'Teaser.', format: 'NEWS', desk: 'hack', date: '2026-10-14',
    source: 'example.org', url: URL_A, firstSeen: '2026-10-14T10:00:00Z', seenCount: 1, origin: 'feed',
  };
  const PAGE = `<html><body><article><h1>T</h1><p>${PARA} 1.</p><img src="/pics/a.jpg" alt="First"><p>${PARA} 2.</p>${
    Array.from({ length: 10 }, (_, i) => `<p>${PARA} n${i}.</p>`).join('')}<iframe src="https://www.youtube.com/embed/zz"></iframe></article></body></html>`;

  it('extractArticleText still returns the bare text', () => {
    expect(typeof extractArticleText(PAGE, URL_A)).toBe('string');
  });

  it('prefetchBodies with the default extractor writes media, and loadStories returns it', async () => {
    fs.writeFileSync(path.join(dir(), 's1.json'), JSON.stringify(base));
    const d = {
      ...defaultPrefetchDeps({ rootDir: () => root, now: () => NOW, log: () => {} }, createRobotsCache()),
      http: jest.fn(async (u: string) => (u.endsWith('/robots.txt')
        ? { status: 200, body: 'User-agent: *\nDisallow:\n', contentType: 'text/plain' }
        : { status: 200, body: PAGE, contentType: 'text/html' })),
      gate: jest.fn(async () => {}),
    };
    expect((await prefetchBodies(d)).fetched).toBe(1);
    const [saved] = loadStories(dir());
    expect(saved.media).toHaveLength(2);
    expect(saved.media![0]).toMatchObject({ url: 'https://www.example.org/pics/a.jpg', kind: 'image', alt: 'First', site: 'example.org' });
    const paras = saved.body!.split('\n\n');
    // The anchor is the position in the stored body: right after paragraph 1.
    expect(paras[saved.media![0].anchor - 1]).toBe(`${PARA} 1.`);
    expect(saved.media![1]).toMatchObject({ kind: 'embed', anchor: saved.body!.split('\n\n').length });
  });

  it('a story with media survives write and load unchanged; one without gets no field', () => {
    const media = [{ url: 'https://x.org/a.jpg', kind: 'video' as const, alt: 'a', site: 'x.org', anchor: 3, poster: 'https://x.org/p.jpg', failure: 'HTTP 404' }];
    writeAtomic(path.join(dir(), 'a.json'), JSON.stringify({ ...base, id: 'a', media }));
    writeAtomic(path.join(dir(), 'b.json'), JSON.stringify({ ...base, id: 'b' }));
    const byId = new Map(loadStories(dir()).map((s) => [s.id, s]));
    expect(byId.get('a')!.media).toEqual(media);
    expect('media' in byId.get('b')!).toBe(false);
  });
});
