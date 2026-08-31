/**
 * A conference that exists is a conference people can reach.
 *
 * "i created conf 13 now 'test' but i dont see it in the bbs". It was on
 * disk, in the mirror and in every handler's list. The sysop's access string
 * was XXXXXXXXXXXX - twelve wide - and the board reads a missing thirteenth
 * position as no access. Boot pads every account to NCONFS; the refresh that
 * runs after an admin write did not, so a created conference was invisible
 * to everyone until the next restart.
 */

process.env.SKIP_DB_INIT = '1';

import { expandConferenceAccessTo, padAccessTo } from '../../src/services/conference-access-expansion';

function makeSqlite(users: Array<{ id: number; confaccess: string | null }>, newUserDefault = 'XXX') {
  const updates: Array<{ sql: string; params: unknown[] }> = [];
  return {
    updates,
    prepare: (sql: string) => ({
      get: () => (sql.includes('system_config') ? { new_user_conf_access: newUserDefault } : undefined),
      all: (...params: unknown[]) => {
        const count = Number(params[0]);
        return users.filter((u) => (u.confaccess ?? '').length < count).map((u) => ({ ...u }));
      },
      run: (...params: unknown[]) => {
        updates.push({ sql, params });
        return { changes: 1 };
      },
    }),
  };
}

describe('padAccessTo', () => {
  it('grants the new positions and leaves the old ones alone', () => {
    expect(padAccessTo('XXXXXXXXXXXX', 13)).toBe('XXXXXXXXXXXXX');
    expect(padAccessTo('XX_X', 6)).toBe('XX_XXX');
  });

  it('never shortens', () => {
    expect(padAccessTo('XXXXXXXXXXXXXX', 12)).toBe('XXXXXXXXXXXXXX');
  });

  it('treats a missing string as empty', () => {
    expect(padAccessTo(null, 3)).toBe('XXX');
  });
});

describe('expandConferenceAccessTo', () => {
  it('widens every account shorter than the conference count', () => {
    const sqlite = makeSqlite([
      { id: 1, confaccess: 'XXXXXXXXXXXX' },
      { id: 2, confaccess: 'XXXXXXXXXXXXX' },
      { id: 3, confaccess: null },
    ]);

    const result = expandConferenceAccessTo(sqlite, 13);

    expect(result.usersExpanded).toBe(2);
    const userUpdates = sqlite.updates.filter((u) => u.sql.startsWith('UPDATE users'));
    expect(userUpdates.map((u) => u.params)).toEqual([
      ['XXXXXXXXXXXXX', 1],
      ['XXXXXXXXXXXXX', 3],
    ]);
  });

  it('widens the new-user default too', () => {
    const sqlite = makeSqlite([], 'XXX');

    const result = expandConferenceAccessTo(sqlite, 5);

    expect(result.newUserDefaultExpanded).toBe(true);
    expect(sqlite.updates.find((u) => u.sql.includes('system_config'))?.params).toEqual(['XXXXX']);
  });

  it('does nothing on a board with no conferences', () => {
    const sqlite = makeSqlite([{ id: 1, confaccess: '' }]);
    expect(expandConferenceAccessTo(sqlite, 0)).toEqual({ usersExpanded: 0, newUserDefaultExpanded: false });
    expect(sqlite.updates).toEqual([]);
  });
});
