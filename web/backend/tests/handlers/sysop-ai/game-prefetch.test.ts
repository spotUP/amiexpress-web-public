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

import { looksLikeGameQuestion, gameCardFor, setGamesFetcher } from '../../../src/handlers/sysop-ai/external/games';
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

describe('gameCardFor', () => {
  it('returns RAWG rows as a prompt card', async () => {
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
