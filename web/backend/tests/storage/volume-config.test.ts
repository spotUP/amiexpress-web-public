import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { applyTooltypes } from '../../src/utils/info-file.util';
import { parseVolumes, parseQuota, readVolumeSecret } from '../../src/storage/volume-config';

function boardWith(drivesInfoTooltypes: string[]): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'volcfg-'));
  // parseInfoFile reads a real .info; the util's writer is what makes one.
  // applyTooltypes goes through parseOrCreateInfoFile, so it creates the file
  // when it is not there yet - which is what a fresh temp board needs.
  applyTooltypes(
    path.join(root, 'Drives.info'),
    drivesInfoTooltypes.map((line) => {
      const eq = line.indexOf('=');
      return [line.slice(0, eq), line.slice(eq + 1)] as const;
    })
  );
  return root;
}

describe('parseQuota', () => {
  it('reads the suffixes a sysop actually types', () => {
    expect(parseQuota('10G')).toBe(10 * 1024 ** 3);
    expect(parseQuota('2T')).toBe(2 * 1024 ** 4);
    expect(parseQuota('512M')).toBe(512 * 1024 ** 2);
    expect(parseQuota('1024')).toBe(1024);
  });

  it('rejects nonsense rather than guessing', () => {
    expect(() => parseQuota('lots')).toThrow(/quota/i);
  });
});

describe('parseVolumes', () => {
  it('reads a plain local board exactly as before', () => {
    const root = boardWith(['DRIVE.1=BBS:Files']);
    const vols = parseVolumes(root);
    expect(vols).toHaveLength(1);
    expect(vols[0].kind).toBe('local');
    expect(vols[0].path).toBe('BBS:Files');
    expect(vols[0].quotaBytes).toBeUndefined();
  });

  it('reads an s3 drive with its sub-keys', () => {
    const root = boardWith([
      'DRIVE.1=BBS:Files',
      'DRIVE.2=s3://uprough-cold',
      'DRIVE.2.ENDPOINT=https://s3.eu-central-003.backblazeb2.com',
      'DRIVE.2.REGION=eu-central-003',
      'DRIVE.2.QUOTA=10G',
      'DRIVE.2.EGRESS=3X',
      'DRIVE.2.CLASS=FREE',
      'DRIVE.2.KEYID=00512abc',
    ]);
    const vols = parseVolumes(root);
    expect(vols).toHaveLength(2);
    expect(vols[1]).toMatchObject({
      driveNumber: 2,
      kind: 's3',
      path: 'uprough-cold',
      endpoint: 'https://s3.eu-central-003.backblazeb2.com',
      quotaBytes: 10 * 1024 ** 3,
      egress: '3X',
      volumeClass: 'FREE',
      keyId: '00512abc',
    });
  });

  it('defaults an s3 drive to PAID and METERED, because assuming free is the expensive mistake', () => {
    const root = boardWith(['DRIVE.1=s3://somebucket']);
    const [vol] = parseVolumes(root);
    expect(vol.volumeClass).toBe('PAID');
    expect(vol.egress).toBe('METERED');
  });

  it('stops at the first gap, the way express.e freeDiskSpace does', () => {
    const root = boardWith(['DRIVE.1=BBS:Files', 'DRIVE.3=s3://orphan']);
    expect(parseVolumes(root)).toHaveLength(1);
  });

  it('returns no volumes when Drives.info is absent', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'volcfg-empty-'));
    expect(parseVolumes(root)).toEqual([]);
  });
});

describe('readVolumeSecret', () => {
  it('prefers the environment over the key file', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'volsec-'));
    fs.mkdirSync(path.join(root, 'Storage'));
    fs.writeFileSync(path.join(root, 'Storage', '2.key'), 'from-file\n');
    process.env.BBS_STORAGE_2_SECRET = 'from-env';
    try {
      expect(readVolumeSecret(root, 2)).toBe('from-env');
    } finally {
      delete process.env.BBS_STORAGE_2_SECRET;
    }
  });

  it('reads the key file, trimming the newline', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'volsec2-'));
    fs.mkdirSync(path.join(root, 'Storage'));
    fs.writeFileSync(path.join(root, 'Storage', '2.key'), 'sekrit\n', { mode: 0o600 });
    expect(readVolumeSecret(root, 2)).toBe('sekrit');
  });

  it('returns null when there is no secret anywhere', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'volsec3-'));
    expect(readVolumeSecret(root, 2)).toBeNull();
  });
});
