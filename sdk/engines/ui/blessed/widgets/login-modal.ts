/**
 * LoginModal - Username/password login dialog
 *
 * Features:
 * - Username and password fields
 * - Password masking (asterisks)
 * - Error message display
 * - Tab navigation between fields
 * - Enter to submit, Escape to cancel
 * - Overlay support for dimming
 * - Responsive mobile layout
 * - Proper click-to-focus on inputs
 */

import { Box } from './box';
import { Textbox } from './textbox';
import { Button } from './button';
import { Overlay } from './overlay';
import { makeModalResponsive, trapModalInput } from '../utils/modal-helpers';
import type { ElementOptions } from '../core/types';
import type { ResponsiveState } from '../core/responsive-mixin';
import type { BreakpointName } from '../core/responsive-constants';
import { calculateDialogWidth, MIN_TOUCH_HEIGHT, BREAKPOINT_XS } from '../core/responsive-constants';

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface LoginModalOptions extends ElementOptions {
  /** Dialog title (default: "Login") */
  title?: string;
  /** Enable overlay dimming (default: true) */
  overlay?: boolean;
  /** Overlay opacity (default: 0.5) */
  overlayOpacity?: number;
  /** Username field label (default: "Username:") */
  usernameLabel?: string;
  /** Password field label (default: "Password:") */
  passwordLabel?: string;
  /** Login button text (default: "Login") */
  loginButtonText?: string;
  /** Initial username value */
  username?: string;
  /** Callback on successful submit */
  onSubmit?: (credentials: LoginCredentials) => void;
  /** Callback on cancel */
  onCancel?: () => void;
}

export class LoginModal extends Box {
  private _overlay?: Overlay;
  private _usernameLabel: Box;
  private _usernameInput: Textbox;
  private _passwordLabel: Box;
  private _passwordInput: Textbox;
  private _loginButton: Button;
  private _errorBox: Box;
  private _responsiveCleanup?: () => void;
  private _trapCleanup?: () => void;
  private _tabCleanup?: () => void;
  private _onSubmit?: (credentials: LoginCredentials) => void;
  private _onCancel?: () => void;
  private _isMobileMode: boolean = false;

  constructor(options: LoginModalOptions = {}) {
    const originalParent = options.parent;
    const useOverlay = options.overlay !== false;

    super({
      ...options,
      parent: useOverlay ? undefined : originalParent,
      top: 'center',
      left: 'center',
      width: options.width || 50,
      height: options.height || 16,
      label: ` ${options.title || 'Login'} `,
      border: options.border || { type: 'line', fg: 'cyan' },
      shadow: true,
      hidden: true,
      mouse: true,
      keys: true,
      trapFocus: true,
      ch: ' ',
      style: {
        fg: 'white',
        bg: 'black',
        border: { fg: 'cyan' },
        ...options.style,
      },
    });

    this._onSubmit = options.onSubmit;
    this._onCancel = options.onCancel;

    // Create overlay if enabled
    if (useOverlay && originalParent) {
      this._overlay = new Overlay({
        parent: originalParent,
        opacity: options.overlayOpacity ?? 0.5,
        hidden: true,
      });
      this._overlay.append(this);
    }

    // Error message box (hidden by default)
    this._errorBox = new Box({
      parent: this,
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
    this._usernameLabel = new Box({
      parent: this,
      top: 3,
      left: 2,
      width: 12,
      height: 1,
      content: options.usernameLabel || 'Username:',
      style: { fg: 'white', bg: 'black' },
    });

    // Username input
    this._usernameInput = new Textbox({
      parent: this,
      top: 4,
      left: 2,
      right: 2,
      height: 3,
      border: { type: 'line', fg: 'blue' },
      inputOnFocus: true,
      mouse: true,
      keys: true,
      clickable: true,
      focusable: true,
      value: options.username || '',
      style: {
        fg: 'white',
        bg: 'blue',
        border: { fg: 'blue' },
        focus: { bg: 'lightblue' },
      } as any,
    });

    // Password label
    this._passwordLabel = new Box({
      parent: this,
      top: 7,
      left: 2,
      width: 12,
      height: 1,
      content: options.passwordLabel || 'Password:',
      style: { fg: 'white', bg: 'black' },
    });

    // Password input (censored)
    this._passwordInput = new Textbox({
      parent: this,
      top: 8,
      left: 2,
      right: 2,
      height: 3,
      border: { type: 'line', fg: 'blue' },
      inputOnFocus: true,
      mouse: true,
      keys: true,
      clickable: true,
      focusable: true,
      censor: true,
      style: {
        fg: 'white',
        bg: 'blue',
        border: { fg: 'blue' },
        focus: { bg: 'lightblue' },
      } as any,
    });

    // Login button
    this._loginButton = new Button({
      parent: this,
      bottom: 1,
      left: 'center',
      width: 14,
      height: 3,
      content: options.loginButtonText || '[ Login ]',
      align: 'center',
      valign: 'middle',
      border: { type: 'line' },
      mouse: true,
      clickable: true,
      focusable: true,
      style: {
        fg: 'white',
        bg: 'green',
        border: { fg: 'green' },
        hover: { bg: 'lightgreen', fg: 'black' },
        focus: { bg: 'lightgreen', fg: 'black' },
      } as any,
    });

    this._setupEventHandlers();
  }

  private _setupEventHandlers(): void {
    // Click to focus inputs
    this._usernameInput.on('click', () => {
      this._usernameInput.focus();
      this.screen?.render();
    });

    this._passwordInput.on('click', () => {
      this._passwordInput.focus();
      this.screen?.render();
    });

    // Login button press
    this._loginButton.on('press', () => {
      this._handleSubmit();
    });

    this._loginButton.on('click', () => {
      this._handleSubmit();
    });

    // Enter is handled by the TEXTBOX, which consumes it and emits 'submit'
    // (see Textbox._onKeypress, case 'enter'). Binding .key(['enter']) here
    // looked right and did nothing at all: measured, Enter in the username
    // did not move focus, and Enter in the password did not submit - the
    // form simply swallowed both, which is what "Enter clears the form"
    // looked like from the outside.
    this._usernameInput.on('submit', () => {
      this._passwordInput.focus();
      this.screen?.render();
    });

    this._passwordInput.on('submit', () => {
      this._handleSubmit();
    });

    // Enter on button submits
    this._loginButton.key(['enter', 'return'], () => {
      this._handleSubmit();
      return true;
    });

    // Tab is owned by the SCREEN, which runs focusNext() over every
    // focusable child unless a widget marks the key handled - and these
    // per-element .key(['tab']) bindings never did. So Tab walked whatever
    // happened to be next in the screen's focus list rather than the three
    // fields, which is why "username tab password tab enter" ended up
    // somewhere that did nothing. The modal claims Tab for itself while it
    // is displayed instead; see _installTabOrder().

    // Escape to cancel/clear
    this.key(['escape'], () => {
      if (this._onCancel) {
        this._onCancel();
      }
      this.emit('cancel');
    });
  }

  /**
   * Claim Tab and Shift+Tab while the modal is up, so focus walks
   * username -> password -> Login and back, and nothing outside the modal
   * can be reached by keyboard.
   */
  private _installTabOrder(): void {
    if (this._tabCleanup || !this.screen) return;

    const order = [this._usernameInput, this._passwordInput, this._loginButton];

    const onKey = (_ch: unknown, key: { name?: string; shift?: boolean }) => {
      if (key?.name !== 'tab') return;
      if (this.hidden) return;

      const current = order.findIndex(el => el.focused);
      const step = key.shift ? -1 : 1;
      const next = order[(Math.max(0, current) + step + order.length) % order.length];

      next.focus();
      this.screen?.render();
    };

    const screen = this.screen as unknown as {
      on: (event: string, handler: typeof onKey) => void;
      off?: (event: string, handler: typeof onKey) => void;
      removeListener?: (event: string, handler: typeof onKey) => void;
    };

    screen.on('keypress', onKey);
    this._tabCleanup = () => {
      screen.off?.('keypress', onKey);
      screen.removeListener?.('keypress', onKey);
    };
  }

  private _handleSubmit(): void {
    const username = this._usernameInput.getValue().trim();
    const password = this._passwordInput.getValue();

    if (!username) {
      this.showError('Please enter a username');
      this._usernameInput.focus();
      return;
    }

    if (!password) {
      this.showError('Please enter a password');
      this._passwordInput.focus();
      return;
    }

    this.hideError();
    const credentials = { username, password };

    if (this._onSubmit) {
      this._onSubmit(credentials);
    }
    this.emit('submit', credentials);
  }

  /**
   * Show the login modal
   */
  display(): void {
    // Show overlay first if present
    if (this._overlay) {
      this._overlay.show();
    }

    // Enable responsive centering
    if (!this._responsiveCleanup) {
      this._responsiveCleanup = makeModalResponsive(this);
    }

    // Trap input within modal
    if (this.screen) {
      this.screen.saveFocus?.();
      this.screen.focusPush?.(this);
      if (!this._trapCleanup) {
        this._trapCleanup = trapModalInput(this);
      }
      this._installTabOrder();
    }

    this.show();
    this.setFront();
    this._usernameInput.focus();
    this.screen?.render();
  }

  /**
   * Hide the modal
   */
  hide(): void {
    super.hide();
    if (this._overlay) {
      this._overlay.hide();
    }

    // Restore focus state
    if (this.screen) {
      this.screen.restoreFocus?.();
    }

    // Cleanup trap handlers
    if (this._trapCleanup) {
      this._trapCleanup();
      this._trapCleanup = undefined;
    }
  }

  /**
   * Show error message
   */
  showError(message: string): void {
    this._errorBox.setContent(`{red-fg}{bold}Error:{/bold} ${message}{/red-fg}`);
    this._errorBox.show();
    this.screen?.render();
  }

  /**
   * Hide error message
   */
  hideError(): void {
    this._errorBox.hide();
    this.screen?.render();
  }

  /**
   * Clear all inputs
   */
  clearInputs(): void {
    this._usernameInput.clearValue();
    this._passwordInput.clearValue();
    this.hideError();
  }

  /**
   * Set username value
   */
  setUsername(value: string): void {
    this._usernameInput.setValue(value);
  }

  /**
   * Get username value
   */
  getUsername(): string {
    return this._usernameInput.getValue();
  }

  /**
   * Set password value
   */
  setPassword(value: string): void {
    this._passwordInput.setValue(value);
  }

  /**
   * Get password value
   */
  getPassword(): string {
    return this._passwordInput.getValue();
  }

  /**
   * Set submit callback
   */
  onSubmit(callback: (credentials: LoginCredentials) => void): void {
    this._onSubmit = callback;
  }

  /**
   * Set cancel callback
   */
  onCancel(callback: () => void): void {
    this._onCancel = callback;
  }

  /**
   * Override destroy
   */
  destroy(): void {
    if (this._responsiveCleanup) {
      this._responsiveCleanup();
      this._responsiveCleanup = undefined;
    }
    if (this._trapCleanup) {
      this._trapCleanup();
      this._trapCleanup = undefined;
    }
    if (this._tabCleanup) {
      this._tabCleanup();
      this._tabCleanup = undefined;
    }
    super.destroy();
  }

  // ============================================================================
  // Responsive Lifecycle Hooks
  // ============================================================================

  protected _handleBreakpointChange(
    breakpoint: BreakpointName,
    previousBreakpoint: BreakpointName,
    state: ResponsiveState
  ): void {
    super._handleBreakpointChange?.(breakpoint, previousBreakpoint, state);
    if (state.isMobile || breakpoint === 'xs') {
      this._setMobileLayout();
    } else {
      this._setDesktopLayout();
    }
    this.emit('breakpoint-change', breakpoint, previousBreakpoint);
  }

  protected _enterMobileMode(): void {
    this._setMobileLayout();
    this.emit('enter-mobile');
  }

  protected _exitMobileMode(): void {
    this._setDesktopLayout();
    this.emit('exit-mobile');
  }

  private _setMobileLayout(): void {
    if (!this.screen) return;
    this._isMobileMode = true;

    const screenWidth = this.screen.width as number;
    this.width = calculateDialogWidth(screenWidth);

    // Larger touch-friendly button
    this._loginButton.width = 18;
    this._loginButton.height = MIN_TOUCH_HEIGHT;

    this.screen?.render();
  }

  private _setDesktopLayout(): void {
    this._isMobileMode = false;
    this.width = 50;

    // Restore desktop button size
    this._loginButton.width = 14;
    this._loginButton.height = 3;

    this.screen?.render();
  }
}

/**
 * Factory function
 */
export function loginModal(options?: LoginModalOptions): LoginModal {
  return new LoginModal(options);
}
