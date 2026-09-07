/**
 * A door's achievement definitions and the events it actually reports are the
 * same set.
 *
 * WHAT THIS CATCHES, and why it is not a style check. An achievement is DATA
 * on the server: a rule counts events of a named type, and nothing anywhere
 * checks that a door ever emits that type. So a definition whose `rule.type`
 * is misspelled - or whose door never calls `ctx.achievement` at all - is a
 * row in the catalog that can never unlock, and the only symptom is a player
 * who says the door "doesn't give the award". `door.gmaster.*` was in this
 * state until 2026-09-07: the door emitted three types and the manifest
 * declared rules over them, with nothing to keep the two spellings together.
 *
 * The other half is the namespace the SERVER enforces. `BBSApi.achievement`
 * refuses any type that is not `door.<command>.<slug>` for the running door,
 * and `PUT /catalog/doors/<door>` refuses any id that is not - so a manifest
 * that gets this wrong is a 400 the sysop never sees, at a moment nobody is
 * watching. It is cheaper to be told here.
 *
 * The scan is deliberately dumb: the literal string, anywhere in the door's
 * own sources. A door that builds a type by concatenation would fail this,
 * and should - the board's own guard reads the finished string too.
 */
import * as fs from 'fs';
import * as path from 'path';

import { doorManifests, doorsRoot, type DoorAchievementDef } from '../../src/achievements/door-catalog';

const TIERS = ['bronze', 'silver', 'gold', 'platinum'];
/** Files a door's own code lives in. `dist` is built output and would pass vacuously. */
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs', '.cjs'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', 'assets']);

/** Every line of a door's own source, concatenated. */
function sourcesOf(dir: string): string {
  const parts: string[] = [];
  const walk = (current: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(path.join(current, entry.name));
      } else if (SOURCE_EXTENSIONS.includes(path.extname(entry.name))) {
        try { parts.push(fs.readFileSync(path.join(current, entry.name), 'utf-8')); } catch { /* unreadable */ }
      }
    }
  };
  walk(dir);
  return parts.join('\n');
}

/** The event type a rule counts, when it counts one. `all` composes ids instead. */
function typeOf(rule: Record<string, unknown>): string | null {
  return typeof rule?.type === 'string' ? rule.type : null;
}

const manifests = doorManifests();

describe('door-declared achievements', () => {
  it('there is at least one door declaring them, or this suite proves nothing', () => {
    expect({ doorsRoot: doorsRoot(), declaring: manifests.map((m) => m.command) })
      .toEqual({ doorsRoot: doorsRoot(), declaring: expect.arrayContaining(['gmaster', 'phreakwars']) });
  });

  describe.each(manifests.map((m) => [m.command, m] as const))('%s', (command, manifest) => {
    const source = sourcesOf(manifest.dir);
    const ids = new Set(manifest.achievements.map((a) => a.id));

    it.each(manifest.achievements.map((a) => [a.id, a] as const))(
      '%s is named, tiered and scored the way the catalog is',
      (_id, def: DoorAchievementDef) => {
        expect({ id: def.id, ok: new RegExp(`^door\\.${command}\\.[a-z0-9_]+$`).test(def.id) })
          .toEqual({ id: def.id, ok: true });
        expect({ id: def.id, tier: TIERS.includes(def.tier) }).toEqual({ id: def.id, tier: true });
        expect({ id: def.id, points: typeof def.points === 'number' && def.points > 0 })
          .toEqual({ id: def.id, points: true });
        expect(typeof def.name).toBe('string');
        expect(def.name.length).toBeGreaterThan(0);
        expect(typeof def.description).toBe('string');
        expect(def.description.length).toBeGreaterThan(0);
      },
    );

    it.each(manifest.achievements.map((a) => [a.id, a] as const))(
      '%s counts an event this door really reports',
      (_id, def: DoorAchievementDef) => {
        const type = typeOf(def.rule);
        if (type === null) {
          // `all(ids)` composes other achievements of the same door; each one
          // must exist here, or the meta award is unreachable too.
          const composed = (def.rule as { ids?: unknown }).ids;
          expect({ id: def.id, composed: Array.isArray(composed) }).toEqual({ id: def.id, composed: true });
          for (const other of composed as string[]) {
            expect({ id: def.id, refers: other, known: ids.has(other) })
              .toEqual({ id: def.id, refers: other, known: true });
          }
          return;
        }
        expect({ id: def.id, type, namespaced: new RegExp(`^door\\.${command}\\.[a-z0-9_]+$`).test(type) })
          .toEqual({ id: def.id, type, namespaced: true });
        expect({ id: def.id, type, emitted: source.includes(type) })
          .toEqual({ id: def.id, type, emitted: true });
      },
    );
  });
});
