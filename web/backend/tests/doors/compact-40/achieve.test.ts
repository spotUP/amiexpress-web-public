/**
 * ACHIEVE at 40 and 80 columns: every builder's rows fit, the menu says
 * what the account state allows, and every refusal has words.
 */
import { getCompactProfile } from '../../../../../sdk/engines/ui/blessed/core/responsive-constants';
const {
  menuItems, profileLines, catalogLines, leaderboardLines, explain, footerHints, familiesOf, clip,
} = require('../../../../../Doors/achieve/app');

const compact = getCompactProfile(40);
const wide = getCompactProfile(80);
const profile = {
  handle: 'Spot', verified: true, private: false, points: 480, linkedBoards: ['uprough', 'cyberspace'],
  unlocks: [
    { id: 'msg.post.100', name: 'Century', tier: 'silver', points: 10, hidden: false, rarityPctTenths: 81, at: '2026-09-07T10:00:00Z' },
    { id: 'file.up.bytes.1gb', name: 'Freight Train Of A Very Long Achievement Name', tier: 'gold', points: 25, hidden: false, rarityPctTenths: 4, at: '2026-09-07T10:00:00Z' },
  ],
  progress: [{ id: 'msg.post.1000', have: 412, need: 1000 }],
};
const catalog = {
  revision: 'a3-t1',
  achievements: [
    { id: 'msg.post.1', name: 'First Words', description: 'Post a message', family: 'msg', tier: 'bronze', points: 5, hidden: false, rarityPctTenths: 1000, rarityBucket: 'common' },
    { id: 'file.up.1', name: 'Contributor', description: 'Upload a file, any file, to any conference on this board', family: 'file', tier: 'bronze', points: 5, hidden: false, rarityPctTenths: 1000, rarityBucket: 'common' },
    { id: 'rare.midnight', name: '???', description: '', family: 'rare', tier: 'silver', points: 10, hidden: true, rarityPctTenths: 1000, rarityBucket: 'common' },
  ],
};
const lb = { scope: 'board:uprough', period: 'all', season: null, rows: [{ rank: 1, handle: 'Spot', points: 480, unlocks: 37 }, { rank: 2, handle: 'A Handle That Is Sixteen', points: 5, unlocks: 1 }] };
const fits = (lines: string[], w: number): void => { for (const l of lines) expect(l.length).toBeLessThanOrEqual(w); };

describe('ACHIEVE builders', () => {
  it('the menu fits forty columns and says what the account state allows', () => {
    const linked = menuItems({ kind: 'linked', email: 'a@b.c', profile }, compact);
    fits(linked.map((i: { label: string }) => i.label), 38);
    expect(linked.map((i: { id: string }) => i.id)).toEqual(['profile', 'catalog', 'board', 'global', 'account', 'quit']);
    expect(linked[4].label).toBe('Account: Spot');
    expect(menuItems({ kind: 'not-linked', email: 'a@b.c' }, wide)[4].label).toBe('Account: register and link this board');
    expect(menuItems({ kind: 'off' }, compact)[4].label).toBe('Account: not available here');
  });

  it('the profile, the catalog and the scoreboard fit forty columns, clipped never folded', () => {
    fits(profileLines(profile, 39), 39);
    fits(catalogLines(catalog, 39, new Set(['msg.post.1'])), 39);
    fits(leaderboardLines(lb, 39), 39);
    const cat40 = catalogLines(catalog, 39, new Set(['msg.post.1']));
    expect(cat40[0]).toBe('== MSG ==');
    expect(cat40[1]).toBe('*[BRZ] First Words');
    expect(cat40).toContain(' [SLV] ???');
    expect(familiesOf(catalog)).toEqual(['msg', 'file', 'rare']);
    expect(clip('abcdefghij', 5)).toBe('abcd~');
  });

  it('at eighty columns the catalog carries the description and the scoreboard the handle in full', () => {
    const cat80 = catalogLines(catalog, 79);
    fits(cat80, 79);
    expect(cat80[1]).toBe(' [BRZ] First Words          Post a message');
    const rows = leaderboardLines(lb, 79);
    expect(rows[0]).toBe('This board, all time');
    expect(rows[2]).toBe('  1. Spot                   480 pts  37');
    const p = profileLines(profile, 79);
    expect(p[0]).toBe('Spot  480 points  2 unlocked');
    expect(p[3]).toContain('[SLV] Century  10 pts');
    expect(p[p.length - 1]).toBe('  msg.post.1000  412/1000');
  });

  it('every refusal has words, and the hints change with the view', () => {
    for (const code of ['not_configured', 'not_linked', 'unverified_player', 'bad_code', 'code_expired', 'code_burned', 'handle_taken', 'bad_handle', 'bad_email', 'rate_limited', 'unreachable', 'timeout', 'not_json', 'unauthenticated']) {
      const words = explain({ status: 400, body: null, error: code });
      expect(words.length).toBeGreaterThan(10);
      expect(words).not.toContain('undefined');
    }
    expect(explain({ status: 200, body: {} })).toBe('');
    expect(explain({ status: 500, body: null, error: 'internal_error' })).toBe('The server said internal_error.');
    expect(footerHints(compact, true).map((h: { key: string }) => h.key)).toEqual(['Up/Dn', 'Q']);
    expect(footerHints(wide, false).map((h: { key: string }) => h.key)).toEqual(['Up/Down', 'Enter', 'Q']);
  });
});
