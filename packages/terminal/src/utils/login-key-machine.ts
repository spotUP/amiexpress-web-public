/**
 * The web login state machine, as a pure function.
 *
 * Extracted from BBSTerminal.tsx's term.onKey handler (BBSTerminal.tsx:2873-3009)
 * so that desktop keys, the on-screen keyboard and the PETSCII canvas all
 * drive ONE implementation, and so the echo goes through a surface-agnostic
 * `echo` (xterm write, or transducer -> canvas) instead of a hard-wired
 * term.write.
 *
 * term.onKey is the richer of the two existing copies. The injectInput
 * duplicate (BBSTerminal.tsx:793-887) diverges only in the new-user-prompt
 * branch: it treats any single character as a raw response (echoing
 * `data + '\r\n'` and sending it verbatim) instead of the R/C-specific
 * handling below - this extraction follows term.onKey per the task brief.
 *
 * Returns true when the key belonged to the login flow (consumed, possibly
 * swallowed); false means "not a login key" and the caller sends it to the
 * server as ordinary command input. In state 'waiting' and 'registering'
 * (and 'loggedin') term.onKey falls through without a `return` inside any
 * branch, i.e. does nothing - equivalent to returning false here, since
 * Task 8 sends unconsumed keys on to the server as command input.
 */
export type LoginState =
  | 'waiting' | 'username' | 'password' | 'new-user-prompt' | 'registering'
  | 'loggedin' | 'checking-username' | 'logging-in' | 'password-reset' | 'forced-pwd-change';

export interface LoginKeyContext {
  state: { current: LoginState };
  username: { current: string };
  password: { current: string };
  newUserPromptUsername: { current: string };
  passwordResetInput: { current: string };
  forcedPwdChangeInput: { current: string };
  passwordMode: { current: boolean };
  emit(event: string, payload?: unknown): void;
  echo(text: string): void;
  /** Runs fn after the current keystroke's other listeners (setTimeout 0 in the component). */
  defer(fn: () => void): void;
  log?(message: string): void;
}

const isEnter = (k: string) => k === '\r' || k === '\n';
const isBackspace = (k: string) => k === '\x7f' || k === '\b';
const isPrintable = (k: string) => k.length === 1 && k >= ' ';

function lineField(key: string, field: { current: string }, ctx: LoginKeyContext, mask: boolean): 'submit' | 'handled' {
  if (isEnter(key)) return 'submit';
  if (isBackspace(key)) {
    if (field.current.length > 0) { field.current = field.current.slice(0, -1); ctx.echo('\b \b'); }
    return 'handled';
  }
  if (isPrintable(key)) { field.current += key; ctx.echo(mask ? '*' : key); }
  return 'handled';
}

export function processLoginKey(key: string, ctx: LoginKeyContext): boolean {
  const s = ctx.state.current;

  if (s === 'checking-username' || s === 'logging-in') return true; // BBS is busy: swallow

  if (s === 'username') {
    if (lineField(key, ctx.username, ctx, false) === 'submit') {
      ctx.log?.('Username entered: ' + ctx.username.current);
      ctx.emit('check-username', { username: ctx.username.current });
      ctx.state.current = 'checking-username';
      ctx.echo('\r\n');
    }
    return true;
  }

  if (s === 'password') {
    if (lineField(key, ctx.password, ctx, !ctx.passwordMode.current) === 'submit') {
      ctx.log?.('Password entered, sending login');
      ctx.emit('login', { username: ctx.username.current, password: ctx.password.current });
      ctx.state.current = 'logging-in';
      ctx.echo('\r\n');
    }
    return true;
  }

  if (s === 'password-reset') { // express.e:29152-29213
    if (lineField(key, ctx.passwordResetInput, ctx, ctx.passwordMode.current) === 'submit') {
      ctx.emit('password-reset-input', { input: ctx.passwordResetInput.current });
      ctx.echo('\r\n');
      ctx.passwordResetInput.current = '';
    }
    return true;
  }

  if (s === 'forced-pwd-change') { // express.e:29785-29845 - always masked
    if (lineField(key, ctx.forcedPwdChangeInput, ctx, true) === 'submit') {
      ctx.emit('forced-pwd-change-input', { input: ctx.forcedPwdChangeInput.current });
      ctx.echo('\r\n');
      ctx.forcedPwdChangeInput.current = '';
    }
    return true;
  }

  if (s === 'new-user-prompt') {
    const promptUser = ctx.newUserPromptUsername.current || ctx.username.current || '';
    const send = (response: string) => ctx.emit('new-user-response', { response, username: promptUser });
    if (isEnter(key)) {
      ctx.echo('\r\n');
      send('');
      ctx.defer(() => { ctx.state.current = 'registering'; });
      return true;
    }
    const lower = key.toLowerCase();
    if (lower === 'c') {
      ctx.echo('C'); // express.e:6845 lineInput echoes the char; the backend adds the newline with the next prompt
      send('C');
      ctx.defer(() => { ctx.state.current = 'registering'; });
    } else if (lower === 'r') {
      ctx.echo('R');
      send('R');
      ctx.defer(() => { ctx.state.current = 'username'; });
      ctx.username.current = '';
      ctx.password.current = '';
    } else {
      ctx.echo('\r\n\x1b[33mPress R to retry or C to continue as a new user\x1b[0m\r\n');
    }
    return true;
  }

  return false; // waiting / registering / loggedin: not a login key
}
