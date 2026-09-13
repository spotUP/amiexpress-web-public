/**
 * A level-100 account is a SCREEN EDITOR, and Screens is the whole of the
 * admin it may use.
 *
 * The Overview was minLevel 100 and the /admin index route was unguarded, so
 * an artist both saw the entry and landed on it - onto panels fed by
 * /api/config, which is requireSysop(), so every one of them 403'd. The rule
 * the sysop stated is the one asserted here: at level 100 the sidebar offers
 * Screens and nothing else.
 *
 * This names the exact set on purpose. It is a POLICY, not a snapshot of
 * today's nav: if a new destination is given to level 100, this failing is
 * the decision being noticed, which is what should happen.
 */
import { describe, expect, it } from 'vitest';
import { navItemsForLevel, hardcodedMinLevel } from '../components/AppShell/nav-config';

function labels(level: number): string[] {
  return navItemsForLevel(level).flatMap((group) => group.items.map((i) => i.label));
}

describe('what a level-100 screen editor may see in the admin', () => {
  it('offers Screens and nothing else', () => {
    expect(labels(100)).toEqual(['Screens']);
  });

  it('does not offer the Overview, whose data is sysop-only', () => {
    expect(labels(100)).not.toContain('Overview');
    expect(hardcodedMinLevel('')).toBe(255);
  });

  it('still gives a sysop everything, including the Overview', () => {
    const sysop = labels(255);
    expect(sysop).toContain('Overview');
    expect(sysop).toContain('Screens');
    expect(sysop.length).toBeGreaterThan(labels(100).length);
  });

  it('gives a caller below 100 nothing at all', () => {
    expect(labels(99)).toEqual([]);
  });
});
