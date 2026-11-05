import * as fs from 'fs';
import * as path from 'path';

/**
 * The door server owns the manifest contract; this repo commits a mirror so
 * DOORMAN compiles without depending on that checkout. If the two drift, a
 * client can be reading fields the server no longer sends.
 *
 * Skips when the door server checkout is absent, so CI here does not depend
 * on a sibling repo - but fails loudly when it IS present and differs.
 * Override the checkout path with DOORSERVER_CONTRACT so this can run in CI
 * too, not just on the one machine with that hardcoded path.
 */
const SERVER_CONTRACT = process.env.DOORSERVER_CONTRACT
  ?? '~/Code/amiexpress-doorserver/contract/manifest-types.ts';
const MIRROR = path.join(__dirname, '..', '..', '..', '..', 'board', 'Doors', 'door-manager', 'repo-types.generated.ts');

const describeIfServer = fs.existsSync(SERVER_CONTRACT) ? describe : describe.skip;

describe('vendored contract mirror', () => {
  it('exists and is marked generated', () => {
    const mirror = fs.readFileSync(MIRROR, 'utf-8');
    expect(mirror).toContain('GENERATED FILE');
    expect(mirror).toContain('export interface ManifestDoor');
  });
});

describeIfServer('mirror against the door server contract', () => {
  // Regression test (2026-08-24): the original version of this test
  // returned [] for BOTH sides when its regex failed to match (a renamed
  // interface, or any field whose type itself contains a `}` -- the
  // `[^}]*` body match stops at the FIRST `}`), and `[]` `toEqual` `[]`
  // passes -- a rename or a genuinely broken mirror would go undetected.
  // It also compared field NAMES only, so `archiveSize: number | null` vs.
  // `archiveSize: string` passed too. Both are now hard failures.
  const fields = (src: string, iface: string): string[] => {
    const match = new RegExp(`export interface ${iface} \\{([^}]*)\\}`).exec(src);
    if (!match) throw new Error(`interface ${iface} not found -- has it been renamed?`);
    return match[1].split('\n').map((l) => l.trim().replace(/,$/, ''))
      .filter((l) => l.length > 0 && !l.startsWith('//') && !l.startsWith('*') && !l.startsWith('/*'));
  };

  it('declares the same fields, in the same types, the server does', () => {
    const server = fs.readFileSync(SERVER_CONTRACT, 'utf-8');
    const mirror = fs.readFileSync(MIRROR, 'utf-8');
    const mirrorDoorFields = fields(mirror, 'ManifestDoor');
    const mirrorManifestFields = fields(mirror, 'DoorRepoManifest');
    // A parse that silently found nothing would make the toEqual below
    // vacuously pass if the server side also found nothing for the same
    // (broken) reason -- assert real content on both sides independently.
    expect(mirrorDoorFields.length).toBeGreaterThan(5);
    expect(mirrorManifestFields.length).toBeGreaterThan(2);
    expect(mirrorDoorFields).toEqual(fields(server, 'ManifestDoor'));
    expect(mirrorManifestFields).toEqual(fields(server, 'DoorRepoManifest'));
  });

  it('mirrors the server\'s CONTRACT_VERSION', () => {
    const server = fs.readFileSync(SERVER_CONTRACT, 'utf-8');
    const mirror = fs.readFileSync(MIRROR, 'utf-8');
    const version = (src: string): string | undefined =>
      /CONTRACT_VERSION\s*=\s*'([^']+)'/.exec(src)?.[1];
    expect(version(mirror)).toBeDefined();
    expect(version(mirror)).toBe(version(server));
  });
});
