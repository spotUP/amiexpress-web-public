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

import * as fs from 'fs';
import * as path from 'path';

/**
 * Sanitize raw archive text (FILE_ID.DIZ art, descriptions) for a blessed
 * box with tags:true: escape {}-runs so blessed doesn't parse art as tags,
 * and drop non-printable/high-bit bytes that render as garbage glyphs.
 */
export function sanitizeForTags(text: string): string {
  // Strips C0 control characters (which could move the cursor or set
  // colours from catalog text) and escapes blessed's tag braces - but KEEPS
  // everything from 0x80 up.
  //
  // This used to strip anything outside \x20-\x7e, which deleted the
  // high-bit glyphs Amiga scene art is drawn with. That is not cosmetic:
  // removing a character shortens its line by one column, so a rectangular
  // 44-column FILE_ID.DIZ loses its right-hand border on exactly the lines
  // that used one, and the art comes apart. Reported from the live BBS as
  // "many file_id's break like this"; $CP-ST14.LZX is a clean example, 13
  // lines of exactly 44 columns bordered with 0xA1 and 0xF7.
  //
  // The BBS speaks ISO-8859-1/Amiga, so those bytes are display characters.
  return text
    .split('\n')
    .map(l => l.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '').replace(/[{}]/g, c => `\\${c}`))
    .join('\n');
}

/**
 * Resolve the BBS root directory for DOORMAN's file operations.
 * `__dirname/../../..` was correct only when running the built
 * dist/index.js (Doors/door-manager/dist -> repo root); dev runs the
 * SOURCE index.ts and landed one level above the repo, so installs wrote
 * Commands/BBSCmd into the wrong tree (regression: 2026-08-15 local
 * install ENOENT at ~/Code/Commands/...). Order: explicit env
 * (live container sets BBS_DATA_DIR), then walk up from startDir to the
 * first directory that actually contains Commands/BBSCmd.
 */
export function resolveBbsRoot(
  startDir: string,
  env: Record<string, string | undefined> = process.env,
  exists: (p: string) => boolean = (p) => fs.existsSync(p)
): string {
  if (env.BBS_DATA_DIR && exists(path.join(env.BBS_DATA_DIR, 'Commands', 'BBSCmd'))) {
    return env.BBS_DATA_DIR;
  }
  let dir = startDir;
  for (let i = 0; i < 8; i++) {
    if (exists(path.join(dir, 'Commands', 'BBSCmd'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Last resort: historical dist-relative guess.
  return path.resolve(startDir, '..', '..', '..');
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
  private bound: Array<{ keys: string[]; handler: (...a: any[]) => boolean | void }> = [];
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

  /**
   * Propagates `handler`'s return value through to Screen.key()/
   * _handleKey — returning `true` marks the keystroke `handled`, which
   * skips Screen._handleKey's phase-2 emit-to-focused-element AND its
   * default Tab/Shift-Tab focus-navigation fallback (screen.ts's
   * `_handleKey`: both are gated on `!handled`). Every existing hotkey in
   * this codebase returns `undefined` (falls through `wrapped` unchanged),
   * so this is purely additive — only a caller that now explicitly
   * `return`s `true` opts in. See RepoView's filter-activation handler
   * (app.ts) for why this was needed: an unhandled Tab keystroke hits
   * Screen's own `focusNext()` fallback and returns before ever reaching
   * the phase-3 broadcast, silently undoing a synchronous focus change and
   * leaking a stuck one-shot guard flag with nothing left to consume it.
   */
  key(keys: string[], handler: (...a: any[]) => boolean | void): void {
    const wrapped = (...a: any[]): boolean | void => {
      if (this.guard && !this.guard()) return;
      return handler(...a);
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
