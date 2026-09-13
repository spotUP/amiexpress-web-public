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
 * THE FIRST VERSION OF THIS CHECK WAS WRONG, and this file now pins the fix.
 *
 * It compared docker image IDs: the container's `{{.Image}}` against
 * `docker image inspect {{.Id}}` of the tag it was created from. Those are
 * different identifier spaces. Under the containerd snapshotter a build that
 * exports an attestation manifest gives the container an `.Image` that is a
 * manifest-LIST digest, which `docker image inspect` cannot resolve at all
 * ("No such image"). On 2026-09-13 that reported the WHIP bot STALE while its
 * /app/bot/src checksum matched the repo byte for byte - and the check does
 * `exit 1`, so it would have failed deploys over healthy code.
 *
 * A gate that cries wolf gets ignored, which is worse than no gate. So the
 * comparison is now the commit the image was STAMPED with at build time,
 * against the commit this deploy built. That answers the real question -
 * which code is this? - without depending on the image store, the builder, or
 * whether attestations were exported.
 *
 * Assertions are on the shell, because the shell is what deploys.
 */
import * as fs from 'fs';
import * as path from 'path';

const REPO = path.join(__dirname, '..', '..', '..', '..');
const DEPLOY = fs.readFileSync(path.join(REPO, 'deploy', 'deploy.sh'), 'utf8');

/** The check, isolated from the rest of the script. */
const CHECK = DEPLOY.slice(
  DEPLOY.indexOf('== running code is the code just built =='),
  DEPLOY.indexOf('== door sync verification ==')
);

const LABEL = 'org.opencontainers.image.revision';

describe('the deploy verifying what is running', () => {
  it('has the check at all', () => {
    expect(CHECK.length).toBeGreaterThan(0);
  });

  it('compares the commit the image was stamped with, not image IDs', () => {
    // The whole point of the rewrite. `.Image` vs `.Id` is the bug.
    //
    // The negative half has to ignore comment lines: the block deliberately
    // EXPLAINS the old comparison so the next reader does not reintroduce it,
    // and a blunt search finds that prose and calls it a regression.
    const code = CHECK.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');

    expect(CHECK).toContain(LABEL);
    expect(code).toMatch(/\$ACTUAL_SHA/);
    expect(code).not.toMatch(/\{\{\.Image\}\}/);
    expect(code).not.toMatch(/docker image inspect/);
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

  it('reports an unlabelled image rather than passing it silently', () => {
    // An image nobody stamped cannot be verified, and saying so beats a green
    // deploy built on a comparison that never happened. It is a WARNING and
    // not an exit, so one unstamped sidecar cannot block the board shipping.
    expect(CHECK).toMatch(/WARNING no \$REVISION_LABEL/);
    expect(CHECK).toMatch(/UNLABELLED_SERVICES/);
  });

  it('does not exit 1 merely because a label is missing', () => {
    // The unlabelled branch must `continue`, not join STALE_SERVICES - or the
    // check regains exactly the false-positive it was rewritten to remove.
    const unlabelled = CHECK.slice(
      CHECK.indexOf('if [ -z "$built_sha" ]'),
      CHECK.indexOf('if [ "$built_sha" = "$ACTUAL_SHA" ]')
    );
    expect(unlabelled).toMatch(/continue/);
    expect(unlabelled).not.toMatch(/STALE_SERVICES=/);
  });
});

describe('the images the check depends on', () => {
  /** Every service that declares a build in docker-compose.yml. */
  const COMPOSE = fs.readFileSync(path.join(REPO, 'docker-compose.yml'), 'utf8');

  it('the board image stamps the revision it was built from', () => {
    const dockerfile = fs.readFileSync(path.join(REPO, 'Dockerfile'), 'utf8');
    expect(dockerfile).toMatch(new RegExp(`LABEL ${LABEL.replace(/\./g, '\\.')}`));
    expect(dockerfile).toMatch(/ARG GIT_SHA/);
  });

  it('the bot image stamps it too, which is what it was missing', () => {
    // Without this the bot builds as GIT_SHA=unknown and is unverifiable -
    // the state it was actually in when the ID comparison flagged it.
    const dockerfile = fs.readFileSync(path.join(REPO, 'bots', 'whip', 'Dockerfile'), 'utf8');
    expect(dockerfile).toMatch(new RegExp(`LABEL ${LABEL.replace(/\./g, '\\.')}`));
    expect(dockerfile).toMatch(/ARG GIT_SHA/);
  });

  it('every built service is passed GIT_SHA, or its label says "unknown"', () => {
    // A LABEL with no build arg behind it is worse than none: it looks
    // verified and reads "unknown".
    // Everything under `services:` up to the next top-level key. Slicing from
    // `services:` first is what keeps `bbs-data:` (a volume) and
    // `doorserver-net:` (a network) out - they are indented identically.
    const servicesBlock = COMPOSE.slice(
      COMPOSE.indexOf('\nservices:\n') + 1
    ).replace(/\n(?=[a-z])/i, '\n\u0000').split('\u0000')[0];

    /** One service's body: its own line excluded, to the next service. */
    function bodyOf(svc: string): string {
      const header = `\n  ${svc}:\n`;
      const from = servicesBlock.indexOf(header) + header.length;
      const rest = servicesBlock.slice(from);
      const next = rest.search(/^ {2}[a-z0-9-]+:$/m);
      return next === -1 ? rest : rest.slice(0, next);
    }

    const services = [...servicesBlock.matchAll(/^ {2}([a-z0-9-]+):$/gm)].map((m) => m[1]);
    const built = services.filter((s) => /^\s+build:/m.test(bodyOf(s)));

    expect(built.sort()).toEqual(['bbs', 'whip-bot']);
    for (const svc of built) {
      expect([svc, /GIT_SHA:\s*\$\{GIT_SHA/.test(bodyOf(svc))]).toEqual([svc, true]);
    }
  });
});
