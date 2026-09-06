/**
 * Adding a bucket has to reach Drives.info, or the admin is a form that
 * cannot do the thing it exists for.
 *
 * Before this, the writer emitted only `DRIVE.n` - the base path - and the
 * save schema declared only four fields, so ENDPOINT/REGION/KEYID/QUOTA had
 * to be hand-typed into the file. A sysop could see a pooled volume's terms
 * in the admin and never create one there.
 *
 * The other half is just as important: a save that does NOT mention a
 * sub-key must leave the sysop's hand-written value alone.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parseVolumes } from '../../src/storage/volume-config';
import { applyTooltypes } from '../../src/utils/info-file.util';
import { STORAGE_PROVIDERS, providerById, buildEndpoint } from '../../src/storage/providers';

describe('the provider catalogue', () => {
  it('gives every provider an endpoint the sysop can complete', () => {
    for (const p of STORAGE_PROVIDERS) {
      expect(p.id).toMatch(/^[a-z0-9]+$/);
      expect(p.label.length).toBeGreaterThan(0);
      // A template with a {} must say what goes in it; one without must not.
      if (p.endpointTemplate?.includes('{}')) {
        expect(p.endpointFieldLabel.length).toBeGreaterThan(0);
      } else {
        expect(p.endpointFieldLabel).toBe('');
      }
    }
  });

  it('builds Cloudflare R2 endpoints from an account id alone', () => {
    const r2 = providerById('r2')!;
    expect(buildEndpoint(r2, 'f3f3dfe3536ea995a70df201b22fb6f1')).toBe(
      'https://f3f3dfe3536ea995a70df201b22fb6f1.r2.cloudflarestorage.com'
    );
    // The terms a BBS decides on: R2 serves downloads for nothing.
    expect(r2.egress).toBe('FREE');
    expect(r2.minimumRetentionDays).toBe(0);
  });

  it('carries the retention trap that costs money, not just the price', () => {
    // Deleting a file from Wasabi before 90 days still bills its 90 days.
    expect(providerById('wasabi')!.minimumRetentionDays).toBe(90);
    expect(providerById('s3')!.minimumRetentionDays).toBe(30);
  });
});

describe('a saved bucket reaches Drives.info', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'drive-bucket-'));
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  /**
   * Drives.info is an Amiga .info icon carrying tooltypes, not a text file -
   * applyTooltypes is the writer the service itself uses, and it creates the
   * icon when the board has none yet.
   */
  function writeInfo(lines: string[]): void {
    applyTooltypes(
      path.join(root, 'Drives.info'),
      lines.map(line => {
        const eq = line.indexOf('=');
        return [line.slice(0, eq), line.slice(eq + 1)] as const;
      })
    );
  }

  // The number MUST be contiguous: parseVolumes stops at the first gap, the
  // same rule freeDiskSpace() follows, so a bucket added as DRIVE.3 beside a
  // lone DRIVE.1 is invisible to the board. This is why the Add Drive form
  // has to offer the next free number rather than let one be typed.
  it('parses back as a usable s3 volume with its terms', () => {
    writeInfo([
      'DRIVE.1=DH1:',
      'DRIVE.2=s3://amiexpress-files',
      'DRIVE.2.ENDPOINT=https://acct.r2.cloudflarestorage.com',
      'DRIVE.2.REGION=auto',
      'DRIVE.2.KEYID=AKIAEXAMPLE',
      'DRIVE.2.QUOTA=10737418240',
      'DRIVE.2.CLASS=FREE',
      'DRIVE.2.EGRESS=FREE',
    ]);

    const volumes = parseVolumes(root);
    const pooled = volumes.find(v => v.driveNumber === 2)!;

    expect(pooled.kind).toBe('s3');
    expect(pooled.path).toBe('amiexpress-files');
    expect(pooled.endpoint).toBe('https://acct.r2.cloudflarestorage.com');
    expect(pooled.keyId).toBe('AKIAEXAMPLE');
    expect(pooled.volumeClass).toBe('FREE');
    expect(pooled.egress).toBe('FREE');

    // The local drive beside it is untouched and still local.
    expect(volumes.find(v => v.driveNumber === 1)!.kind).toBe('local');
  });
});
