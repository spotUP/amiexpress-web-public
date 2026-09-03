import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { applyTooltypes } from '../../src/utils/info-file.util';
import { VolumeSet } from '../../src/storage/volume-set';
import { LocalBackend } from '../../src/storage/local-backend';
import { S3Backend } from '../../src/storage/s3-backend';

/**
 * fromBoard is the only place the brief's "default off, skip the
 * misconfigured drive, construct no S3 client" constraint actually lives -
 * parseVolumes just reads tooltypes, and place()/freeBytes() trust whatever
 * VolumeState[] they are handed. Nothing else in this suite exercises it.
 */

function boardWith(drivesInfoTooltypes: string[]): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'volset-'));
  applyTooltypes(
    path.join(root, 'Drives.info'),
    drivesInfoTooltypes.map((line) => {
      const eq = line.indexOf('=');
      return [line.slice(0, eq), line.slice(eq + 1)] as const;
    })
  );
  return root;
}

describe('VolumeSet.fromBoard', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('builds an empty pool when there is no Drives.info', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'volset-empty-'));
    const set = VolumeSet.fromBoard(root);
    expect(set.states).toEqual([]);
    expect(set.hasPool()).toBe(false);
  });

  it('constructs no S3 client for a board of only local drives - default off', () => {
    const root = boardWith(['DRIVE.1=DH1:', 'DRIVE.2=DH2:']);
    const set = VolumeSet.fromBoard(root);
    expect(set.states).toHaveLength(2);
    for (const s of set.states) {
      expect(s.backend).toBeInstanceOf(LocalBackend);
      expect(s.backend).not.toBeInstanceOf(S3Backend);
    }
    expect(set.hasPool()).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });

  it('skips a bucket with no secret, warns naming the drive, and keeps the rest of the pool', () => {
    const root = boardWith([
      'DRIVE.1=DH1:',
      'DRIVE.2=s3://uprough-cold',
      'DRIVE.2.ENDPOINT=https://s3.example.com',
      'DRIVE.2.KEYID=keyid-2',
    ]);
    const set = VolumeSet.fromBoard(root);
    expect(set.states.map((s) => s.volume.driveNumber)).toEqual([1]);
    expect(set.states[0].backend).toBeInstanceOf(LocalBackend);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('DRIVE.2'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('secret'));
  });

  it('skips a bucket with no KEYID, warns naming the drive, and keeps the rest of the pool', () => {
    const root = boardWith([
      'DRIVE.1=DH1:',
      'DRIVE.2=s3://uprough-cold',
      'DRIVE.2.ENDPOINT=https://s3.example.com',
    ]);
    process.env.BBS_STORAGE_2_SECRET = 'sekrit';
    try {
      const set = VolumeSet.fromBoard(root);
      expect(set.states.map((s) => s.volume.driveNumber)).toEqual([1]);
      expect(set.states[0].backend).toBeInstanceOf(LocalBackend);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('DRIVE.2'));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('misconfigured'));
    } finally {
      delete process.env.BBS_STORAGE_2_SECRET;
    }
  });

  it('builds a working s3 backend for a fully-configured bucket alongside a local drive', () => {
    const root = boardWith([
      'DRIVE.1=DH1:',
      'DRIVE.2=s3://uprough-cold',
      'DRIVE.2.ENDPOINT=https://s3.example.com',
      'DRIVE.2.KEYID=keyid-2',
    ]);
    process.env.BBS_STORAGE_2_SECRET = 'sekrit';
    try {
      const set = VolumeSet.fromBoard(root);
      expect(set.states.map((s) => s.volume.driveNumber)).toEqual([1, 2]);
      expect(set.states[1].backend).toBeInstanceOf(S3Backend);
      expect(set.hasPool()).toBe(true);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      delete process.env.BBS_STORAGE_2_SECRET;
    }
  });
});
