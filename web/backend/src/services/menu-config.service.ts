/**
 * Where a menu door's config lives: <boardRoot>/Menus/<KIND>.json, untracked
 * (Decision 31) - disk-based like every other board setting (RULES 10), and
 * outside anything a deploy reseeds, so a sysop's edit survives a deploy.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as amigafs from '../utils/amigafs';
import { validateMenuConfig, type MenuConfig, type MenuKind } from '../screens/menu-config/menu-config';

export function menuConfigPath(bbsRoot: string, kind: MenuKind): string {
  return path.join(bbsRoot, 'Menus', `${kind}.json`);
}
export function menuLogoDir(bbsRoot: string, kind: MenuKind): string {
  return path.join(bbsRoot, 'Screens', 'menus', kind.toLowerCase(), 'logos');
}

export function readMenuConfig(bbsRoot: string, kind: MenuKind): { config: MenuConfig; problems: string[] } {
  const file = menuConfigPath(bbsRoot, kind);
  if (!amigafs.existsSync(file)) return validateMenuConfig(kind, undefined);
  let raw: unknown;
  try { raw = JSON.parse(amigafs.readFileSync(file, 'utf8') as string); }
  catch { const v = validateMenuConfig(kind, undefined); return { config: v.config, problems: [`${kind}.json is not JSON; showing the defaults`] }; }
  return validateMenuConfig(kind, raw);
}

export function writeMenuConfig(bbsRoot: string, kind: MenuKind, raw: unknown): { config: MenuConfig; problems: string[] } {
  const result = validateMenuConfig(kind, raw);
  const file = menuConfigPath(bbsRoot, kind);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) fs.copyFileSync(file, file + '.bak');
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(result.config, null, 2) + '\n');
  fs.renameSync(tmp, file);
  return result;
}
