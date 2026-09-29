/**
 * "is it possible to get the web term to use autofill for login?" (sysop,
 * 2026-09-29; original login stays the only login, Chrome first).
 *
 * The password manager's answer is typed into the server's own prompts: the
 * name at the name prompt, the password when `mask-input` announces the
 * password prompt. Pinned from the backend suite because no CI job builds
 * packages/terminal.
 */
import * as fs from 'fs';
import * as path from 'path';

import {
  createLoginCredentials,
  type CredentialStore,
  type SavedCredential,
} from '../../../../packages/terminal/src/utils/login-credentials';

const flush = () => new Promise((resolve) => setImmediate(resolve));

function harness(saved: SavedCredential | null) {
  const sent: string[] = [];
  const store: CredentialStore = {
    get: jest.fn(async () => saved),
    save: jest.fn(async () => undefined),
    forgetSilentAccess: jest.fn(async () => undefined),
  };
  const login = createLoginCredentials((line) => sent.push(line), store);
  return { sent, store, login };
}

describe('password manager through the board prompts', () => {
  it('types the saved name at the name prompt and the password at the password prompt', async () => {
    const { sent, login } = harness({ id: 'spot', password: 'hunter2' });
    login.onPromptLogin();
    await flush();
    expect(sent).toEqual(['spot\r']);
    login.onMaskInput(true);
    expect(sent).toEqual(['spot\r', 'hunter2\r']);
  });

  it('fills once per connection: a rejected password is not tried again', async () => {
    const { sent, login } = harness({ id: 'spot', password: 'wrong' });
    login.onPromptLogin();
    await flush();
    login.onMaskInput(true);
    login.onLoginFailed();
    login.onPromptLogin();
    await flush();
    expect(sent).toEqual(['spot\r', 'wrong\r']);
    login.onConnect();
    login.onPromptLogin();
    await flush();
    expect(sent).toEqual(['spot\r', 'wrong\r', 'spot\r']);
  });

  it('types nothing when the browser has nothing saved, and a later password prompt is the caller\'s', async () => {
    const { sent, login } = harness(null);
    login.onPromptLogin();
    await flush();
    login.onMaskInput(true);
    expect(sent).toEqual([]);
  });

  it('offers to save what the caller typed once the login succeeds', async () => {
    const { store, login } = harness(null);
    login.onPromptLogin();
    await flush();
    login.onTyped('spo');
    login.onTyped('x\x7ft\r');
    login.onMaskInput(true);
    login.onTyped('secret\r');
    login.onLoginSuccess();
    expect(store.save).toHaveBeenCalledWith({ id: 'spot', password: 'secret' });
  });

  it('saves nothing after a failed login, and stops silent sign-in', async () => {
    const { store, login } = harness(null);
    login.onPromptLogin();
    await flush();
    login.onTyped('spot\r');
    login.onMaskInput(true);
    login.onTyped('bad\r');
    login.onLoginFailed();
    login.onLoginSuccess();
    expect(store.save).not.toHaveBeenCalled();
    expect(store.forgetSilentAccess).toHaveBeenCalled();
  });

  it('does nothing without a credential store (Safari, Firefox, plain http)', async () => {
    const sent: string[] = [];
    const login = createLoginCredentials((l) => sent.push(l), null);
    login.onPromptLogin();
    login.onMaskInput(true);
    login.onTyped('x\r');
    login.onLoginSuccess();
    expect(sent).toEqual([]);
  });

  it('is wired into the terminal: the cues and the keystrokes reach it', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../../../packages/terminal/src/components/BBSTerminal.tsx'),
      'utf8'
    );
    for (const cue of ['onPromptLogin()', "onMaskInput(", 'onTyped(', 'onLoginSuccess()', 'onLoginFailed()', 'onConnect()']) {
      expect(source).toContain(`loginCredentials.current!.${cue}`);
    }
  });
});
