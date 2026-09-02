/**
 * A door draws in the BOARD'S theme, not in colours it picked itself.
 *
 * The sysop chooses one of seven themes (sdk/engines/ui/theme/tokens.ts) and
 * a door that writes `fg: 'cyan'` ignores that choice: it looks identical on
 * a board running Quiet Phosphor and on one running Classic. Several doors
 * were migrated in August and several were not, so the board was half one
 * thing and half the other - "many seem only half updated to use themes".
 *
 * The rule, and the exceptions:
 *
 *   * every door listed here resolves the caller's theme and takes its
 *     colours from the tokens;
 *   * GAMES are exempt. An arcade door's palette IS its artwork - Pengo's ice
 *     blocks and Frogger's lanes are not chrome, and repainting them in a
 *     theme's accent would be vandalism;
 *   * a door may still name a colour whose meaning is fixed rather than
 *     decorative: the UNO colour picker, a card suit, a spectrum. Those are
 *     the game's own semantics.
 *
 * This is a source check on purpose. What a door DRAWS is covered by each
 * door's own tests (Doors/card-lobby/tests/theme.test.ts starts the door
 * under two themes and reads the colours off the widgets); what this catches
 * is the next door that never asks the board what it looks like.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join } from 'path';

const DOORS = join(__dirname, '..', '..', '..', '..', 'Doors');

/** Non-game doors: chrome, not artwork. */
const THEME_AWARE_DOORS = [
  'card-lobby',
  'door-manager',
  'bug-tracker',
  'bbs-dashboard',
  'doors-menu',
  'theme-picker',
  'rip-browser',
  'sprite-editor',
  'ansi-editor',
  'livechat',
  'voice-chat',
  'whip',
  'header-dropdown-demo',
  'widget-shadow-demo',
];

/**
 * neo-blessed-showcase is NOT here, and cannot be: its app.ts is 3705 lines
 * against the repo's 2000-line ceiling, so the pre-commit hook refuses any
 * edit to it. It needs an extraction before it can be themed.
 */

function sources(dir: string, found: string[] = []): string[] {
  if (!existsSync(dir)) return found;
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === 'tests') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sources(full, found);
    else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) found.push(full);
  }
  return found;
}

describe('doors take their colours from the board', () => {
  it.each(THEME_AWARE_DOORS)('%s resolves the caller\'s theme', (door) => {
    const files = sources(join(DOORS, door));
    expect(files.length).toBeGreaterThan(0);

    const resolves = files.filter((f) => {
      const text = readFileSync(f, 'utf8');
      return /getTheme|applyTheme\(|themeById\(/.test(text);
    });

    expect(resolves.length).toBeGreaterThan(0);
  });

  it.each(THEME_AWARE_DOORS)('%s imports the theme module', (door) => {
    const files = sources(join(DOORS, door));
    const importers = files.filter((f) =>
      /@amiexpress\/bbs-door-sdk\/engines\/ui\/theme|from '.*door-theme'/.test(readFileSync(f, 'utf8')),
    );

    expect(importers.length).toBeGreaterThan(0);
  });
});
