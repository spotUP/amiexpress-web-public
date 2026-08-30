/**
 * Every ACS permission is described, and placed exactly once.
 *
 * The Access Levels page listed all 87 flags by their raw name, in the order
 * express.e declares them (express.e:31528-31537) - which is the order of the
 * bits in Access/ACS.<level>.info, not an order that means anything. Working
 * out what a level could do meant reading all 87 and knowing the codebase.
 *
 * Grouping them only helps if the grouping is complete. A permission left out
 * of the table would vanish from the page, and a level would silently grant
 * or withhold something the sysop could no longer see - which is the failure
 * this admin has had too much of already.
 */

import { describe, expect, it } from 'vitest';
import {
  ACS_GROUPS,
  ACS_LABELS,
  GROUPED_PERMISSIONS,
  acsLabel,
  groupPermissions,
} from '../pages/acs-permission-groups';

describe('ACS permission groups', () => {
  it('places every permission exactly once', () => {
    const seen = new Map<string, number>();
    for (const permission of GROUPED_PERMISSIONS) {
      seen.set(permission, (seen.get(permission) ?? 0) + 1);
    }

    const duplicates = [...seen.entries()].filter(([, count]) => count > 1);
    expect(duplicates.map(([name]) => name)).toEqual([]);
  });

  it('covers all 87 that express.e declares', () => {
    // express.e:31528-31537. If the count moves, a flag was added and this
    // table has to place it.
    expect(GROUPED_PERMISSIONS).toHaveLength(87);
  });

  it('describes every permission it places', () => {
    const undescribed = GROUPED_PERMISSIONS.filter((p) => !ACS_LABELS[p]);
    expect(undescribed).toEqual([]);
  });

  it('describes nothing it does not place', () => {
    const placed = new Set(GROUPED_PERMISSIONS);
    const orphans = Object.keys(ACS_LABELS).filter((p) => !placed.has(p));
    expect(orphans).toEqual([]);
  });

  it('gives every group a heading and a line of its own', () => {
    for (const group of ACS_GROUPS) {
      expect(group.title.length).toBeGreaterThan(0);
      expect(group.description.length).toBeGreaterThan(0);
      expect(group.permissions.length).toBeGreaterThan(0);
    }
  });

  it('falls back to the raw name rather than showing nothing', () => {
    expect(acsLabel('ACS.DOWNLOAD')).toBe('Download files');
    expect(acsLabel('ACS.SOMETHING_NEW')).toBe('ACS.SOMETHING_NEW');
  });

  describe('what the page is given to render', () => {
    const all = () => true;

    it('drops a group the level has nothing from', () => {
      const groups = groupPermissions(['ACS.DOWNLOAD', 'ACS.UPLOAD'], all);

      expect(groups).toHaveLength(1);
      expect(groups[0].title).toBe('Files');
      expect(groups[0].permissions).toEqual(['ACS.DOWNLOAD', 'ACS.UPLOAD']);
    });

    it('keeps a permission it has never heard of, rather than hiding it', () => {
      // A flag added to express.e and not to this table must still reach the
      // sysop - being unknown to the page is not a reason to withhold it.
      const groups = groupPermissions(['ACS.DOWNLOAD', 'ACS.BRAND_NEW'], all);

      const everythingElse = groups.find((g) => g.title === 'Everything else');
      expect(everythingElse?.permissions).toEqual(['ACS.BRAND_NEW']);
    });

    it('narrows to what the filter matches', () => {
      const groups = groupPermissions(
        ['ACS.DOWNLOAD', 'ACS.UPLOAD', 'ACS.READ_MESSAGE'],
        (name) => name.includes('LOAD')
      );

      expect(groups).toHaveLength(1);
      expect(groups[0].permissions).toEqual(['ACS.DOWNLOAD', 'ACS.UPLOAD']);
    });

    it('returns nothing when the filter matches nothing', () => {
      expect(groupPermissions(['ACS.DOWNLOAD'], () => false)).toEqual([]);
    });
  });
});
