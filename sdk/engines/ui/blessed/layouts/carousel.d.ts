/**
 * Carousel Layout
 *
 * 1:1 port from blessed-contrib/lib/layout/carousel.js
 * Page carousel with navigation controls
 */
import type { Screen } from '../core/screen';
export type CarouselPage = (screen: Screen, page: number) => void;
export interface CarouselOptions {
    screen: Screen;
    interval?: number;
    controlKeys?: boolean;
    rotate?: boolean;
}
/**
 * Carousel Layout
 * Manages multiple pages with navigation
 */
export declare class Carousel {
    currPage: number;
    pages: CarouselPage[];
    options: CarouselOptions;
    screen: Screen;
    private intervalId?;
    constructor(pages: CarouselPage[], options: CarouselOptions);
    move(): void;
    next(): void;
    prev(): void;
    home(): void;
    end(): void;
    start(): void;
    stop(): void;
}
/**
 * Factory function
 */
export declare function carousel(pages: CarouselPage[], options: CarouselOptions): Carousel;
