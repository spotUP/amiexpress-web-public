/**
 * A deploy proves what is RUNNING, not only what was built.
 *
 * The deploy already proved the board was new - the container's age, and
 * /health answering with the deployed SHA. It proved nothing about any other
 * service, and on 2026-09-13 that gap ran for three days: the WHIP bot sits
 * behind `profiles: [bots]`, `docker compose build` and `up` skipped it, and
 * the deploy rebuilt the board, recreated it, verified health and reported
 * success while the bot kept running a three-day-old image. Its feed fix had
 * been committed, tested, merged and deployed green, and was not in the
 * running process.
 *
 * That is the shape this check exists for, and it is the same shape as a door
 * dist that is not rebuilt and a manifest the image never carried: green in
 * git, absent in production, and nothing says so.
 *
 * The rule: for every RUNNING service, the container's image ID must still
 * equal the ID its tag points at. A tag that has moved since the container
 * started means something rebuilt that image and this container did not get
 * it. `.Config.Image` is the tag it was created from; `.Image` is the ID it
 * actually runs.
 *
 * Proven against the live host while it was written: it reported `bbs: OK` and
 * caught `whip-bot` genuinely stale in the same breath.
 *
 * Assertions are on the shell, because the shell is what deploys.
 */
import * as fs from 'fs';
import * as path from 'path';

const DEPLOY = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', '..', 'deploy', 'deploy.sh'),
  'utf8'
);

/** The staleness check, isolated from the rest of the script. */
const CHECK = DEPLOY.slice(
  DEPLOY.indexOf('== running images match what was just built =='),
  DEPLOY.indexOf('== door sync verification ==')
);

describe('the deploy verifying what is running', () => {
  it('has the check at all', () => {
    expect(CHECK.length).toBeGreaterThan(0);
  });

  it('compares the running image ID against the tag it was created from', () => {
    // Both halves are needed: the ID the container runs, and the ID the tag
    // resolves to NOW. Comparing tags to tags would always match.
    expect(CHECK).toMatch(/\{\{\.Image\}\}/);
    expect(CHECK).toMatch(/\{\{\.Config\.Image\}\}/);
    expect(CHECK).toMatch(/docker image inspect -f '\{\{\.Id\}\}'/);
  });

  it('checks every running service, not just the board', () => {
    // Checking `amiexpress-bbs` alone is exactly the blind spot that let a
    // profiled bot run three-day-old code through green deploys.
    expect(CHECK).toMatch(/ps --services --status running/);
    expect(CHECK).not.toMatch(/^\s*docker inspect .*amiexpress-bbs/m);
  });

  it('includes the active profiles, or it cannot see the service that broke', () => {
    expect(CHECK).toMatch(/\$PROFILE_ARGS/);
  });

  it('FAILS the deploy when something is stale, rather than warning', () => {
    // A warning in a log nobody reads is how this went unnoticed for three
    // days. It has to be an error exit.
    expect(CHECK).toMatch(/ERROR: these services were not recreated/);
    expect(CHECK).toMatch(/exit 1/);
  });

  it('says the fix in the message, because the deploy log is where it is read', () => {
    expect(CHECK).toMatch(/up -d --force-recreate --no-build/);
  });

  it('does not pass silently when a tag cannot be resolved', () => {
    // An unresolvable tag is unknown, not healthy; saying so beats a green
    // deploy built on a comparison that never happened.
    expect(CHECK).toMatch(/WARNING cannot resolve image tag/);
  });
});
