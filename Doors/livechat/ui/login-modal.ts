/**
 * Login Modal for ChatOnly Mode
 * Provides a blessed modal interface for username/password entry
 */
import blessed, { Screen, Box, Textbox, Button } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createBox, createTextbox, createButton } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface LoginModalOptions {
  screen: Screen;
  onSubmit: (credentials: LoginCredentials) => void;
  onError?: (message: string) => void;
}

export class LoginModal {
  private modalBackground: Box;
  private modalBox: Box;
  private usernameInput: Textbox;
  private passwordInput: Textbox;
  private loginButton: Button;
  private errorBox: Box;
  private screen: Screen;
  private onSubmit: (credentials: LoginCredentials) => void;
  private onError?: (message: string) => void;

  constructor(options: LoginModalOptions) {
    this.screen = options.screen;
    this.onSubmit = options.onSubmit;
    this.onError = options.onError;

    // Modal background - full screen overlay
    this.modalBackground = createBox({
      parent: this.screen,
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      style: {
        bg: 'black',
        transparent: true,
      },
      // @ts-ignore - zIndex exists but not in types
      zIndex: 998,
    });

    // Modal box - centered
    this.modalBox = createBox({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: 50,
      height: 14,
      label: ' LiveChat Login ',
      border: { type: 'line', fg: 'cyan' },
      shadow: true,
      style: {
        fg: 'white',
        bg: 'black',
        border: { fg: 'cyan' },
      },
      // @ts-ignore - zIndex exists but not in types
      zIndex: 999,
    });

    // Error message box (hidden by default)
    this.errorBox = createBox({
      parent: this.modalBox,
      top: 1,
      left: 2,
      width: '100%-4',
      height: 2,
      hidden: true,
      tags: true,
      style: {
        fg: 'red',
        bg: 'black',
      },
    });

    // Username label
    createBox({
      parent: this.modalBox,
      top: 3,
      left: 2,
      width: 10,
      height: 1,
      content: 'Username:',
      style: { fg: 'white', bg: 'black' },
    });

    // Username input
    this.usernameInput = createTextbox({
      parent: this.modalBox,
      top: 4,
      left: 2,
      width: '100%-4',
      height: 1,
      inputOnFocus: true,
      mouse: true,
      keys: true,
      style: {
        fg: 'white',
        bg: 'blue',
        focus: { fg: 'white', bg: 'cyan' },
      },
    });

    // Password label
    createBox({
      parent: this.modalBox,
      top: 6,
      left: 2,
      width: 10,
      height: 1,
      content: 'Password:',
      style: { fg: 'white', bg: 'black' },
    });

    // Password input
    this.passwordInput = createTextbox({
      parent: this.modalBox,
      top: 7,
      left: 2,
      width: '100%-4',
      height: 1,
      inputOnFocus: true,
      mouse: true,
      keys: true,
      censor: true,  // Hide password with asterisks
      style: {
        fg: 'white',
        bg: 'blue',
        focus: { fg: 'white', bg: 'cyan' },
      },
    });

    // Login button (now properly focusable via SDK fix)
    this.loginButton = createButton({
      parent: this.modalBox,
      bottom: 1,
      left: 'center',
      width: 12,
      height: 3,
      content: ' Login ',
      align: 'center',
      style: {
        fg: 'white',
        bg: 'green',
        focus: { fg: 'black', bg: 'cyan' },
        hover: { fg: 'black', bg: 'cyan' },
      },
    });

    // Setup event handlers
    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    // Login button click - both press and click events
    this.loginButton.on('press', () => {
      console.log('[LoginModal] Button pressed');
      this.handleSubmit();
    });

    this.loginButton.on('click', () => {
      console.log('[LoginModal] Button clicked');
      this.handleSubmit();
    });

    // Intercept Enter key at screen level to prevent textarea clearing
    this.screen.key(['enter'], () => {
      // Use getFocused() method - there is no .focused property on Screen
      const focused = this.screen.getFocused();

      console.log('[LoginModal] Enter pressed, focused element:', focused?.constructor?.name);

      if (focused === this.usernameInput) {
        // Move to password field
        console.log('[LoginModal] Moving focus to password field');
        this.passwordInput.focus();
        this.screen.render();
        return false;
      } else if (focused === this.passwordInput) {
        // Submit form
        console.log('[LoginModal] Submitting from password field');
        this.handleSubmit();
        return false;
      } else if (focused === this.loginButton) {
        // Button pressed
        console.log('[LoginModal] Submitting from button');
        this.handleSubmit();
        return false;
      }
    });

    // ESC key to clear
    this.modalBox.key(['escape'], () => {
      this.usernameInput.clearValue();
      this.passwordInput.clearValue();
      this.usernameInput.focus();
      this.hideError();
      this.screen.render();
    });

    // Tab to switch between fields - MUST be at screen level because screen intercepts Tab
    this.screen.key(['tab'], () => {
      const focused = this.screen.getFocused();
      console.log('[LoginModal] Tab pressed, focused:', focused?.constructor?.name);

      if (focused === this.usernameInput) {
        console.log('[LoginModal] Moving focus from username to password');
        this.passwordInput.focus();
      } else if (focused === this.passwordInput) {
        console.log('[LoginModal] Moving focus from password to button');
        this.loginButton.focus();
      } else if (focused === this.loginButton) {
        console.log('[LoginModal] Moving focus from button to username');
        this.usernameInput.focus();
      }
      this.screen.render();
      return false; // Prevent default Tab handling
    });
  }

  private handleSubmit() {
    const username = this.usernameInput.getValue().trim();
    const password = this.passwordInput.getValue();

    if (!username) {
      this.showError('Please enter a username');
      this.usernameInput.focus();
      return;
    }

    if (!password) {
      this.showError('Please enter a password');
      this.passwordInput.focus();
      return;
    }

    this.hideError();
    this.onSubmit({ username, password });
  }

  public showError(message: string) {
    this.errorBox.setContent(`{red-fg}{bold}Error:{/bold} ${message}{/red-fg}`);
    this.errorBox.show();
    this.screen.render();

    if (this.onError) {
      this.onError(message);
    }
  }

  public hideError() {
    this.errorBox.hide();
    this.screen.render();
  }

  public show() {
    console.log('[LoginModal.show] Called');
    console.log('[LoginModal.show] usernameInput properties:', {
      // @ts-ignore
      type: this.usernameInput.type,
      // @ts-ignore
      focusable: this.usernameInput.options?.focusable,
      // @ts-ignore
      keys: this.usernameInput.options?.keys,
      // @ts-ignore
      mouse: this.usernameInput.options?.mouse,
      visible: this.usernameInput.visible,
      // @ts-ignore
      hidden: this.usernameInput.hidden,
    });

    console.log('[LoginModal.show] loginButton properties:', {
      // @ts-ignore
      type: this.loginButton.type,
      // @ts-ignore
      focusable: this.loginButton.options?.focusable,
      // @ts-ignore
      keys: this.loginButton.options?.keys,
      // @ts-ignore
      mouse: this.loginButton.options?.mouse,
      visible: this.loginButton.visible,
      // @ts-ignore
      hidden: this.loginButton.hidden,
    });

    this.modalBackground.show();
    this.modalBox.show();

    console.log('[LoginModal.show] About to call usernameInput.focus()');
    // @ts-ignore - access internal properties
    console.log('[LoginModal.show] usernameInput.options.focusable:', this.usernameInput.options?.focusable);
    // @ts-ignore
    console.log('[LoginModal.show] usernameInput.disabled:', this.usernameInput.disabled);
    // @ts-ignore
    console.log('[LoginModal.show] screen._focused BEFORE:', this.screen._focused);
    console.log('[LoginModal.show] screen.getFocused() BEFORE:', this.screen.getFocused());

    this.usernameInput.focus();

    // @ts-ignore
    console.log('[LoginModal.show] screen._focused AFTER focus():', this.screen._focused);
    console.log('[LoginModal.show] screen.getFocused() AFTER focus():', this.screen.getFocused());
    console.log('[LoginModal.show] usernameInput.focused:', this.usernameInput.focused);

    this.screen.render();

    // @ts-ignore
    console.log('[LoginModal.show] screen._focused AFTER render():', this.screen._focused);
    console.log('[LoginModal.show] screen.getFocused() AFTER render():', this.screen.getFocused());
  }

  public hide() {
    this.modalBackground.hide();
    this.modalBox.hide();
    this.screen.render();
  }

  public destroy() {
    this.modalBackground.destroy();
    this.modalBox.destroy();
  }

  public clearInputs() {
    this.usernameInput.clearValue();
    this.passwordInput.clearValue();
    this.hideError();
  }
}

export function createLoginModal(options: LoginModalOptions): LoginModal {
  return new LoginModal(options);
}
