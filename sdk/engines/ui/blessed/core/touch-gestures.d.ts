/**
 * Touch Gestures Handler
 *
 * Provides swipe, long-press, and other touch gesture detection
 * for blessed widgets.
 */
export type SwipeDirection = 'left' | 'right' | 'up' | 'down';
export interface SwipeEvent {
    direction: SwipeDirection;
    deltaX: number;
    deltaY: number;
    /** Total swipe distance (absolute value of primary axis) */
    distance: number;
    duration: number;
    velocity: number;
}
export interface SwipeOptions {
    /** Minimum distance to trigger (default: SWIPE_THRESHOLD) */
    threshold?: number;
    /** Vertical threshold (default: SWIPE_THRESHOLD_VERTICAL) */
    verticalThreshold?: number;
    /** Maximum time for swipe gesture (default: SWIPE_MAX_TIME) */
    maxTime?: number;
    /** Allowed directions (default: both) */
    direction?: 'horizontal' | 'vertical' | 'both';
    /** Callback for swipe left */
    onSwipeLeft?: (event: SwipeEvent) => void;
    /** Callback for swipe right */
    onSwipeRight?: (event: SwipeEvent) => void;
    /** Callback for swipe up */
    onSwipeUp?: (event: SwipeEvent) => void;
    /** Callback for swipe down */
    onSwipeDown?: (event: SwipeEvent) => void;
    /** General swipe callback */
    onSwipe?: (event: SwipeEvent) => void;
}
export interface LongPressOptions {
    /** Duration before triggering (default: LONG_PRESS_TIME) */
    duration?: number;
    /** Callback when long press triggered */
    onLongPress: (x: number, y: number) => void;
    /** Callback when press cancelled (moved or released early) */
    onCancel?: () => void;
}
export interface DoubleTapOptions {
    /** Maximum interval between taps (default: DOUBLE_TAP_INTERVAL) */
    interval?: number;
    /** Callback when double tap detected */
    onDoubleTap: (x: number, y: number) => void;
}
export interface GestureState {
    startX: number;
    startY: number;
    startTime: number;
    isActive: boolean;
}
/**
 * Touch gesture handler for an element
 * Attach to blessed elements to detect swipe, long-press, and other gestures
 */
export declare class TouchGestureHandler {
    private element;
    private screen;
    private state;
    private swipeOptions?;
    private longPressOptions?;
    private doubleTapOptions?;
    private longPressTimer?;
    private lastTapTime;
    private lastTapX;
    private lastTapY;
    private boundHandlers;
    constructor(element: any);
    /**
     * Enable swipe gesture detection
     */
    enableSwipe(options: SwipeOptions): () => void;
    /**
     * Enable long press detection
     */
    enableLongPress(options: LongPressOptions): () => void;
    /**
     * Enable double tap detection
     */
    enableDoubleTap(options: DoubleTapOptions): () => void;
    /**
     * Disable all gestures and cleanup
     */
    destroy(): void;
    private attachMouseListeners;
    private detachMouseListenersIfUnused;
    private detachAllListeners;
    private handleMouseDown;
    private handleMouseUp;
    private handleMouseMove;
    private detectSwipe;
    private startLongPressTimer;
    private clearLongPressTimer;
}
/**
 * Create a touch gesture handler for an element
 */
export declare function createTouchGestureHandler(element: any): TouchGestureHandler;
/**
 * Enable swipe gestures on an element (convenience function)
 */
export declare function enableSwipe(element: any, options: SwipeOptions): () => void;
/**
 * Enable long press on an element (convenience function)
 */
export declare function enableLongPress(element: any, options: LongPressOptions): () => void;
/**
 * Enable double tap on an element (convenience function)
 */
export declare function enableDoubleTap(element: any, options: DoubleTapOptions): () => void;
