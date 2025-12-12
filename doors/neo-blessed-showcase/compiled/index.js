"use strict";
/**
 * Neo-Blessed Showcase v2.0
 *
 * Interactive demonstration of neo-blessed UI widgets using SDK v2.0
 *
 * Features:
 * - Core blessed widgets (Box, Text, List, Input, Button, etc.)
 * - Multi-page carousel navigation
 * - Interactive demos
 * - Best practices guide
 */
Object.defineProperty(exports, "__esModule", { value: true });
const bbs_door_sdk_1 = require("@amiexpress/bbs-door-sdk");
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
class NeoBlessedShowcase {
    constructor() {
        this.currentPage = 0;
        this.totalPages = 5;
        this.exitResolve = null;
    }
    setContext(ctx) {
        this.ctx = ctx;
    }
    async start() {
        const dims = (0, bbs_door_sdk_1.getTerminalDimensions)(this.ctx);
        this.screen = new blessed_1.Screen({
            height: dims.height,
            smartCSR: true,
            title: 'Neo-Blessed Showcase',
            output: (data) => this.ctx.output.write(data),
        });
        this.setupKeyBindings();
        this.showPage(0);
        this.screen.render();
        // Wait for exit
        await new Promise((resolve) => {
            this.exitResolve = resolve;
            this.screen.on('destroy', () => resolve());
        });
    }
    setupKeyBindings() {
        this.screen.key(['q', 'Q', 'escape'], () => {
            this.cleanup();
            this.ctx.close();
        });
        this.screen.key(['left', 'h'], () => {
            if (this.currentPage > 0) {
                this.currentPage--;
                this.showPage(this.currentPage);
            }
        });
        this.screen.key(['right', 'l', 'space'], () => {
            if (this.currentPage < this.totalPages - 1) {
                this.currentPage++;
                this.showPage(this.currentPage);
            }
        });
        // Number keys to jump to pages
        for (let i = 1; i <= 9; i++) {
            this.screen.key([i.toString()], () => {
                if (i - 1 < this.totalPages) {
                    this.currentPage = i - 1;
                    this.showPage(this.currentPage);
                }
            });
        }
    }
    showPage(page) {
        // Clear screen
        if (this.mainBox) {
            this.mainBox.destroy();
        }
        switch (page) {
            case 0:
                this.showWelcomePage();
                break;
            case 1:
                this.showBoxesPage();
                break;
            case 2:
                this.showListPage();
                break;
            case 3:
                this.showInputPage();
                break;
            case 4:
                this.showBestPracticesPage();
                break;
        }
        this.screen.render();
    }
    showWelcomePage() {
        this.mainBox = new blessed_1.Box({
            parent: this.screen,
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            tags: true,
            border: { type: 'line' },
            style: {
                border: { fg: 'cyan' }
            },
            label: ` Page ${this.currentPage + 1}/${this.totalPages}: Welcome `
        });
        const content = new blessed_1.Text({
            parent: this.mainBox,
            top: 1,
            left: 2,
            right: 2,
            tags: true,
            content: `
{center}{bold}{cyan-fg}╔══════════════════════════════════════════════════════════╗{/cyan-fg}{/bold}{/center}
{center}{bold}{cyan-fg}║      NEO-BLESSED SHOWCASE - SDK v2.0                    ║{/cyan-fg}{/bold}{/center}
{center}{bold}{cyan-fg}╚══════════════════════════════════════════════════════════╝{/cyan-fg}{/bold}{/center}

{center}Interactive demonstration of neo-blessed UI widgets{/center}
{center}for AmiExpress BBS door development{/center}

{bold}{yellow-fg}What is neo-blessed?{/yellow-fg}{/bold}

Neo-blessed is a powerful terminal UI library that provides ncurses-like
functionality for creating sophisticated ASCII/ANSI interfaces in BBS doors.

{bold}{yellow-fg}Key Features:{/yellow-fg}{/bold}

  {green-fg}*{/green-fg} 30+ widgets (Box, Text, List, Input, Button, etc.)
  {green-fg}*{/green-fg} Efficient rendering (only updates changed areas)
  {green-fg}*{/green-fg} Keyboard and mouse support
  {green-fg}*{/green-fg} Focus management and navigation
  {green-fg}*{/green-fg} Tag-based styling and markup
  {green-fg}*{/green-fg} Event-driven architecture

{bold}{yellow-fg}This Showcase:{/yellow-fg}{/bold}

This door demonstrates core neo-blessed widgets with interactive examples.
Use the navigation keys to explore different widget categories and see
how they work in practice.

{center}{gray-fg}Page ${this.currentPage + 1} of ${this.totalPages}{/gray-fg}{/center}
`
        });
        this.addNavigationFooter(this.mainBox);
    }
    showBoxesPage() {
        this.mainBox = new blessed_1.Box({
            parent: this.screen,
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            tags: true,
            border: { type: 'line' },
            style: {
                border: { fg: 'cyan' }
            },
            label: ` Page ${this.currentPage + 1}/${this.totalPages}: Boxes & Borders `
        });
        const content = new blessed_1.Text({
            parent: this.mainBox,
            top: 1,
            left: 2,
            right: 2,
            tags: true,
            content: `
{center}{bold}{yellow-fg}BOXES & BORDERS{/yellow-fg}{/bold}{/center}

Boxes are the fundamental building blocks of neo-blessed UIs.
They can contain other widgets and define layout structure.

`
        });
        // Demo boxes with different styles
        const box1 = new blessed_1.Box({
            parent: this.mainBox,
            top: 8,
            left: 5,
            width: 30,
            height: 5,
            tags: true,
            border: { type: 'line' },
            style: {
                border: { fg: 'green' }
            },
            label: ' Line Border ',
            content: '{center}Green line border{/center}'
        });
        const box2 = new blessed_1.Box({
            parent: this.mainBox,
            top: 8,
            left: 40,
            width: 30,
            height: 5,
            tags: true,
            border: { type: 'line' },
            style: {
                border: { fg: 'yellow' }
            },
            label: ' Yellow Border ',
            content: '{center}With a label!{/center}'
        });
        const box3 = new blessed_1.Box({
            parent: this.mainBox,
            top: 14,
            left: 5,
            width: 65,
            height: 4,
            tags: true,
            border: { type: 'line' },
            style: {
                border: { fg: 'cyan' },
                bg: 'black'
            },
            content: '{center}{bold}Boxes can have background colors and styled content{/bold}{/center}'
        });
        this.addNavigationFooter(this.mainBox);
    }
    showListPage() {
        this.mainBox = new blessed_1.Box({
            parent: this.screen,
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            tags: true,
            border: { type: 'line' },
            style: {
                border: { fg: 'cyan' }
            },
            label: ` Page ${this.currentPage + 1}/${this.totalPages}: Lists `
        });
        const header = new blessed_1.Text({
            parent: this.mainBox,
            top: 1,
            left: 2,
            right: 2,
            height: 3,
            tags: true,
            content: `
{center}{bold}{yellow-fg}INTERACTIVE LISTS{/yellow-fg}{/bold}{/center}
{center}Lists are scrollable, selectable collections of items{/center}
`
        });
        const list = new blessed_1.List({
            parent: this.mainBox,
            top: 5,
            left: 5,
            width: 35,
            height: 12,
            tags: true,
            border: { type: 'line' },
            label: ' BBS Doors ',
            items: [
                'Fire Emblem: Tactical RPG',
                'BBS Dashboard',
                'Neo-Blessed Showcase',
                'Tic-Tac-Toe',
                'Space Shooter',
                'Arkanoid',
                'MultiTop',
                'QuickNew'
            ],
            keys: true,
            vi: true,
            style: {
                selected: { bg: 'blue', fg: 'white' },
                border: { fg: 'green' }
            }
        });
        const info = new blessed_1.Box({
            parent: this.mainBox,
            top: 5,
            left: 42,
            width: 30,
            height: 12,
            tags: true,
            border: { type: 'line' },
            label: ' Info ',
            style: {
                border: { fg: 'yellow' }
            },
            content: `
{bold}List Features:{/bold}

{green-fg}*{/green-fg} Arrow keys to navigate
{green-fg}*{/green-fg} Vi-style (j/k) support
{green-fg}*{/green-fg} Mouse click selection
{green-fg}*{/green-fg} Scrolling support
{green-fg}*{/green-fg} Custom styling

Try navigating with
arrow keys or j/k!
`
        });
        list.focus();
        this.addNavigationFooter(this.mainBox);
    }
    showInputPage() {
        this.mainBox = new blessed_1.Box({
            parent: this.screen,
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            tags: true,
            border: { type: 'line' },
            style: {
                border: { fg: 'cyan' }
            },
            label: ` Page ${this.currentPage + 1}/${this.totalPages}: Input & Buttons `
        });
        const header = new blessed_1.Text({
            parent: this.mainBox,
            top: 1,
            left: 2,
            right: 2,
            height: 3,
            tags: true,
            content: `
{center}{bold}{yellow-fg}INPUT WIDGETS & BUTTONS{/yellow-fg}{/bold}{/center}
{center}Collect user input with textboxes and buttons{/center}
`
        });
        const formBox = new blessed_1.Box({
            parent: this.mainBox,
            top: 5,
            left: 10,
            width: 60,
            height: 12,
            tags: true,
            border: { type: 'line' },
            label: ' Example Form ',
            style: {
                border: { fg: 'green' }
            }
        });
        const nameLabel = new blessed_1.Text({
            parent: formBox,
            top: 1,
            left: 2,
            content: 'Name:',
            style: { fg: 'yellow' }
        });
        const nameInput = new blessed_1.Textbox({
            parent: formBox,
            top: 2,
            left: 2,
            width: 40,
            height: 3,
            border: { type: 'line' },
            keys: true,
            inputOnFocus: true
        });
        const submitButton = new blessed_1.Button({
            parent: formBox,
            bottom: 1,
            left: 10,
            width: 15,
            height: 3,
            content: 'Submit',
            tags: true,
            border: { type: 'line' },
            style: {
                fg: 'white',
                bg: 'green',
                focus: {
                    bg: 'cyan'
                }
            }
        });
        const cancelButton = new blessed_1.Button({
            parent: formBox,
            bottom: 1,
            right: 10,
            width: 15,
            height: 3,
            content: 'Cancel',
            tags: true,
            border: { type: 'line' },
            style: {
                fg: 'white',
                bg: 'red',
                focus: {
                    bg: 'cyan'
                }
            }
        });
        nameInput.focus();
        this.addNavigationFooter(this.mainBox);
    }
    showBestPracticesPage() {
        this.mainBox = new blessed_1.Box({
            parent: this.screen,
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            tags: true,
            border: { type: 'line' },
            style: {
                border: { fg: 'cyan' }
            },
            label: ` Page ${this.currentPage + 1}/${this.totalPages}: Best Practices `
        });
        const content = new blessed_1.Text({
            parent: this.mainBox,
            top: 1,
            left: 2,
            right: 2,
            tags: true,
            content: `
{center}{bold}{yellow-fg}NEO-BLESSED BEST PRACTICES{/yellow-fg}{/bold}{/center}

{bold}1. Use SDK v2.0 Pattern{/bold}

   {green-fg}import {{ CoreDoor as Door }} from '@amiexpress/bbs-door-sdk';{/green-fg}
   {green-fg}import {{ Screen, Box, Text }} from '@amiexpress/bbs-door-sdk/engines/ui/blessed';{/green-fg}

{bold}2. Get Terminal Dimensions{/bold}

   {green-fg}const dims = getTerminalDimensions(ctx);{/green-fg}
   {green-fg}const screen = new Screen({{ height: dims.height }});{/green-fg}

{bold}3. Use Tags for Styling{/bold}

   {green-fg}content: '{{bold}}{{cyan-fg}}Hello!{{/cyan-fg}}{{/bold}}'{/green-fg}

{bold}4. Handle Cleanup Properly{/bold}

   {green-fg}screen.on('destroy', () => resolve());{/green-fg}
   {green-fg}screen.key(['q'], () => screen.destroy());{/green-fg}

{bold}5. Use Lifecycle Hooks{/bold}

   {green-fg}door.onStart(async (ctx) => {{ ... }});{/green-fg}
   {green-fg}door.onClose(async (ctx) => {{ ... }});{/green-fg}
   {green-fg}door.onError(async (ctx, error) => {{ ... }});{/green-fg}

{center}{gray-fg}See Fire Emblem v2 and BBS Dashboard for complete examples!{/gray-fg}{/center}
`
        });
        this.addNavigationFooter(this.mainBox);
    }
    addNavigationFooter(parent) {
        new blessed_1.Text({
            parent: parent,
            bottom: 0,
            left: 2,
            right: 2,
            tags: true,
            content: `{center}{yellow-fg}← → : Navigate  1-${this.totalPages}: Jump to Page  Q: Quit{/yellow-fg}{/center}`
        });
    }
    cleanup() {
        if (this.screen) {
            this.screen.destroy();
        }
        // Resolve the exit promise to allow door to complete
        if (this.exitResolve) {
            this.exitResolve();
            this.exitResolve = null;
        }
    }
}
// ===== SDK v2.0 Pattern =====
const door = new bbs_door_sdk_1.CoreDoor({
    name: 'Neo-Blessed Showcase',
    version: '2.0.0',
    author: 'AmiExpress SDK v2.0',
});
let showcase;
door.onStart(async (ctx) => {
    showcase = new NeoBlessedShowcase();
    showcase.setContext(ctx);
    await showcase.start();
});
door.onClose(async (ctx) => {
    ctx.output.writeLine('\r\n\x1b[36mThanks for exploring neo-blessed!\x1b[0m\r\n');
});
door.onError(async (ctx, error) => {
    ctx.output.writeLine(`\r\n\x1b[31mError: ${error.message}\x1b[0m\r\n`);
    console.error('Showcase error:', error);
});
exports.default = door;
