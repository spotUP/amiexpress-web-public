/**
 * The board is not allowed to wrap.
 *
 * Reported live: "the lines in zookeeper are too long, every second one is
 * black". Every arcade door here was built from the same template, and the
 * template omits two options on the boxes that matter:
 *
 *   - blessed.box() returns a Panel, and a Panel INJECTS a line border
 *     whenever `border` is absent from the options. That steals two columns
 *     and two rows. A row drawn to the full field width then overflows the
 *     box by two columns, wraps, and the wrapped remainder paints as a black
 *     line - so the board appears on every other row.
 *
 *   - a one-row HUD is worse: the injected border IS the whole box, so the
 *     score line never appears at all.
 *
 * There was a sweep for exactly this ("sweep ghost-border fix to all blessed
 * doors") and it missed six doors, so this test exists per door rather than
 * as one shared check somebody can forget to extend.
 */

import assert from 'assert';
import { readFileSync } from 'fs';
import { join } from 'path';

/** The options block of a named blessed.box() call. */
function boxOptions(src: string, name: string): string {
  const re = new RegExp(`${name}\\s*=\\s*blessed\\.box\\(\\{([\\s\\S]*?)\\n  \\}\\)`);
  const m = src.match(re);
  assert.ok(m, `no ${name} = blessed.box({...}) found`);
  return m![1];
}

function indexSource(): string {
  return readFileSync(join(__dirname, '..', 'index.ts'), 'utf8');
}

/** The playfield must not draw its own border, and must not wrap. */
export async function theGameAreaHasNoGhostBorderAndDoesNotWrap(): Promise<void> {
  const opts = boxOptions(indexSource(), 'gameArea');

  assert.ok(
    /border:\s*undefined/.test(opts),
    'gameArea must pass border: undefined explicitly, or Panel injects one ' +
    'and steals two columns from a row that is already full width'
  );
  assert.ok(
    /wrap:\s*false/.test(opts),
    'gameArea must set wrap: false, or a full-width row wraps and the board ' +
    'renders on every other line'
  );
}

/** A one-row HUD must not draw a border, or it has no room for content. */
export async function theHudHasNoGhostBorder(): Promise<void> {
  const opts = boxOptions(indexSource(), 'hudBox');

  assert.ok(
    /border:\s*undefined/.test(opts),
    'hudBox must pass border: undefined explicitly - on a one-row box the ' +
    'injected border is the whole box and the score line never appears'
  );
}
