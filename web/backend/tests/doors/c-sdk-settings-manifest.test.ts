/**
 * A C SDK DOOR'S SETTINGS FORM IS GENERATED FROM THE DOOR'S OWN SOURCE.
 *
 * A door registers in the admin automatically - the board scans BBSCmd .info
 * files at boot and 138 doors appear with nobody lifting a finger. Its
 * SETTINGS did not: those needed a hand-written
 * `Doors/<door>/door.settings.json`, so of those 138 doors exactly 8 had a
 * settings form and only one was a C door. A sysop could see every door on the
 * board and configure almost none of them.
 *
 * The consuming half was already generic (door-settings.service.ts renders any
 * manifest, and `cfgFile` + `cfgKey` write the plain Key=value file a 68K
 * binary actually opens). The missing link was DECLARING, and it now lives in
 * the door's own C source beside the code that reads the values:
 * `sdk/c/examples/<door>/settings.c`, using the AE_SETTINGS_* macros, emitted
 * by `make -C sdk/c settings`.
 *
 * THIS TEST IS THE ANTI-DRIFT GUARD. It re-runs the generator and compares it
 * against the manifest actually shipped in Doors/. If a door's declaration is
 * edited and the manifest is not regenerated - or the manifest is hand-edited
 * behind the generator's back - the two disagree and the sysop gets a form
 * that edits fields the door never reads. That failure is silent in
 * production, which is exactly why it is loud here.
 *
 * It also validates the generated JSON against the SAME schema the backend
 * enforces, because a field the schema rejects makes the whole door's settings
 * vanish with the form falling back to "this door declares no settings".
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const REPO = path.resolve(__dirname, '..', '..', '..', '..');
const SDK_C = path.join(REPO, 'sdk', 'c');

/**
 * Every door that declares its settings in C, READ FROM THE MAKEFILE.
 *
 * This list used to be written out here, and it named two of the three doors
 * the generator actually emits. TEXTTV was the missing one, so its manifest
 * drifted away from its declaration - two help strings had been improved in
 * the shipped JSON, behind the generator's back - and the guard below could
 * not see it, because the guard did not know the door existed. Found on
 * 2026-09-15 when `make -C sdk/c settings` silently reverted both strings.
 *
 * `SETTINGS_DOORS` in sdk/c/Makefile is what the generator iterates, so it is
 * the list this test must use. A third copy is a third place to forget.
 */
function cSdkDoors(): Array<{ src: string; doorsDir: string }> {
  const makefile = fs.readFileSync(path.join(SDK_C, 'Makefile'), 'utf8');
  const line = /^SETTINGS_DOORS\s*=\s*(.+)$/m.exec(makefile);
  if (line === null) throw new Error('sdk/c/Makefile declares no SETTINGS_DOORS');
  return line[1]
    .trim()
    .split(/\s+/)
    .map(pair => {
      const [src, doorsDir] = pair.split(':');
      return { src, doorsDir };
    });
}

const C_SDK_DOORS = cSdkDoors();

function haveCompiler(): boolean {
  try {
    execFileSync('cc', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Build the host emitter for one door and return what it prints. */
function generate(src: string): string {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'ae-settings-'));
  const bin = path.join(out, 'emit');
  execFileSync('cc', [
    '-I', path.join(SDK_C, 'include'),
    '-o', bin,
    path.join(SDK_C, 'tools', 'emit-door-settings.c'),
    path.join(SDK_C, 'src', 'ae_settings.c'),
    path.join(SDK_C, 'examples', src, 'settings.c'),
    '-lm',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  const json = execFileSync(bin, { encoding: 'utf8' });
  fs.rmSync(out, { recursive: true, force: true });
  return json;
}

describe('a C SDK door declares its own settings', () => {
  const compiler = haveCompiler();

  for (const door of C_SDK_DOORS) {
    const manifestPath = path.join(REPO, 'Doors', door.doorsDir, 'door.settings.json');

    it(`${door.doorsDir}: the shipped manifest is exactly what the declaration emits`, () => {
      if (!compiler) {
        // Never a silent skip: say why, so a green run is not mistaken for a
        // check that ran.
        console.warn('[c-sdk-settings] no host compiler; drift check not performed');
        return;
      }
      expect(fs.existsSync(manifestPath)).toBe(true);
      const shipped = fs.readFileSync(manifestPath, 'utf8');
      const generated = generate(door.src);

      // Byte-for-byte: the generator is the source of truth, so any drift at
      // all is drift. Regenerate with `make -C sdk/c settings`.
      expect(generated).toBe(shipped);
    });

    it(`${door.doorsDir}: what it emits satisfies the schema the backend enforces`, () => {
      if (!compiler) return;
      const parsed = JSON.parse(generate(door.src));

      // Mirrors door-settings.service.ts's zod schema. A manifest that fails
      // it does not error - the door simply reports no settings at all.
      expect(typeof parsed.command).toBe('string');
      expect(parsed.command.length).toBeGreaterThan(0);
      expect(parsed.command.length).toBeLessThanOrEqual(50);
      expect(Array.isArray(parsed.settings)).toBe(true);
      expect(parsed.settings.length).toBeLessThanOrEqual(100);
      if (parsed.cfgFile !== undefined) {
        expect(parsed.cfgFile).not.toContain('/');   // bare filename only
        expect(parsed.cfgFile).not.toContain('..');
      }
      for (const s of parsed.settings) {
        expect(s.key.length).toBeGreaterThan(0);
        expect(s.key.length).toBeLessThanOrEqual(64);
        expect(s.label.length).toBeLessThanOrEqual(120);
        expect(['string', 'number', 'boolean', 'choice']).toContain(s.type);
        if (s.help !== undefined) expect(s.help.length).toBeLessThanOrEqual(300);
        if (s.type === 'choice') expect((s.choices ?? []).length).toBeGreaterThan(0);
        if (s.cfgKey !== undefined) expect(s.cfgKey.length).toBeLessThanOrEqual(64);
      }
    });

    it(`${door.doorsDir}: every cfgKey is unique, or the rendered .cfg loses a line`, () => {
      if (!compiler) return;
      const parsed = JSON.parse(generate(door.src));
      const keys = parsed.settings.map((s: { cfgKey?: string }) => s.cfgKey).filter(Boolean);
      expect(new Set(keys).size).toBe(keys.length);
    });
  }

  /**
   * A setting can say its VALUE names an art file, so the ANSI Studio offers
   * it as a drawable slot and the picker writes that same setting. One
   * declaration, one filename - the alternative was a second list repeating
   * the name, which is the shape this repository has paid for three times
   * this week.
   */
  it('REQUESTS marks its two art files as art, and nothing else', () => {
    if (!compiler) return;
    const parsed = JSON.parse(generate('requests')) as {
      settings: Array<{ key: string; type: string; art?: boolean }>;
    };
    const art = parsed.settings.filter((s) => s.art === true).map((s) => s.key);

    // `bulletin` names the screen the door WRITES - a destination, not a
    // drawing - and must not be here.
    expect(art).toEqual(['bulletinHeader', 'bulletinTail']);
    for (const s of parsed.settings) {
      if (s.art) expect(s.type).toBe('string');
    }
  });
});
