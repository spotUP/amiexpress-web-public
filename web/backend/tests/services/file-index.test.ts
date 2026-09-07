/**
 * The file index: what the board knows about a file beyond its DIR row.
 *
 * IT IS A CACHE. Every column can be recomputed from the DIR file on disk, an
 * empty index is a valid state, and a miss degrades to the row's own text. The
 * tests below are about the READING - what facts come out of a DIR entry, and
 * which of the four sources gets to name the release group.
 *
 * The DIR fixture is shaped exactly as express.e writes one: the entry row,
 * then the FILE_ID.DIZ folded in as continuation lines indented 33 columns
 * (express.e:19499).
 */
import { parseDirFile } from '../../src/utils/dir-file-reader.util';
import {
  dirIsStale,
  deriveGroup,
  dizTextOf,
  factsForEntry,
  groupTagsFor,
  resolveAcrossDirs,
  rowIsStale,
  sha1Of,
  tagsFingerprint,
  lookupFileFacts,
  type IndexDb,
} from '../../src/services/file-index.service';
import { DESCRIBE_CONTRACT_VERSION } from '../../src/utils/describe.generated';

const INDENT = ' '.repeat(33);
const DIR_ENTRY = [
  'OTL-DOOR.LHA P  40960  03-28-18  A door from the Outlaws',
  INDENT + 'MegaDoor v2.1',
  INDENT + 'Coded by sNoW/OUTLAWS',
  INDENT + 'Requires /X 4.x',
].join('\n');

const entry = parseDirFile(DIR_ENTRY)[0];
const TAGS = groupTagsFor(['OTL-DOOR.LHA', 'OTL-INTRO.LHA', 'OTL-TOOL.LHA', 'PDX-A.LHA', 'PDX-B.LHA']);

describe('the DIZ a DIR entry carries', () => {
  it('is the entry row\'s own text plus the continuation block, indent removed', () => {
    // The first line is on the ENTRY row (express.e:19454 writes the fields
    // and the first description line together); the rest follow at indent 33.
    expect(dizTextOf(entry)).toBe(
      'A door from the Outlaws\nMegaDoor v2.1\nCoded by sNoW/OUTLAWS\nRequires /X 4.x',
    );
  });

  it('is the typed line when an entry has no continuation rows', () => {
    // The first row of a description lives on the ENTRY row, so an entry with
    // nothing after it still has a description - it is one line long. Only an
    // entry with nothing past column 33 at all has none.
    const bare = parseDirFile('BARE.LHA     P   1024  03-28-18  Just a line\n')[0];
    expect(dizTextOf(bare)).toBe('Just a line');
  });

  it('is null when there is nothing past the description column', () => {
    const empty = parseDirFile('BARE.LHA     P   1024  03-28-18\n')[0];
    expect(dizTextOf(empty)).toBeNull();
  });
});

describe('reading one entry into facts', () => {
  const facts = factsForEntry({ entry, groupTags: TAGS });

  it('reads the door through the door server\'s own extractor', () => {
    // Not asserting the exact prose - that is the extractor's contract and is
    // pinned by the shared corpus. What matters here is that the facts came
    // from the DIZ rather than from the entry row.
    expect(facts.description).toBeTruthy();
    expect(facts.dizSha1).toBe(sha1Of(dizTextOf(entry)));
  });

  it('records which corpus and which rules produced it', () => {
    // Both are what make a row STALE later: a rule change moves outputs, and a
    // different corpus is a different reading.
    expect(facts.extractorVer).toBe(DESCRIBE_CONTRACT_VERSION);
    expect(facts.tagsSha1).toBe(tagsFingerprint(TAGS));
  });
});

describe('the group, four sources in trust order', () => {
  const base = { filename: 'OTL-DOOR.LHA', groupTags: TAGS };

  it('1. the sysop\'s GROUPS.MAP outranks everything', () => {
    expect(deriveGroup({
      ...base,
      mapGroup: 'Outlaws',
      catalog: { release_group: 'Something Else' },
      author: 'sNoW/PARADOX',
    })).toEqual({ group: 'Outlaws', source: 'map' });
  });

  it('2. then the door-repo catalog', () => {
    expect(deriveGroup({ ...base, catalog: { release_group: 'Outlaws' }, author: 'sNoW/PARADOX' }))
      .toEqual({ group: 'Outlaws', source: 'catalog' });
  });

  it('3. then the tail of a handle', () => {
    expect(deriveGroup({ ...base, author: 'sNoW/OUTLAWS' }))
      .toEqual({ group: 'OUTLAWS', source: 'handle' });
  });

  it('4. then the filename prefix, when the board\'s own corpus knows it', () => {
    const { group, source } = deriveGroup({ ...base, author: null });
    expect(source).toBe('prefix');
    expect((group ?? '').toUpperCase()).toBe('OTL');
  });

  it('answers nothing rather than guessing', () => {
    expect(deriveGroup({ filename: 'MYSTERY.LHA', groupTags: TAGS, author: null }))
      .toEqual({ group: null, source: null });
  });
});

describe('staleness', () => {
  it('is true when the RULES have moved', () => {
    expect(rowIsStale({ extractor_ver: '0', tags_sha1: tagsFingerprint(TAGS) }, tagsFingerprint(TAGS))).toBe(true);
  });

  it('is true when the CORPUS has moved', () => {
    expect(rowIsStale({ extractor_ver: DESCRIBE_CONTRACT_VERSION, tags_sha1: 'old' }, tagsFingerprint(TAGS))).toBe(true);
  });

  it('is false when neither has', () => {
    const t = tagsFingerprint(TAGS);
    expect(rowIsStale({ extractor_ver: DESCRIBE_CONTRACT_VERSION, tags_sha1: t }, t)).toBe(false);
  });
});

describe('the ambiguity rule - two DIRs, one filename', () => {
  it('answers when the rows agree about what a reader would see', () => {
    const rows = [
      { description: 'A door', version: '2.1', release_group: 'Outlaws', dir_number: 1 },
      { description: 'A door', version: '2.1', release_group: 'Outlaws', dir_number: 3 },
    ];
    expect(resolveAcrossDirs(rows)?.dir_number).toBe(1);
  });

  it('answers NOTHING when they disagree, rather than picking one', () => {
    // Guessing the wrong description is worse than showing none: the record
    // then renders from its own parsed row, which is never wrong.
    const rows = [
      { description: 'A door', version: '2.1', release_group: 'Outlaws' },
      { description: 'A different door', version: '2.1', release_group: 'Outlaws' },
    ];
    expect(resolveAcrossDirs(rows)).toBeNull();
  });

  it('answers nothing for an empty result', () => {
    expect(resolveAcrossDirs([])).toBeNull();
  });
});

describe('the lookup, over a database', () => {
  const TAGS_SHA = tagsFingerprint(TAGS);

  /** A database that answers with whatever rows the test hands it. */
  const dbOf = (rows: any[]): IndexDb => ({ query: async () => ({ rows }) });

  const row = (over: Record<string, unknown> = {}) => ({
    conf_id: 1, dir_number: 1, filename: 'OTL-DOOR.LHA',
    description: 'A door', version: '2.1', requires_bbs: null,
    author: null, release_group: 'Outlaws', group_source: 'prefix',
    category: null, diz_sha1: null,
    tags_sha1: TAGS_SHA, extractor_ver: DESCRIBE_CONTRACT_VERSION,
    indexed_at: 1000, ...over,
  });

  it('answers with the row when one DIR holds the file', async () => {
    const facts = await lookupFileFacts(dbOf([row()]), 1, 'OTL-DOOR.LHA', TAGS_SHA);
    expect(facts?.description).toBe('A door');
  });

  it('IGNORES a row analysed under different rules or a different corpus', async () => {
    // Silently serving a reading from an older extractor is exactly the drift
    // the version and fingerprint columns exist to catch.
    const stale = row({ extractor_ver: '0' });
    expect(await lookupFileFacts(dbOf([stale]), 1, 'OTL-DOOR.LHA', TAGS_SHA)).toBeNull();

    const otherCorpus = row({ tags_sha1: 'another-board' });
    expect(await lookupFileFacts(dbOf([otherCorpus]), 1, 'OTL-DOOR.LHA', TAGS_SHA)).toBeNull();
  });

  it('answers nothing when two DIRs disagree', async () => {
    const rows = [row(), row({ dir_number: 3, description: 'Something else' })];
    expect(await lookupFileFacts(dbOf(rows), 1, 'OTL-DOOR.LHA', TAGS_SHA)).toBeNull();
  });
});

describe('the DIR freshness guard', () => {
  const dbOf = (newest: unknown): IndexDb => ({ query: async () => ({ rows: [{ newest }] }) });

  it('is stale when the DIR has never been indexed', async () => {
    expect(await dirIsStale(dbOf(null), 1, 1, 1000)).toBe(true);
  });

  it('is stale when the DIR file is newer than its rows', async () => {
    expect(await dirIsStale(dbOf(1000), 1, 1, 2000)).toBe(true);
  });

  it('is fresh when the rows are newer than the file', async () => {
    // The listing then reads the index without touching the disk again.
    expect(await dirIsStale(dbOf(2000), 1, 1, 1000)).toBe(false);
  });
});
