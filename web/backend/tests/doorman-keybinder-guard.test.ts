/**
 * Regression: typing in DOORMAN's repo filter fired view hotkeys — "fa"
 * opened [A]rchive browse and threw the user out of the input (only the 'f'
 * binding was guarded). KeyBinder now supports a modal guard that suppresses
 * every bound hotkey while a text-input mode is active.
 */
import { KeyBinder } from '../../../Doors/door-manager/ViewManager';

class ScreenStub {
  handlers = new Map<string, Array<(...a: unknown[]) => void>>();
  key(keys: string[], handler: (...a: unknown[]) => void): void {
    for (const k of keys) {
      if (!this.handlers.has(k)) this.handlers.set(k, []);
      this.handlers.get(k)!.push(handler);
    }
  }
  unkey(keys: string[], handler: (...a: unknown[]) => void): void {
    for (const k of keys) {
      const list = this.handlers.get(k) ?? [];
      this.handlers.set(k, list.filter(h => h !== handler));
    }
  }
  press(k: string): void {
    for (const h of this.handlers.get(k) ?? []) h(k, { name: k });
  }
}

describe('DOORMAN KeyBinder modal guard', () => {
  it('suppresses hotkeys while the guard returns false (filter mode active)', () => {
    const screen = new ScreenStub();
    const keys = new KeyBinder(screen);
    let archiveOpened = 0;
    let filterActive = false;
    keys.setGuard(() => !filterActive);
    keys.key(['a'], () => { archiveOpened++; });

    filterActive = true;
    screen.press('a');
    expect(archiveOpened).toBe(0);

    filterActive = false;
    screen.press('a');
    expect(archiveOpened).toBe(1);
  });

  it('release() unbinds wrapped handlers and clears the guard', () => {
    const screen = new ScreenStub();
    const keys = new KeyBinder(screen);
    let fired = 0;
    keys.key(['q'], () => { fired++; });
    keys.release();
    screen.press('q');
    expect(fired).toBe(0);
    expect(screen.handlers.get('q')).toEqual([]);
  });
});

// Regression: InstalledView rendered raw FILE_ID.DIZ/description into a
// tags:true blessed box — brace runs in ASCII art were parsed as tags and
// the art rendered mangled. sanitizeForTags escapes braces and drops
// non-printable/high-bit bytes.
import { sanitizeForTags } from '../../../Doors/door-manager/ViewManager';

describe('DOORMAN sanitizeForTags', () => {
  it('escapes brace runs so blessed does not eat ASCII art', () => {
    expect(sanitizeForTags('_{___}_')).toBe('_\\{___\\}_');
  });
  it('drops high-bit and control bytes, keeps printable ASCII and newlines', () => {
    expect(sanitizeForTags('A\xb1B\x1b[31mC\nD')).toBe('AB[31mC\nD');
  });
});

// Regression: installed doors were invisible in the doors list until BBS
// restart — the backend door registry is a boot-time cache and DOORMAN never
// called reloadDoors(). refreshDoorRegistry discovers it via require.cache.
import { refreshDoorRegistry } from '../../../Doors/door-manager/ViewManager';

describe('DOORMAN refreshDoorRegistry', () => {
  it('calls reloadDoors on the discovered door.handler module', async () => {
    let reloaded = 0;
    const fakeCache = {
      '/x/handlers/door.handler.js': { exports: { reloadDoors: async () => { reloaded++; } } },
    };
    await expect(refreshDoorRegistry(fakeCache)).resolves.toBe(true);
    expect(reloaded).toBe(1);
  });
  it('returns false when no registry module is loaded', async () => {
    await expect(refreshDoorRegistry({})).resolves.toBe(false);
  });
});

// Regression: PROJECT_ROOT = __dirname/../../.. broke when dev runs the
// SOURCE app.ts (one level short of repo root) — installs wrote
// Commands/BBSCmd into the wrong tree. resolveBbsRoot prefers env, then
// walks up to the dir containing Commands/BBSCmd.
import { resolveBbsRoot } from '../../../Doors/door-manager/ViewManager';

describe('DOORMAN resolveBbsRoot', () => {
  const hasCmd = (root: string) => (p: string) => p === `${root}/Commands/BBSCmd`;
  it('prefers BBS_DATA_DIR when it holds Commands/BBSCmd', () => {
    expect(resolveBbsRoot('/x/Doors/door-manager', { BBS_DATA_DIR: '/bbs' }, hasCmd('/bbs'))).toBe('/bbs');
  });
  it('walks up from a source run (Doors/door-manager) to the repo root', () => {
    expect(resolveBbsRoot('/repo/Doors/door-manager', {}, hasCmd('/repo'))).toBe('/repo');
  });
  it('walks up from a dist run (Doors/door-manager/dist) to the repo root', () => {
    expect(resolveBbsRoot('/repo/Doors/door-manager/dist', {}, hasCmd('/repo'))).toBe('/repo');
  });
  it('falls back to the historical dist-relative guess when nothing matches', () => {
    expect(resolveBbsRoot('/a/b/c/d', {}, () => false)).toBe('/a');
  });
});
