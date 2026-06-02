"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ViewManager = exports.BaseView = exports.KeyBinder = void 0;
// ─── KeyBinder ────────────────────────────────────────────────────────────────
class KeyBinder {
    constructor(screen) {
        this.bound = [];
        this.screen = screen;
    }
    key(keys, handler) {
        this.bound.push({ keys, handler });
        this.screen.key(keys, handler);
    }
    release() {
        for (const { keys, handler } of this.bound) {
            this.screen.unkey(keys, handler);
        }
        this.bound = [];
    }
}
exports.KeyBinder = KeyBinder;
// ─── BaseView ─────────────────────────────────────────────────────────────────
class BaseView {
    /**
     * Called when ESC is pressed while this view is active.
     * Default: pop this view. Override to prevent or customise.
     */
    onEsc() { this.vm.pop(); }
    /** Attach to a ViewManager — called by ViewManager.push. */
    _attach(vm) {
        this.vm = vm;
        this.keys = new KeyBinder(vm.screen);
    }
}
exports.BaseView = BaseView;
// ─── ViewManager ─────────────────────────────────────────────────────────────
class ViewManager {
    constructor(screen) {
        this.stack = [];
        this.screen = screen;
        this.escHandler = () => {
            const top = this.stack[this.stack.length - 1];
            if (top)
                top.onEsc();
        };
        this.screen.key(['escape'], this.escHandler);
    }
    /** Push a new view onto the stack (becomes active). */
    push(view) {
        // Pause current top without destroying it
        const current = this.stack[this.stack.length - 1];
        if (current)
            current.exit();
        view._attach(this);
        this.stack.push(view);
        view.enter();
    }
    /** Remove the top view and restore the previous one. */
    pop() {
        const top = this.stack.pop();
        if (top) {
            top.keys.release();
            top.exit();
        }
        const next = this.stack[this.stack.length - 1];
        if (next) {
            next.keys = new KeyBinder(this.screen);
            next.enter();
        }
    }
    /** Replace the top view with a new one (no back navigation). */
    replace(view) {
        const top = this.stack.pop();
        if (top) {
            top.keys.release();
            top.exit();
        }
        view._attach(this);
        this.stack.push(view);
        view.enter();
    }
    get depth() { return this.stack.length; }
    /** Tear down everything and release the global ESC handler. */
    destroy() {
        while (this.stack.length > 0) {
            const v = this.stack.pop();
            v.keys?.release();
            v.exit();
        }
        this.screen.unkey(['escape'], this.escHandler);
    }
}
exports.ViewManager = ViewManager;
//# sourceMappingURL=ViewManager.js.map