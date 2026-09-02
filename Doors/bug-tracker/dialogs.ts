/**
 * The generic dialogs BUGS puts on screen: a selector, a text input, a
 * message and a confirm.
 *
 * None of them know anything about bugs - they take a screen, a title and a
 * callback. That is why they can live outside the app class, which was at
 * 2500 lines against a 2000-line ceiling.
 *
 * They reach the app for exactly two things, so those are the contract:
 * the screen to draw on, and the view marker the app uses to route keys.
 */
import {
  createBox,
  createList,
  createTextbox,
} from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

import { T } from './door-theme-bugs';

/** The views BUGS routes keys for. Kept in step with app.ts's field. */
export type BugView =
  | 'menu' | 'list' | 'detail' | 'create'
  | 'stats' | 'settings' | 'dialog' | 'search';

/**
 * What a dialog needs from the app that opened it.
 *
 * `currentView` is the union rather than `string` on purpose: a mutable
 * `string` property will not accept the app's narrower field, because
 * writing "anything" into it would break the app's own type.
 */
export interface DialogHost {
  screen: Screen;
  currentView: BugView;
}

export function showSelector(ctx: DialogHost, title: string, items: string[], callback: (idx: number) => void): void {
  // Capture the currently-focused element so we can restore it on cleanup.
  // Without this, after the dialog closes no widget has focus and key input
  // appears frozen until the user clicks something.
  // getFocused() is the focused ELEMENT; `screen.focused` is a boolean,
  // so this used to stash `true` and restore nothing.
  const previousFocus = (ctx.screen as any).getFocused?.() ?? null;
  // Defer to next tick to avoid Enter key propagation from parent
  setImmediate(() => {
    const previousView = ctx.currentView;
    ctx.currentView = 'dialog';

    // Create modal backdrop to capture clicks outside
    const backdrop = createBox({
      // A ground, not a frame: createBox draws a line border when no
      // border key is given (Panel's default), which outlines the whole
      // terminal.
      border: undefined,
      parent: ctx.screen,
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      style: { bg: T.ground, transparent: true },
      focusable: false,
      clickable: true,
    });

    const list = createList({
      parent: ctx.screen,
      top: 'center',
      left: 'center',
      width: 40,
      height: Math.min(items.length + 4, 15),
      border: { type: 'line' },
      label: ` ${title} `,
      style: {
        fg: T.ink,
        bg: T.ground,
        border: { fg: T.warn },
        selected: { fg: T.selectionInk, bg: T.warn },
      },
      items,
      keys: true,
      vi: true,
      mouse: true,
      grabKeys: true,  // Capture all key input
    });

    list.focus();

    const cleanup = () => {
      backdrop.detach();
      list.detach();
      ctx.currentView = previousView;
      if (previousFocus && typeof previousFocus.focus === 'function') {
        previousFocus.focus();
      }
      ctx.screen.render();
    };

    list.once('select', (_item: any, idx: number) => {
      cleanup();
      callback(idx);
    });

    list.key(['escape'], () => {
      cleanup();
      callback(-1);
    });

    // Click backdrop to cancel
    backdrop.on('click', () => {
      cleanup();
      callback(-1);
    });

    ctx.screen.render();
  });
}

export function showTextInput(ctx: DialogHost, title: string, defaultValue: string, multiline: boolean, callback: (value: string | null) => void): void {
  // getFocused() is the focused ELEMENT; `screen.focused` is a boolean,
  // so this used to stash `true` and restore nothing.
  const previousFocus = (ctx.screen as any).getFocused?.() ?? null;
  // Defer to next tick to avoid Enter key propagation from parent
  setImmediate(() => {
    const previousView = ctx.currentView;
    ctx.currentView = 'dialog';
    const height = multiline ? 10 : 5;

    // Create modal backdrop
    const backdrop = createBox({
      // A ground, not a frame: createBox draws a line border when no
      // border key is given (Panel's default), which outlines the whole
      // terminal.
      border: undefined,
      parent: ctx.screen,
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      style: { bg: T.ground, transparent: true },
      focusable: false,
      clickable: true,
    });

    const inputBox = createBox({
      parent: ctx.screen,
      top: 'center',
      left: 'center',
      width: 60,
      height: height + 4,
      border: { type: 'line' },
      label: ` ${title} `,
      style: {
        fg: T.ink,
        bg: T.ground,
        border: { fg: T.warn },
      },
      tags: true,
      focusable: false,
      mouse: false,
      clickable: false,
    });

    const textbox = createTextbox({
      parent: inputBox,
      top: 1,
      left: 1,
      width: 56,
      height,
      style: {
        fg: T.ink,
        bg: T.bar,
      },
      inputOnFocus: true,
      keys: true,
      mouse: true,
      grabKeys: true,  // Capture all key input while editing
    });

    textbox.setValue(defaultValue);
    textbox.focus();

    createBox({
      parent: inputBox,
      bottom: 0,
      left: 1,
      width: 56,
      height: 1,
      content: `{${T.dim}-fg}Enter=Submit | ESC=Cancel{/}`,
      tags: true,
      style: { fg: T.dim, bg: T.ground },
      focusable: false,
      mouse: false,
      clickable: false,
    });

    const cleanup = () => {
      backdrop.detach();
      inputBox.detach();
      ctx.currentView = previousView;
      if (previousFocus && typeof previousFocus.focus === 'function') {
        previousFocus.focus();
      }
      ctx.screen.render();
    };

    textbox.on('submit', () => {
      const value = textbox.getValue();
      cleanup();
      callback(value);
    });

    textbox.key(['escape'], () => {
      cleanup();
      callback(null);
    });

    // Click backdrop to cancel
    backdrop.on('click', () => {
      cleanup();
      callback(null);
    });

    ctx.screen.render();
  });
}

export function showMessage(ctx: DialogHost, title: string, message: string, callback?: () => void): void {
  // getFocused() is the focused ELEMENT; `screen.focused` is a boolean,
  // so this used to stash `true` and restore nothing.
  const previousFocus = (ctx.screen as any).getFocused?.() ?? null;
  // Defer to next tick to avoid key propagation from parent
  setImmediate(() => {
    const previousView = ctx.currentView;
    ctx.currentView = 'dialog';

    // Create modal backdrop
    const backdrop = createBox({
      // A ground, not a frame: createBox draws a line border when no
      // border key is given (Panel's default), which outlines the whole
      // terminal.
      border: undefined,
      parent: ctx.screen,
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      style: { bg: T.ground, transparent: true },
      focusable: false,
      clickable: true,
    });

    const msgBox = createBox({
      parent: ctx.screen,
      top: 'center',
      left: 'center',
      width: 50,
      height: 7,
      border: { type: 'line' },
      label: ` ${title} `,
      style: {
        fg: T.ink,
        bg: T.ground,
        border: { fg: title === 'Error' ? 'red' : 'green' },
      },
      content: `\n${message}\n\n{center}Press any key to continue{/center}`,
      tags: true,
      grabKeys: true,  // Capture all key input
    });

    msgBox.focus();

    const cleanup = () => {
      backdrop.detach();
      msgBox.detach();
      ctx.currentView = previousView;
      if (previousFocus && typeof previousFocus.focus === 'function') {
        previousFocus.focus();
      }
      ctx.screen.render();
    };

    msgBox.once('keypress', () => {
      cleanup();
      if (callback) callback();
    });

    // Click anywhere to dismiss
    backdrop.on('click', () => {
      cleanup();
      if (callback) callback();
    });

    msgBox.on('click', () => {
      cleanup();
      if (callback) callback();
    });

    ctx.screen.render();
  });
}

export function showConfirm(ctx: DialogHost, title: string, message: string, callback: (confirmed: boolean) => void): void {
  // Defer to next tick to avoid key propagation from parent
  setImmediate(() => {
    const previousView = ctx.currentView;
    ctx.currentView = 'dialog';

    // Create modal backdrop
    const backdrop = createBox({
      // A ground, not a frame: createBox draws a line border when no
      // border key is given (Panel's default), which outlines the whole
      // terminal.
      border: undefined,
      parent: ctx.screen,
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      style: { bg: T.ground, transparent: true },
      focusable: false,
      clickable: true,
    });

    const confirmBox = createBox({
      parent: ctx.screen,
      top: 'center',
      left: 'center',
      width: 50,
      height: 8,
      border: { type: 'line' },
      label: ` ${title} `,
      style: {
        fg: T.ink,
        bg: T.ground,
        border: { fg: T.warn },
      },
      content: `\n${message}\n\n{center}Y=Yes | N=No{/center}`,
      tags: true,
      grabKeys: true,  // Capture all key input
    });

    confirmBox.focus();

    const cleanup = () => {
      backdrop.detach();
      confirmBox.detach();
      ctx.currentView = previousView;
      ctx.screen.render();
    };

    confirmBox.key(['y', 'Y'], () => {
      cleanup();
      callback(true);
    });

    confirmBox.key(['n', 'N', 'escape'], () => {
      cleanup();
      callback(false);
    });

    // Click backdrop to cancel
    backdrop.on('click', () => {
      cleanup();
      callback(false);
    });

    ctx.screen.render();
  });
}
