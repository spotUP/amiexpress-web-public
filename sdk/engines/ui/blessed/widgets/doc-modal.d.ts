/**
 * DocModal - Documentation/Help modal widget
 *
 * A full-screen scrollable documentation overlay with:
 * - Optional bigtext header (hidden on mobile for space)
 * - Scrollable content area with navigation keys
 * - Footer with navigation hints
 * - Proper focus trapping and keyboard handling
 * - Responsive mobile support with touch gestures
 *
 * Navigation:
 * - Up/Down/j/k: Line scroll
 * - PageUp/PageDown/Left/Right/b/Space: Page scroll
 * - Home/End/g/G: Top/bottom
 * - ESC/Q/F1: Close
 * - Swipe up/down: Scroll (mobile)
 * - Tap anywhere: Close (mobile, optional)
 */
import { Box } from './box';
import { ScrollableText } from './scrollabletext';
import type { ElementOptions } from '../core/types';
import type { ResponsiveState } from '../core/responsive-mixin';
import type { BreakpointName } from '../core/responsive-constants';
export interface DocModalOptions extends ElementOptions {
    /** Modal title shown in border label */
    title?: string;
    /** Optional bigtext header (e.g., "HELP") - hidden on mobile */
    header?: string;
    /** Content to display (supports blessed tags) */
    content?: string;
    /** Footer hint text (default shows navigation keys) */
    footerText?: string;
    /** Mobile footer text (shorter for small screens) */
    mobileFooterText?: string;
    /** Additional close keys beyond ESC/Q/F1 */
    closeKeys?: string[];
    /** Callback when modal is closed */
    onClose?: () => void;
    /** Style for the header bigtext */
    headerStyle?: {
        fg?: string;
        bg?: string;
    };
    /** Style for the content area */
    contentStyle?: {
        fg?: string;
        bg?: string;
    };
    /** Style for the footer */
    footerStyle?: {
        fg?: string;
        bg?: string;
    };
    /** Enable tap-to-dismiss on mobile (default: true) */
    tapToDismiss?: boolean;
    /** Enable swipe gestures for scrolling (default: true) */
    swipeToScroll?: boolean;
}
export declare class DocModal extends Box {
    private _header;
    private _contentArea;
    private _footer;
    private _onClose?;
    private _closeKeys;
    private _isMobileMode;
    private _tapToDismiss;
    private _swipeToScroll;
    private _desktopFooterText;
    private _mobileFooterText;
    private _hasHeader;
    private _contentTopDesktop;
    private _swipeStartY;
    private _swipeStartTime;
    private _trapCleanup?;
    private _savedFocus?;
    constructor(options?: DocModalOptions);
    /**
     * Set up keyboard navigation and close handlers
     */
    private _setupKeyHandlers;
    /**
     * Set up touch/swipe handlers for mobile
     */
    private _setupTouchHandlers;
    /**
     * Show the modal
     */
    display(focusOnClose?: Box | any): void;
    /**
     * Invalidate coordinate cache for element and children
     */
    private _invalidateCache;
    /**
     * Handle resize - adjust layout for screen size
     */
    protected _handleResize(width: number, height: number, state: ResponsiveState): void;
    /**
     * Handle breakpoint change
     */
    protected _handleBreakpointChange(breakpoint: BreakpointName, previousBreakpoint: BreakpointName, state: ResponsiveState): void;
    /**
     * Called when entering mobile mode
     */
    protected _enterMobileMode(): void;
    /**
     * Called when exiting mobile mode
     */
    protected _exitMobileMode(): void;
    /**
     * Set mobile-friendly layout
     */
    private _setMobileLayout;
    /**
     * Set desktop layout
     */
    private _setDesktopLayout;
    /**
     * Set content
     */
    setContent(content: string): void;
    /**
     * Get content
     */
    getContent(): string;
    /**
     * Append content
     */
    appendContent(content: string): void;
    /**
     * Set title
     */
    setTitle(title: string): void;
    /**
     * Set header text (bigtext)
     */
    setHeader(text: string): void;
    /**
     * Set footer text (desktop)
     */
    setFooterText(text: string): void;
    /**
     * Set mobile footer text
     */
    setMobileFooterText(text: string): void;
    /**
     * Scroll to top
     */
    scrollToTop(): void;
    /**
     * Scroll to bottom
     */
    scrollToBottom(): void;
    /**
     * Get the content area element (for advanced customization)
     */
    getContentArea(): ScrollableText | null;
    /**
     * Set close callback
     */
    onClose(callback: () => void): void;
    /**
     * Check if in mobile mode
     */
    isMobile(): boolean;
    /**
     * Enable/disable tap-to-dismiss
     */
    setTapToDismiss(enabled: boolean): void;
    /**
     * Enable/disable swipe scrolling
     */
    setSwipeToScroll(enabled: boolean): void;
}
/**
 * Factory function
 */
export declare function docModal(options?: DocModalOptions): DocModal;
