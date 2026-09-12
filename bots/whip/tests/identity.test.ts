/**
 * Discord identity: link, exact handle, door name, fuzzy, unknown.
 *
 * The bot API is stubbed at the method level: what is pinned is the
 * resolution ORDER and that ambiguity asks instead of guessing. Only the
 * bridge registers; everyone else matches by name.
 */
import assert from 'assert';
import { resolveDiscordIdentity } from '../src/index';
import { WhipApiError } from '../src/whip-api';

const notFound = () => new WhipApiError('nope', 404);

function stubApi(over: Record<string, any> = {}) {
  return {
    linkStatus: async () => { throw notFound(); },
    resolve: async () => { throw notFound(); },
    listUsers: async () => [],
    ...over,
  } as any;
}

export async function linkedWinsWithDiscordId(): Promise<void> {
  const api = stubApi({ linkStatus: async () => ({ userId: 'u-sysop' }) });
  assert.deepStrictEqual(
    await resolveDiscordIdentity(api, 'discord-1', 'spotUP'),
    { userId: 'u-sysop', discordId: 'discord-1' },
  );
}

export async function exactBbsHandleNeedsNoLink(): Promise<void> {
  const api = stubApi({ resolve: async () => ({ userId: 'u-spot', username: 'spotUP' }) });
  assert.deepStrictEqual(
    await resolveDiscordIdentity(api, 'discord-9', 'spotUP'),
    { userId: 'u-spot' },
  );
}

export async function doorSetNameMatches(): Promise<void> {
  const api = stubApi({
    listUsers: async () => [{ userId: 'u1', handle: 'spot', discordName: 'spotUP' }],
  });
  assert.deepStrictEqual(
    await resolveDiscordIdentity(api, 'discord-9', 'spotUP'),
    { userId: 'u1' },
  );
}

export async function fuzzySubstringMatchesOne(): Promise<void> {
  const api = stubApi({
    listUsers: async () => [{ userId: 'u1', handle: 'spot' }],
  });
  assert.deepStrictEqual(
    await resolveDiscordIdentity(api, 'discord-9', 'spotUP'),
    { userId: 'u1' },
  );
}

export async function fuzzyAmbiguityAsksInsteadOfGuessing(): Promise<void> {
  const api = stubApi({
    listUsers: async () => [
      { userId: 'u1', handle: 'spot' },
      { userId: 'u2', handle: 'spotUP-fan' },
    ],
  });
  assert.deepStrictEqual(
    await resolveDiscordIdentity(api, 'discord-9', 'spotUP'),
    { ambiguous: ['spot', 'spotUP-fan'] },
  );
}

export async function unknownStaysUnknown(): Promise<void> {
  const api = stubApi({
    listUsers: async () => [{ userId: 'u1', handle: 'someone-else' }],
  });
  assert.strictEqual(await resolveDiscordIdentity(api, 'discord-9', 'xyzzy-nope'), null);
}

export async function explicitOptionResolvesByHandle(): Promise<void> {
  const api = stubApi({
    listUsers: async () => [{ userId: 'u7', handle: 'Knut' }],
  });
  assert.deepStrictEqual(
    await resolveDiscordIdentity(api, 'discord-9', 'anyone', 'knut'),
    { userId: 'u7' },
  );
}

export async function non404ErrorsRethrow(): Promise<void> {
  const api = stubApi({
    linkStatus: async () => { throw new WhipApiError('boom', 500); },
  });
  await assert.rejects(() => resolveDiscordIdentity(api, 'discord-9', 'spotUP'));
}

export async function buttonPressWithNoOptionsResolvesPresser(): Promise<void> {
  // A button interaction carries no options bag: the presser IS the
  // identity (live 2026-09-11: Move… crashed reading getString of
  // undefined). resolveUserId is imported for this; resolveDiscordIdentity
  // is stubbed at the api level like the rest of this file.
  const { resolveUserId } = await import('../src/index');
  const api = stubApi({ linkStatus: async () => ({ userId: 'u-sysop' }) });
  const buttonInteraction = {
    options: undefined,
    user: { id: 'discord-1', username: 'spotUP' },
    reply: async () => {},
    editReply: async () => {},
    deferred: false,
    replied: false,
  };
  assert.deepStrictEqual(
    await resolveUserId(buttonInteraction as any, api),
    { userId: 'u-sysop', discordId: 'discord-1' },
  );
}
