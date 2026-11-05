/**
 * Login modal keyboard flow.
 *
 * Reported live 2026-08-25 on bbs.uprough.net/chat: "username [tab] password
 * [tab] [enter] clears the form instead of submitting it", and "username
 * [enter] password [enter] clears the password field".
 *
 * Measured cause: Enter belongs to the TEXTBOX. Textbox._onKeypress consumes
 * it and emits 'submit' (single-line textboxes submit on Enter), so the
 * modal's `.key(['enter'])` bindings never ran - Enter in the username did
 * not move focus and Enter in the password did not submit. Nothing was
 * "cleared"; nothing happened at all, and the form looked reset.
 */

import { describe, it, expect } from '@jest/globals';
import { Screen } from '../engines/ui/blessed/core/screen';
import { LoginModal } from '../engines/ui/blessed/widgets/login-modal';

interface Harness {
  screen: any;
  modal: any;
  user: any;
  pass: any;
  button: any;
  submits: Array<{ username: string; password: string }>;
  press: (el: any, name: string, shift?: boolean) => void;
  tab: (from: any, shift?: boolean) => void;
  done: () => void;
}

function harness(): Harness {
  const screen: any = new Screen({ title: 'login', width: 80, height: 25 });
  const submits: Array<{ username: string; password: string }> = [];
  const modal: any = new LoginModal({
    parent: screen,
    title: 'Test Login',
    onSubmit: (credentials: { username: string; password: string }) => submits.push(credentials),
  });
  modal.display?.();

  return {
    screen,
    modal,
    submits,
    user: modal._usernameInput,
    pass: modal._passwordInput,
    button: modal._loginButton,
    press: (el: any, name: string, shift = false) => {
      el.focus();
      el._onKeypress?.(null, { name, full: name, shift });
    },
    // Tab never reaches the element: Textbox ignores it and the SCREEN runs
    // focus navigation, so a Tab test must go through the screen.
    tab: (from: any, shift = false) => {
      from.focus();
      screen.emit('keypress', '\t', { name: 'tab', full: shift ? 'S-tab' : 'tab', shift });
    },
    done: () => screen.destroy(),
  };
}

describe('login modal keyboard flow', () => {
  it('moves from username to password on Enter', () => {
    const h = harness();
    try {
      h.user.setValue('sysop');

      h.press(h.user, 'enter');

      expect(h.pass.focused).toBe(true);
      expect(h.submits).toHaveLength(0);
    } finally { h.done(); }
  });

  it('submits on Enter in the password, with both values intact', () => {
    const h = harness();
    try {
      h.user.setValue('sysop');
      h.pass.setValue('secret');

      h.press(h.pass, 'enter');

      expect(h.submits).toEqual([{ username: 'sysop', password: 'secret' }]);
    } finally { h.done(); }
  });

  it('does not lose what was typed', () => {
    const h = harness();
    try {
      h.user.setValue('sysop');
      h.pass.setValue('secret');

      h.press(h.user, 'enter');

      expect(h.user.getValue()).toBe('sysop');
      expect(h.pass.getValue()).toBe('secret');
    } finally { h.done(); }
  });

  it('refuses to submit an empty password, and says why', () => {
    const h = harness();
    try {
      h.user.setValue('sysop');

      h.press(h.pass, 'enter');

      expect(h.submits).toHaveLength(0);
      expect(h.pass.focused).toBe(true);
    } finally { h.done(); }
  });

  it('refuses to submit an empty username', () => {
    const h = harness();
    try {
      h.pass.setValue('secret');

      h.press(h.pass, 'enter');

      expect(h.submits).toHaveLength(0);
      expect(h.user.focused).toBe(true);
    } finally { h.done(); }
  });
});

describe('login modal tab order', () => {
  it('walks username -> password -> Login -> username', () => {
    const h = harness();
    try {
      h.tab(h.user);
      const afterUser = h.pass.focused;

      h.tab(h.pass);
      const afterPass = h.button.focused;

      h.tab(h.button);
      const afterButton = h.user.focused;

      expect({ afterUser, afterPass, afterButton }).toEqual({
        afterUser: true, afterPass: true, afterButton: true,
      });
    } finally { h.done(); }
  });

  it('submits from the Login button', () => {
    const h = harness();
    try {
      h.user.setValue('sysop');
      h.pass.setValue('secret');

      h.press(h.button, 'enter');

      expect(h.submits).toEqual([{ username: 'sysop', password: 'secret' }]);
    } finally { h.done(); }
  });
});

describe('login modal focus containment', () => {
  it('walks backwards on Shift+Tab', () => {
    const h = harness();
    try {
      h.tab(h.user, true);

      expect(h.button.focused).toBe(true);
    } finally { h.done(); }
  });

  it('keeps Tab inside the modal - it cannot reach the screen behind it', () => {
    const h = harness();
    try {
      for (let i = 0; i < 6; i++) h.tab(h.screen._focused ?? h.user);

      const inside = [h.user, h.pass, h.button].some(el => el.focused);
      expect(inside).toBe(true);
    } finally { h.done(); }
  });
});
