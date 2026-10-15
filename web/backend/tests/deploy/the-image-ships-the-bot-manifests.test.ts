/**
 * The Bots page has manifests to read.
 *
 * `plugin.service.ts` resolves `bots/` from the backend CODE tree, and its
 * comment states the rule it depends on: "Manifests ship with the image
 * (bots/ is COPYd), so they resolve from the backend CODE tree in every
 * environment". Nothing ever COPYd it.
 *
 * So on the live board `/app/bots` did not exist, `listPlugins()` read an
 * empty list, and the admin answered "Bot not installed" for a bot that was
 * running and delivering events. The sysop could not set the Discord token
 * through the UI at all - which is why rotating a token that had been exposed
 * in a chat log sat open for days as "unknown if done". It was not parked; it
 * was impossible.
 *
 * Same family as the profiled service the deploy skipped, and as a door's
 * dist that is not rebuilt: green in git, absent in production, and nothing
 * says so. The assertion is on the Dockerfile, because the Dockerfile is what
 * decides.
 */
import * as fs from 'fs';
import * as path from 'path';

const REPO = path.join(__dirname, '..', '..', '..', '..');
const DOCKERFILE = fs.readFileSync(path.join(REPO, 'Dockerfile'), 'utf8');

/** Every bot in the repo, by directory name. */
function botsInRepo(): string[] {
  const dir = path.join(REPO, 'bots');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .filter((e) => fs.existsSync(path.join(dir, e.name, 'bot.json')))
    .map((e) => e.name);
}

describe('the board image and the bot manifests', () => {
  it('has at least one bot to ship, or this guard is pointless', () => {
    // If bots/ ever leaves the repo, delete this suite knowingly rather than
    // let it pass against nothing.
    expect(botsInRepo().length).toBeGreaterThan(0);
  });

  it('COPYs bots/ into the image, where plugin.service looks for it', () => {
    // plugin.service.ts: botsDir() = <backend tree>/../../.. + '/bots' = /app/bots
    expect(DOCKERFILE).toMatch(/^COPY bots \/app\/bots$/m);
  });

  it('ships every bot, not a hand-listed one', () => {
    // A per-bot COPY line is a line somebody forgets when the second bot
    // arrives - which is exactly how the first one came to be missing.
    const perBot = botsInRepo().filter((name) =>
      new RegExp(`COPY bots/${name}`).test(DOCKERFILE)
    );
    expect(perBot).toEqual([]);
  });

  it('every shipped manifest is the shape the admin requires', () => {
    // listPlugins() drops a manifest that fails isValidManifest(), which
    // would put the page back to "not installed" with the file present.
    for (const name of botsInRepo()) {
      const raw = JSON.parse(
        fs.readFileSync(path.join(REPO, 'bots', name, 'bot.json'), 'utf8')
      );
      expect(typeof raw.id).toBe('string');
      expect(raw.id.length).toBeGreaterThan(0);
      expect(Array.isArray(raw.configSchema)).toBe(true);
    }
  });

  it('the WHIP manifest still declares the Discord token field', () => {
    // The field the sysop needs to reach; named here so a rename cannot
    // silently remove the only route to setting it.
    const raw = JSON.parse(
      fs.readFileSync(path.join(REPO, 'bots', 'whip', 'bot.json'), 'utf8')
    );
    const keys = (raw.configSchema as Array<{ key: string; secret?: boolean }>);
    const token = keys.find((f) => f.key === 'DISCORD_BOT_TOKEN');

    expect(token).toBeDefined();
    expect(token?.secret).toBe(true);
  });
});
