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
    key(keys: string[], handler: (...a: any[]) => void): void;
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