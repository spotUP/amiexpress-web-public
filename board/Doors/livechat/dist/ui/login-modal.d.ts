/**
 * Login Modal for ChatOnly Mode - uses SDK LoginModal widget
 */
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { LoginCredentials } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
export { LoginCredentials };
export interface LoginModalOptions {
    screen: Screen;
    onSubmit: (credentials: LoginCredentials) => void;
    onError?: (message: string) => void;
}
export declare class LoginModal {
    private modal;
    private onError?;
    constructor(options: LoginModalOptions);
    showError(message: string): void;
    hideError(): void;
    show(): void;
    hide(): void;
    destroy(): void;
    clearInputs(): void;
}
export declare function createLoginModal(options: LoginModalOptions): LoginModal;
