import { processLoginKey, type LoginKeyContext, type LoginState } from '../../../../packages/terminal/src/utils/login-key-machine';

function ctx(state: LoginState, overrides: Partial<LoginKeyContext> = {}) {
  const emitted: Array<[string, unknown]> = [];
  const echoed: string[] = [];
  const deferred: Array<() => void> = [];
  const c: LoginKeyContext = {
    state: { current: state },
    username: { current: '' }, password: { current: '' }, newUserPromptUsername: { current: '' },
    passwordResetInput: { current: '' }, forcedPwdChangeInput: { current: '' },
    passwordMode: { current: false },
    emit: (e, p) => emitted.push([e, p]),
    echo: (t) => echoed.push(t),
    defer: (fn) => deferred.push(fn),
    ...overrides,
  };
  return { c, emitted, echoed, deferred, runDeferred: () => deferred.splice(0).forEach((f) => f()) };
}

describe('processLoginKey', () => {
  it('username entry echoes each character and submits check-username on Enter', () => {
    const { c, emitted, echoed } = ctx('username');
    expect(processLoginKey('s', c)).toBe(true);
    expect(processLoginKey('p', c)).toBe(true);
    expect(echoed).toEqual(['s', 'p']);
    expect(processLoginKey('\r', c)).toBe(true);
    expect(emitted).toEqual([['check-username', { username: 'sp' }]]);
    expect(c.state.current).toBe('checking-username');
    expect(echoed[2]).toBe('\r\n');
  });
  it('backspace erases with the \\b \\b idiom and never underflows', () => {
    const { c, echoed } = ctx('username');
    processLoginKey('a', c);
    processLoginKey('\x7f', c);
    processLoginKey('\x7f', c);
    expect(c.username.current).toBe('');
    expect(echoed).toEqual(['a', '\b \b']);
  });
  it('password entry masks with * unless passwordMode says otherwise, and logs in on Enter', () => {
    const { c, emitted, echoed } = ctx('password');
    c.username.current = 'sp';
    processLoginKey('x', c);
    expect(echoed).toEqual(['*']);
    processLoginKey('\r', c);
    expect(emitted).toEqual([['login', { username: 'sp', password: 'x' }]]);
    expect(c.state.current).toBe('logging-in');
  });
  it('keys are swallowed while the BBS is checking or logging in', () => {
    const { c, emitted, echoed } = ctx('checking-username');
    expect(processLoginKey('a', c)).toBe(true);
    expect(emitted).toEqual([]);
    expect(echoed).toEqual([]);
  });
  it('new-user prompt: R retries as username, C continues as new user, Enter sends empty', () => {
    const r = ctx('new-user-prompt');
    r.c.newUserPromptUsername.current = 'newbie';
    processLoginKey('r', r.c);
    expect(r.emitted).toEqual([['new-user-response', { response: 'R', username: 'newbie' }]]);
    r.runDeferred();
    expect(r.c.state.current).toBe('username');
    const k = ctx('new-user-prompt');
    processLoginKey('C', k.c);
    k.runDeferred();
    expect(k.c.state.current).toBe('registering');
  });
  it('new-user prompt: Enter echoes a newline, sends the empty response and moves to registering', () => {
    const { c, emitted, echoed, runDeferred } = ctx('new-user-prompt');
    c.newUserPromptUsername.current = 'newbie';
    expect(processLoginKey('\r', c)).toBe(true);
    expect(echoed).toEqual(['\r\n']);
    expect(emitted).toEqual([['new-user-response', { response: '', username: 'newbie' }]]);
    expect(c.state.current).toBe('new-user-prompt'); // deferred so onData still skips this keystroke
    runDeferred();
    expect(c.state.current).toBe('registering');
  });
  it('new-user prompt: any other key only prints the retry message, sends nothing', () => {
    const { c, emitted, echoed } = ctx('new-user-prompt');
    expect(processLoginKey('z', c)).toBe(true);
    expect(emitted).toEqual([]);
    expect(echoed).toEqual(['\r\n\x1b[33mPress R to retry or C to continue as a new user\x1b[0m\r\n']);
    expect(c.state.current).toBe('new-user-prompt');
  });
  it('password entry echoes the real character when passwordMode is on (unmasked)', () => {
    const { c, echoed } = ctx('password');
    c.passwordMode.current = true;
    processLoginKey('x', c);
    processLoginKey('y', c);
    expect(echoed).toEqual(['x', 'y']);
    expect(c.password.current).toBe('xy');
  });
  it('password reset echoes plainly by default and masks while passwordMode is on', () => {
    const plain = ctx('password-reset');
    processLoginKey('a', plain.c);
    expect(plain.echoed).toEqual(['a']); // express.e:29152 - the reset prompt asks for a code, not a secret
    const masked = ctx('password-reset');
    masked.c.passwordMode.current = true;
    processLoginKey('a', masked.c);
    expect(masked.echoed).toEqual(['*']);
    processLoginKey('\r', masked.c);
    expect(masked.emitted).toEqual([['password-reset-input', { input: 'a' }]]);
    expect(masked.c.passwordResetInput.current).toBe(''); // cleared for the next prompt in the flow
    expect(masked.c.state.current).toBe('password-reset'); // the backend drives the next state
  });
  it('forced password change always masks, whatever passwordMode says', () => {
    const { c, emitted, echoed } = ctx('forced-pwd-change');
    c.passwordMode.current = true; // express.e:29785 - never echoed either way
    processLoginKey('n', c);
    processLoginKey('u', c);
    expect(echoed).toEqual(['*', '*']);
    processLoginKey('\r', c);
    expect(emitted).toEqual([['forced-pwd-change-input', { input: 'nu' }]]);
    expect(c.forcedPwdChangeInput.current).toBe('');
  });
  it('is not a login key once logged in (returns false, touches nothing)', () => {
    const { c, emitted, echoed } = ctx('loggedin');
    expect(processLoginKey('x', c)).toBe(false);
    expect(emitted).toEqual([]);
    expect(echoed).toEqual([]);
  });
});
