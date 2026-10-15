/**
 * The co-sysop knows the scene and the games - from Demozoo and a game
 * database - cached, time-boxed, and honest when the net does not answer.
 *
 * K4 of the plan. The fetchers are injected: what is pinned is the shape of
 * the answer, the cache (a second ask does not fetch), the fallback order
 * (RAWG with a key, Wikipedia without), and that a dead net yields a
 * sentence rather than a hang or a throw.
 */
import { searchProductions, searchGroups, searchParties, setExternalFetcher, resetExternalCache } from '../../../src/handlers/sysop-ai/external/demozoo';
import { lookupGame, setGamesFetcher } from '../../../src/handlers/sysop-ai/external/games';
import { runTool, toolsFor, type ToolContext } from '../../../src/handlers/sysop-ai/tools';

jest.mock('../../../src/server/database-helpers', () => ({ callersLog: jest.fn(async () => undefined), searchFilesAdvanced: jest.fn(async () => []) }));

const prod = { results: [{ title: 'State Of The Art', author_nicks: [{ name: 'Spaceballs' }], release_date: '1992-12-29', platforms: [{ name: 'Amiga OCS/ECS' }], types: [{ name: 'Demo' }], demozoo_url: 'https://demozoo.org/productions/1/' }] };

beforeEach(() => { resetExternalCache(); setExternalFetcher(null); setGamesFetcher(null); });
afterAll(() => { setExternalFetcher(null); setGamesFetcher(null); });

describe('demozoo', () => {
  it('a production, its group, date, platform and link - and the second ask comes from the cache', async () => {
    let fetched = 0;
    setExternalFetcher(async (url) => { fetched++; expect(url).toContain('/productions/?title=State%20Of%20The%20Art'); return prod; });
    const a = await searchProductions('State Of The Art');
    expect(a).toBe('State Of The Art by Spaceballs (1992-12-29; Amiga OCS/ECS; Demo) https://demozoo.org/productions/1/');
    await searchProductions('state of the art');
    expect(fetched).toBe(1);
  });
  it('a party, its dates and where it was', async () => {
    setExternalFetcher(async () => ({ results: [{ name: 'Revision 2024', start_date: '2024-03-29', end_date: '2024-04-01', location: 'Saarbrücken, Germany', demozoo_url: 'https://demozoo.org/parties/4791/' }] }));
    expect(await searchParties('revision 2024')).toContain('Revision 2024: 2024-03-29 to 2024-04-01, Saarbrücken, Germany');
  });

  /**
   * A GROUP IS NOT A NAME AND A LINK. The sysop asked the co-sysop about Up
   * Rough on 2026-09-08 and got `Up Rough (group) <url>` and three unrelated
   * retail games - true, and no use to anyone. The search endpoint carries a
   * name and an id and nothing else, so the answer has to go and get the rest.
   */
  describe('a group', () => {
    const detail = {
      nicks: [
        { name: 'Up Rough', abbreviation: 'UP', is_primary_nick: true },
        { name: 'Up Rough Allstarz' }, { name: 'Up Rough Soundsystem' },
      ],
      members: [
        { member: { id: 1, name: 'Spot' }, is_current: true },
        { member: { id: 2, name: 'Dipswitch' }, is_current: true },
        { member: { id: 3, name: 'Stingray' }, is_current: false },
      ],
      subgroups: [{ subgroup: { id: 3172, name: 'Divine Stylers' }, is_current: false }],
      external_links: [{ link_class: 'BaseUrl', url: 'http://www.uprough.net' }],
      member_of: [],
    };
    const productions = {
      count: 61,
      results: [
        { title: 'Fastline', release_date: '2026-08-15', types: [{ name: 'Graphics' }] },
        { title: '?', release_date: '2026-09-01', types: [{ name: 'Tracked Music' }] },
        { title: 'Hypocrisy', release_date: '2025-11-02', types: [{ name: 'Demo' }] },
      ],
    };

    function board(): string[] {
      const urls: string[] = [];
      setExternalFetcher(async (url) => {
        urls.push(url);
        if (url.includes('/releasers/?name=')) return { results: [{ id: 456, name: 'Up Rough', is_group: true }] };
        if (url.includes('/releasers/456/')) return detail;
        if (url.includes('/productions/?author=456')) return productions;
        return { results: [] };
      });
      return urls;
    }

    it('answers with the aliases, the members, the subgroups and the recent releases', async () => {
      board();
      const out = await searchGroups('up rough');

      expect(out).toContain('Up Rough (UP) - group https://demozoo.org/groups/456/');
      expect(out).toContain('Also known as: Up Rough Allstarz, Up Rough Soundsystem');
      // The count is every member; the names are the CURRENT ones.
      expect(out).toContain('Members (3, 2 current): Spot, Dipswitch');
      expect(out).not.toContain('Stingray');
      expect(out).toContain('Subgroups: Divine Stylers (past)');
      expect(out).toContain('http://www.uprough.net');
      expect(out).toContain('Releases credited since');
      expect(out).toContain('Fastline (2026-08, Graphics)');
      // Newest first, and Demozoo's placeholder title for an untitled track
      // says nothing to a caller.
      expect(out.indexOf('Fastline')).toBeLessThan(out.indexOf('Hypocrisy'));
      expect(out).not.toContain('? (2026-09');
    });

    it('asks for the detail and the releases together, and not for a lifetime count', async () => {
      // Demozoo ignores `limit`, so a "just the count" call downloads a hundred
      // rows - 78 KB, 6.7 s measured - to answer one number.
      const urls = board();
      await searchGroups('up rough');

      expect(urls.some((u) => u.includes('/releasers/456/'))).toBe(true);
      expect(urls.some((u) => u.includes('released_since='))).toBe(true);
      expect(urls.some((u) => /\/productions\/\?author=456&limit=/.test(u))).toBe(false);
    });

    it('tells two groups of the same name apart by their records', async () => {
      // Demozoo holds two called Spaceballs; one has 69 members and one has
      // none. Two identical lines and a shrug was the old answer.
      setExternalFetcher(async (url) => {
        if (url.includes('/releasers/?name=')) {
          return { results: [{ id: 3, name: 'Spaceballs', is_group: true }, { id: 42942, name: 'Spaceballs', is_group: true }] };
        }
        if (url.includes('/releasers/3/')) return { nicks: [{ name: 'Spaceballs', is_primary_nick: true }], members: [{ member: { id: 9, name: 'Menace' }, is_current: true }], subgroups: [], external_links: [], member_of: [] };
        if (url.includes('/releasers/42942/')) return { nicks: [], members: [], subgroups: [], external_links: [], member_of: [] };
        return { results: [] };
      });

      const out = await searchGroups('spaceballs');

      expect(out).toContain('https://demozoo.org/groups/3/');
      expect(out).toContain('Menace');
      expect(out).toContain('Demozoo also has: Spaceballs (https://demozoo.org/groups/42942/, 0 members)');
    });

    it('lists near-misses rather than picking one of them', async () => {
      // Nothing here IS the name asked for, so every row is a guess. The list
      // is the honest answer - deep-diving the first would be inventing a
      // decision the caller did not make.
      setExternalFetcher(async (url) => url.includes('/releasers/?name=')
        ? { results: [{ id: 1, name: 'Fairlight Norway', is_group: true }, { id: 2, name: 'Fairlight Sweden', is_group: true }] }
        : { results: [] });

      expect(await searchGroups('fairlight')).toBe(
        'Fairlight Norway (group) https://demozoo.org/groups/1/\nFairlight Sweden (group) https://demozoo.org/groups/2/'
      );
    });
  });
  it('nothing found, and a net that does not answer, are sentences', async () => {
    setExternalFetcher(async () => ({ results: [] }));
    expect(await searchProductions('zzzz')).toContain('no production called "zzzz"');
    setExternalFetcher(async () => { throw new Error('timeout of 3000ms exceeded'); });
    expect(await searchGroups('anyone')).toBe('No answer from the net right now (timeout of 3000ms exceeded).');
  });
});

describe('games', () => {
  it('with a RAWG key, RAWG answers; without one, Wikipedia does', async () => {
    const urls: string[] = [];
    setGamesFetcher(async (url) => {
      urls.push(url);
      if (url.startsWith('https://api.rawg.io/')) return { results: [{ name: 'Turrican', released: '1990-01-01', slug: 'turrican', platforms: [{ platform: { name: 'Commodore / Amiga' } }, { platform: { name: 'Commodore 64' } }], genres: [{ name: 'Action' }], metacritic: null }] };
      return { title: 'Turrican', description: '1990 video game', extract: 'Turrican is a 1990 run and gun video game developed by Factor 5.', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Turrican' } } };
    });
    expect(await lookupGame('Turrican', 'rawg-key')).toBe('Turrican (1990-01-01; Commodore / Amiga, Commodore 64; Action) https://rawg.io/games/turrican');
    expect(urls[0]).toContain('api.rawg.io/api/games?key=rawg-key&search=Turrican');
    expect(await lookupGame('Turrican')).toBe('Turrican - 1990 video game: Turrican is a 1990 run and gun video game developed by Factor 5. https://en.wikipedia.org/wiki/Turrican');
    expect(urls[1]).toBe('https://en.wikipedia.org/api/rest_v1/page/summary/Turrican');
  });
});

describe('as tools', () => {
  function ctx(): ToolContext {
    return {
      io: { to: () => ({ emit() {} }) }, session: { user: { id: 'u', username: 'Knut', secLevel: 30 }, nodeId: 1, currentConf: 1, tempData: {} } as any,
      page: { id: 'p', userId: 'u', userHandle: 'Knut', nodeId: 1 } as any, chatSession: {} as any, bbsRoot: '/nonexistent',
      execute: async () => undefined, caps: { grantTimeMinutesPerDay: 30 }, sysopName: 'Spot', rawgKey: undefined,
    };
  }
  it('search_demozoo and lookup_game are caller tools and route by kind', async () => {
    setExternalFetcher(async () => prod);
    setGamesFetcher(async () => ({ title: 'Turrican', extract: 'A game.', content_urls: { desktop: { page: 'x' } } }));
    expect(toolsFor({ user: { secLevel: 30 } } as any).map((t) => t.name)).toEqual(expect.arrayContaining(['search_demozoo', 'lookup_game']));
    expect((await runTool(ctx(), 'search_demozoo', { kind: 'production', query: 'State Of The Art' })).result.content).toContain('Spaceballs');
    expect((await runTool(ctx(), 'lookup_game', { title: 'Turrican' })).result.content).toContain('A game.');
    expect((await runTool(ctx(), 'search_demozoo', { kind: 'nonsense', query: 'x' })).result.content).toContain('production, group or party');
  });
});
