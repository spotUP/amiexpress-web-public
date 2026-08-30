import {
  applyRepoMetadata,
  archiveKey,
  buildMetadataIndex,
  clearRepoMetadataCache,
  getRepoMetadataIndex,
  metadataKey,
  METADATA_TTL_MS,
} from '../../src/doors/door-repo-metadata';
import type { RepoDoorMetadata } from '../../src/doors/door-repo-metadata';

/**
 * Every door on this board reaches the doors menu with an empty description.
 *
 * getDoorList overlays name/description/category from door_installs - this
 * node's snapshot of the repo, written when a door is installed through
 * DOORMAN or DOORREPO. Doors put on disk any other way have no such row, and
 * on the live board door_installs does not exist at all, so the overlay
 * never fires for any of the 365 commands.
 *
 * The repo knows what most of them are. These pin how it is asked, and how
 * carefully the answer is applied: a wrong description is worse than none,
 * and a door's own .info always wins.
 */

const CALC: RepoDoorMetadata = {
  archiveName: '-D-CALC.LHA',
  name: 'Calculator',
  description: 'Today calculator',
  category: 'Utility',
  author: 'VASCAL/DLT',
  releaseGroup: null,
  doorType: 'XIM',
};

describe('matching a local door to the catalog', () => {
  it('ignores case and punctuation', () => {
    expect(metadataKey('Some Door v2!')).toBe(metadataKey('SOMEDOOR-V2'));
  });

  it('reduces an archive name to its base', () => {
    expect(archiveKey('-D-CALC.LHA')).toBe('dcalc');
    expect(archiveKey('WALL.LZX')).toBe('wall');
  });

  it('indexes a door by both its archive and its name', () => {
    const index = buildMetadataIndex([CALC]);

    expect(index.get('dcalc')).toBe(CALC);
    expect(index.get('calculator')).toBe(CALC);
  });

  it('lets the first entry win a repeated name', () => {
    // A display name repeats across releases; the archive name does not.
    const older = { ...CALC, archiveName: 'OLD-CALC.LHA', description: 'older' };
    const index = buildMetadataIndex([CALC, older]);

    expect(index.get('calculator')).toBe(CALC);
    expect(index.get('oldcalc')).toBe(older);
  });
});

describe('applying repo metadata to a door', () => {
  const index = buildMetadataIndex([CALC]);

  it('fills a missing description from a name match', () => {
    // applyRepoMetadata fills category from the repo match even when the
    // input door didn't declare one; type the fixture to admit that field
    // so this reads the real return contract instead of the narrower shape
    // TS would otherwise infer from the literal.
    const door = applyRepoMetadata<{ command: string; name: string; description: string; category?: string }>(
      { command: 'CALC', name: 'Calculator', description: '' },
      index
    );

    expect(door.description).toBe('Today calculator');
    expect(door.category).toBe('Utility');
  });

  it('matches on the command when the name does not', () => {
    const door = applyRepoMetadata({ command: 'DCALC', name: 'Something else', description: '' }, index);

    expect(door.description).toBe('Today calculator');
  });

  it('never overwrites what the door itself says', () => {
    // A sysop who set NAME and a description in the .info meant them.
    const door = applyRepoMetadata(
      { command: 'CALC', name: 'My Calculator', description: 'my own words', category: 'Mine' },
      index
    );

    expect(door.name).toBe('My Calculator');
    expect(door.description).toBe('my own words');
    expect(door.category).toBe('Mine');
  });

  it('leaves a door the catalog does not recognise alone', () => {
    const door = applyRepoMetadata({ command: 'LOCALTHING', name: 'Local Thing', description: '' }, index);

    expect(door.description).toBe('');
  });

  it('does nothing at all with an empty index', () => {
    const door = { command: 'CALC', name: 'Calculator', description: '' };

    expect(applyRepoMetadata(door, new Map())).toBe(door);
  });
});

describe('applyRepoMetadata precedence', () => {
  const HACKCHK: RepoDoorMetadata = {
    archiveName: 'HACKCHK.LHA',
    name: 'Hack Check',
    description: 'Checks for known hacks',
    category: 'Security',
    author: null,
    releaseGroup: null,
    doorType: 'XIM',
  };
  const index = buildMetadataIndex([HACKCHK]);

  it('replaces a NAME that is ASCII art with the catalog name', () => {
    const door = { command: 'HACKCHECK', name: '.______.', description: '' };

    expect(applyRepoMetadata(door, index, { archiveName: 'HACKCHK.LHA' })).toMatchObject({
      name: 'Hack Check',
      description: 'Checks for known hacks',
    });
  });

  it('keeps a NAME the sysop plainly meant', () => {
    const door = { command: 'HACKCHECK', name: 'My Hack Checker', description: '' };

    expect(applyRepoMetadata(door, index, { archiveName: 'HACKCHK.LHA' }).name)
      .toBe('My Hack Checker');
  });

  it('matches on the linked archive exactly, not on a name that happens to look alike', () => {
    // No name/command match exists here: the link is the only way in.
    const door = { command: 'ZZ9', name: '.______.', description: '' };

    expect(applyRepoMetadata(door, index, { archiveName: 'HACKCHK.LHA' }).name)
      .toBe('Hack Check');
  });

  it('leaves an unlinked door to the old heuristic', () => {
    const door = { command: 'ZZ9', name: '.______.', description: '' };

    expect(applyRepoMetadata(door, index).name).toBe('.______.');
  });

  it('never touches an unlinked door that already has all three fields', () => {
    // The 370 doors this plan leaves alone: no install record, so no
    // precedence rule applies to them, whatever their NAME looks like.
    const door = { command: 'HACKCHECK', name: '.______.', description: 'own text', category: 'Utility' };

    expect(applyRepoMetadata(door, index)).toEqual(door);
  });

  it('applies the plausibility rule only to a linked door', () => {
    const unlinked = { command: 'HACKCHECK', name: '.______.', description: '' };
    const linked = { command: 'HACKCHECK', name: '.______.', description: '' };

    expect(applyRepoMetadata(unlinked, index).name).toBe('.______.');
    expect(applyRepoMetadata(linked, index, { archiveName: 'HACKCHK.LHA' }).name).toBe('Hack Check');
  });
});

describe('fetching the index', () => {
  const originalUrl = process.env.DOOR_SERVER_URL;

  beforeEach(() => {
    clearRepoMetadataCache();
    process.env.DOOR_SERVER_URL = 'https://doors.example.test';
  });

  afterEach(() => {
    clearRepoMetadataCache();
    if (originalUrl === undefined) delete process.env.DOOR_SERVER_URL;
    else process.env.DOOR_SERVER_URL = originalUrl;
  });

  function manifestFetch(doors: RepoDoorMetadata[]) {
    return jest.fn().mockResolvedValue({ ok: true, json: async () => ({ doors }) });
  }

  it('asks the configured door server for the manifest', async () => {
    const fetchImpl = manifestFetch([CALC]);

    const index = await getRepoMetadataIndex(0, fetchImpl as never);

    expect(fetchImpl.mock.calls[0][0]).toBe('https://doors.example.test/api/door-repo/manifest');
    expect(index.get('calculator')).toMatchObject({ description: 'Today calculator' });
  });

  it('asks once and serves the rest from the cache', async () => {
    const fetchImpl = manifestFetch([CALC]);

    await getRepoMetadataIndex(0, fetchImpl as never);
    await getRepoMetadataIndex(1000, fetchImpl as never);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('asks again once the cache has aged out', async () => {
    const fetchImpl = manifestFetch([CALC]);

    await getRepoMetadataIndex(0, fetchImpl as never);
    await getRepoMetadataIndex(METADATA_TTL_MS + 1, fetchImpl as never);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('keeps serving the last good index when the server goes away', async () => {
    await getRepoMetadataIndex(0, manifestFetch([CALC]) as never);

    const failing = jest.fn().mockRejectedValue(new Error('offline'));
    const index = await getRepoMetadataIndex(METADATA_TTL_MS + 1, failing as never);

    expect(index.get('calculator')).toBeTruthy();
  });

  it('returns nothing when no door server is configured', async () => {
    delete process.env.DOOR_SERVER_URL;
    const fetchImpl = manifestFetch([CALC]);

    expect((await getRepoMetadataIndex(0, fetchImpl as never)).size).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
