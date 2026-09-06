/**
 * The mapping between a board's file areas and the objects that back them.
 *
 * Pure functions, no I/O: every remote decision the download path, the upload
 * path and DosLibrary make starts here, so the edges (a name that only looks
 * like it is inside an area, an area with no leaf directory, a local area)
 * are pinned once rather than three times.
 */
import * as path from 'path';
import {
  brokenRemoteAreas,
  isRemoteArea,
  locateByRealPath,
  objectPrefixFor,
  remoteAreaFromDisk,
  remoteAreasFor,
  remoteLocationFor,
  areaLocalRoot,
  usableRemoteAreasFor,
  type RemoteArea,
} from '../../src/storage/remote-areas';

const DATA_DIR = path.join('/board', 'data');

function area(over: Partial<RemoteArea> = {}): RemoteArea {
  return {
    id: 1,
    conferenceId: 1,
    dirNumber: 1,
    path: 'BBS:Conf1/Files/',
    storageVolume: 2,
    ...over,
  };
}

describe('remoteLocationFor', () => {
  it('reads a catalog row that carries both halves of a location', () => {
    expect(remoteLocationFor({ storageVolume: 2, objectKey: 'Conf1/Files/DEMO.LHA' })).toEqual({
      driveNumber: 2,
      key: 'Conf1/Files/DEMO.LHA',
    });
  });

  it('is null for a row on local disk', () => {
    expect(remoteLocationFor({})).toBeNull();
  });

  it('is null when only half the location is recorded', () => {
    expect(remoteLocationFor({ storageVolume: 2 })).toBeNull();
    expect(remoteLocationFor({ objectKey: 'Conf1/Files/DEMO.LHA' })).toBeNull();
  });

  it('accepts the snake_case shape a raw SELECT hands back', () => {
    // file-socket-handlers.ts looks a download up by name with `SELECT fe.*`,
    // whose row is snake_case. Reading only `storageVolume` there sends every
    // by-name download of a pooled file down the local route.
    expect(remoteLocationFor({ storage_volume: 2, object_key: 'Conf1/Files/DEMO.LHA' })).toEqual({
      driveNumber: 2,
      key: 'Conf1/Files/DEMO.LHA',
    });
  });

  it('is null for a raw row on local disk, where both columns are NULL', () => {
    expect(remoteLocationFor({ storage_volume: null, object_key: null })).toBeNull();
  });
});

describe('isRemoteArea', () => {
  it('is true only when the area names a drive', () => {
    expect(isRemoteArea(area())).toBe(true);
    expect(isRemoteArea(area({ storageVolume: undefined }))).toBe(false);
  });
});

describe('objectPrefixFor', () => {
  it('turns an Amiga area path into a key prefix', () => {
    expect(objectPrefixFor({ conferenceId: 1, path: 'BBS:Conf1/Files/' })).toBe('Conf1/Files/');
  });

  it('turns a local absolute area path into the same prefix', () => {
    expect(objectPrefixFor({ conferenceId: 3, path: '/board/data/Conf3/Upload' })).toBe('Conf3/Upload/');
  });

  it('falls back to Files when the area names no leaf directory', () => {
    expect(objectPrefixFor({ conferenceId: 2, path: '' })).toBe('Conf2/Files/');
    expect(objectPrefixFor({ conferenceId: 2, path: 'BBS:Conf2' })).toBe('Conf2/Files/');
    expect(objectPrefixFor({ conferenceId: 2, path: 'BBS:Conf2/' })).toBe('Conf2/Files/');
  });

  it('keeps the conference number from the area, not from the path', () => {
    // A misconfigured DLPATH must not silently file objects under another
    // conference's prefix, where the other conference's index would find them.
    expect(objectPrefixFor({ conferenceId: 4, path: 'BBS:Conf9/Files/' })).toBe('Conf4/Files/');
  });
});

describe('remoteAreasFor', () => {
  it('returns only the remote areas of that conference', () => {
    const areas = [
      area({ id: 1, conferenceId: 1 }),
      area({ id: 2, conferenceId: 1, storageVolume: undefined }),
      area({ id: 3, conferenceId: 2 }),
    ];
    expect(remoteAreasFor(1, areas).map(a => a.id)).toEqual([1]);
  });
});

describe('remoteAreaFromDisk', () => {
  it('maps the loader shape (dlPath, dirNumber) onto the area shape', () => {
    expect(
      remoteAreaFromDisk({
        id: 7,
        conferenceId: 2,
        dirNumber: 3,
        dlPath: 'BBS:Conf2/Files/',
        ulPath: 'BBS:Conf2/Upload/',
        storageVolume: 2,
      })
    ).toEqual({
      id: 7,
      conferenceId: 2,
      dirNumber: 3,
      path: 'BBS:Conf2/Files/',
      storageVolume: 2,
      volumeClassPref: undefined,
    });
  });
});

describe('areaLocalRoot', () => {
  it('resolves the BBS: assign against the board directory', () => {
    expect(areaLocalRoot(area(), DATA_DIR)).toBe(path.join(DATA_DIR, 'Conf1', 'Files'));
  });

  it('follows the real path, not the conference number', () => {
    // DLPATH.n is free text. Deriving `<conf dir>/<leaf>` for an area that
    // points elsewhere would name a directory the area has nothing to do with.
    expect(areaLocalRoot({ conferenceId: 1, path: 'BBS:Archive/Warez/' }, DATA_DIR)).toBe(
      path.join(DATA_DIR, 'Archive', 'Warez')
    );
  });

  it('is null for another AmigaDOS volume, which this process cannot resolve', () => {
    expect(areaLocalRoot({ conferenceId: 1, path: 'DH1:Warez/Files/' }, DATA_DIR)).toBeNull();
  });

  it('takes an absolute path as itself', () => {
    expect(areaLocalRoot({ conferenceId: 3, path: '/mnt/files/Conf3/Files' }, DATA_DIR)).toBe(
      path.join('/mnt', 'files', 'Conf3', 'Files')
    );
  });
});

describe('usableRemoteAreasFor', () => {
  const configured = (n: number) => n === 2;
  const collect = (): { warn: (m: string) => void; lines: string[] } => {
    const lines: string[] = [];
    return { warn: (m: string) => lines.push(m), lines };
  };

  it('keeps an area whose drive is in the pool', () => {
    const w = collect();
    expect(usableRemoteAreasFor(1, [area()], configured, w.warn).map(a => a.id)).toEqual([1]);
    expect(w.lines).toEqual([]);
  });

  it('drops an area naming a drive Drives.info does not have, and says which', () => {
    // Left in, NameIndexRegistry throws a plain Error for the unknown drive
    // BEFORE the local fallback runs, so every download in the conference -
    // including the files on local disk - would answer "storage error".
    const w = collect();
    const areas = [area({ id: 1, storageVolume: 9 })];

    expect(usableRemoteAreasFor(1, areas, configured, w.warn)).toEqual([]);
    expect(w.lines.join('')).toContain('DRIVE.9');
    expect(w.lines.join('')).toContain('local disk');
  });

  it('drops the second of two areas that would share one object prefix', () => {
    // Both spell Conf1/Files/: their objects would collide in the bucket and
    // the inverse lookup could only ever name one of them.
    const w = collect();
    const areas = [
      area({ id: 1, dirNumber: 1, path: 'BBS:Conf1/Files/' }),
      area({ id: 2, dirNumber: 2, path: 'DH1:Archive/Files/' }),
    ];

    expect(usableRemoteAreasFor(1, areas, configured, w.warn).map(a => a.id)).toEqual([1]);
    expect(w.lines.join('')).toContain('Conf1/Files/');
  });

  it('keeps two areas whose directories differ', () => {
    const areas = [
      area({ id: 1, dirNumber: 1, path: 'BBS:Conf1/Files/' }),
      area({ id: 2, dirNumber: 2, path: 'BBS:Conf1/Extra/' }),
    ];
    expect(usableRemoteAreasFor(1, areas, configured, collect().warn).map(a => a.id)).toEqual([1, 2]);
  });
});

describe('brokenRemoteAreas', () => {
  const configured = (n: number) => n === 2;

  it('is empty when every pooled area names a configured drive', () => {
    expect(brokenRemoteAreas([area({ storageVolume: 2 })], configured)).toEqual([]);
  });

  it('is empty for a local area - it has no drive to be wrong about', () => {
    expect(brokenRemoteAreas([area({ storageVolume: undefined })], configured)).toEqual([]);
  });

  it('names the area and the drive for a mis-numbered STORAGEDRIVE', () => {
    const broken = brokenRemoteAreas(
      [area({ conferenceId: 1, dirNumber: 3, path: 'BBS:Conf1/Warez/', storageVolume: 9 })],
      configured
    );
    expect(broken).toEqual([{ conferenceId: 1, dirNumber: 3, path: 'BBS:Conf1/Warez/', driveNumber: 9 }]);
  });

  it('reports every broken area, not just the first', () => {
    const broken = brokenRemoteAreas(
      [area({ dirNumber: 1, storageVolume: 9 }), area({ dirNumber: 2, storageVolume: 2 }), area({ dirNumber: 3, storageVolume: 7 })],
      configured
    );
    expect(broken.map((b) => b.dirNumber)).toEqual([1, 3]);
  });
});

describe('locateByRealPath', () => {
  const areas = [
    area({ id: 1, conferenceId: 1, path: 'BBS:Conf1/Files/', storageVolume: 2 }),
    area({ id: 2, conferenceId: 1, path: 'BBS:Conf1/Upload/', storageVolume: 3 }),
    area({ id: 3, conferenceId: 2, path: 'BBS:Conf2/Files/', storageVolume: undefined }),
  ];

  it('maps a resolved path under a remote area back to its drive and key', () => {
    expect(locateByRealPath(path.join(DATA_DIR, 'Conf1', 'Files', 'DEMO.LHA'), areas, DATA_DIR)).toEqual({
      driveNumber: 2,
      key: 'Conf1/Files/DEMO.LHA',
    });
  });

  it('picks the area the path is actually in, not the first remote one', () => {
    expect(locateByRealPath(path.join(DATA_DIR, 'Conf1', 'Upload', 'NEW.LHA'), areas, DATA_DIR)).toEqual({
      driveNumber: 3,
      key: 'Conf1/Upload/NEW.LHA',
    });
  });

  it('keeps a nested path nested in the key', () => {
    expect(locateByRealPath(path.join(DATA_DIR, 'Conf1', 'Files', 'sub', 'A.TXT'), areas, DATA_DIR)?.key).toBe(
      'Conf1/Files/sub/A.TXT'
    );
  });

  it('does not match a sibling directory that merely shares the prefix', () => {
    // `<root>Files2/X` starts with `<root>Files` as a string. Containment is
    // a path question, not a string question.
    expect(locateByRealPath(path.join(DATA_DIR, 'Conf1', 'Files2', 'X.LHA'), areas, DATA_DIR)).toBeNull();
  });

  it('is null for a path in a local area', () => {
    expect(locateByRealPath(path.join(DATA_DIR, 'Conf2', 'Files', 'X.LHA'), areas, DATA_DIR)).toBeNull();
  });

  it('is null for a path under an area on another AmigaDOS volume', () => {
    const elsewhere = [area({ id: 4, conferenceId: 1, path: 'DH1:Warez/Files/', storageVolume: 2 })];
    expect(locateByRealPath(path.join(DATA_DIR, 'Conf1', 'Files', 'X.LHA'), elsewhere, DATA_DIR)).toBeNull();
  });

  it('is null for a path outside every area', () => {
    expect(locateByRealPath(path.join(DATA_DIR, 'Node0', 'Playpen', 'X.LHA'), areas, DATA_DIR)).toBeNull();
  });

  it('is null for the area root itself, which is a directory and not an object', () => {
    expect(locateByRealPath(path.join(DATA_DIR, 'Conf1', 'Files'), areas, DATA_DIR)).toBeNull();
  });

  it('resolves a relative or dotted path before deciding', () => {
    expect(
      locateByRealPath(path.join(DATA_DIR, 'Conf1', 'Files', '..', 'Files', 'DEMO.LHA'), areas, DATA_DIR)?.key
    ).toBe('Conf1/Files/DEMO.LHA');
  });

  it('does not let a traversal escape the area', () => {
    expect(locateByRealPath(path.join(DATA_DIR, 'Conf1', 'Files', '..', 'Secret', 'X'), areas, DATA_DIR)).toBeNull();
  });
});
