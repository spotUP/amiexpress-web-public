/**
 * THE WORDS A SYSOP ACTUALLY TYPES MUST FIND THE PAGE.
 *
 * Reported: "i dont find the notification settings in the admin ui and
 * searching for push or notification returns nothing the admin search is
 * pretty weak?"
 *
 * He was right, and the cause is structural rather than a missing word. The
 * sidebar filter searches nav labels, nav keywords, and the SystemConfigPage
 * section table. "Notification Settings" is a section of the OPERATOR CHAT
 * page, which no index covers - so the one place the push switch lives was
 * unreachable by search, and the feature looked absent.
 *
 * This pins the SEARCH TERMS, not the implementation: whatever the filter is
 * built from later, typing these words must still reach the page that holds
 * the setting.
 *
 * UPDATED 2026-09-08: the setting moved. Those three sections are now a
 * destination of their own - "i think all notification settings deserves its
 * own menu entry its to spread out now hard to find" - so the words must reach
 * `notifications`, and the SECOND half of this file pins the other half of the
 * same complaint: "the menu search still sucks and returns nothing from all
 * pages", which was true because only Configuration's insides were indexed.
 */
import { describe, it, expect } from 'vitest';
import { NAV_GROUPS, navItemMatchesQuery } from '../src/components/AppShell/nav-config';

/** The filter's own rule: label, description and keywords, case-insensitive. */
function findsPath(term: string): string[] {
  const q = term.toLowerCase();
  const hits: string[] = [];
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      const haystack = [
        item.label,
        item.description ?? '',
        ...(item.keywords ?? []),
      ].join(' ').toLowerCase();
      if (haystack.includes(q)) hits.push(item.path);
    }
  }
  return hits;
}

describe('the admin search finds the notification switch', () => {
  // The exact words from the report.
  for (const term of ['push', 'notification', 'notifications']) {
    it(`"${term}" reaches the notifications page`, () => {
      expect(findsPath(term)).toContain('notifications');
    });
  }

  // The words a sysop reaches for when the tab is closed and nothing beeped.
  for (const term of ['desktop notifications', 'browser notifications', 'alerts']) {
    it(`"${term}" reaches it too`, () => {
      expect(findsPath(term)).toContain('notifications');
    });
  }

  it('does not turn the whole nav into a match for a common word', () => {
    // A search that answers "everything" is the same as one that answers
    // nothing. 'push' must not now hit every destination in the admin.
    expect(findsPath('push').length).toBeLessThan(5);
  });
});

/**
 * The other half of the complaint: the filter could only see INSIDE
 * Configuration, so a word that names a section of any other page answered
 * nothing at all.
 */
describe('the search reaches inside the other destinations too', () => {
  /** The filter's real rule, sections included. */
  const reaches = (term: string): string[] => {
    const hits: string[] = [];
    for (const group of NAV_GROUPS) {
      for (const item of group.items) {
        if (navItemMatchesQuery(item, term)) hits.push(item.path);
      }
    }
    return hits;
  };

  const cases: Array<[string, string]> = [
    ['quiet hours', 'operator-chat'],
    ['pushover', 'notifications'],
    ['ntfy', 'notifications'],
    ['vapid', 'notifications'],
    ['artist studio', 'screens'],
    ['deployment', 'health'],
    ['batch scripts', 'config-files'],
    ['transfer protocols', 'lookup-tables'],
    ['file areas', 'conferences'],
    ['smtp_port', 'system'],
  ];

  for (const [term, path] of cases) {
    it(`"${term}" reaches ${path}`, () => {
      expect(reaches(term)).toContain(path);
    });
  }

  it('still answers nothing for a word the admin does not have', () => {
    expect(reaches('teleportation')).toEqual([]);
  });
});
