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
import { calculateDialogWidth, MIN_TOUCH_HEIGHT } from '../core/responsive-constants';
export class LoginModal extends Box {
    constructor(options = {}) {
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
        this._isMobileMode = false;
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
            },
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
            },
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
            },
        });
        this._setupEventHandlers();
    }
    _setupEventHandlers() {
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
        // Enter in username moves to password
        this._usernameInput.key(['enter', 'return'], () => {
            this._passwordInput.focus();
            this.screen?.render();
            return true;
        });
        // Enter in password submits
        this._passwordInput.key(['enter', 'return'], () => {
            this._handleSubmit();
            return true;
        });
        // Enter on button submits
        this._loginButton.key(['enter', 'return'], () => {
            this._handleSubmit();
            return true;
        });
        // Tab navigation
        this._usernameInput.key(['tab'], () => {
            this._passwordInput.focus();
            this.screen?.render();
            return true;
        });
        this._passwordInput.key(['tab'], () => {
            this._loginButton.focus();
            this.screen?.render();
            return true;
        });
        this._loginButton.key(['tab'], () => {
            this._usernameInput.focus();
            this.screen?.render();
            return true;
        });
        // Escape to cancel/clear
        this.key(['escape'], () => {
            if (this._onCancel) {
                this._onCancel();
            }
            this.emit('cancel');
        });
    }
    _handleSubmit() {
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
    display() {
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
        }
        this.show();
        this.setFront();
        this._usernameInput.focus();
        this.screen?.render();
    }
    /**
     * Hide the modal
     */
    hide() {
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
    showError(message) {
        this._errorBox.setContent(`{red-fg}{bold}Error:{/bold} ${message}{/red-fg}`);
        this._errorBox.show();
        this.screen?.render();
    }
    /**
     * Hide error message
     */
    hideError() {
        this._errorBox.hide();
        this.screen?.render();
    }
    /**
     * Clear all inputs
     */
    clearInputs() {
        this._usernameInput.clearValue();
        this._passwordInput.clearValue();
        this.hideError();
    }
    /**
     * Set username value
     */
    setUsername(value) {
        this._usernameInput.setValue(value);
    }
    /**
     * Get username value
     */
    getUsername() {
        return this._usernameInput.getValue();
    }
    /**
     * Set password value
     */
    setPassword(value) {
        this._passwordInput.setValue(value);
    }
    /**
     * Get password value
     */
    getPassword() {
        return this._passwordInput.getValue();
    }
    /**
     * Set submit callback
     */
    onSubmit(callback) {
        this._onSubmit = callback;
    }
    /**
     * Set cancel callback
     */
    onCancel(callback) {
        this._onCancel = callback;
    }
    /**
     * Override destroy
     */
    destroy() {
        if (this._responsiveCleanup) {
            this._responsiveCleanup();
            this._responsiveCleanup = undefined;
        }
        if (this._trapCleanup) {
            this._trapCleanup();
            this._trapCleanup = undefined;
        }
        super.destroy();
    }
    // ============================================================================
    // Responsive Lifecycle Hooks
    // ============================================================================
    _handleBreakpointChange(breakpoint, previousBreakpoint, state) {
        super._handleBreakpointChange?.(breakpoint, previousBreakpoint, state);
        if (state.isMobile || breakpoint === 'xs') {
            this._setMobileLayout();
        }
        else {
            this._setDesktopLayout();
        }
        this.emit('breakpoint-change', breakpoint, previousBreakpoint);
    }
    _enterMobileMode() {
        this._setMobileLayout();
        this.emit('enter-mobile');
    }
    _exitMobileMode() {
        this._setDesktopLayout();
        this.emit('exit-mobile');
    }
    _setMobileLayout() {
        if (!this.screen)
            return;
        this._isMobileMode = true;
        const screenWidth = this.screen.width;
        this.width = calculateDialogWidth(screenWidth);
        // Larger touch-friendly button
        this._loginButton.width = 18;
        this._loginButton.height = MIN_TOUCH_HEIGHT;
        this.screen?.render();
    }
    _setDesktopLayout() {
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
export function loginModal(options) {
    return new LoginModal(options);
}
