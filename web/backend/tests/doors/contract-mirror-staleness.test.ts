import * as fs from 'fs';
import * as path from 'path';

/**
 * The door server owns the manifest contract; this repo commits a mirror so
 * DOORMAN compiles without depending on that checkout. If the two drift, a
 * client can be reading fields the server no longer sends.
 *
 * Skips when the door server checkout is absent, so CI here does not depend
 * on a sibling repo - but fails loudly when it IS present and differs.
 */
const SERVER_CONTRACT = '~/Code/amiexpress-doorserver/contract/manifest-types.ts';
const MIRROR = path.join(__dirname, '..', '..', '..', '..', 'Doors', 'door-manager', 'repo-types.generated.ts');

const describeIfServer = fs.existsSync(SERVER_CONTRACT) ? describe : describe.skip;

describe('vendored contract mirror', () => {
  it('exists and is marked generated', () => {
    const mirror = fs.readFileSync(MIRROR, 'utf-8');
    expect(mirror).toContain('GENERATED FILE');
    expect(mirror).toContain('export interface ManifestDoor');
  });
});

describeIfServer('mirror against the door server contract', () => {
  it('declares the same fields the server does', () => {
    const server = fs.readFileSync(SERVER_CONTRACT, 'utf-8');
    const mirror = fs.readFileSync(MIRROR, 'utf-8');
    const fields = (src: string, iface: string): string[] => {
      const body = new RegExp(`export interface ${iface} \\{([^}]*)\\}`).exec(src)?.[1] ?? '';
      return body.split('\n').map((l) => l.trim().split(/[?:]/)[0].trim())
        .filter((l) => l.length > 0 && !l.startsWith('//') && !l.startsWith('*') && !l.startsWith('/*'));
    };
    expect(fields(mirror, 'ManifestDoor')).toEqual(fields(server, 'ManifestDoor'));
    expect(fields(mirror, 'DoorRepoManifest')).toEqual(fields(server, 'DoorRepoManifest'));
  });
});
