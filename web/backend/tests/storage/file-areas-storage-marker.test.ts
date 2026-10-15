/**
 * Where a file area's remote marker lives for the RUNNING board.
 *
 * `file_areas.storage_volume` exists in SQL, and the live download path never
 * reads it: `server/initialization.ts` builds the area list with
 * `loadFileAreasFromDisk`, out of each Conf<N>.info, and injects THAT. So the
 * marker a download branches on has to come off the same disk file as the
 * paths it qualifies, or the column is written and never read.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadFileAreasFromDisk } from '../../src/services/file-areas-loader';

/** A Conf<N>.info the way InfoFileParser reads one: NUL-separated tooltypes. */
function writeConfInfo(root: string, confId: number, tooltypes: string[]): void {
  fs.writeFileSync(
    path.join(root, `Conf${confId}.info`),
    Buffer.from(tooltypes.map(t => `${t}\0`).join(''), 'latin1')
  );
}

function boardRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'areas-'));
}

const CONFERENCES = [{ id: 1, name: 'General' }];

describe('the storage marker on a disk-loaded file area', () => {
  it('is undefined for an ordinary local area, which is every board today', () => {
    const root = boardRoot();
    writeConfInfo(root, 1, ['NDIRS=1', 'DLPATH.1=BBS:Conf1/Files/', 'ULPATH.1=BBS:Conf1/Upload/']);

    const [area] = loadFileAreasFromDisk(root, CONFERENCES);

    expect(area.storageVolume).toBeUndefined();
  });

  it('reads STORAGEDRIVE.n as the drive that dir n lives on', () => {
    const root = boardRoot();
    writeConfInfo(root, 1, [
      'NDIRS=2',
      'DLPATH.1=BBS:Conf1/Files/',
      'ULPATH.1=BBS:Conf1/Upload/',
      'STORAGEDRIVE.1=2',
      'DLPATH.2=BBS:Conf1/Extra/',
      'ULPATH.2=BBS:Conf1/Extra/',
    ]);

    const areas = loadFileAreasFromDisk(root, CONFERENCES);

    expect(areas[0].storageVolume).toBe(2);
    expect(areas[1].storageVolume).toBeUndefined();
  });

  it('lets a conference-wide STORAGEDRIVE cover every dir', () => {
    const root = boardRoot();
    writeConfInfo(root, 1, [
      'NDIRS=2',
      'STORAGEDRIVE=3',
      'DLPATH.1=BBS:Conf1/Files/',
      'ULPATH.1=BBS:Conf1/Upload/',
      'DLPATH.2=BBS:Conf1/Extra/',
      'ULPATH.2=BBS:Conf1/Extra/',
    ]);

    const areas = loadFileAreasFromDisk(root, CONFERENCES);

    expect(areas.map(a => a.storageVolume)).toEqual([3, 3]);
  });

  it('lets the per-dir key override the conference-wide one', () => {
    const root = boardRoot();
    writeConfInfo(root, 1, [
      'NDIRS=2',
      'STORAGEDRIVE=3',
      'STORAGEDRIVE.2=4',
      'DLPATH.1=BBS:Conf1/Files/',
      'ULPATH.1=BBS:Conf1/Upload/',
      'DLPATH.2=BBS:Conf1/Extra/',
      'ULPATH.2=BBS:Conf1/Extra/',
    ]);

    expect(loadFileAreasFromDisk(root, CONFERENCES).map(a => a.storageVolume)).toEqual([3, 4]);
  });

  it('leaves the area local and says so when the value is not a drive number', () => {
    // Failing to local is the pre-existing behaviour; failing to a GUESSED
    // drive would upload a caller's file into the wrong bucket in silence.
    const root = boardRoot();
    writeConfInfo(root, 1, ['NDIRS=1', 'DLPATH.1=BBS:Conf1/Files/', 'STORAGEDRIVE.1=two']);
    const written: string[] = [];
    const spy = jest.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      written.push(String(chunk));
      return true;
    });

    const [area] = loadFileAreasFromDisk(root, CONFERENCES);
    spy.mockRestore();

    expect(area.storageVolume).toBeUndefined();
    expect(written.join('')).toContain('STORAGEDRIVE.1');
    expect(written.join('')).toContain('two');
  });

  it('refuses drive 0 and negatives, which name no drive', () => {
    // DRIVE numbering starts at 1 (see StorageQuotaError's note on the
    // sentinel), so a 0 here is a typo, not a volume.
    const root = boardRoot();
    writeConfInfo(root, 1, ['NDIRS=1', 'DLPATH.1=BBS:Conf1/Files/', 'STORAGEDRIVE.1=0']);
    const spy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const [area] = loadFileAreasFromDisk(root, CONFERENCES);
    spy.mockRestore();

    expect(area.storageVolume).toBeUndefined();
  });
});
