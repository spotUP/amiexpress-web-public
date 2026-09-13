/**
 * F11: a BOT_DATA_TOKENS secret containing ':' was silently truncated.
 *
 * The format is `id:secret[:domains]`, comma separated, with no escape for
 * either separator. `part.split(':')` took the first field as the id, the
 * SECOND as the secret and the third as the domain scope - so a sysop who
 * pasted a secret with a colon in it configured a board that authenticated a
 * SHORTER secret than they set, and handed the tail of the real secret to the
 * domain scoping as a bogus read domain. Nothing said a word about it.
 *
 * An entry that cannot be read back is now refused and named.
 */
import { parseBotServiceTokens, resetBotTokenWarnings } from '../../src/middleware/service-auth.middleware';

beforeEach(() => {
  resetBotTokenWarnings();
  jest.restoreAllMocks();
});

describe('a bot token entry that cannot be read back', () => {
  it('never authenticates a truncated secret when the configured secret has a colon in it', () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const entries = parseBotServiceTokens('mybot:s3c:ret:whip');
    // The old parse produced { id: 'mybot', secret: 's3c', domains: ['ret'] }:
    // three characters of the secret were enough to get in.
    expect(entries.map((e) => e.secret)).not.toContain('s3c');
    expect(entries).toHaveLength(0);
  });

  it('warns the sysop, naming the entry, instead of failing in silence', () => {
    const warned: string[] = [];
    jest.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
      warned.push(args.map((a) => String(a)).join(' '));
    });
    parseBotServiceTokens('good:secret,mybot:s3c:ret:whip');
    expect(warned.join('\n')).toMatch(/entry 2/);
    expect(warned.join('\n')).toMatch(/BOT_DATA_TOKENS/);
  });

  it('warns about an entry with no secret rather than dropping it in silence', () => {
    const warned: string[] = [];
    jest.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
      warned.push(args.map((a) => String(a)).join(' '));
    });
    expect(parseBotServiceTokens('lonely')).toHaveLength(0);
    expect(warned.join('\n')).toMatch(/has no secret/);
  });

  it('keeps the good entries in a list that also holds a broken one', () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const entries = parseBotServiceTokens('good:secret:whip+board,broken:a:b:c,other:secret2');
    expect(entries.map((e) => e.id)).toEqual(['good', 'other']);
    expect(entries[0].domains).toEqual(['whip', 'board']);
    expect(entries[1].domains).toBeNull();
  });

  it('does not repeat its warning once a second, when a request parses the same value again', () => {
    const warned: string[] = [];
    jest.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
      warned.push(args.map((a) => String(a)).join(' '));
    });
    for (let i = 0; i < 50; i++) parseBotServiceTokens('broken:a:b:c');
    expect(warned).toHaveLength(1);
  });

  it('still reads the ordinary shapes', () => {
    expect(parseBotServiceTokens(undefined)).toEqual([]);
    expect(parseBotServiceTokens('')).toEqual([]);
    expect(parseBotServiceTokens('bot:secret')).toEqual([{ id: 'bot', secret: 'secret', domains: null }]);
    expect(parseBotServiceTokens(' bot : secret : whip board ')).toEqual([
      { id: 'bot', secret: 'secret', domains: ['whip', 'board'] },
    ]);
  });
});
