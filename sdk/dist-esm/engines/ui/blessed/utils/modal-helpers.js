/**
 * Modal Helpers - Utilities for centering and managing modals
 *
 * Provides functions to ensure modals stay centered in responsive layouts
 */
/**
 * Center an element on the screen
 *
 * Works with both fixed sizes and percentage-based sizes
 */
export function centerElement(element) {
    if (!element || !element.screen)
        return;
    const screen = element.screen;
    const screenWidth = screen.width;
    const screenHeight = screen.height;
    // Get element dimensions - handle both number and string types
    let width;
    let height;
    const elWidth = element.width;
    const elHeight = element.height;
    if (typeof elWidth === 'string' && elWidth.includes('%')) {
        const percent = parseInt(elWidth) / 100;
        width = Math.floor(screenWidth * percent);
    }
    else if (typeof elWidth === 'number') {
        width = elWidth;
    }
    else {
        width = 40; // Default width
    }
    if (typeof elHeight === 'string' && elHeight.includes('%')) {
        const percent = parseInt(elHeight) / 100;
        height = Math.floor(screenHeight * percent);
    }
    else if (typeof elHeight === 'number') {
        height = elHeight;
    }
    else {
        height = 12; // Default height
    }
    // Calculate centered position
    const left = Math.floor((screenWidth - width) / 2);
    const top = Math.floor((screenHeight - height) / 2);
    // Update position
    element.left = left;
    element.top = top;
    // Emit position event if the element supports it
    if (typeof element.emit === 'function') {
        element.emit('move');
    }
}
/**
 * Make a modal responsive - re-center on screen resize
 *
 * Returns a cleanup function to remove the resize listener
 */
export function makeModalResponsive(element) {
    if (!element || !element.screen) {
        return () => { };
    }
    const screen = element.screen;
    const handleResize = () => {
        centerElement(element);
        screen.render();
    };
    // Listen for resize events
    screen.on('resize', handleResize);
    // Initial center
    centerElement(element);
    // Return cleanup function
    return () => {
        screen.removeListener('resize', handleResize);
    };
}
/**
 * Create a backdrop overlay for modals
 *
 * Returns the overlay element and a cleanup function
 */
export function createModalBackdrop(screen, opacity = 0.5) {
    const blessed = require('../index');
    const overlay = blessed.box({
        parent: screen,
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        style: {
            bg: 'black',
            transparent: true,
        },
        hidden: true,
    });
    // Set opacity if supported
    if (overlay.setOpacity) {
        overlay.setOpacity(opacity);
    }
    const cleanup = () => {
        if (overlay && overlay.detach) {
            overlay.detach();
        }
    };
    return { overlay, cleanup };
}
/**
 * Show a modal with backdrop, centered positioning, and input trapping
 *
 * Input trapping ensures keyboard events don't leak to elements behind the modal.
 * This is critical for modals shown over lists/tables that have their own key handlers.
 */
export function showModal(modal, options = {}) {
    if (!modal || !modal.screen) {
        return () => { };
    }
    const { backdrop = true, backdropOpacity = 0.5, onClose, trapInput = true } = options;
    const cleanups = [];
    const screen = modal.screen;
    // Save focus state before showing modal
    let savedFocus = null;
    if (trapInput && screen.saveFocus) {
        savedFocus = screen.saveFocus();
    }
    // Create backdrop if requested
    let overlayElement = null;
    if (backdrop) {
        const { overlay, cleanup } = createModalBackdrop(screen, backdropOpacity);
        overlayElement = overlay;
        overlay.show();
        cleanups.push(cleanup);
    }
    // Make modal responsive
    const responsiveCleanup = makeModalResponsive(modal);
    cleanups.push(responsiveCleanup);
    // Push modal onto focus stack to trap input
    if (trapInput && screen.focusPush) {
        screen.focusPush(modal);
    }
    // Show modal
    modal.show();
    modal.setFront?.();
    modal.focus?.();
    screen.render();
    // Close handler
    const handleClose = () => {
        modal.hide();
        if (overlayElement) {
            overlayElement.hide();
        }
        // Restore focus state
        if (trapInput && screen.restoreFocus) {
            screen.restoreFocus();
        }
        cleanups.forEach(fn => fn());
        screen?.render();
        onClose?.();
    };
    // Listen for close events
    modal.once('hide', handleClose);
    modal.once('close', handleClose);
    // Return cleanup function
    return () => {
        if (trapInput && screen.restoreFocus) {
            screen.restoreFocus();
        }
        cleanups.forEach(fn => fn());
        if (overlayElement) {
            overlayElement.hide();
        }
    };
}
/**
 * Trap keyboard navigation keys within a modal element
 *
 * Call this on a modal to prevent arrow keys, page up/down, home/end from
 * reaching elements behind the modal.
 */
export function trapModalInput(modal) {
    const keysToTrap = ['up', 'down', 'pageup', 'pagedown', 'home', 'end'];
    const handlers = [];
    keysToTrap.forEach(key => {
        const handler = () => {
            // Do nothing - absorb the key
        };
        modal.key?.([key], handler);
        handlers.push(() => {
            modal.unkey?.([key], handler);
        });
    });
    return () => {
        handlers.forEach(fn => fn());
    };
}
