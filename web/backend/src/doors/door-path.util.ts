import * as fs from 'fs';
import * as path from 'path';

import { resolveCaseInsensitivePath } from '../utils/fs-amiga.util';

/**
 * Resolve a door resource path (config files, assets, etc.) using
 * Amiga-style case-insensitive lookups. Checks the current working
 * directory plus parent directories so doors can be executed from
 * web/backend or the project root.
 */
export function resolveDoorResourcePath(...segments: string[]): string | null {
  const searchRoots = [
    process.cwd(),
    path.resolve(process.cwd(), '..'),
    path.resolve(process.cwd(), '..', '..')
  ];

  for (const root of searchRoots) {
    const resolved = resolveCaseInsensitivePath(root, segments);
    if (resolved && fs.existsSync(resolved)) {
      return resolved;
    }
  }

  return null;
}
