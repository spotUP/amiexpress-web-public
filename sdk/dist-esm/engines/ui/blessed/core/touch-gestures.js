/**
 * Touch Gestures Handler
 *
 * Provides swipe, long-press, and other touch gesture detection
 * for blessed widgets.
 */
import { SWIPE_THRESHOLD, SWIPE_THRESHOLD_VERTICAL, SWIPE_MAX_TIME, LONG_PRESS_TIME, DOUBLE_TAP_INTERVAL, } from './responsive-constants';
// ============================================================================
// Gesture Handler Class
// ============================================================================
/**
 * Touch gesture handler for an element
 * Attach to blessed elements to detect swipe, long-press, and other gestures
 */
export class TouchGestureHandler {
    constructor(element) {
        this.state = {
            startX: 0,
            startY: 0,
            startTime: 0,
            isActive: false,
        };
        this.lastTapTime = 0;
        this.lastTapX = 0;
        this.lastTapY = 0;
        this.boundHandlers = {};
        this.element = element;
        this.screen = element.screen;
    }
    /**
     * Enable swipe gesture detection
     */
    enableSwipe(options) {
        this.swipeOptions = {
            threshold: SWIPE_THRESHOLD,
            verticalThreshold: SWIPE_THRESHOLD_VERTICAL,
            maxTime: SWIPE_MAX_TIME,
            direction: 'both',
            ...options,
        };
        this.attachMouseListeners();
        return () => {
            this.swipeOptions = undefined;
            this.detachMouseListenersIfUnused();
        };
    }
    /**
     * Enable long press detection
     */
    enableLongPress(options) {
        this.longPressOptions = {
            duration: LONG_PRESS_TIME,
            ...options,
        };
        this.attachMouseListeners();
        return () => {
            this.longPressOptions = undefined;
            this.clearLongPressTimer();
            this.detachMouseListenersIfUnused();
        };
    }
    /**
     * Enable double tap detection
     */
    enableDoubleTap(options) {
        this.doubleTapOptions = {
            interval: DOUBLE_TAP_INTERVAL,
            ...options,
        };
        this.attachMouseListeners();
        return () => {
            this.doubleTapOptions = undefined;
            this.detachMouseListenersIfUnused();
        };
    }
    /**
     * Disable all gestures and cleanup
     */
    destroy() {
        this.swipeOptions = undefined;
        this.longPressOptions = undefined;
        this.doubleTapOptions = undefined;
        this.clearLongPressTimer();
        this.detachAllListeners();
    }
    // ============================================================================
    // Private Methods
    // ============================================================================
    attachMouseListeners() {
        if (this.boundHandlers.mousedown)
            return; // Already attached
        this.boundHandlers.mousedown = this.handleMouseDown.bind(this);
        this.boundHandlers.mouseup = this.handleMouseUp.bind(this);
        this.boundHandlers.mousemove = this.handleMouseMove.bind(this);
        this.element.on('mousedown', this.boundHandlers.mousedown);
        // Use screen-level events for tracking (mouse may leave element)
        if (this.element.screen) {
            this.screen = this.element.screen;
            this.screen.on('mouseup', this.boundHandlers.mouseup);
            this.screen.on('mousemove', this.boundHandlers.mousemove);
        }
        else {
            // Wait for attach event
            this.element.once('attach', () => {
                this.screen = this.element.screen;
                if (this.screen) {
                    this.screen.on('mouseup', this.boundHandlers.mouseup);
                    this.screen.on('mousemove', this.boundHandlers.mousemove);
                }
            });
        }
    }
    detachMouseListenersIfUnused() {
        if (!this.swipeOptions && !this.longPressOptions && !this.doubleTapOptions) {
            this.detachAllListeners();
        }
    }
    detachAllListeners() {
        if (this.boundHandlers.mousedown) {
            this.element.removeListener('mousedown', this.boundHandlers.mousedown);
        }
        if (this.screen) {
            if (this.boundHandlers.mouseup) {
                this.screen.removeListener('mouseup', this.boundHandlers.mouseup);
            }
            if (this.boundHandlers.mousemove) {
                this.screen.removeListener('mousemove', this.boundHandlers.mousemove);
            }
        }
        this.boundHandlers = {};
    }
    handleMouseDown(data) {
        this.state = {
            startX: data.x,
            startY: data.y,
            startTime: Date.now(),
            isActive: true,
        };
        // Start long press timer
        if (this.longPressOptions) {
            this.startLongPressTimer(data.x, data.y);
        }
        // Check for double tap
        if (this.doubleTapOptions) {
            const now = Date.now();
            const interval = this.doubleTapOptions.interval || DOUBLE_TAP_INTERVAL;
            const dx = Math.abs(data.x - this.lastTapX);
            const dy = Math.abs(data.y - this.lastTapY);
            if (now - this.lastTapTime < interval && dx < 2 && dy < 2) {
                this.doubleTapOptions.onDoubleTap(data.x, data.y);
                this.lastTapTime = 0; // Reset to prevent triple-tap
                return;
            }
            this.lastTapTime = now;
            this.lastTapX = data.x;
            this.lastTapY = data.y;
        }
    }
    handleMouseUp(data) {
        if (!this.state.isActive)
            return;
        this.clearLongPressTimer();
        const deltaX = data.x - this.state.startX;
        const deltaY = data.y - this.state.startY;
        const duration = Date.now() - this.state.startTime;
        // Check for swipe
        if (this.swipeOptions) {
            this.detectSwipe(deltaX, deltaY, duration);
        }
        this.state.isActive = false;
    }
    handleMouseMove(data) {
        if (!this.state.isActive)
            return;
        const deltaX = Math.abs(data.x - this.state.startX);
        const deltaY = Math.abs(data.y - this.state.startY);
        // Cancel long press if moved too much
        if (this.longPressOptions && (deltaX > 2 || deltaY > 2)) {
            this.clearLongPressTimer();
            if (this.longPressOptions.onCancel) {
                this.longPressOptions.onCancel();
            }
        }
    }
    detectSwipe(deltaX, deltaY, duration) {
        if (!this.swipeOptions)
            return;
        const { threshold = SWIPE_THRESHOLD, verticalThreshold = SWIPE_THRESHOLD_VERTICAL, maxTime = SWIPE_MAX_TIME, direction = 'both', } = this.swipeOptions;
        // Check if within time limit
        if (duration > maxTime)
            return;
        const absDeltaX = Math.abs(deltaX);
        const absDeltaY = Math.abs(deltaY);
        const velocity = Math.sqrt(deltaX * deltaX + deltaY * deltaY) / duration;
        let swipeDirection = null;
        // Determine direction
        if (direction === 'horizontal' || direction === 'both') {
            if (absDeltaX >= threshold && absDeltaX > absDeltaY) {
                swipeDirection = deltaX < 0 ? 'left' : 'right';
            }
        }
        if (direction === 'vertical' || direction === 'both') {
            if (absDeltaY >= verticalThreshold && absDeltaY > absDeltaX) {
                swipeDirection = deltaY < 0 ? 'up' : 'down';
            }
        }
        if (swipeDirection) {
            // Calculate distance based on primary axis
            const distance = swipeDirection === 'left' || swipeDirection === 'right'
                ? absDeltaX
                : absDeltaY;
            const event = {
                direction: swipeDirection,
                deltaX,
                deltaY,
                distance,
                duration,
                velocity,
            };
            // Fire direction-specific callback
            switch (swipeDirection) {
                case 'left':
                    this.swipeOptions.onSwipeLeft?.(event);
                    break;
                case 'right':
                    this.swipeOptions.onSwipeRight?.(event);
                    break;
                case 'up':
                    this.swipeOptions.onSwipeUp?.(event);
                    break;
                case 'down':
                    this.swipeOptions.onSwipeDown?.(event);
                    break;
            }
            // Fire general swipe callback
            this.swipeOptions.onSwipe?.(event);
        }
    }
    startLongPressTimer(x, y) {
        this.clearLongPressTimer();
        const duration = this.longPressOptions?.duration || LONG_PRESS_TIME;
        this.longPressTimer = setTimeout(() => {
            if (this.state.isActive && this.longPressOptions) {
                this.longPressOptions.onLongPress(x, y);
            }
        }, duration);
    }
    clearLongPressTimer() {
        if (this.longPressTimer) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = undefined;
        }
    }
}
// ============================================================================
// Factory Functions
// ============================================================================
/**
 * Create a touch gesture handler for an element
 */
export function createTouchGestureHandler(element) {
    return new TouchGestureHandler(element);
}
/**
 * Enable swipe gestures on an element (convenience function)
 */
export function enableSwipe(element, options) {
    const handler = new TouchGestureHandler(element);
    return handler.enableSwipe(options);
}
/**
 * Enable long press on an element (convenience function)
 */
export function enableLongPress(element, options) {
    const handler = new TouchGestureHandler(element);
    return handler.enableLongPress(options);
}
/**
 * Enable double tap on an element (convenience function)
 */
export function enableDoubleTap(element, options) {
    const handler = new TouchGestureHandler(element);
    return handler.enableDoubleTap(options);
}
