/**
 * {{displayName}}
 * Version {{version}}
 *
 * {{description}}
 *
 * Created with AmiExpress BBS Door SDK
 * https://github.com/amiexpress/sdk
 */

import { ServerDoor, DoorContext } from '@amiexpress/bbs-door-sdk';
import { createScreen, createBox, createList, DoorInputManager } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

class {{className}} {
  private ctx!: DoorContext;
  private screen!: Screen;
  private inputManager!: DoorInputManager;
  private exitResolve: (() => void) | null = null;

  setContext(ctx: DoorContext): void {
    this.ctx = ctx;
  }

  async run(): Promise<void> {
    // Create screen
    this.screen = createScreen(this.ctx.bbs, {
      smartCSR: false,
      fastCSR: false,
      title: '{{displayName}}',
    });

    // Set up input management (CRITICAL for proper cleanup)
    this.inputManager = new DoorInputManager(this.ctx, this.screen, {
      enableGameMode: false,  // Blessed UI mode (use true for games)
      enableGrabKeys: false,  // Blessed focus system (use true for games)
      enableMouse: true,      // Enable mouse events
      debug: false,
      debugName: '{{displayName}}'
    });

    // Enable input
    this.inputManager.enable();

    // Clear screen
    this.screen.clearRegion(0, this.screen.width, 0, this.screen.height);
    this.screen.alloc();
    this.screen.render();
    await this.sleep(200);

    // Create UI
    this.createUI();

    // Wait for exit
    await new Promise<void>((resolve) => {
      this.exitResolve = resolve;
      this.screen.once('destroy', resolve);
    });
  }

  private createUI(): void {
    // Header
    const header = createBox({
      parent: this.screen,
      top: 0,
      left: 0,
      width: '100%',
      height: 3,
      content: '{center}{bold}{cyan-fg}{{displayName}}{/cyan-fg}{/bold}{/center}',
      style: { fg: 'cyan', bg: 'black' }
    });

    // Main menu
    const menuBox = createBox({
      parent: this.screen,
      top: 4,
      left: 'center',
      width: 30,
      height: 10,
      border: { type: 'line' },
      label: ' Menu ',
      style: {
        border: { fg: 'cyan' },
        bg: 'black'
      }
    });

    const menu = createList({
      parent: menuBox,
      top: 1,
      left: 1,
      width: '100%-2',
      height: '100%-2',
      items: [
        'Start',
        'Instructions',
        'High Scores',
        'Quit'
      ],
      keys: true,
      vi: true,
      mouse: true,
      style: {
        fg: 'white',
        bg: 'black',
        selected: {
          fg: 'black',
          bg: 'cyan'
        }
      }
    });

    // Menu handlers
    menu.on('select', (item: any, index: number) => {
      switch (index) {
        case 0: this.startGame(); break;
        case 1: this.showInstructions(); break;
        case 2: this.showHighScores(); break;
        case 3: this.quit(); break;
      }
    });

    // Keyboard shortcuts
    this.screen.key(['q', 'Q', 'escape'], () => this.quit());

    // Focus and render
    menu.focus();
    this.screen.render();
  }

  private startGame(): void {
    // TODO: Implement game logic
    this.screen.clearRegion(0, this.screen.width, 0, this.screen.height);
    this.screen.alloc();

    const gameBox = createBox({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: 40,
      height: 10,
      border: { type: 'line' },
      content: '{center}Game running...{/center}\\n{center}Press Q to quit{/center}',
      style: {
        border: { fg: 'green' },
        bg: 'black',
        fg: 'white'
      }
    });

    this.screen.render();
  }

  private showInstructions(): void {
    // TODO: Implement instructions screen
  }

  private showHighScores(): void {
    // TODO: Implement high scores screen
  }

  private quit(): void {
    this.cleanup();
  }

  private cleanup(): void {
    // CRITICAL: Disable input manager FIRST (before screen.destroy)
    if (this.inputManager) {
      this.inputManager.disable();
    }

    if (this.screen) {
      this.screen.destroy();
    }

    if (this.exitResolve) {
      this.exitResolve();
      this.exitResolve = null;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Create door instance
const door = new ServerDoor({
  name: '{{displayName}}',
  version: '{{version}}',
  description: '{{description}}',
  author: '{{author}}',
});

// Door lifecycle hooks
door.onStart(async (ctx: DoorContext) => {
  const app = new {{className}}();
  app.setContext(ctx);
  await app.run();
});

door.onError((ctx: DoorContext, error: Error) => {
  console.error('[{{displayName}}] Error:', error);
});

// Export door
export default door;
