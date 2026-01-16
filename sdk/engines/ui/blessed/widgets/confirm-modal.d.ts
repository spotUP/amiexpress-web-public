/**
 * ConfirmModal - Generic confirmation dialog
 *
 * A reusable modal with:
 * - Customizable title and message
 * - Scrollable message content
 * - Two action buttons (confirm/cancel)
 * - Tab navigation between buttons
 * - ESC to cancel
 * - Overlay dimming support
 * - Responsive mobile layout
 */
import { Box } from './box';
import type { ElementOptions } from '../core/types';
import type { ResponsiveState } from '../core/responsive-mixin';
import type { BreakpointName } from '../core/responsive-constants';
export interface ConfirmModalOptions extends ElementOptions {
    /** Dialog title */
    title?: string;
    /** Message content (supports tags) */
    message?: string;
    /** Confirm button text (default: "Confirm") */
    confirmText?: string;
    /** Cancel button text (default: "Cancel") */
    cancelText?: string;
    /** Confirm button color (default: "green") */
    confirmColor?: string;
    /** Cancel button color (default: "red") */
    cancelColor?: string;
    /** Border color (default: "cyan") */
    borderColor?: string;
    /** Enable overlay dimming (default: true) */
    overlay?: boolean;
    /** Overlay opacity (default: 0.5) */
    overlayOpacity?: number;
    /** Callback on confirm */
    onConfirm?: () => void;
    /** Callback on cancel */
    onCancel?: () => void;
    /** Show only confirm button (no cancel) */
    singleButton?: boolean;
}
export declare class ConfirmModal extends Box {
    private _overlay?;
    private _messageBox;
    private _confirmButton;
    private _cancelButton?;
    private _responsiveCleanup?;
    private _trapCleanup?;
    private _onConfirm?;
    private _onCancel?;
    private _isMobileMode;
    private _singleButton;
    constructor(options?: ConfirmModalOptions);
    private _setupEventHandlers;
    private _handleConfirm;
    private _handleCancel;
    /**
     * Show the modal
     */
    display(): void;
    /**
     * Hide the modal
     */
    hide(): void;
    /**
     * Set message content
     */
    setMessage(message: string): void;
    /**
     * Set title
     */
    setTitle(title: string): void;
    /**
     * Set confirm callback
     */
    onConfirm(callback: () => void): void;
    /**
     * Set cancel callback
     */
    onCancel(callback: () => void): void;
    /**
     * Override destroy
     */
    destroy(): void;
    protected _handleBreakpointChange(breakpoint: BreakpointName, previousBreakpoint: BreakpointName, state: ResponsiveState): void;
    protected _enterMobileMode(): void;
    protected _exitMobileMode(): void;
    private _setMobileLayout;
    private _setDesktopLayout;
}
/**
 * Factory function
 */
export declare function confirmModal(options?: ConfirmModalOptions): ConfirmModal;
