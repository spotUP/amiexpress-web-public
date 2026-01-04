"use strict";
/**
 * Carousel Layout
 *
 * 1:1 port from blessed-contrib/lib/layout/carousel.js
 * Page carousel with navigation controls
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Carousel = void 0;
exports.carousel = carousel;
/**
 * Carousel Layout
 * Manages multiple pages with navigation
 */
class Carousel {
    constructor(pages, options) {
        this.currPage = 0;
        this.currPage = 0;
        this.pages = pages;
        this.options = options;
        this.screen = this.options.screen;
    }
    move() {
        let i = this.screen.children.length;
        while (i--) {
            this.screen.children[i].detach();
        }
        this.pages[this.currPage](this.screen, this.currPage);
        this.screen.render();
    }
    next() {
        this.currPage++;
        if (this.currPage == this.pages.length) {
            if (!this.options.rotate) {
                this.currPage--;
                return;
            }
            else {
                this.currPage = 0;
            }
        }
        this.move();
    }
    prev() {
        this.currPage--;
        if (this.currPage < 0) {
            if (!this.options.rotate) {
                this.currPage++;
                return;
            }
            else {
                this.currPage = this.pages.length - 1;
            }
        }
        this.move();
    }
    home() {
        this.currPage = 0;
        this.move();
    }
    end() {
        this.currPage = this.pages.length - 1;
        this.move();
    }
    start() {
        this.move();
        if (this.options.interval) {
            this.intervalId = setInterval(this.next.bind(this), this.options.interval);
        }
        if (this.options.controlKeys) {
            this.screen.key(['right', 'left', 'home', 'end'], (ch, key) => {
                if (key.name == 'right')
                    this.next();
                if (key.name == 'left')
                    this.prev();
                if (key.name == 'home')
                    this.home();
                if (key.name == 'end')
                    this.end();
            });
        }
    }
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = undefined;
        }
    }
}
exports.Carousel = Carousel;
/**
 * Factory function
 */
function carousel(pages, options) {
    return new Carousel(pages, options);
}
