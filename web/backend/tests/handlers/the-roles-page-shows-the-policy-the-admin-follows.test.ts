/**
 * THE ADMIN ROLES PAGE MUST SHOW THE POLICY THE ADMIN ACTUALLY FOLLOWS.
 *
 * `ADMIN_SECTIONS` is what that page lists and what a sysop's saved
 * permissions file is cleaned against. Nothing in the backend reads it to
 * decide access - `getAdminPerm` has no callers - so a wrong entry here is not
 * a hole. It is worse in a quieter way: the page states a policy, a sysop
 * believes it, and the admin does something else.
 *
 * `overview` said 100 while the frontend's nav floor said 255. The Overview's
 * panels are fed by `/api/config`, which is `requireSysop()`, so a level-100
 * account landing there got a 403 behind every panel - which is exactly why
 * the frontend was raised. The table was never brought along.
 *
 * The frontend half of this policy is asserted in
 * `web/config-app/src/test/a-level-100-sees-only-screens.test.tsx`: at level
 * 100 the sidebar offers Screens and nothing else. This is the other half.
 */
process.env.SKIP_DB_INIT = '1';

import { ADMIN_SECTIONS } from '../../src/handlers/admin/admin-permissions.handler';

const levelOf = (key: string): number | undefined =>
  ADMIN_SECTIONS.find(section => section.key === key)?.defaultMinLevel;

describe('what the roles page offers a level-100 account', () => {
  it('gives it Screens, which is the whole point of level 100', () => {
    expect(levelOf('screens')).toBe(100);
  });

  it('does NOT give it the Overview, whose every panel is sysop-only', () => {
    expect(levelOf('overview')).toBe(255);
  });

  it('offers it nothing else at all', () => {
    const open = ADMIN_SECTIONS
      .filter(section => section.defaultMinLevel <= 100)
      .map(section => section.key);
    // Named on purpose: a destination given to level 100 in future should
    // fail this and be noticed, rather than arrive unannounced.
    expect(open).toEqual(['screens']);
  });
});

describe('the table itself', () => {
  it('names every section once', () => {
    const keys = ADMIN_SECTIONS.map(section => section.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('carries a label for each, because the page renders it', () => {
    for (const section of ADMIN_SECTIONS) {
      expect(section.label.trim().length).toBeGreaterThan(0);
    }
  });

  it('uses levels the board understands', () => {
    for (const section of ADMIN_SECTIONS) {
      expect(section.defaultMinLevel).toBeGreaterThanOrEqual(0);
      expect(section.defaultMinLevel).toBeLessThanOrEqual(255);
    }
  });
});
