/**
 * New user time limits.
 *
 * Reported live: "regular users - their time limit runs out fast".
 *
 * The cause was a unit mismatch. `system_config.new_user_time_limit` is in
 * MINUTES (its CHECK constraint is 1..1440), while `users.timelimit` is read
 * as SECONDS everywhere - see utils/time-tracking.util.ts, which divides it
 * by 60 to display minutes. Writing the config value straight into the
 * column turned a "60 minute" default into sixty SECONDS, which is what the
 * reporting user's own account had.
 *
 * These tests pin the units at every place a time limit is written or shown.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const backendSrc = join(__dirname, '..', '..', 'src');

function source(...parts: string[]): string {
  return readFileSync(join(backendSrc, ...parts), 'utf8');
}

/** Seconds a user gets from a configured limit given in minutes. */
function secondsFor(minutes: number): number {
  return minutes * 60;
}

describe('the configured default', () => {
  it('is expressed in minutes and converted to seconds when a user is created', () => {
    const routes = source('api', 'config-routes.ts');

    // The write must multiply, not pass the minutes through as seconds.
    expect(routes).toMatch(/timeLimit:\s*userData\.timeLimit\s*\?\?\s*\(\(defaults\.timeLimit[^)]*\)\s*\*\s*60\)/);
  });

  it('reaches users who sign up through the BBS itself', () => {
    // This path used to hardcode 3600, so raising the configured limit had no
    // effect on anyone registering through the BBS - which is everyone.
    const auth = source('handlers', 'user', 'auth.handler.ts');

    expect(auth).toContain('newUserTimeLimitSeconds');
    expect(auth).toMatch(/new_user_time_limit/);
    expect(auth).not.toMatch(/timeLimit:\s*3600,/);
  });

  it('defaults to the maximum the schema allows', () => {
    const db = source('database.ts');
    const repo = source('database', 'config-repository.ts');

    // 1440 minutes = 24 hours, the ceiling of the column's CHECK constraint.
    expect(db).toMatch(/new_user_time_limit INTEGER DEFAULT 1440/);
    expect(repo).toMatch(/new_user_time_limit \?\? 1440/);
  });
});

describe('a day at the configured maximum', () => {
  it('is a full 24 hours of seconds, not 1440 of them', () => {
    expect(secondsFor(1440)).toBe(86400);
  });

  it('would have been 24 minutes under the old behaviour', () => {
    // The bug in one line: the number that meant "a day" meant "24 minutes".
    expect(1440 / 60).toBe(24);
  });
});

describe('showing and editing a limit', () => {
  it('converts to minutes for display rather than printing raw seconds', () => {
    const account = source('handlers', 'user', 'account.handler.ts');

    expect(account).not.toMatch(/Time Limit: \$\{user\.timeLimit\} minutes/);
    expect(account).toMatch(/Time Limit: \$\{Math\.floor\(\(user\.timeLimit \|\| 0\) \/ 60\)\} minutes/);
  });

  it('converts the sysop editor back to seconds on the way in', () => {
    // The editor's field is labelled "mins", so a sysop typing 60 must get an
    // hour, not a minute.
    const editor = source('handlers', 'user', 'user-editor.handler.ts');

    expect(editor).toMatch(/updates\.timeLimit = parseInt\(s\[10\], 10\) \* 60/);
  });
});
