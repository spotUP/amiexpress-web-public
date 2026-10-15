/**
 * SP7 - the DIZ fallback, on the surface that finally reaches it.
 *
 * "For a record with no metadata and no group - the DIZ art is all there is"
 * (2026-09-03-c64-file-view-design.md, decision 14). The ladder had been
 * written, tested and called by nothing: `dizBlockFor` had no caller in `src/`
 * and `lookupFileFacts` had none either, so the record view showed the
 * description squeezed to two rows whether or not anything was known about the
 * file, and `DIZ_ART_SKIP` was a tooltype no code read.
 *
 * These drive `FileListingHandler.showFileRecord` - the `FI <n>` surface, and
 * the same one a search hit and an upload announcement use.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('../../src/database', () => ({
  db: { query: jest.fn().mockResolvedValue({ rows: [] }), run: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('../../src/services/file-facts.service', () => ({
  factsForRecord: jest.fn().mockResolvedValue(null),
  forgetCorpusFingerprint: jest.fn(),
}));
jest.mock('../../src/handlers/command-execution.handler', () => ({
  commandCache: { bbscmd: new Map(), syscmd: new Map() },
}));

import { FileListingHandler } from '../../src/handlers/file/file-listing.handler';
import { factsForRecord } from '../../src/services/file-facts.service';
import { commandCache } from '../../src/handlers/command-execution.handler';
import { config, type BBSConfig } from '../../src/config';

const facts = factsForRecord as unknown as jest.Mock;

/** 45 columns of boxed art - five wider than the screen, like every real DIZ. */
const DIZ = [
  '.-------------------------------------------.',
  '| Invitation for Deadline 2026, Berlin      |',
  "'-------------------------------------------'",
];

/** express.e writes the first description line on the entry row itself. */
const ENTRY = {
  filename: 'APOCAL.ZIP',
  fileSize: 108741,
  fileSizeDisplay: '108741',
  statusMarker: 'P',
  uploadDateDisplay: '24-Aug-26',
  uploadDate: new Date('2026-08-24'),
  description: DIZ.join(' '),
  rawLines: [
    'APOCAL.ZIP   P 108741  24-Aug-26  ' + DIZ[0],
    ...DIZ.slice(1).map((line) => ' '.repeat(33) + line),
  ],
};

function c64Session() {
  return {
    currentConf: 1,
    petsciiMode: true,
    screenWidth: 40,
    screenHeight: 25,
    user: { id: 1, username: 'SYSOP', secLevel: 255 },
    tempData: {},
  } as never;
}

function ansiSession() {
  return {
    currentConf: 1,
    petsciiMode: false,
    screenWidth: 80,
    screenHeight: 24,
    user: { id: 1, username: 'SYSOP', secLevel: 255 },
    tempData: {},
  } as never;
}

async function showRecord(session: never): Promise<string[]> {
  const wire: string[] = [];
  const socket = {
    id: 'diz-fallback',
    emit: (event: string, payload: unknown) => {
      if (event === 'ansi-output' && typeof payload === 'string') wire.push(payload);
      return true;
    },
  };
  await FileListingHandler.showFileRecord(socket as never, session, ENTRY as never, 3);
  // The MCI pass is not run here; strip the codes so the assertions read the
  // text a caller sees rather than the template's colours.
  return wire.join('').split('\r\n').map((row) => row.replace(/~[^|]*\|/g, ''));
}

let tmp = '';
const realGet = config.get.bind(config);

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'diz-fallback-'));
});

afterAll(() => {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* noop */ }
});

beforeEach(() => {
  jest.spyOn(config, 'get').mockImplementation((key: keyof BBSConfig) =>
    key === 'dataDir' ? tmp : realGet(key));
  facts.mockResolvedValue(null);
  commandCache.bbscmd.clear();
});

afterEach(() => jest.restoreAllMocks());

describe('a record with nothing known about it', () => {
  it('shows the DIZ through the ladder, cropped at the screen edge', async () => {
    const rows = await showRecord(c64Session());

    const top = rows.findIndex((row) => row.startsWith('.---'));
    expect(top).toBeGreaterThan(-1);
    // Three source rows, three screen rows, each cut where the screen ends.
    expect(rows[top].length).toBe(40);
    expect(rows[top + 1]).toBe('| Invitation for Deadline 2026, Berlin  ');
    expect(rows[top + 2].length).toBe(40);
  });

  it('does not then print the description a second time, squeezed', async () => {
    const rows = await showRecord(c64Session());

    // The block's own description row would start with the same text. It is
    // dropped once the DIZ has said it.
    const descRows = rows.filter((row) => row.includes('Invitation for Deadline'));
    expect(descRows.length).toBe(1);
  });

  it('still prints the record\'s own facts under the art', async () => {
    const rows = await showRecord(c64Session());

    expect(rows.some((row) => row.includes('APOCAL.ZIP'))).toBe(true);
    expect(rows.some((row) => row.includes('24-Aug-26'))).toBe(true);
  });
});

describe('the sysop switch', () => {
  it('replaces the block with one line when DIZ_ART_SKIP=YES on FI.info', async () => {
    commandCache.bbscmd.set('FI', { name: 'FI', toolTypes: { DIZ_ART_SKIP: 'YES' } } as never);

    const rows = await showRecord(c64Session());

    expect(rows).toContain('[ART - SKIPPED]');
    expect(rows.some((row) => row.startsWith('.---'))).toBe(false);
  });
});

describe('a record the index knows', () => {
  it('renders from its facts and shows no DIZ art', async () => {
    facts.mockResolvedValue({
      description: 'A door from the Outlaws',
      version: '2.1',
      release_group: 'OUTLAWS',
      author: 'SLASH',
    });

    const rows = await showRecord(c64Session());

    expect(rows.some((row) => row.startsWith('.---'))).toBe(false);
    expect(rows.some((row) => row.includes('OUTLAWS'))).toBe(true);
    expect(rows.some((row) => row.includes('A door from the Outlaws'))).toBe(true);
  });
});

describe('eighty columns', () => {
  it('is not the fallback\'s business at all', async () => {
    const rows = await showRecord(ansiSession());

    expect(rows.some((row) => row.startsWith('.---'))).toBe(false);
  });
});
