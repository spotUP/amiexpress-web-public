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
