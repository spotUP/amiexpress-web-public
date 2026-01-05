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
export class Carousel {
  currPage = 0;
  pages: CarouselPage[];
  options: CarouselOptions;
  screen: Screen;
  private intervalId?: NodeJS.Timeout;

  constructor(pages: CarouselPage[], options: CarouselOptions) {
    this.currPage = 0;
    this.pages = pages;
    this.options = options;
    this.screen = this.options.screen;
  }

  move(): void {
    let i = this.screen.children.length;
    while (i--) {
      this.screen.children[i].detach();
    }

    this.pages[this.currPage](this.screen, this.currPage);
    this.screen.render();
  }

  next(): void {
    this.currPage++;
    if (this.currPage == this.pages.length) {
      if (!this.options.rotate) {
        this.currPage--;
        return;
      } else {
        this.currPage = 0;
      }
    }
    this.move();
  }

  prev(): void {
    this.currPage--;
    if (this.currPage < 0) {
      if (!this.options.rotate) {
        this.currPage++;
        return;
      } else {
        this.currPage = this.pages.length - 1;
      }
    }
    this.move();
  }

  home(): void {
    this.currPage = 0;
    this.move();
  }

  end(): void {
    this.currPage = this.pages.length - 1;
    this.move();
  }

  start(): void {
    this.move();

    if (this.options.interval) {
      this.intervalId = setInterval(this.next.bind(this), this.options.interval);
    }

    if (this.options.controlKeys) {
      this.screen.on('keypress', (ch: any, key: any) => {
        if (key.name === 'right' || (key.name === 'l')) {
          this.next();
          return true;
        }
        if (key.name === 'left' || (key.name === 'h')) {
          this.prev();
          return true;
        }
        if (key.name === 'home') {
          this.home();
          return true;
        }
        if (key.name === 'end') {
          this.end();
          return true;
        }
        return false;
      });
    }
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }
}

/**
 * Factory function
 */
export function carousel(pages: CarouselPage[], options: CarouselOptions): Carousel {
  return new Carousel(pages, options);
}
