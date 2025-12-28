/**
 * Modal Helpers - Utilities for centering and managing modals
 *
 * Provides functions to ensure modals stay centered in responsive layouts
 */

import type { Element } from '../core/element';
import type { Screen } from '../core/screen';

/**
 * Center an element on the screen
 *
 * Works with both fixed sizes and percentage-based sizes
 */
export function centerElement(element: Element): void {
  if (!element || !element.screen) return;

  const screen = element.screen;
  const screenWidth = screen.width as number;
  const screenHeight = screen.height as number;

  // Get element dimensions - handle both number and string types
  let width: number;
  let height: number;

  const elWidth = (element as any).width;
  const elHeight = (element as any).height;

  if (typeof elWidth === 'string' && elWidth.includes('%')) {
    const percent = parseInt(elWidth) / 100;
    width = Math.floor(screenWidth * percent);
  } else if (typeof elWidth === 'number') {
    width = elWidth;
  } else {
    width = 40; // Default width
  }

  if (typeof elHeight === 'string' && elHeight.includes('%')) {
    const percent = parseInt(elHeight) / 100;
    height = Math.floor(screenHeight * percent);
  } else if (typeof elHeight === 'number') {
    height = elHeight;
  } else {
    height = 12; // Default height
  }

  // Calculate centered position
  const left = Math.floor((screenWidth - width) / 2);
  const top = Math.floor((screenHeight - height) / 2);

  // Update position
  (element as any).left = left;
  (element as any).top = top;

  // Emit position event if the element supports it
  if (typeof (element as any).emit === 'function') {
    (element as any).emit('move');
  }
}

/**
 * Make a modal responsive - re-center on screen resize
 *
 * Returns a cleanup function to remove the resize listener
 */
export function makeModalResponsive(element: Element): () => void {
  if (!element || !element.screen) {
    return () => {};
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
export function createModalBackdrop(screen: Screen, opacity: number = 0.5): {
  overlay: Element;
  cleanup: () => void;
} {
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
  if ((overlay as any).setOpacity) {
    (overlay as any).setOpacity(opacity);
  }

  const cleanup = () => {
    if (overlay && overlay.detach) {
      overlay.detach();
    }
  };

  return { overlay, cleanup };
}

/**
 * Show a modal with backdrop and centered positioning
 */
export function showModal(modal: Element, options: {
  backdrop?: boolean;
  backdropOpacity?: number;
  onClose?: () => void;
} = {}): () => void {
  if (!modal || !modal.screen) {
    return () => {};
  }

  const { backdrop = true, backdropOpacity = 0.5, onClose } = options;
  const cleanups: Array<() => void> = [];

  // Create backdrop if requested
  let overlayElement: Element | null = null;
  if (backdrop) {
    const { overlay, cleanup } = createModalBackdrop(modal.screen, backdropOpacity);
    overlayElement = overlay;
    overlay.show();
    cleanups.push(cleanup);
  }

  // Make modal responsive
  const responsiveCleanup = makeModalResponsive(modal);
  cleanups.push(responsiveCleanup);

  // Show modal
  modal.show();
  (modal as any).setFront?.();
  (modal as any).focus?.();
  modal.screen.render();

  // Close handler
  const handleClose = () => {
    modal.hide();
    if (overlayElement) {
      overlayElement.hide();
    }
    cleanups.forEach(fn => fn());
    modal.screen?.render();
    onClose?.();
  };

  // Listen for close events
  modal.once('hide', handleClose);
  modal.once('close', handleClose);

  // Return cleanup function
  return () => {
    cleanups.forEach(fn => fn());
    if (overlayElement) {
      overlayElement.hide();
    }
  };
}
