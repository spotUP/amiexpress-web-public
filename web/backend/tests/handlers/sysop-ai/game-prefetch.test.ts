/**
 * Forced RAWG pre-fetch (2026-09-10): the models answer game questions
 * from training weights and never call lookup_game (zero calls in 72h of
 * live logs), so a stored, valid RAWG key sat unused. Game-looking
 * messages now get one RAWG lookup whose hits ride the prompt.
 *
 * Pinned: which messages count as game questions (and which do not), the
 * card shape on RAWG rows, silence on a RAWG miss / no key / dead net,
 * and that the pre-fetch never throws into the chat path.
 */
process.env.SKIP_SERVER_START = '1';

import { looksLikeGameQuestion, gameCardFor, extractGameTitle, lookupGame, setGamesFetcher } from '../../../src/handlers/sysop-ai/external/games';
import { resetExternalCache } from '../../../src/handlers/sysop-ai/external/demozoo';

beforeEach(() => { resetExternalCache(); setGamesFetcher(null); });
afterAll(() => { setGamesFetcher(null); });

const RAWG_ROWS = { results: [{ name: 'Turrican', released: '1990-03-16', platforms: [{ platform: { name: 'Amiga' } }, { platform: { name: 'C64' } }], genres: [{ name: 'Shooter' }], metacritic: 85, slug: 'turrican' }] };

describe('looksLikeGameQuestion', () => {
  it.each([
    'who made Turrican?',
    'when was Turrican released?',
    'best amiga games of 1990',
    'what is the metacritic score of Turrican?',
    'any good ps1 rpgs?',
    'tell me about this xbox game',
  ])('fires on "%s"', (msg) => {
    expect(looksLikeGameQuestion(msg)).toBe(true);
  });

  it.each([
    'who is on node 2 right now?',
    'show me doors about racing',
    'when is the next demoparty?',
    'who runs this board?',
    'what time is it?',
  ])('stays quiet on "%s"', (msg) => {
    expect(looksLikeGameQuestion(msg)).toBe(false);
  });
});

describe('gameCardFor', () => {  it('returns RAWG rows as a prompt card', async () => {
    let fetched = '';
    setGamesFetcher(async (url) => { fetched = url; return RAWG_ROWS; });
    const card = await gameCardFor('who made Turrican?', 'KEY');
    expect(fetched).toContain('api.rawg.io');
    expect(card).toContain('RAWG games database:');
    expect(card).toContain('Turrican');
    expect(card).toContain('rawg.io/games/turrican');
  });

  it('stays silent when RAWG knows no rows', async () => {
    setGamesFetcher(async (url) => {
      if (url.includes('api.rawg.io')) return { results: [] };
      return {};
    });
    await expect(gameCardFor('tell me about this xbox game', 'KEY')).resolves.toBeUndefined();
  });

  it('never fetches without a key', async () => {
    let fetched = 0;
    setGamesFetcher(async () => { fetched++; return RAWG_ROWS; });
    await expect(gameCardFor('who made Turrican?')).resolves.toBeUndefined();
    expect(fetched).toBe(0);
  });

  it('never fetches for a non-game message even with a key', async () => {
    let fetched = 0;
    setGamesFetcher(async () => { fetched++; return RAWG_ROWS; });
    await expect(gameCardFor('who is on node 2 right now?', 'KEY')).resolves.toBeUndefined();
    expect(fetched).toBe(0);
  });

  it('never throws into the chat path on a dead net', async () => {
    setGamesFetcher(async () => { throw new Error('net gone'); });
    await expect(gameCardFor('who made Turrican?', 'KEY')).resolves.toBeUndefined();
  });
});

describe('extractGameTitle', () => {
  it.each([
    ['who made Turrican?', 'Turrican'],
    ['when was Turrican released?', 'Turrican'],
    ['tell me about Turrican', 'Turrican'],
    ['what is the metacritic score of Turrican?', 'Turrican'],
    ['Turrican', 'Turrican'],
    ['  Turrican  ', 'Turrican'],
  ])('strips "%s" to "%s"', (msg, title) => {
    expect(extractGameTitle(msg)).toBe(title);
  });

  it('a whole question reaches RAWG as its title', async () => {
    let searched = '';
    setGamesFetcher(async (url) => {
      searched = url;
      return RAWG_ROWS;
    });
    const card = await gameCardFor('who made Turrican?', 'KEY');
    expect(searched).toContain('search=Turrican');
    expect(searched).not.toContain('who');
    expect(card).toContain('Turrican');
  });

  it('names the makers from one detail call on the top hit', async () => {
    // Detail shape per rawg.io/apidocs (no key to probe with at build
    // time): developers/publishers arrays of {name}. Recapture live.
    const search = { results: [{ id: 11277, name: 'Turrican', released: '1990', slug: 'turrican' }] };
    const detail = { id: 11277, developers: [{ name: 'Factor 5' }], publishers: [{ name: 'Rainbow Arts' }] };
    const seen: string[] = [];
    setGamesFetcher(async (url) => {
      seen.push(url);
      if (url.includes('/api/games/11277?')) return detail;
      return search;
    });
    const card = await gameCardFor('who made Turrican?', 'KEY');
    expect(card).toContain('Made by Factor 5');
    expect(card).toContain('Published by Rainbow Arts');
    expect(seen.filter((u) => u.includes('/api/games/11277?'))).toHaveLength(1);
  });

  it('a dead detail call still answers the search rows', async () => {
    const search = { results: [{ id: 1, name: 'X', slug: 'x' }] };
    setGamesFetcher(async (url) => {
      if (url.includes('/api/games/1?')) throw new Error('down');
      return search;
    });
    const card = await gameCardFor('who made X?', 'KEY');
    expect(card).toContain('X (');
  });
});
