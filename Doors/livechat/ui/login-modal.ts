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
      trapFocus: true,
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
        focus: { fg: 'white', bg: 'lightblue' },
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
        focus: { fg: 'white', bg: 'lightblue' },
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
        focus: { fg: 'white', bg: 'lightblue' },
        hover: { fg: 'white', bg: 'lightblue' },
      },
    });

    // Setup event handlers
    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    // Login button click - both press and click events
    this.loginButton.on('press', () => {
      this.handleSubmit();
    });

    this.loginButton.on('click', () => {
      this.handleSubmit();
    });

    // Enter key handling on focused fields
    this.usernameInput.key(['enter', 'return'], () => {
      this.passwordInput.focus();
      this.screen.render();
      return true;
    });

    this.passwordInput.key(['enter', 'return'], () => {
      this.handleSubmit();
      return true;
    });

    this.loginButton.key(['enter', 'return'], () => {
      this.handleSubmit();
      return true;
    });

    // ESC key to clear
    this.modalBox.key(['escape'], () => {
      this.usernameInput.clearValue();
      this.passwordInput.clearValue();
      this.usernameInput.focus();
      this.hideError();
      this.screen.render();
    });

    // Tab to switch between fields
    this.usernameInput.key(['tab'], () => {
      this.passwordInput.focus();
      this.screen.render();
      return true;
    });

    this.passwordInput.key(['tab'], () => {
      this.loginButton.focus();
      this.screen.render();
      return true;
    });

    this.loginButton.key(['tab'], () => {
      this.usernameInput.focus();
      this.screen.render();
      return true;
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
    this.modalBackground.show();
    this.modalBox.show();
    this.usernameInput.focus();
    this.screen.render();
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
