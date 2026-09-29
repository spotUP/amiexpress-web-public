/**
 * The browser's password manager, through the board's own login prompts.
 *
 * The login is the SERVER's text in an xterm canvas, so a password manager
 * has no field to fill. The Credential Management API (Chrome, Edge) needs
 * none: it hands back a saved name and password, and this types them into
 * the prompts exactly as the caller would - the original login stays the
 * only login (the server retired its credential arm on purpose, TP-9b).
 *
 * Cues, all already sent by the server:
 *   `prompt-login`  the name prompt is on screen
 *   `mask-input`    (true) the password prompt follows; the server set the
 *                   phase before it emitted, so the answer can go at once
 *   `login-success` / `login-failed`
 *
 * One fill per connection: a wrong saved password re-prompts, and answering
 * that too would feed the server's attempt counter and the IP ban.
 */

export interface SavedCredential {
  id: string;
  password: string;
}

/** The slice of the Credential Management API this needs. */
export interface CredentialStore {
  get(): Promise<SavedCredential | null>;
  save(credential: SavedCredential): Promise<void>;
  /** Stop the browser signing this site in without being asked. */
  forgetSilentAccess(): Promise<void>;
}

type PasswordCredentialCtor = new (init: { id: string; password: string }) => Credential;

export function browserCredentialStore(): CredentialStore | null {
  if (typeof window === 'undefined' || !window.isSecureContext) return null;
  const Ctor = (window as unknown as { PasswordCredential?: PasswordCredentialCtor }).PasswordCredential;
  const container = navigator.credentials;
  if (!Ctor || !container) return null;
  return {
    async get() {
      const found = (await container.get({ password: true, mediation: 'optional' } as CredentialRequestOptions)) as
        | (Credential & { password?: string })
        | null;
      return found && found.password ? { id: found.id, password: found.password } : null;
    },
    async save(credential) {
      await container.store(new Ctor(credential));
    },
    async forgetSilentAccess() {
      await container.preventSilentAccess();
    },
  };
}

export interface LoginCredentials {
  onPromptLogin(): void;
  onMaskInput(masked: boolean): void;
  /** Every keystroke the caller types; the fill itself does not pass through here. */
  onTyped(data: string): void;
  onLoginSuccess(): void;
  onLoginFailed(): void;
  /** A new connection may fill once more. */
  onConnect(): void;
}

export function createLoginCredentials(
  send: (line: string) => void,
  store: CredentialStore | null = browserCredentialStore()
): LoginCredentials {
  let filled = false;
  let awaiting: 'none' | 'name' | 'password' = 'none';
  let filling: string | null = null; // the password to send at the password prompt
  let typedName = '';
  let typedPassword = '';
  let line = '';
  let capturing: 'name' | 'password' | 'none' = 'none';

  const reset = () => {
    awaiting = 'none';
    filling = null;
  };

  return {
    onConnect() {
      filled = false;
      reset();
      capturing = 'none';
      typedName = typedPassword = line = '';
    },

    onPromptLogin() {
      capturing = 'name';
      line = '';
      if (filled || !store) return;
      filled = true;
      awaiting = 'name';
      store
        .get()
        .then((saved) => {
          if (!saved || awaiting !== 'name') return reset();
          filling = saved.password;
          awaiting = 'password';
          capturing = 'none';
          send(`${saved.id}\r`);
        })
        .catch(reset);
    },

    onMaskInput(masked) {
      if (!masked) return;
      if (awaiting === 'password' && filling !== null) {
        const password = filling;
        reset();
        capturing = 'none';
        send(`${password}\r`);
        return;
      }
      capturing = 'password';
      line = '';
    },

    onTyped(data) {
      if (capturing === 'none') return;
      for (const ch of data) {
        if (ch === '\r' || ch === '\n') {
          if (capturing === 'name') typedName = line;
          else typedPassword = line;
          line = '';
          capturing = 'none';
        } else if (ch === '\x7f' || ch === '\b') {
          line = line.slice(0, -1);
        } else if (ch >= ' ') {
          line += ch;
        }
      }
    },

    onLoginSuccess() {
      // Offer to keep what was TYPED. A filled login is already saved.
      if (store && typedName && typedPassword) {
        store.save({ id: typedName, password: typedPassword }).catch(() => undefined);
      }
      typedName = typedPassword = '';
      reset();
    },

    onLoginFailed() {
      typedName = typedPassword = '';
      reset();
      store?.forgetSilentAccess().catch(() => undefined);
    },
  };
}
