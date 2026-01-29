/**
 * {{displayName}}
 * Version {{version}}
 *
 * {{description}}
 *
 * Created with AmiExpress BBS Door SDK
 * https://github.com/amiexpress/sdk
 *
 * TEMPLATE FEATURES:
 * - Three-part layout: Header, Content, Footer (all views)
 * - Proper focus management (headers/footers not focusable)
 * - View state management with currentView pattern
 * - Key handler cleanup between views (prevents accumulation)
 * - ESC key race condition handling with setImmediate()
 * - Mouse and scrollwheel support on all lists
 * - Hover effects on list items (SDK default)
 */

import { ServerDoor, DoorContext } from '@amiexpress/bbs-door-sdk';
import {
  createScreen,
  createBox,
  createList,
  DoorInputManager,
} from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import type { Screen, Box, List } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

// ============================================================================
// Types
// ============================================================================

type ViewName = 'menu' | 'game' | 'instructions' | 'scores' | 'dialog';

interface KeyHandler {
  keys: string[];
  handler: () => void;
}

// ============================================================================
// Main Application Class
// ============================================================================

class {{className}} {
  private ctx!: DoorContext;
  private screen!: Screen;
  private inputManager!: DoorInputManager;
  private exitResolve: (() => void) | null = null;

  // View management
  private currentView: ViewName = 'menu';
  private mainContainer!: Box;
  private headerBox!: Box;
  private footerBox!: Box;

  // Key handler management (prevents accumulation between views)
  private keyHandlers: KeyHandler[] = [];

  setContext(ctx: DoorContext): void {
    this.ctx = ctx;
  }

  async run(): Promise<void> {
    // Create screen with mouse support
    this.screen = createScreen(this.ctx.bbs, {
      smartCSR: false,
      fastCSR: false,
      title: '{{displayName}}',
      mouse: true,
    });

    // Set up input management (CRITICAL for proper cleanup)
    this.inputManager = new DoorInputManager(this.ctx, this.screen, {
      enableGameMode: false,  // Set true for real-time games needing raw input
      enableGrabKeys: true,   // Capture all keys
      enableMouse: true,      // Enable mouse events
      debug: false,
      debugName: '{{displayName}}'
    });

    // Enable input handling
    this.inputManager.enable();

    // Create base layout (header, main container, footer)
    this.createBaseLayout();

    // Show main menu
    this.showMainMenu();

    // Wait for exit
    await new Promise<void>((resolve) => {
      this.exitResolve = resolve;
      this.screen.once('destroy', resolve);
    });
  }

  // ============================================================================
  // Base Layout (Three-Part Pattern)
  // ============================================================================

  private createBaseLayout(): void {
    // Global header - NOT focusable
    this.headerBox = createBox({
      parent: this.screen,
      top: 0,
      left: 0,
      width: '100%',
      height: 3,
      style: {
        fg: 'white',
        bg: 'blue',
      },
      content: '{center}{bold}{{displayName}}{/bold}{/center}',
      tags: true,
      focusable: false,
    });

    // Main container for view content - NOT focusable (children are)
    this.mainContainer = createBox({
      parent: this.screen,
      top: 3,
      left: 0,
      width: '100%',
      bottom: 3,
      style: {
        fg: 'white',
        bg: 'black',
      },
      focusable: false,
    });

    // Global footer - NOT focusable
    this.footerBox = createBox({
      parent: this.screen,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 3,
      style: {
        fg: 'white',
        bg: 'blue',
      },
      content: '{center}Q=Quit | Arrow Keys=Navigate | Enter=Select{/center}',
      tags: true,
      focusable: false,
    });

    // Global quit handler (Q only quits from main menu)
    this.screen.key(['q', 'Q'], () => {
      if (this.currentView === 'menu') {
        this.quit();
      }
    });
  }

  // ============================================================================
  // View Management Helpers
  // ============================================================================

  private clearMain(): void {
    // Clear view-specific key handlers to prevent accumulation
    this.clearKeyHandlers();

    // Remove all children from main container
    const children = [...this.mainContainer.children];
    children.forEach(child => child.detach());
  }

  private registerKey(keys: string | string[], handler: () => void): void {
    const keyArray = Array.isArray(keys) ? keys : [keys];
    this.keyHandlers.push({ keys: keyArray, handler });
    this.screen.key(keyArray, handler);
  }

  private clearKeyHandlers(): void {
    this.keyHandlers.forEach(({ keys, handler }) => {
      this.screen.unkey(keys, handler);
    });
    this.keyHandlers = [];
  }

  // ============================================================================
  // Main Menu View
  // ============================================================================

  private showMainMenu(): void {
    this.currentView = 'menu';
    this.clearMain();

    // View header - NOT focusable
    createBox({
      parent: this.mainContainer,
      top: 0,
      left: 1,
      width: '98%',
      height: 3,
      border: { type: 'line' },
      label: ' Welcome ',
      style: {
        fg: 'white',
        bg: 'black',
        border: { fg: 'cyan' },
      },
      content: ` Hello, ${this.ctx.user?.username || 'Guest'}! Select an option below.`,
      tags: true,
      focusable: false,
    });

    // Menu items
    const menuItems = [
      '[S] Start Game',
      '[I] Instructions',
      '[H] High Scores',
      '[Q] Quit',
    ];

    const menuActions = [
      () => this.showGame(),
      () => this.showInstructions(),
      () => this.showHighScores(),
      () => this.quit(),
    ];

    // Menu list - focusable, with mouse/keyboard support
    const menuList = createList({
      parent: this.mainContainer,
      top: 3,
      left: 1,
      width: '98%',
      height: '100%-6',
      border: { type: 'line' },
      label: ' Menu ',
      items: menuItems,
      style: {
        fg: 'white',
        bg: 'black',
        border: { fg: 'cyan' },
        selected: { fg: 'black', bg: 'cyan' },
        item: { fg: 'white', bg: 'black' },
      },
      padding: { left: 1 },
    });

    // View footer - NOT focusable
    createBox({
      parent: this.mainContainer,
      bottom: 0,
      left: 1,
      width: '98%',
      height: 3,
      border: { type: 'line' },
      style: {
        fg: 'gray',
        bg: 'black',
        border: { fg: 'gray' },
      },
      content: ' {cyan-fg}[Enter]{/} Select   {cyan-fg}[Hotkey]{/} Quick Action   {red-fg}[Q]{/} Quit',
      tags: true,
      focusable: false,
    });

    // Handle selection via Enter or mouse click
    menuList.on('select', (_item: any, index: number) => {
      if (this.currentView === 'menu' && menuActions[index]) {
        menuActions[index]();
      }
    });

    // Hotkey handlers
    this.registerKey(['s', 'S'], () => { if (this.currentView === 'menu') this.showGame(); });
    this.registerKey(['i', 'I'], () => { if (this.currentView === 'menu') this.showInstructions(); });
    this.registerKey(['h', 'H'], () => { if (this.currentView === 'menu') this.showHighScores(); });

    menuList.focus();
    this.screen.render();
  }

  // ============================================================================
  // Game View
  // ============================================================================

  private showGame(): void {
    this.currentView = 'game';
    this.clearMain();

    // View header
    createBox({
      parent: this.mainContainer,
      top: 0,
      left: 1,
      width: '98%',
      height: 3,
      border: { type: 'line' },
      label: ' Game ',
      style: {
        fg: 'white',
        bg: 'black',
        border: { fg: 'green' },
      },
      content: ' Game in progress...',
      tags: true,
      focusable: false,
    });

    // Game content area
    const gameBox = createBox({
      parent: this.mainContainer,
      top: 3,
      left: 1,
      width: '98%',
      height: '100%-6',
      border: { type: 'line' },
      style: {
        fg: 'white',
        bg: 'black',
        border: { fg: 'cyan' },
      },
      content: '{center}TODO: Implement your game here!{/center}',
      tags: true,
      focusable: true,
    });

    // View footer
    createBox({
      parent: this.mainContainer,
      bottom: 0,
      left: 1,
      width: '98%',
      height: 3,
      border: { type: 'line' },
      style: {
        fg: 'gray',
        bg: 'black',
        border: { fg: 'gray' },
      },
      content: ' {red-fg}[ESC]{/} Back to Menu',
      tags: true,
      focusable: false,
    });

    // ESC goes back (use setImmediate to avoid race condition)
    this.registerKey(['escape'], () => {
      if (this.currentView === 'game') {
        setImmediate(() => this.showMainMenu());
      }
    });

    gameBox.focus();
    this.screen.render();
  }

  // ============================================================================
  // Instructions View
  // ============================================================================

  private showInstructions(): void {
    this.currentView = 'instructions';
    this.clearMain();

    // View header
    createBox({
      parent: this.mainContainer,
      top: 0,
      left: 1,
      width: '98%',
      height: 3,
      border: { type: 'line' },
      label: ' Instructions ',
      style: {
        fg: 'white',
        bg: 'black',
        border: { fg: 'yellow' },
      },
      content: ' How to play',
      tags: true,
      focusable: false,
    });

    // Instructions content (scrollable)
    const contentBox = createBox({
      parent: this.mainContainer,
      top: 3,
      left: 1,
      width: '98%',
      height: '100%-6',
      border: { type: 'line' },
      style: {
        fg: 'white',
        bg: 'black',
        border: { fg: 'cyan' },
      },
      content: [
        '{bold}Welcome to {{displayName}}!{/bold}',
        '',
        'TODO: Add your game instructions here.',
        '',
        '{cyan-fg}Controls:{/}',
        '  Arrow keys - Navigate menus',
        '  Enter - Select option',
        '  ESC - Go back',
        '  Q - Quit (from main menu)',
        '',
        '{cyan-fg}Tips:{/}',
        '  - Mouse clicks work on all menus',
        '  - Scrollwheel scrolls long lists',
      ].join('\n'),
      tags: true,
      scrollable: true,
      alwaysScroll: true,
      keys: true,
      vi: true,
      mouse: true,
      padding: { left: 1, right: 1 },
    });

    // View footer
    createBox({
      parent: this.mainContainer,
      bottom: 0,
      left: 1,
      width: '98%',
      height: 3,
      border: { type: 'line' },
      style: {
        fg: 'gray',
        bg: 'black',
        border: { fg: 'gray' },
      },
      content: ' {cyan-fg}[Up/Down]{/} Scroll   {red-fg}[ESC]{/} Back to Menu',
      tags: true,
      focusable: false,
    });

    // ESC goes back
    this.registerKey(['escape'], () => {
      if (this.currentView === 'instructions') {
        setImmediate(() => this.showMainMenu());
      }
    });

    contentBox.focus();
    this.screen.render();
  }

  // ============================================================================
  // High Scores View
  // ============================================================================

  private showHighScores(): void {
    this.currentView = 'scores';
    this.clearMain();

    // View header
    createBox({
      parent: this.mainContainer,
      top: 0,
      left: 1,
      width: '98%',
      height: 3,
      border: { type: 'line' },
      label: ' High Scores ',
      style: {
        fg: 'white',
        bg: 'black',
        border: { fg: 'magenta' },
      },
      content: ' Top players',
      tags: true,
      focusable: false,
    });

    // Scores list
    const scoreItems = [
      '{yellow-fg}1.{/} Player1     {cyan-fg}10000{/}',
      '{yellow-fg}2.{/} Player2     {cyan-fg}8500{/}',
      '{yellow-fg}3.{/} Player3     {cyan-fg}7200{/}',
      '{gray-fg}(No more scores){/}',
    ];

    const scoresList = createList({
      parent: this.mainContainer,
      top: 3,
      left: 1,
      width: '98%',
      height: '100%-6',
      border: { type: 'line' },
      label: ' Leaderboard ',
      items: scoreItems,
      style: {
        fg: 'white',
        bg: 'black',
        border: { fg: 'cyan' },
        selected: { fg: 'black', bg: 'cyan' },
        item: { fg: 'white', bg: 'black' },
      },
      padding: { left: 1 },
    });

    // View footer
    createBox({
      parent: this.mainContainer,
      bottom: 0,
      left: 1,
      width: '98%',
      height: 3,
      border: { type: 'line' },
      style: {
        fg: 'gray',
        bg: 'black',
        border: { fg: 'gray' },
      },
      content: ' {red-fg}[ESC]{/} Back to Menu',
      tags: true,
      focusable: false,
    });

    // ESC goes back
    this.registerKey(['escape'], () => {
      if (this.currentView === 'scores') {
        setImmediate(() => this.showMainMenu());
      }
    });

    scoresList.focus();
    this.screen.render();
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  private quit(): void {
    this.cleanup();
  }

  private cleanup(): void {
    // Clear any remaining key handlers
    this.clearKeyHandlers();

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
}

// ============================================================================
// Door Export
// ============================================================================

const door = new ServerDoor({
  name: '{{displayName}}',
  version: '{{version}}',
  description: '{{description}}',
  author: '{{author}}',
});

door.onStart(async (ctx: DoorContext) => {
  const app = new {{className}}();
  app.setContext(ctx);
  await app.run();
});

door.onError((ctx: DoorContext, error: Error) => {
  console.error('[{{displayName}}] Error:', error);
});

export default door;
