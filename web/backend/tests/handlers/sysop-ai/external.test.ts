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
  it('groups and parties', async () => {
    setExternalFetcher(async (url) => url.includes('/releasers/')
      ? { results: [{ id: 456, name: 'Up Rough', is_group: true }] }
      : { results: [{ name: 'Revision 2024', start_date: '2024-03-29', end_date: '2024-04-01', location: 'Saarbrücken, Germany', demozoo_url: 'https://demozoo.org/parties/4791/' }] });
    expect(await searchGroups('up rough')).toBe('Up Rough (group) https://demozoo.org/groups/456/');
    expect(await searchParties('revision 2024')).toContain('Revision 2024: 2024-03-29 to 2024-04-01, Saarbrücken, Germany');
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
