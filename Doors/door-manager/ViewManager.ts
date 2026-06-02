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

// ─── KeyBinder ────────────────────────────────────────────────────────────────

export class KeyBinder {
  private screen: any;
  private bound: Array<{ keys: string[]; handler: (...a: any[]) => void }> = [];

  constructor(screen: any) { this.screen = screen; }

  key(keys: string[], handler: (...a: any[]) => void): void {
    this.bound.push({ keys, handler });
    (this.screen as any).key(keys, handler);
  }

  release(): void {
    for (const { keys, handler } of this.bound) {
      (this.screen as any).unkey(keys, handler);
    }
    this.bound = [];
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
