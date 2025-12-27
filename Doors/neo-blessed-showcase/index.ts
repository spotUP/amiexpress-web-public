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

import { CoreDoor as Door, getTerminalDimensions } from '@amiexpress/bbs-door-sdk';
import type { DoorContext } from '@amiexpress/bbs-door-sdk';
import { Screen, Box, Text, List, Button, Textbox } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

class NeoBlessedShowcase {
  private ctx!: DoorContext;
  private screen!: Screen;
  private currentPage = 0;
  private totalPages = 5;
  private mainBox!: Box;
  private exitResolve: (() => void) | null = null;

  setContext(ctx: DoorContext): void {
    this.ctx = ctx;
  }

  async start(): Promise<void> {
    const dims = getTerminalDimensions(this.ctx);

    this.screen = new Screen({
      height: dims.height,
      smartCSR: true,
      title: 'Neo-Blessed Showcase',
      output: (data: string) => this.ctx.output.write(data),
    });

    this.setupKeyBindings();
    this.showPage(0);
    this.screen.render();

    // Wait for exit
    await new Promise<void>((resolve) => {
      this.exitResolve = resolve;
      this.screen.on('destroy', () => resolve());
    });
  }

  private setupKeyBindings(): void {
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

  private showPage(page: number): void {
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

  private showWelcomePage(): void {
    this.mainBox = new Box({
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

    const content = new Text({
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

  private showBoxesPage(): void {
    this.mainBox = new Box({
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

    const content = new Text({
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
    const box1 = new Box({
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

    const box2 = new Box({
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

    const box3 = new Box({
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

  private showListPage(): void {
    this.mainBox = new Box({
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

    const header = new Text({
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

    const list = new List({
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

    const info = new Box({
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

  private showInputPage(): void {
    this.mainBox = new Box({
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

    const header = new Text({
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

    const formBox = new Box({
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

    const nameLabel = new Text({
      parent: formBox,
      top: 1,
      left: 2,
      content: 'Name:',
      style: { fg: 'yellow' }
    });

    const nameInput = new Textbox({
      parent: formBox,
      top: 2,
      left: 2,
      width: 40,
      height: 3,
      border: { type: 'line' },
      keys: true,
      inputOnFocus: true
    });

    const submitButton = new Button({
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

    const cancelButton = new Button({
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

  private showBestPracticesPage(): void {
    this.mainBox = new Box({
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

    const content = new Text({
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

   {green-fg}door.onStart(async (ctx: DoorContext) => {{ ... }});{/green-fg}
   {green-fg}door.onClose(async (ctx: DoorContext) => {{ ... }});{/green-fg}
   {green-fg}door.onError(async (ctx: DoorContext, error: Error) => {{ ... }});{/green-fg}

{center}{gray-fg}See Fire Emblem v2 and BBS Dashboard for complete examples!{/gray-fg}{/center}
`
    });

    this.addNavigationFooter(this.mainBox);
  }

  private addNavigationFooter(parent: Box): void {
    new Text({
      parent: parent,
      bottom: 0,
      left: 2,
      right: 2,
      tags: true,
      content: `{center}{yellow-fg}← → : Navigate  1-${this.totalPages}: Jump to Page  Q: Quit{/yellow-fg}{/center}`
    });
  }

  private cleanup(): void {
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

const door = new Door({
  name: 'Neo-Blessed Showcase',
  version: '2.0.0',
  author: 'AmiExpress SDK v2.0',
});

let showcase: NeoBlessedShowcase;

door.onStart(async (ctx: DoorContext) => {
  showcase = new NeoBlessedShowcase();
  showcase.setContext(ctx);
  await showcase.start();
});

door.onClose(async (ctx: DoorContext) => {
  ctx.output.writeLine('\r\n\x1b[36mThanks for exploring neo-blessed!\x1b[0m\r\n');
});

door.onError(async (ctx: DoorContext, error: Error) => {
  ctx.output.writeLine(`\r\n\x1b[31mError: ${error.message}\x1b[0m\r\n`);
  console.error('Showcase error:', error);
});

export default door;
