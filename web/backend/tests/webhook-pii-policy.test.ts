/**
 * Regression tests for webhook PII minimisation (GDPR Phase 5).
 *
 * Default (webhook_include_pii unset or false) anonymises the event data:
 * - username -> `User #<userId>` (or `anon` if no id)
 * - realname, location, phone, email stripped from event data
 * When webhook_include_pii=true, original payload is preserved.
 */

import { applyPiiPolicy, WebhookTrigger } from '../src/services/webhook.service';

describe('applyPiiPolicy (Phase 5)', () => {
  test('strips handle and free-text PII by default (override=false)', () => {
    const out = applyPiiPolicy({
      username: 'realHandle',
      userId: 'abc123',
      location: 'Amsterdam',
      realname: 'John Doe',
      phone: '555-0100',
      email: 'john@example.com',
      filename: 'cool-demo.lha',
    }, false);

    expect(out.username).toBe('User #abc123');
    expect(out.location).toBeUndefined();
    expect(out.realname).toBeUndefined();
    expect(out.phone).toBeUndefined();
    expect(out.email).toBeUndefined();
    // Non-PII metadata preserved.
    expect(out.filename).toBe('cool-demo.lha');
  });

  test('falls back to "anon" when userId is missing', () => {
    const out = applyPiiPolicy({ username: 'whoever' }, false);
    expect(out.username).toBe('anon');
  });

  test('preserves original payload when override=true', () => {
    const input = {
      username: 'visibleHandle',
      userId: 'xyz',
      location: 'Paris',
      realname: 'Jane Real',
      email: 'jane@example.com',
    };
    const out = applyPiiPolicy(input, true);
    expect(out.username).toBe('visibleHandle');
    expect(out.location).toBe('Paris');
    expect(out.realname).toBe('Jane Real');
    expect(out.email).toBe('jane@example.com');
  });

  test('does not mutate the caller\'s input object', () => {
    const input = {
      username: 'realHandle',
      userId: 'abc',
      location: 'x',
    };
    const snap = JSON.stringify(input);
    applyPiiPolicy(input, false);
    expect(JSON.stringify(input)).toBe(snap);
  });

  test('trigger enum is exported for downstream callers', () => {
    expect(WebhookTrigger.USER_LOGIN).toBe('user_login');
    expect(WebhookTrigger.NEW_USER).toBe('new_user');
  });
});
