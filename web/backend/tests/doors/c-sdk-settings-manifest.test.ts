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

/** Every door that declares its settings in C, and where its manifest ships. */
const C_SDK_DOORS: Array<{ src: string; doorsDir: string }> = [
  { src: 'requests', doorsDir: 'REQUESTS' },
];

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
});
