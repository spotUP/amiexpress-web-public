/**
 * ONE NAME FOR THE PLACE SCREENS ARE DRAWN: Screen Designer.
 *
 * It had four. "Artist studio" was a tab, "ANSI Studio" was the copy on two
 * other pages, "Screen Files" was the heading of the page it opened on, and
 * "screen manager" was what Login Sequence called it. None of them was the
 * name of the page you were on.
 *
 * The sysop picked it and said why, 2026-09-17: he first said ANSI Studio,
 * then "no wait, it's not only ansi... Screen Designer is a proper name". He
 * is right - the same place draws `.seq` for a C64, `.rip` for a RIP terminal
 * and `.ttx` for teletext, so naming it after one of the four formats was
 * wrong about three quarters of the board.
 *
 * The retired names stay as nav KEYWORDS: a sysop who learned "artist studio"
 * must still find it by typing that.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { resolve, join } from 'path';

import { NAV_ITEMS } from '../components/AppShell/nav-config';

const SRC = resolve(__dirname, '..');

/** Every .ts/.tsx under src, except the tests that quote the old names. */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'test') continue;
      out.push(...sourceFiles(full));
      continue;
    }
    if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * The strings a person actually reads: JSX text and quoted copy, with the
 * comments stripped. A comment quoting the sysop ("preview as a caller is
 * just black in ansi studio") is history and stays.
 */
function visibleText(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    // `keywords: [...]` is the search index, not copy: the retired names live
    // there ON PURPOSE so a sysop who learned one can still find the page.
    .replace(/keywords:\s*\[[^\]]*\]/g, 'keywords: []');
}

describe('the name of the place screens are drawn', () => {
  it('is what the sidebar says', () => {
    const item = NAV_ITEMS.find(entry => entry.path === 'screens');
    expect(item?.label).toBe('Screen Designer');
  });

  it('still finds it by the names it used to have', () => {
    const item = NAV_ITEMS.find(entry => entry.path === 'screens');
    const keywords = (item?.keywords ?? []).map(word => word.toLowerCase());
    for (const retired of ['artist studio', 'ansi studio', 'screen files', 'screen manager']) {
      expect(keywords, `"${retired}" no longer finds the page`).toContain(retired);
    }
  });

  it('is not called anything else in the copy', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const text = visibleText(readFileSync(file, 'utf8'));
      for (const retired of ['Artist studio', 'ANSI Studio', 'Screen Files', 'screen manager']) {
        if (text.includes(retired)) offenders.push(`${file.replace(SRC, 'src')}: ${retired}`);
      }
    }
    expect(offenders, `retired names still on screen:\n${offenders.join('\n')}`).toEqual([]);
  });
});
