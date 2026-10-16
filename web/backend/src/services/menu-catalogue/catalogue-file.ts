import * as fs from 'fs';
import * as path from 'path';
import type { Catalogue } from './types';
import { cleanText } from '../../screens/menu-config/menu-config';

export const CATALOGUE_MAGIC = 'AEMENU 1';
const f = (s: string, max: number) => cleanText(s, max);
const w = (code: string) => code || '-';

/**
 * Line order: K, T, P, O, W, [D], R, L*, then S/E per section, then ".".
 * D <enabled 0|1>\t<slide 0|1> is written ONLY when drill-down is on: an older menu door
 * refuses a line it does not know, so a drill-off catalogue stays byte-identical.
 */
export function formatCatalogue(c: Catalogue, lastRow: number): string {
  const lines = [CATALOGUE_MAGIC, `K ${c.kind}\t${c.parent || '-'}`, `T ${f(c.title, 30)}`, `P ${f(c.prompt, 72)}`,
    `O ${c.overflow}`, `W ${w(c.wipes.open)}\t${w(c.wipes.leave)}\t${w(c.wipes.page)}`];
  if (c.drill.enabled) lines.push(`D 1\t${c.drill.slide ? 1 : 0}`);
  lines.push(`R ${Math.max(0, lastRow | 0)}`);
  for (const l of c.logos) lines.push(`L ${l.position}\t${l.rows}\t${l.cols}\t${l.afterSection}`);
  for (const s of c.sections) {
    lines.push(`S ${f(s.title, 30)}`);
    for (const e of s.entries) lines.push(`E ${f(e.key, 15)}\t${f(e.label, 26)}\t${f(e.description, 76)}\t${f(e.right, 10)}\t${f(e.flags, 4)}`);
  }
  lines.push('.', '');
  return lines.join('\n');
}

/** Decision 25: one file per node and kind, read by the door with ae_dos. */
export function writeCatalogueFile(bbsRoot: string, node: number, c: Catalogue, lastRow: number): string {
  const dir = path.join(bbsRoot, `Node${node}`);
  fs.mkdirSync(dir, { recursive: true });
  const name = `menu-${c.kind.toLowerCase()}.cat`;
  fs.writeFileSync(path.join(dir, name), Buffer.from(formatCatalogue(c, lastRow), 'latin1'));
  return `BBS:Node${node}/${name}`;
}
