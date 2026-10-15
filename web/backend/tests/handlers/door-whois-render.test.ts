// @ts-nocheck
/**
 * /whois showed nothing. `whoisCmd` returned { type: 'whois', username } and
 * NOTHING consumed it, so both `/whois @user` and the right-click Whois entry
 * (which submits `/whois <name>`) were silent. The submit handler now resolves
 * the name against the online-user map and prints a line; these are the two
 * pure functions it uses, tested the way formatDmLine is.
 */

describe('whois-render', () => {
  let findOnlineUser: (users: Map<string, any>, name: string) => any;
  let formatWhois: (user: any, name: string) => string;

  beforeAll(() => {
    const m = require('../../../../Doors/livechat/handlers/whois-render');
    findOnlineUser = m.findOnlineUser;
    formatWhois = m.formatWhois;
  });

  const users = () => new Map<string, any>([
    ['7', { username: 'Dino', nodeId: 3, status: 'active' }],
    ['9', { username: 'Qwan', nodeId: 5, status: 'idle' }],
    ['4', { username: 'Away', nodeId: 2, status: 'away' }],
  ]);

  describe('findOnlineUser', () => {
    it('finds a user by exact name', () => {
      expect(findOnlineUser(users(), 'Dino')?.nodeId).toBe(3);
    });
    it('ignores a leading @ and is case-insensitive', () => {
      expect(findOnlineUser(users(), '@dino')?.username).toBe('Dino');
      expect(findOnlineUser(users(), 'QWAN')?.nodeId).toBe(5);
    });
    it('returns undefined for someone not online', () => {
      expect(findOnlineUser(users(), 'ghost')).toBeUndefined();
    });
  });

  describe('formatWhois', () => {
    it('shows node and active status for an online user', () => {
      const line = formatWhois(findOnlineUser(users(), 'Dino'), 'Dino');
      expect(line).toContain('Dino');
      expect(line).toContain('Node 3');
      expect(line).toContain('active');
    });
    it('reports idle', () => {
      expect(formatWhois(findOnlineUser(users(), 'Qwan'), 'Qwan')).toContain('idle');
    });
    it('reports away', () => {
      expect(formatWhois(findOnlineUser(users(), 'Away'), 'Away')).toContain('away');
    });
    it('says "not online" for a miss - and NOT nothing', () => {
      const line = formatWhois(undefined, '@ghost');
      expect(line).toContain('ghost');
      expect(line).toMatch(/not online/i);
      expect(line.length).toBeGreaterThan(0);
    });
  });
});
