/**
 * Phase 0 - Discord link codes and the link table.
 *
 * LINKDISCORD mints a single-use code on the BBS; the bot redeems it into a
 * user_discord_links row. Codes expire, spend once, and re-linking moves the
 * row instead of doubling it. Repository tests run against the isolated
 * testDb; service tests pass it as the store so nothing touches live data.
 */
import { discordLinkService, CODE_TTL_MS } from '../../src/services/discord-link.service';
import { DiscordLinkCommandsHandler } from '../../src/handlers/commands/discord-link-commands.handler';
import { LoggedOnSubState } from '../../src/constants/bbs-states';

async function waitForTestDb(): Promise<any> {
  let attempts = 0;
  while (!(global as any).testDb && attempts < 30) {
    await new Promise((r) => setTimeout(r, 500));
    attempts++;
  }
  const db = (global as any).testDb;
  if (!db) throw new Error('Test database not initialized');
  return db;
}

let testDb: any;
beforeAll(async () => { testDb = await waitForTestDb(); }, 30000);
beforeEach(async () => {
  await testDb.db.exec('DELETE FROM user_discord_links');
});

function socket(): any {
  const lines: string[] = [];
  return {
    lines,
    emit: (event: string, text: string) => { if (event === 'ansi-output') lines.push(String(text)); },
  };
}

function session(userId = 'u1', username = 'spot'): any {
  return { user: { id: userId, username }, menuPause: false, subState: null };
}

describe('user_discord_links repository', () => {
  it('round-trips both directions and unlinks', async () => {
    expect(await testDb.getDiscordLinkByDiscordId('d1')).toBeNull();
    await testDb.linkDiscord('d1', 'u1');
    expect(await testDb.getDiscordLinkByDiscordId('d1')).toMatchObject({ discordId: 'd1', userId: 'u1' });
    expect(await testDb.getDiscordLinkByUserId('u1')).toMatchObject({ discordId: 'd1', userId: 'u1' });
    expect(await testDb.unlinkDiscordByDiscordId('d1')).toBe(true);
    expect(await testDb.getDiscordLinkByUserId('u1')).toBeNull();
    expect(await testDb.unlinkDiscordByDiscordId('d1')).toBe(false);
  });

  it('re-linking moves the row instead of doubling it', async () => {
    await testDb.linkDiscord('d1', 'u1');
    await testDb.linkDiscord('d1', 'u2');
    expect(await testDb.getDiscordLinkByDiscordId('d1')).toMatchObject({ userId: 'u2' });
    expect(await testDb.getDiscordLinkByUserId('u1')).toBeNull();
    await testDb.linkDiscord('d9', 'u2');
    expect(await testDb.getDiscordLinkByUserId('u2')).toMatchObject({ discordId: 'd9' });
    expect(await testDb.getDiscordLinkByDiscordId('d1')).toBeNull();
  });
});

describe('link codes', () => {
  it('redeems once, then the code is spent', async () => {
    const { code } = discordLinkService.issueCode('u1', 'spot');
    expect(code).toMatch(/^[0-9A-F]{8}$/);
    const first = await discordLinkService.redeemCode(code, 'd1', testDb);
    expect(first).toMatchObject({ userId: 'u1', username: 'spot' });
    expect(await testDb.getDiscordLinkByDiscordId('d1')).toMatchObject({ userId: 'u1' });
    expect(await discordLinkService.redeemCode(code, 'd2', testDb)).toBeNull();
  });

  it('rejects unknown codes and is case-insensitive', async () => {
    expect(await discordLinkService.redeemCode('NOPE1234', 'd1', testDb)).toBeNull();
    const { code } = discordLinkService.issueCode('u1', 'spot');
    const ok = await discordLinkService.redeemCode(code.toLowerCase(), 'd1', testDb);
    expect(ok).toMatchObject({ userId: 'u1' });
  });

  it('expires codes after the TTL', async () => {
    const { code } = discordLinkService.issueCode('u1', 'spot');
    const now = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + CODE_TTL_MS + 1000);
    try {
      expect(await discordLinkService.redeemCode(code, 'd1', testDb)).toBeNull();
    } finally {
      now.mockRestore();
    }
    expect(await testDb.getDiscordLinkByDiscordId('d1')).toBeNull();
  });

  it('a new code replaces the old one for the same user', async () => {
    const first = discordLinkService.issueCode('u1', 'spot');
    const second = discordLinkService.issueCode('u1', 'spot');
    expect(await discordLinkService.redeemCode(first.code, 'd1', testDb)).toBeNull();
    expect(await discordLinkService.redeemCode(second.code, 'd1', testDb)).toMatchObject({ userId: 'u1' });
  });
});

describe('LINKDISCORD command', () => {
  it('issues a code to a fresh user and returns to the menu', async () => {
    const sock = socket();
    const sess = session();
    // The handler reads links through the live db singleton; point it at
    // the isolated testDb for this test only.
    const live = await import('../../src/database');
    const orig = live.db.getDiscordLinkByUserId.bind(live.db);
    (live.db as any).getDiscordLinkByUserId = testDb.getDiscordLinkByUserId.bind(testDb);
    try {
      await DiscordLinkCommandsHandler.handleLinkDiscordCommand(sock, sess);
    } finally {
      (live.db as any).getDiscordLinkByUserId = orig;
    }
    expect(sock.lines.join('')).toMatch(/[0-9A-F]{8}/);
    expect(sess.menuPause).toBe(true);
    expect(sess.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
    expect(discordLinkService.pendingCount()).toBeGreaterThanOrEqual(1);
  });

  it('tells an already-linked user instead of minting', async () => {
    await testDb.linkDiscord('d1', 'u1');
    const sock = socket();
    const sess = session();
    const live = await import('../../src/database');
    const orig = live.db.getDiscordLinkByUserId.bind(live.db);
    (live.db as any).getDiscordLinkByUserId = testDb.getDiscordLinkByUserId.bind(testDb);
    try {
      await DiscordLinkCommandsHandler.handleLinkDiscordCommand(sock, sess);
    } finally {
      (live.db as any).getDiscordLinkByUserId = orig;
    }
    expect(sock.lines.join('')).toMatch(/already linked/);
  });
});
