/**
 * Disconnection Modal for ChatOnly Mode - uses SDK ConfirmModal widget
 */
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
export interface DisconnectionModalOptions {
    screen: Screen;
    onRetry: () => void;
    onCancel: () => void;
}
export declare class DisconnectionModal {
    private modal;
    constructor(options: DisconnectionModalOptions);
    showError(message: string): void;
    show(): void;
    hide(): void;
    destroy(): void;
}
export declare function createDisconnectionModal(options: DisconnectionModalOptions): DisconnectionModal;
