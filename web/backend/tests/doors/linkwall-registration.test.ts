/**
 * LINKWALL runs the wall that exists.
 *
 * Its registration said TYPE=XIM, LOCATION=Doors:bbslink/bbslinkwall - the
 * Amiga E wall from the BBSLink sources. That binary is not on the board and
 * not in this repo; the wall that exists is the TypeScript door in
 * Doors/bbslinkwall, which GWWALL already registered. Third one of these in
 * two days: GWALL and LINKMENU were the same shape, a TypeScript door wearing
 * a 68K registration, and AmiExpress reads the registration rather than the
 * door, so nothing notices until a user runs the command.
 *
 * The tooltypes are pinned here because a registration is DATA - no code
 * change can break it, and no code change can fix it either. It goes wrong by
 * an old copy coming back.
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseInfoFile } from '../../src/utils/info-file.util';

const ROOT = path.resolve(__dirname, '../../../..');

function tooltypes(file: string): Record<string, string> {
  const parsed: any = parseInfoFile(path.join(ROOT, file));
  const out: Record<string, string> = {};
  for (const t of (parsed?.tooltypes ?? []) as any[]) {
    if (!t.commented && out[t.key] === undefined) out[t.key] = String(t.value);
  }
  return out;
}

describe('the BBSLink wall registration', () => {
  const wall = tooltypes('Commands/BBSCmd/linkwall.info');

  it('runs the TypeScript door, not a 68K binary that is not there', () => {
    expect(wall.TYPE).toBe('TS');
    expect(wall.LOCATION).toBe('Doors/bbslinkwall');
  });

  it('points at a door this repo actually ships', () => {
    const pkg = path.join(ROOT, wall.LOCATION, 'package.json');

    expect(fs.existsSync(pkg)).toBe(true);
    expect(JSON.parse(fs.readFileSync(pkg, 'utf8')).doorType).toBe('TS');
  });

  it('keeps the access level the board had set', () => {
    expect(wall.ACCESS).toBe('20');
  });

  it('is still an Amiga icon, not a text stub', () => {
    // A hand-edited .info loses its DiskObject and GetDiskObject reads NIL -
    // which is how a rename destroyed a file checker's icon on 2026-08-31.
    const head = fs.readFileSync(path.join(ROOT, 'Commands/BBSCmd/linkwall.info')).subarray(0, 2);

    expect(head.toString('hex')).toBe('e310');
  });
});
