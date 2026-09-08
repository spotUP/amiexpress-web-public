import * as fs from 'fs';
import * as path from 'path';

/**
 * The door server owns the global-requests contract; this repo commits a
 * mirror (web/backend/src/requests/contract.ts) so any TypeScript consumer
 * here compiles without depending on that checkout. If the two drift, a client
 * can read fields the server no longer sends.
 *
 * Skips when the door server checkout is absent, so CI here does not depend on
 * a sibling repo - but fails loudly when it IS present and differs. Override
 * the checkout path with DOORSERVER_REQUEST_CONTRACT so this can run in CI too.
 */
const SERVER_CONTRACT =
  process.env.DOORSERVER_REQUEST_CONTRACT ??
  '~/Code/amiexpress-doorserver/contract/request-types.ts';
const MIRROR = path.join(__dirname, '..', '..', 'src', 'requests', 'contract.ts');

const describeIfServer = fs.existsSync(SERVER_CONTRACT) ? describe : describe.skip;

describe('vendored requests contract mirror', () => {
  it('exists and is marked generated', () => {
    const mirror = fs.readFileSync(MIRROR, 'utf-8');
    expect(mirror).toContain('GENERATED FILE');
    expect(mirror).toContain('export interface ListResponse');
    expect(mirror).toContain('REQUESTS_CONTRACT_VERSION');
  });
});

describeIfServer('mirror against the door server contract', () => {
  const fields = (src: string, iface: string): string[] => {
    const match = new RegExp(`export interface ${iface}(?:\\s+extends[^{]+)?\\s*\\{([^}]*)\\}`).exec(src);
    if (!match) throw new Error(`interface ${iface} not found -- has it been renamed?`);
    return match[1]
      .split('\n')
      .map((l) => l.trim().replace(/,$/, ''))
      .filter((l) => l.length > 0 && !l.startsWith('//') && !l.startsWith('*') && !l.startsWith('/*'));
  };

  const version = (src: string): string | undefined =>
    /REQUESTS_CONTRACT_VERSION\s*=\s*'([^']+)'/.exec(src)?.[1];

  it('declares the same fields, in the same types, the server does', () => {
    const server = fs.readFileSync(SERVER_CONTRACT, 'utf-8');
    const mirror = fs.readFileSync(MIRROR, 'utf-8');
    for (const iface of ['RequestRow', 'RequestDetail', 'ListResponse', 'RequestsHealth']) {
      const mirrorFields = fields(mirror, iface);
      expect(mirrorFields.length).toBeGreaterThan(1);
      expect(mirrorFields).toEqual(fields(server, iface));
    }
  });

  it("mirrors the server's REQUESTS_CONTRACT_VERSION", () => {
    const server = fs.readFileSync(SERVER_CONTRACT, 'utf-8');
    const mirror = fs.readFileSync(MIRROR, 'utf-8');
    expect(version(mirror)).toBe(version(server));
  });
});
