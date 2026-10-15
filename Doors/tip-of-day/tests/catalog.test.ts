/**
 * Catalog: registry over directory. A door with no .info is not installed
 * and is never tipped; ports are flagged, never hidden.
 */
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { loadDoorCatalog, resolveBoardRoot } from '../catalog';

function boardFixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tip-catalog-'));
  fs.mkdirSync(path.join(root, 'Commands', 'BBSCmd'), { recursive: true });
  fs.mkdirSync(path.join(root, 'Doors', 'whip'), { recursive: true });
  fs.mkdirSync(path.join(root, 'Doors', 'dopewars'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Commands', 'BBSCmd', 'WHIP.info'), 'TYPE=TS\nLOCATION=Doors/whip\n');
  fs.writeFileSync(path.join(root, 'Commands', 'BBSCmd', 'DOPE.info'), 'TYPE=TS\nLOCATION=Doors/dopewars\n');
  fs.writeFileSync(path.join(root, 'Commands', 'BBSCmd', 'OLD.info'), 'TYPE=XIM\nLOCATION=OldDoor\n');
  fs.writeFileSync(
    path.join(root, 'Doors', 'whip', 'package.json'),
    JSON.stringify({ description: 'Demo-scene projects', author: 'AmiExpress Team' }),
  );
  fs.writeFileSync(
    path.join(root, 'Doors', 'dopewars', 'package.json'),
    JSON.stringify({ description: 'Drug-trading game, port of the classic DopeWars', author: 'ports' }),
  );
  return root;
}

export async function onlyInstalledTsDoors(): Promise<void> {
  const catalog = loadDoorCatalog(boardFixture());
  assert.deepStrictEqual(catalog.map((d) => d.command), ['WHIP', 'DOPE']);
}

export async function inHouseFirstPortsFlagged(): Promise<void> {
  const catalog = loadDoorCatalog(boardFixture());
  assert.strictEqual(catalog[0].inHouse, true);
  assert.strictEqual(catalog[1].inHouse, false);
  assert.ok(catalog[1].description.length > 0);
}

export async function missingRootDegradesToEmpty(): Promise<void> {
  assert.deepStrictEqual(loadDoorCatalog(null), []);
  assert.deepStrictEqual(loadDoorCatalog(path.join(os.tmpdir(), 'tip-nope-NOT-HERE')), []);
}

export async function resolvesUpwards(): Promise<void> {
  const root = boardFixture();
  assert.strictEqual(resolveBoardRoot(path.join(root, 'Doors', 'whip', 'dist')), root);
}

export async function readsBinaryIconInfo(): Promise<void> {
  // Real .info files are Amiga icons: NUL-padded binary, tooltypes buried
  // mid-line (live 2026-09-11: linkwall.info). A text-anchored regex
  // misses them and the door is never tipped.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tip-binary-'));
  fs.mkdirSync(path.join(root, 'Commands', 'BBSCmd'), { recursive: true });
  fs.mkdirSync(path.join(root, 'Doors', 'bbslinkwall'), { recursive: true });
  const binary = Buffer.concat([
    Buffer.from([0x00, 0x10, 0x1b]),
    Buffer.from('LOCATION=Doors/bbslinkwall'),
    Buffer.from([0x00, 0x00, 0x00, 0x00, 0x23]),
    Buffer.from('DESCRIPTION=BBSLink one-liner wall'),
    Buffer.from([0x00, 0x00, 0x1b]),
    Buffer.from('TYPE=TS'),
    Buffer.from([0x00, 0x00, 0x00]),
  ]);
  fs.writeFileSync(path.join(root, 'Commands', 'BBSCmd', 'linkwall.info'), binary);
  fs.writeFileSync(
    path.join(root, 'Doors', 'bbslinkwall', 'package.json'),
    JSON.stringify({ description: 'BBSLink Wall - One-liner wall', author: 'AmiExpress Team' }),
  );
  const catalog = loadDoorCatalog(root);
  assert.strictEqual(catalog.length, 1);
  assert.strictEqual(catalog[0].command, 'LINKWALL');
  assert.strictEqual(catalog[0].inHouse, false);
}

export async function keyNeverMatchesMidWord(): Promise<void> {
  // XTYPES= must not read as TYPE=: the lead boundary is a
  // non-identifier byte, not a fixed set.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tip-midword-'));
  fs.mkdirSync(path.join(root, 'Commands', 'BBSCmd'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Commands', 'BBSCmd', 'fake.info'), 'XTYPES=TS\0LOCATION=Doors/nowhere\0');
  assert.deepStrictEqual(loadDoorCatalog(root), []);
}

export async function amigaSafeKeepsLatin1DropsTheRest(): Promise<void> {
  const { amigaSafe } = await import('../catalog');
  assert.strictEqual(amigaSafe('Try WHIP -Pods'), 'Try WHIP -Pods');
  assert.strictEqual(amigaSafe('Börsen'), 'Börsen');
  assert.strictEqual(amigaSafe('dash — ellipsis … emoji 🎮'), 'dash ? ellipsis ? emoji ??');
}
