/**
 * A sysop's testing does not reach Discord.
 *
 * Asked for 2026-08-26: "can we disable webhooks for sysop user so I don't
 * spam the discord with my tests."
 *
 * The account that does the testing is what gets muted - muting the TRIGGER
 * would have muted it for every real user too.
 */

const mockPost = jest.fn(async () => ({ status: 204 }));
jest.mock('axios', () => ({ __esModule: true, default: { post: (...a: unknown[]) => (mockPost as any)(...a) } }));
jest.mock('../../src/database', () => ({
  db: {
    // One Discord webhook for every trigger, and the PII policy ON
    // (webhook_include_pii false), which is the board default.
    getWebhooksByTrigger: async () => [{ id: 1, name: 'discord', type: 'discord', url: 'https://discord.invalid/hook', enabled: true }],
    getConfigRepository: () => ({ getSystemConfig: () => ({ webhook_include_pii: false }) }),
  },
}));

import {
  webhookExcludedUsers,
  isWebhookSuppressed,
  webhookService,
  WebhookTrigger,
} from '../../src/services/webhook.service';

describe('who is muted', () => {
  it('is the sysop by default, because that is who tests', () => {
    expect(webhookExcludedUsers({} as NodeJS.ProcessEnv)).toEqual(['sysop']);
  });

  it('can be set per board', () => {
    const env = { WEBHOOK_EXCLUDE_USERS: 'sysop,tester,bot' } as unknown as NodeJS.ProcessEnv;

    expect(webhookExcludedUsers(env)).toEqual(['sysop', 'tester', 'bot']);
  });

  it('tolerates spaces and blanks in the list', () => {
    const env = { WEBHOOK_EXCLUDE_USERS: ' sysop , , tester ' } as unknown as NodeJS.ProcessEnv;

    expect(webhookExcludedUsers(env)).toEqual(['sysop', 'tester']);
  });

  it('can be emptied so nobody is muted', () => {
    const env = { WEBHOOK_EXCLUDE_USERS: '' } as unknown as NodeJS.ProcessEnv;

    expect(webhookExcludedUsers(env)).toEqual([]);
  });
});

describe('suppressing an event', () => {
  const excluded = ['sysop'];

  it('mutes the excluded user', () => {
    expect(isWebhookSuppressed('sysop', excluded)).toBe(true);
  });

  it('matches however the name is capitalised', () => {
    // Names come from several paths; SysOp and sysop are one person.
    expect(isWebhookSuppressed('SysOp', excluded)).toBe(true);
    expect(isWebhookSuppressed(' SYSOP ', excluded)).toBe(true);
  });

  it('leaves everybody else alone', () => {
    expect(isWebhookSuppressed('spot', excluded)).toBe(false);
    expect(isWebhookSuppressed('dino', excluded)).toBe(false);
  });

  it('does not suppress an event with no user at all', () => {
    // System events - a nightly backup, a maintenance notice - still post.
    expect(isWebhookSuppressed(undefined, excluded)).toBe(false);
    expect(isWebhookSuppressed('', excluded)).toBe(false);
  });
});

/**
 * DRIVEN through the real sendWebhook, with the PII policy on: it rewrites
 * username to "User #7", so a check made after it would have nothing left
 * to match on and the sysop's test would post.
 */
describe('where the check happens', () => {
  const saved = process.env.WEBHOOK_EXCLUDE_USERS;
  let quiet: jest.SpyInstance;
  beforeEach(() => { delete process.env.WEBHOOK_EXCLUDE_USERS; mockPost.mockClear(); quiet = jest.spyOn(console, 'log').mockImplementation(() => {}); });
  afterEach(() => { quiet.mockRestore(); if (saved === undefined) delete process.env.WEBHOOK_EXCLUDE_USERS; else process.env.WEBHOOK_EXCLUDE_USERS = saved; });

  it('runs before the PII policy replaces the username', async () => {
    await webhookService.sendWebhook(WebhookTrigger.NEW_UPLOAD, { username: 'SysOp', userId: '1', filename: 'TEST.LHA' });
    expect(mockPost).not.toHaveBeenCalled();

    // The same event from anyone else posts - anonymised, which is what
    // proves the policy was on while the sysop's was being judged.
    await webhookService.sendWebhook(WebhookTrigger.NEW_UPLOAD, { username: 'spot', userId: '7', filename: 'TEST.LHA' });
    expect(mockPost).toHaveBeenCalledTimes(1);
    const payload = JSON.stringify((mockPost.mock.calls[0] as unknown[])[1]);
    expect(payload).toContain('User #7');
    expect(payload).not.toContain('spot');
  });
});
