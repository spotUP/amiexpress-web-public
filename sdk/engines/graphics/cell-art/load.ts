/**
 * Sheet loading. The only file in cell-art that touches fs, kept apart so
 * a browser bundle can import the model and renderer without it.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Sprite, parseSprite } from './sprite';

/** Load every `*.sprite.json` in a directory, keyed by sprite name. */
export function loadSpriteSheet(dir: string): Record<string, Sprite> {
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    throw new Error(`sprite directory not found: ${dir}`);
  }

  const sheet: Record<string, Sprite> = {};
  for (const entry of entries) {
    if (!entry.endsWith('.sprite.json')) continue;
    const raw = JSON.parse(fs.readFileSync(path.join(dir, entry), 'utf8'));
    const sprite = parseSprite(raw, entry);
    sheet[sprite.name] = sprite;
  }
  return sheet;
}
