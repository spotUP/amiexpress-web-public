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
export declare function sanitizeForTags(text: string): string;
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
export declare function resolveBbsRoot(startDir: string, env?: Record<string, string | undefined>, exists?: (p: string) => boolean): string;
/**
 * Refresh the backend's in-memory door registry after install/uninstall.
 * getDoors()/getDoorList() serve a boot-time cache — without this, a freshly
 * installed door is invisible in the doors list until the BBS restarts.
 * Discovers backend modules via require.cache (same pattern as app.ts's
 * getCatalogSvc); cache injectable for tests.
 */
export declare function refreshDoorRegistry(cache?: Record<string, any>): Promise<boolean>;
export declare class KeyBinder {
    private screen;
    private bound;
    private guard;
    constructor(screen: any);
    /**
     * Modal-input guard: while `guard()` returns false, every hotkey bound
     * through this binder is suppressed. Views with a text-input mode (e.g.
     * RepoView's filter box) set this so typing "a" filters instead of firing
     * the [A]rchive hotkey — guarding per-handler proved error-prone (only the
     * 'f' binding was guarded; every other hotkey threw the user out of the
     * filter input).
     */
    setGuard(guard: (() => boolean) | null): void;
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
    key(keys: string[], handler: (...a: any[]) => boolean | void): void;
    release(): void;
}
export declare abstract class BaseView {
    vm: ViewManager;
    keys: KeyBinder;
    /** Called when this view becomes the top of the stack. */
    abstract enter(): void;
    /** Called when this view is popped or another is pushed on top. */
    abstract exit(): void;
    /**
     * Called when ESC is pressed while this view is active.
     * Default: pop this view. Override to prevent or customise.
     */
    onEsc(): void;
    /** Attach to a ViewManager — called by ViewManager.push. */
    _attach(vm: ViewManager): void;
}
export declare class ViewManager {
    readonly screen: any;
    private stack;
    private escHandler;
    constructor(screen: any);
    /** Push a new view onto the stack (becomes active). */
    push(view: BaseView): void;
    /** Remove the top view and restore the previous one. */
    pop(): void;
    /** Replace the top view with a new one (no back navigation). */
    replace(view: BaseView): void;
    get depth(): number;
    /** Tear down everything and release the global ESC handler. */
    destroy(): void;
}
//# sourceMappingURL=ViewManager.d.ts.map