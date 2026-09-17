/**
 * Loading a teletext pack off the disk.
 *
 * The recoveries this reads come off home VHS tapes and are lossy by
 * construction, so the load contract is: report the file that would not
 * parse, keep every page that would.
 */
import * as path from 'path';
import {
  listServices,
  loadService,
  getService,
  findService,
  readManifest,
  pageNumberFromFilename,
  clearServiceCache,
} from '../../teletext/library';
import { renderSubpageLines } from '../../teletext/render-session';
import { resolveFastext, subpageCount, subpageAt } from '../../teletext/store';

const FIXTURES = path.join(__dirname, '..', 'fixtures', 'teletext');
const PACK = path.join(FIXTURES, 'ceefax-test');

function plain(line: string): string {
  return line.replace(/\x1b\[[0-9;]*m/g, '').replace(/\x1b#[0-9]/g, '');
}

function pageText(dir: string, page: number, reveal = false): string {
  const loaded = loadService(dir);
  const subpage = subpageAt(loaded.index.get(page), 0);
  if (!subpage) throw new Error(`fixture has no page ${page.toString(16)}`);
  return renderSubpageLines(subpage, { mode: 'ansi', reveal }).map(plain).join('\n');
}

beforeEach(() => clearServiceCache());

describe('finding packs', () => {
  it('lists a directory that has a service.json', () => {
    const services = listServices(FIXTURES);
    expect(services.map(s => s.id)).toEqual(['ceefax-test']);
    expect(services[0].title).toBe('Ceefax Test Pack');
    expect(services[0].fileCount).toBe(4);
  });

  it('skips a directory that does not', () => {
    // Half-copied archives are a normal thing to find on a volume.
    expect(listServices(FIXTURES).some(s => s.dir.endsWith('not-a-pack'))).toBe(false);
    expect(readManifest(path.join(FIXTURES, 'not-a-pack'))).toBeNull();
  });

  it('finds a pack by id', () => {
    expect(findService('ceefax-test', FIXTURES)?.service.title).toBe('Ceefax Test Pack');
    expect(findService('no-such-pack', FIXTURES)).toBeNull();
  });

  it('reads a page number out of a recovery filename', () => {
    expect(pageNumberFromFilename('P1a0-0000.t42')).toBe(0x1a0);
    expect(pageNumberFromFilename('P100-0000.tti')).toBe(0x100);
    expect(pageNumberFromFilename('notes.txt')).toBeNull();
  });
});

describe('loading a pack', () => {
  it('holds every page that parsed', () => {
    const loaded = loadService(PACK);
    expect(loaded.index.pageNumbers).toEqual([0x100, 0x101, 0x102]);
  });

  it('opens on the page the manifest names', () => {
    expect(loadService(PACK).index.homePage).toBe(0x100);
  });

  it('reports the file that would not parse, and keeps the rest', () => {
    // One bad page must never cost the caller the other four hundred.
    const loaded = loadService(PACK);
    expect(loaded.errors.map(e => e.file)).toEqual(['P1FF-0000.t42']);
    expect(loaded.index.pageNumbers.length).toBe(3);
  });

  it('carries the pack credit through to the service', () => {
    const loaded = loadService(PACK);
    expect(loaded.manifest.credit).toBeTruthy();
    expect(loaded.service.metadata?.source).toBe(loaded.manifest.source);
  });

  it('refuses a directory that is not a pack', () => {
    expect(() => loadService(path.join(FIXTURES, 'not-a-pack'))).toThrow(/service\.json/);
  });
});

describe('what the pages actually say', () => {
  it('renders an authored TTI page', () => {
    const text = pageText(PACK, 0x100);
    expect(text).toContain('CEEFAX TEST');
    expect(text).toContain('RED 101');
  });

  it('renders a page that came back out of a .t42 binary', () => {
    // The whole recovery path in one assertion: packets in, page out.
    expect(pageText(PACK, 0x101)).toContain('BINARY PAGE');
  });

  it('keeps a concealed answer concealed until it is revealed', () => {
    expect(pageText(PACK, 0x100)).not.toContain('PARIS');
    expect(pageText(PACK, 0x100, true)).toContain('PARIS');
  });

  it('carries the fastext links off the authored page', () => {
    const page = loadService(PACK).index.get(0x100);
    expect(resolveFastext(page, 'red')).toBe(0x101);
    expect(resolveFastext(page, 'cyan')).toBe(0x104);
  });

  it('carries the fastext links out of packet 27 in the .t42', () => {
    const page = loadService(PACK).index.get(0x101);
    expect(resolveFastext(page, 'red')).toBe(0x100);
  });

  it('holds both halves of a carousel', () => {
    const page = loadService(PACK).index.get(0x102);
    expect(subpageCount(page)).toBe(2);
    const one = renderSubpageLines(subpageAt(page, 0)!, { mode: 'ansi' }).map(plain).join('\n');
    const two = renderSubpageLines(subpageAt(page, 1)!, { mode: 'ansi' }).map(plain).join('\n');
    expect(one).toContain('SUBPAGE ONE');
    expect(two).toContain('SUBPAGE TWO');
  });
});

describe('the cache', () => {
  it('hands back the same parse while the pack is unchanged', () => {
    // A caller walking a magazine asks for the same service on every keypress.
    expect(getService(PACK)).toBe(getService(PACK));
  });

  it('parses again after the cache is cleared', () => {
    const first = getService(PACK);
    clearServiceCache();
    expect(getService(PACK)).not.toBe(first);
  });
});
