/**
 * A service the sysop is running is never left behind by a deploy.
 *
 * `whip-bot` sits behind `profiles: [bots]` in docker-compose.yml because it
 * is opt-in - a board with no Discord bot should not have one started for it.
 * But `docker compose build` and `up` SKIP a profiled service unless its
 * profile is named, and the deploy named none. So it rebuilt the board,
 * recreated it, reported success, and left the bot running whatever image it
 * first started with.
 *
 * It ran that way for three days. The bot's feed-reconnect fix was committed,
 * tested, merged and deployed green while the RUNNING bot still carried the
 * bug - retrying on the 60s cap for ever instead of clearing its backoff on a
 * good connection. Green in git, absent in production, and nothing said so.
 * Verified on the live host: the container had started 2026-09-10 and its
 * `dist/feed.js` still contained the `liveDone` latch the fix removed.
 *
 * The rule, which keeps opt-in opt-in: a profile with something ALREADY
 * RUNNING is part of the deploy; a profile with nothing running stays down.
 *
 * These assertions are about the SHELL, because the shell is what deploys.
 */
import * as fs from 'fs';
import * as path from 'path';

const DEPLOY = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', '..', 'deploy', 'deploy.sh'),
  'utf8'
);
const COMPOSE = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', '..', 'docker-compose.yml'),
  'utf8'
);

describe('the deploy and compose profiles', () => {
  it('still has a profiled service to protect, or this guard is pointless', () => {
    // If profiles ever leave compose, this test should be deleted knowingly
    // rather than quietly passing against nothing.
    expect(COMPOSE).toMatch(/profiles:/);
  });

  it('passes the active profiles to BOTH build and up', () => {
    // Either one alone leaves the split state: a rebuilt image nothing runs,
    // or a recreated container on a stale image.
    expect(DEPLOY).toMatch(/docker compose \$PROFILE_ARGS build/);
    expect(DEPLOY).toMatch(/docker compose \$PROFILE_ARGS up -d --force-recreate/);
  });

  it('rolls back with the same profiles it deployed with', () => {
    // Rolling the board back while leaving a profiled service on the failed
    // build is the same split state, arrived at from the other direction.
    const rollback = DEPLOY.slice(DEPLOY.indexOf('GIT_SHA="rollback"'));
    expect(rollback).toMatch(/docker compose \$PROFILE_ARGS up -d --force-recreate/);
  });

  it('derives the profile list from compose instead of naming bots', () => {
    // A hardcoded `--profile bots` would be wrong the first time somebody
    // adds a second profile, and would silently start a bot on a board that
    // never asked for one.
    expect(DEPLOY).toMatch(/docker compose config --profiles/);
    expect(DEPLOY).not.toMatch(/--profile bots/);
  });

  it('only includes a profile whose service is already running', () => {
    // The opt-in half: the decision is made against `ps --status running`,
    // so a board that has never started a bot does not acquire one.
    const fn = DEPLOY.slice(
      DEPLOY.indexOf('active_profile_args()'),
      DEPLOY.indexOf('PROFILE_ARGS="$(active_profile_args)"')
    );
    expect(fn).toMatch(/ps --services --status running/);
    expect(fn).toMatch(/comm -12/); // gated ∩ running
    expect(fn).toMatch(/comm -13/); // services gated BY the profile
  });
});
