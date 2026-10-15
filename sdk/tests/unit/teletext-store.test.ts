/**
 * The page graph a caller browses: which pages exist, where the coloured
 * keys go, and how the carousel steps.
 */
import {
  buildServiceIndex,
  resolveFastext,
  fastextTargets,
  subpageAt,
  subpageCount,
  stepSubpage,
  dwellMsFor,
  parsePageNumber,
  formatPageNumber,
  isRealPage,
  NO_LINK,
} from '../../teletext/store';
import { createEmptyPage, createEmptySubpage, textTokens } from '../../teletext/marco/model/factories';
import type { TeletextService, TeletextPage } from '../../teletext/marco/model/types';

function service(pages: TeletextPage[]): TeletextService {
  return {
    id: 'test',
    title: 'Test Service',
    pages,
    defaultLanguageSubset: 'english',
  };
}

describe('service index', () => {
  const index = buildServiceIndex(
    service([createEmptyPage(0x100), createEmptyPage(0x1a0), createEmptyPage(0x302)]),
  );

  it('holds only the pages the recovery captured', () => {
    expect(index.pageNumbers).toEqual([0x100, 0x1a0, 0x302]);
    expect(index.has(0x100)).toBe(true);
    expect(index.has(0x101)).toBe(false);
    expect(index.get(0x101)).toBeNull();
  });

  it('opens on the lowest page when no home page is named', () => {
    expect(index.homePage).toBe(0x100);
  });

  it('opens on the named home page when the service holds it', () => {
    const named = buildServiceIndex(
      service([createEmptyPage(0x100), createEmptyPage(0x302)]),
      { homePage: 0x302 },
    );
    expect(named.homePage).toBe(0x302);
  });

  it('ignores a home page the service does not hold', () => {
    // A manifest that names a page lost to tape dropout must not open on a
    // blank screen.
    const named = buildServiceIndex(service([createEmptyPage(0x100)]), { homePage: 0x888 });
    expect(named.homePage).toBe(0x100);
  });

  it('steps to the next page the service actually holds', () => {
    expect(index.nextPage(0x100)).toBe(0x1a0);
    expect(index.nextPage(0x1a0)).toBe(0x302);
  });

  it('wraps at both ends', () => {
    expect(index.nextPage(0x302)).toBe(0x100);
    expect(index.prevPage(0x100)).toBe(0x302);
  });

  it('steps from a page it does not hold', () => {
    // The caller typed 200: next is the first page above it, previous the
    // last page below it.
    expect(index.nextPage(0x200)).toBe(0x302);
    expect(index.prevPage(0x200)).toBe(0x1a0);
  });

  it('keeps the fuller recovery when the same page was recovered twice', () => {
    // Two tapes of one broadcast is the normal case, and one of them is
    // usually the better copy.
    const thin = createEmptyPage(0x100);
    const fat = createEmptyPage(0x100);
    fat.subpages[0].rows[1] = { index: 1, tokens: textTokens('A RECOVERED HEADLINE') };

    const fatFirst = buildServiceIndex(service([fat, thin])).get(0x100);
    const thinFirst = buildServiceIndex(service([thin, fat])).get(0x100);
    expect(fatFirst?.subpages[0].rows[1].tokens.length).toBeGreaterThan(1);
    expect(thinFirst?.subpages[0].rows[1].tokens.length).toBeGreaterThan(1);
  });

  it('unions the subpages when a page appears twice', () => {
    // Two recoveries of one page caught different parts of the carousel.
    // Between them they have four screens, and the caller should get all
    // four rather than whichever recovery happened to be bigger.
    const thin = createEmptyPage(0x100);
    const fat = createEmptyPage(0x100);
    fat.subpages = [createEmptySubpage(1), createEmptySubpage(2), createEmptySubpage(3)];
    expect(subpageCount(buildServiceIndex(service([thin, fat])).get(0x100))).toBe(4);
    expect(subpageCount(buildServiceIndex(service([fat, thin])).get(0x100))).toBe(4);
  });

  it('assembles a carousel from one file per subpage', () => {
    // THIS IS HOW THE REAL ARCHIVE SHIPS. The restoration project writes
    // P152-0001, P152-0002, ... - one file per subpage - and each parses to
    // a page of its own. Treating those as rival recoveries of one page
    // kept a single screen and threw the rest away, which loaded the whole
    // of Bamboozle as a title card with nothing behind it.
    const files = [1, 2, 3, 4, 5, 6, 7].map(subcode => {
      const page = createEmptyPage(0x152);
      page.subpages = [createEmptySubpage(subcode)];
      page.subpages[0].rows[2] = { index: 2, tokens: textTokens(`QUESTION ${subcode}`) };
      return page;
    });

    const page = buildServiceIndex(service(files)).get(0x152);
    expect(subpageCount(page)).toBe(7);
    // ...and in broadcast order, whatever order the files arrived in.
    expect(page?.subpages.map(s => s.subcode)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('keeps the fuller screen when two files carry the same subcode', () => {
    const empty = createEmptyPage(0x100);
    const full = createEmptyPage(0x100);
    full.subpages[0].rows[1] = { index: 1, tokens: textTokens('THE RECOVERED LINE') };

    for (const order of [[empty, full], [full, empty]]) {
      const page = buildServiceIndex(service(order)).get(0x100);
      expect(subpageCount(page)).toBe(1);
      expect(page?.subpages[0].rows[1].tokens.length).toBeGreaterThan(1);
    }
  });

  it('takes the coloured keys from whichever subpage caught them', () => {
    // Packet 27 rides on every subpage, but a noisy tape may only have
    // caught it once.
    const without = createEmptyPage(0x152);
    without.subpages = [createEmptySubpage(1)];
    const with_ = createEmptyPage(0x152);
    with_.subpages = [createEmptySubpage(2)];
    with_.fastext = { red: 0x153 };

    const page = buildServiceIndex(service([without, with_])).get(0x152);
    expect(resolveFastext(page, 'red')).toBe(0x153);
  });

  it('drops page numbers outside 0x100-0x8FF', () => {
    const junk = createEmptyPage(0x0ff);
    expect(buildServiceIndex(service([junk])).pageNumbers).toEqual([]);
    expect(isRealPage(0x900)).toBe(false);
    expect(isRealPage(0x8ff)).toBe(true);
  });
});

describe('fastext links', () => {
  it('reads the four coloured keys', () => {
    const page = createEmptyPage(0x100);
    page.fastext = { red: 0x101, green: 0x102, yellow: 0x103, cyan: 0x104 };
    expect(resolveFastext(page, 'red')).toBe(0x101);
    expect(resolveFastext(page, 'cyan')).toBe(0x104);
    expect(fastextTargets(page)).toEqual({
      red: 0x101,
      green: 0x102,
      yellow: 0x103,
      cyan: 0x104,
    });
  });

  it('treats the 0x8FF sentinel as no link at all', () => {
    // Packet 27 writes 0x8FF into every slot a page does not use. Following
    // it would send the caller to the filler page.
    const page = createEmptyPage(0x100);
    page.fastext = { red: 0x101, green: NO_LINK, yellow: null, cyan: undefined };
    expect(resolveFastext(page, 'green')).toBeNull();
    expect(resolveFastext(page, 'yellow')).toBeNull();
    expect(resolveFastext(page, 'cyan')).toBeNull();
    expect(fastextTargets(page)).toEqual({ red: 0x101 });
  });

  it('is null on a page that carries no packet 27 at all', () => {
    expect(resolveFastext(createEmptyPage(0x100), 'red')).toBeNull();
    expect(fastextTargets(null)).toEqual({});
  });
});

describe('subpage carousel', () => {
  const page = createEmptyPage(0x100);
  page.subpages = [createEmptySubpage(1), createEmptySubpage(2), createEmptySubpage(3)];

  it('wraps forwards and backwards', () => {
    expect(stepSubpage(page, 0, 1)).toBe(1);
    expect(stepSubpage(page, 2, 1)).toBe(0);
    expect(stepSubpage(page, 0, -1)).toBe(2);
  });

  it('returns the subpage at a wrapped position', () => {
    expect(subpageAt(page, 3)?.subcode).toBe(1);
    expect(subpageAt(page, -1)?.subcode).toBe(3);
  });

  it('is inert on a page with no subpages', () => {
    const empty = createEmptyPage(0x100);
    empty.subpages = [];
    expect(subpageAt(empty, 0)).toBeNull();
    expect(stepSubpage(empty, 0, 1)).toBe(0);
  });

  it('honours a CT time in seconds and ignores a cycle count', () => {
    // A cycle count counts magazine rotations, which a BBS does not have.
    page.defaultCycle = { mode: 'time', value: 7 };
    expect(dwellMsFor(page, 4000)).toBe(7000);
    page.defaultCycle = { mode: 'cycle', value: 7 };
    expect(dwellMsFor(page, 4000)).toBe(4000);
    page.defaultCycle = null;
    expect(dwellMsFor(page, 4000)).toBe(4000);
  });
});

describe('page numbers as typed', () => {
  it('reads three hex digits in magazines 1 to 8', () => {
    expect(parsePageNumber('100')).toBe(0x100);
    expect(parsePageNumber('1a0')).toBe(0x1a0);
    expect(parsePageNumber(' 888 ')).toBe(0x888);
  });

  it('rejects anything a teletext service cannot carry', () => {
    expect(parsePageNumber('099')).toBeNull();
    expect(parsePageNumber('900')).toBeNull();
    expect(parsePageNumber('10')).toBeNull();
    expect(parsePageNumber('10G')).toBeNull();
    expect(parsePageNumber('')).toBeNull();
  });

  it('prints a page the way teletext prints it', () => {
    expect(formatPageNumber(0x100)).toBe('100');
    expect(formatPageNumber(0x1a0)).toBe('1A0');
  });
});
