/**
 * A sysop's testing does not reach Discord.
 *
 * Asked for 2026-08-26: "can we disable webhooks for sysop user so I don't
 * spam the discord with my tests."
 *
 * The account that does the testing is what gets muted - muting the TRIGGER
 * would have muted it for every real user too.
 */

import {
  webhookExcludedUsers,
  isWebhookSuppressed,
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

describe('where the check happens', () => {
  it('runs before the PII policy replaces the username', () => {
    // applyPiiPolicy rewrites username to "User #7", so a check after it
    // would have nothing left to match on.
    const { readFileSync } = require('fs');
    const { join } = require('path');
    const source = readFileSync(join(__dirname, '..', '..', 'src', 'services', 'webhook.service.ts'), 'utf8');
    const send = source.slice(source.indexOf('async sendWebhook('));

    const suppressAt = send.indexOf('isWebhookSuppressed');
    const piiAt = send.indexOf('applyPiiPolicy');

    expect(suppressAt).toBeGreaterThan(-1);
    if (piiAt > -1) expect(suppressAt).toBeLessThan(piiAt);
  });
});
