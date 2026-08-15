/**
 * ViewManager — blessed UI view stack for DOORMAN.
 *
 * Each "View" owns its key bindings and lifecycle. The manager keeps a stack:
 * - push(view)  — enter new view on top
 * - pop()       — return to previous view
 * - ESC always pops (views can override onEsc to prevent/customise)
 *
 * KeyBinder tracks all screen.key registrations made during a view's
 * lifetime and automatically removes them when the view exits.
 */

/**
 * Sanitize raw archive text (FILE_ID.DIZ art, descriptions) for a blessed
 * box with tags:true: escape {}-runs so blessed doesn't parse art as tags,
 * and drop non-printable/high-bit bytes that render as garbage glyphs.
 */
export function sanitizeForTags(text: string): string {
  return text
    .split('\n')
    .map(l => l.replace(/[^\x20-\x7e]/g, '').replace(/[{}]/g, c => `\\${c}`))
    .join('\n');
}

/**
 * Refresh the backend's in-memory door registry after install/uninstall.
 * getDoors()/getDoorList() serve a boot-time cache — without this, a freshly
 * installed door is invisible in the doors list until the BBS restarts.
 * Discovers backend modules via require.cache (same pattern as app.ts's
 * getCatalogSvc); cache injectable for tests.
 */
export async function refreshDoorRegistry(cache: Record<string, any> = require.cache as any): Promise<boolean> {
  let refreshed = false;
  try {
    for (const k of Object.keys(cache)) {
      if (k.includes('door.handler')) {
        const mod = cache[k]?.exports;
        if (mod?.reloadDoors) { await mod.reloadDoors(); refreshed = true; break; }
      }
    }
  } catch (err: any) {
    console.log(`[DOORMAN] door registry refresh failed: ${err?.message ?? err}`);
  }
  try {
    for (const k of Object.keys(cache)) {
      if (k.includes('amigaDoorManager')) {
        const mgr = cache[k]?.exports?.getAmigaDoorManager?.();
        if (mgr?.refreshCache) { await mgr.refreshCache(); break; }
      }
    }
  } catch { /* secondary cache, best effort */ }
  return refreshed;
}

// ─── KeyBinder ────────────────────────────────────────────────────────────────

export class KeyBinder {
  private screen: any;
  private bound: Array<{ keys: string[]; handler: (...a: any[]) => void }> = [];
  private guard: (() => boolean) | null = null;

  constructor(screen: any) { this.screen = screen; }

  /**
   * Modal-input guard: while `guard()` returns false, every hotkey bound
   * through this binder is suppressed. Views with a text-input mode (e.g.
   * RepoView's filter box) set this so typing "a" filters instead of firing
   * the [A]rchive hotkey — guarding per-handler proved error-prone (only the
   * 'f' binding was guarded; every other hotkey threw the user out of the
   * filter input).
   */
  setGuard(guard: (() => boolean) | null): void { this.guard = guard; }

  key(keys: string[], handler: (...a: any[]) => void): void {
    const wrapped = (...a: any[]) => {
      if (this.guard && !this.guard()) return;
      handler(...a);
    };
    this.bound.push({ keys, handler: wrapped });
    (this.screen as any).key(keys, wrapped);
  }

  release(): void {
    for (const { keys, handler } of this.bound) {
      (this.screen as any).unkey(keys, handler);
    }
    this.bound = [];
    this.guard = null;
  }
}

// ─── BaseView ─────────────────────────────────────────────────────────────────

export abstract class BaseView {
  vm!: ViewManager;
  keys!: KeyBinder;

  /** Called when this view becomes the top of the stack. */
  abstract enter(): void;

  /** Called when this view is popped or another is pushed on top. */
  abstract exit(): void;

  /**
   * Called when ESC is pressed while this view is active.
   * Default: pop this view. Override to prevent or customise.
   */
  onEsc(): void { this.vm.pop(); }

  /** Attach to a ViewManager — called by ViewManager.push. */
  _attach(vm: ViewManager): void {
    this.vm = vm;
    this.keys = new KeyBinder(vm.screen);
  }
}

// ─── ViewManager ─────────────────────────────────────────────────────────────

export class ViewManager {
  readonly screen: any;
  private stack: BaseView[] = [];
  private escHandler: () => void;

  constructor(screen: any) {
    this.screen = screen;
    this.escHandler = () => {
      const top = this.stack[this.stack.length - 1];
      if (top) top.onEsc();
    };
    (this.screen as any).key(['escape'], this.escHandler);
  }

  /** Push a new view onto the stack (becomes active). */
  push(view: BaseView): void {
    // Pause current top without destroying it
    const current = this.stack[this.stack.length - 1];
    if (current) current.exit();
    view._attach(this);
    this.stack.push(view);
    view.enter();
  }

  /** Remove the top view and restore the previous one. */
  pop(): void {
    const top = this.stack.pop();
    if (top) { top.keys.release(); top.exit(); }
    const next = this.stack[this.stack.length - 1];
    if (next) { next.keys = new KeyBinder(this.screen); next.enter(); }
  }

  /** Replace the top view with a new one (no back navigation). */
  replace(view: BaseView): void {
    const top = this.stack.pop();
    if (top) { top.keys.release(); top.exit(); }
    view._attach(this);
    this.stack.push(view);
    view.enter();
  }

  get depth(): number { return this.stack.length; }

  /** Tear down everything and release the global ESC handler. */
  destroy(): void {
    while (this.stack.length > 0) {
      const v = this.stack.pop()!;
      v.keys?.release();
      v.exit();
    }
    (this.screen as any).unkey(['escape'], this.escHandler);
  }
}
