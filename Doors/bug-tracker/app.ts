/**
 * Bug Tracker Application
 *
 * Main application logic for the bug tracking system.
 * Uses neo-blessed for modern TUI interface with:
 * - Panel-based layout
 * - Mouse support
 * - Keyboard navigation
 */

import {
  createScreen,
  createBox,
  createList,
  createTextbox,
  DoorInputManager,
} from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import type { Screen, Box, List, Textbox } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { T, S, applyTheme } from './door-theme-bugs';
import * as dialogs from './dialogs';
import {
  BugStorage,
  sendWebhook,
  CATEGORIES,
  PRIORITIES,
  STATUSES,
  type DoorSession,
  type BugReport,
  type BugCategory,
  type BugPriority,
  type BugStatus,
  type BugComment,
  type WebhookConfig,
} from './storage';
import * as fs from 'fs';
import * as path from 'path';

// Colours live in door-theme-bugs so the extracted dialogs share them.

// ============================================================================
// Main Application
// ============================================================================

export class BugTrackerApp {
  private session: DoorSession;
  // Public because dialogs.ts draws on it. A private member cannot satisfy
  // a public interface, so `this` would not be a DialogHost.
  screen: Screen;
  private inputManager: DoorInputManager;
  private storage: BugStorage;
  private username: string;
  private isSysop: boolean;

  // UI elements
  private headerBox!: Box;
  private mainContainer!: Box;
  private footerBox!: Box;
  // Public for the same reason, and it must stay a live reference: the
  // dialogs set it while they are open so key routing knows a modal is up.
  currentView: 'menu' | 'list' | 'detail' | 'create' | 'stats' | 'settings' | 'dialog' | 'search' = 'menu';
  private currentFilter: 'all' | 'mine' | 'open' | 'critical' = 'all';
  private keyHandlers: Array<{ keys: string[], handler: () => void }> = [];

  constructor(session: DoorSession) {
    this.session = session;
    this.username = session.user?.username || 'Anonymous';
    this.isSysop = (session.user?.securityLevel || 0) >= 255;

    // Get door path for data storage
    const doorPath = path.dirname(new URL(import.meta.url).pathname);
    this.storage = new BugStorage(doorPath);

    this.screen = this.createAppScreen();

    this.inputManager = new DoorInputManager(session, this.screen, {
      enableGameMode: false, // Menu-based, not game
      enableGrabKeys: true,
      enableMouse: true,
      debug: false,
      debugName: 'BugTracker',
    });
  }

  private createAppScreen(): Screen {
    applyTheme(this.session.bbs);

    const screen = createScreen(this.session.bbs, {
      title: 'Bug Tracker v1.0.0',
      fullUnicode: false,
      smartCSR: false,
      fastCSR: false,
      mouse: true,
    });
    screen.program.write('\x1b[2J');
    screen.program.write('\x1b[H');
    screen.clearRegion(0, screen.width, 0, screen.height);
    screen.alloc();

    // Mouse tracking handled by DoorInputManager
    return screen;
  }

  // Key handler management to prevent accumulation
  private registerKey(keys: string | string[], handler: () => void): void {
    const keyArray = Array.isArray(keys) ? keys : [keys];
    this.keyHandlers.push({ keys: keyArray, handler });
    this.screen.key(keyArray, handler);
  }

  private clearKeyHandlers(): void {
    for (const kh of this.keyHandlers) {
      this.screen.unkey(kh.keys, kh.handler);
    }
    this.keyHandlers = [];
  }

  async run(mode?: string): Promise<void> {
    this.inputManager.enable();

    // Create base layout
    this.createLayout();

    // Handle mode parameter
    if (mode === 'NEW') {
      this.showCreateBug();
    } else if (mode === 'LIST') {
      this.showBugList();
    } else if (mode === 'SEARCH') {
      this.showBugList(true);
    } else {
      this.showMainMenu();
    }

    this.screen.render();

    // Wait for exit - global handler ONLY for quitting from main menu
    // Each view handles its own ESC via registerKey()
    return new Promise<void>((resolve) => {
      this.screen.key(['q', 'Q'], () => {
        // Q only quits from main menu
        if (this.currentView === 'menu') {
          this.quit();
          resolve();
        }
      });

      this.screen.key(['escape'], () => {
        // Global ESC only quits from main menu
        // All other views handle ESC themselves via registerKey()
        if (this.currentView === 'menu') {
          this.quit();
          resolve();
        }
        // Don't do anything for other views - they register their own ESC handlers
      });
    });
  }

  private createLayout(): void {
    // Header - not focusable
    this.headerBox = createBox({
      parent: this.screen,
      top: 0,
      left: 0,
      width: '100%',
      height: 3,
      style: {
        fg: T.ink,
        bg: T.bar,
      },
      content: '{center}{bold}BUG TRACKER{/bold} - AmiExpress BBS Issue Management{/center}',
      tags: true,
      focusable: false,
      mouse: false,
      clickable: false,
    });

    // Main container - not focusable (children are)
    this.mainContainer = createBox({
      parent: this.screen,
      top: 3,
      left: 0,
      width: '100%',
      bottom: 3,
      style: {
        fg: T.ink,
        bg: T.ground,
      },
      focusable: false,
      mouse: false,
      clickable: false,
    });

    // Footer - not focusable
    this.footerBox = createBox({
      parent: this.screen,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 3,
      style: {
        fg: T.ink,
        bg: T.bar,
      },
      content: '{center}Q=Quit | ESC=Back | Arrow Keys=Navigate | Enter=Select{/center}',
      tags: true,
      focusable: false,
      mouse: false,
      clickable: false,
    });
  }

  private clearMain(): void {
    // Clear view-specific key handlers to prevent accumulation
    this.clearKeyHandlers();

    // Remove all children from main container
    const children = [...this.mainContainer.children];
    for (const child of children) {
      child.detach();
    }
  }

  // ============================================================================
  // Main Menu
  // ============================================================================

  private showMainMenu(): void {
    this.currentView = 'menu';
    this.clearMain();

    const stats = this.storage.getStats();
    const openBugs = stats.byStatus.new + stats.byStatus.acknowledged + stats.byStatus['in-progress'];

    // Header
    createBox({
      parent: this.mainContainer,
      top: 0,
      left: 1,
      width: '98%',
      height: 3,
      border: { type: 'line' },
      label: ' Bug Tracker ',
      style: {
        fg: T.ink,
        bg: T.ground,
        border: { fg: T.accent },
      },
      content: ` Welcome, ${this.username}! | ${stats.total} total bugs | ${openBugs} open`,
      tags: true,
      focusable: false,
      mouse: false,
      clickable: false,
    });

    // Menu items with actions
    const menuActions: Array<() => void> = [
      () => this.showCreateBug(),
      () => this.showBugList(),
      () => this.showBugList(false, this.username),
      () => this.showBugList(true),
      () => this.showAnalytics(),
    ];

    const menuLabels = [
      '[N] New Bug Report',
      '[L] List All Bugs',
      '[M] My Bug Reports',
      '[S] Search Bugs',
      '[A] Analytics Dashboard',
    ];

    if (this.isSysop) {
      menuLabels.push('[T] Sysop Tools');
      menuActions.push(() => this.showSysopTools());
      menuLabels.push('[W] Webhook Settings');
      menuActions.push(() => this.showWebhookSettings());
    }

    menuLabels.push('[Q] Quit');
    menuActions.push(() => this.quit());

    // Create menu list with arrow key navigation and mouse support
    const menuList = createList({
      parent: this.mainContainer,
      top: 3,
      left: 1,
      width: '48%',
      height: '100%-6',
      border: { type: 'line' },
      label: ' Menu ',
      items: menuLabels,
      mouse: true,
      keys: true,
      vi: false,
      style: {
        fg: T.ink,
        bg: T.ground,
        border: { fg: T.accent },
        selected: {
          fg: T.selectionInk,
          bg: T.accent,
        },
        item: {
          fg: T.ink,
          bg: T.ground,
        },
      },
      padding: { left: 1 },
    });

    menuList.focus();

    // Handle selection with Enter or mouse click
    menuList.on('select', (_item: any, index: number) => {
      if (this.currentView === 'menu' && menuActions[index]) {
        menuActions[index]();
      }
    });

    // Hotkey handlers
    this.registerKey(['n', 'N'], () => { if (this.currentView === 'menu') this.showCreateBug(); });
    this.registerKey(['l', 'L'], () => { if (this.currentView === 'menu') this.showBugList(); });
    this.registerKey(['m', 'M'], () => { if (this.currentView === 'menu') this.showBugList(false, this.username); });
    this.registerKey(['s', 'S'], () => { if (this.currentView === 'menu') this.showBugList(true); });
    this.registerKey(['a', 'A'], () => { if (this.currentView === 'menu') this.showAnalytics(); });
    if (this.isSysop) {
      this.registerKey(['t', 'T'], () => { if (this.currentView === 'menu') this.showSysopTools(); });
      this.registerKey(['w', 'W'], () => { if (this.currentView === 'menu') this.showWebhookSettings(); });
    }

    // Stats box on the right
    const statsContent = [
      '{bold}Quick Stats:{/bold}',
      '',
      `Total Bugs: ${stats.total}`,
      `Open: ${openBugs}`,
      `Fixed: ${stats.byStatus.fixed}`,
      `Closed: ${stats.byStatus.closed}`,
      '',
      '{bold}This Week:{/bold}',
      `Created: ${stats.recentlyCreated}`,
      `Resolved: ${stats.recentlyClosed}`,
      '',
      '{bold}By Priority:{/bold}',
      `{${T.accentAlt}-fg}Critical: ${stats.byPriority.critical}{/}`,
      `{${T.alert}-fg}High: ${stats.byPriority.high}{/}`,
      `{${T.warn}-fg}Medium: ${stats.byPriority.medium}{/}`,
      `{${T.dim}-fg}Low: ${stats.byPriority.low}{/}`,
    ];

    createBox({
      parent: this.mainContainer,
      top: 3,
      right: 1,
      width: '48%',
      height: '100%-6',
      border: { type: 'line' },
      label: ' Statistics ',
      style: {
        fg: T.ink,
        bg: T.ground,
        border: { fg: T.ok },
      },
      content: statsContent.join('\n'),
      tags: true,
      scrollable: true,
      mouse: true,
      padding: { left: 1, right: 1 },
      focusable: false,
      mouse: false,
      clickable: false,
    });

    // Footer
    createBox({
      parent: this.mainContainer,
      bottom: 0,
      left: 1,
      width: '98%',
      height: 3,
      border: { type: 'line' },
      style: {
        fg: T.dim,
        bg: T.ground,
        border: { fg: T.dim },
      },
      content: ` {${T.accent}-fg}[Enter]{/} Select   {${T.accent}-fg}[Hotkey]{/} Quick Action   {${T.alert}-fg}[Q]{/} Quit`,
      tags: true,
      focusable: false,
      mouse: false,
      clickable: false,
    });

    this.screen.render();
  }

  // ============================================================================
  // Bug List
  // ============================================================================

  private showBugList(showSearch: boolean = false, filterReporter?: string): void {
    this.currentView = 'list';
    this.clearMain();

    let bugs = this.storage.getBugs();

    // If filterReporter is passed explicitly (from menu), set the filter
    if (filterReporter) {
      this.currentFilter = 'mine';
    }

    // Apply current filter
    switch (this.currentFilter) {
      case 'mine':
        bugs = bugs.filter(b => b.reporter === this.username || b.assignee === this.username);
        break;
      case 'open':
        bugs = bugs.filter(b => !['closed', 'fixed', 'wont-fix'].includes(b.status));
        break;
      case 'critical':
        bugs = bugs.filter(b => b.priority === 'critical' || b.priority === 'high');
        break;
      // 'all' shows everything
    }

    // Sort by priority (critical first) then by date
    const priorityOrder: Record<BugPriority, number> = {
      critical: 0, high: 1, medium: 2, low: 3
    };
    bugs.sort((a, b) => {
      const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (pDiff !== 0) return pDiff;
      return b.createdAt - a.createdAt;
    });

    const filterLabels: Record<string, string> = {
      'all': 'All Bugs',
      'mine': 'My Bugs',
      'open': 'Open Bugs',
      'critical': 'Critical/High'
    };

    // Header
    createBox({
      parent: this.mainContainer,
      top: 0,
      left: 1,
      width: '98%',
      height: 3,
      border: { type: 'line' },
      label: ` ${filterLabels[this.currentFilter]} `,
      style: {
        fg: T.ink,
        bg: T.ground,
        border: { fg: T.accent },
      },
      content: ` Showing ${bugs.length} bug(s) | Filter: ${filterLabels[this.currentFilter]} | Press F to cycle filters`,
      tags: true,
      focusable: false,
      mouse: false,
      clickable: false,
    });

    // Format bug list items
    const listItems = bugs.map(bug => {
      const priorityColor = PRIORITIES.find(p => p.value === bug.priority)?.color || 'white';
      const statusColor = STATUSES.find(s => s.value === bug.status)?.color || 'white';
      const voteCount = bug.votes.length > 0 ? ` [+${bug.votes.length}]` : '';

      return `{${priorityColor}-fg}#${bug.id.toString().padStart(4, '0')}{/} {${statusColor}-fg}[${bug.status.toUpperCase().substring(0, 3)}]{/} ${bug.title.substring(0, 50)}${voteCount}`;
    });

    if (listItems.length === 0) {
      listItems.push(`{${T.dim}-fg}No bugs found - press N to create one{/}`);
    }

    const bugList = createList({
      parent: this.mainContainer,
      top: 3,
      left: 1,
      width: '98%',
      height: '100%-6',
      border: { type: 'line' },
      label: ' Bugs ',
      style: {
        fg: T.ink,
        bg: T.ground,
        border: { fg: T.accent },
        selected: {
          fg: T.selectionInk,
          bg: T.accent,
        },
        item: {
          fg: T.ink,
          bg: T.ground,
        },
      },
      items: listItems,
      tags: true,
      keys: true,
      vi: true,
      mouse: true,
      scrollbar: {
        ch: ' ',
        style: { bg: T.accent },
      },
      padding: { left: 1 },
    });

    // Footer
    createBox({
      parent: this.mainContainer,
      bottom: 0,
      left: 1,
      width: '98%',
      height: 3,
      border: { type: 'line' },
      style: {
        fg: T.dim,
        bg: T.ground,
        border: { fg: T.dim },
      },
      content: ` {${T.accent}-fg}[Enter]{/} View Bug   {${T.accent}-fg}[N]{/} New Bug   {${T.accent}-fg}[F]{/} Filter   {${T.alert}-fg}[ESC]{/} Back`,
      tags: true,
      focusable: false,
      mouse: false,
      clickable: false,
    });

    bugList.focus();

    // Select bug to view details
    bugList.on('select', (item: any, index: number) => {
      if (bugs[index]) {
        this.showBugDetail(bugs[index].id);
      }
    });

    this.registerKey(['n', 'N'], () => {
      if (this.currentView === 'list') this.showCreateBug();
    });

    // Filter cycling: F key cycles through filters
    this.registerKey(['f', 'F'], () => {
      if (this.currentView === 'list') {
        const filters: Array<'all' | 'mine' | 'open' | 'critical'> = ['all', 'mine', 'open', 'critical'];
        const idx = filters.indexOf(this.currentFilter);
        this.currentFilter = filters[(idx + 1) % filters.length];
        this.showBugList();
      }
    });

    // ESC goes back to main menu (deferred to avoid race with global handler)
    this.registerKey(['escape'], () => {
      if (this.currentView === 'list') {
        setImmediate(() => this.showMainMenu());
      }
    });

    this.screen.render();
  }

  // ============================================================================
  // Bug Detail
  // ============================================================================

  private showBugDetail(bugId: number): void {
    const bug = this.storage.getBug(bugId);
    if (!bug) {
      this.showMainMenu();
      return;
    }

    this.currentView = 'detail';
    this.clearMain();

    const priorityInfo = PRIORITIES.find(p => p.value === bug.priority);
    const statusInfo = STATUSES.find(s => s.value === bug.status);
    const categoryInfo = CATEGORIES.find(c => c.value === bug.category);
    const createdDate = new Date(bug.createdAt).toLocaleDateString();
    const updatedDate = new Date(bug.updatedAt).toLocaleDateString();

    // Header with summary
    createBox({
      parent: this.mainContainer,
      top: 0,
      left: 1,
      width: '98%',
      height: 3,
      border: { type: 'line' },
      label: ` Bug #${bug.id} `,
      style: {
        fg: T.ink,
        bg: T.ground,
        border: { fg: priorityInfo?.color || 'cyan' },
      },
      content: ` {bold}${bug.title}{/} | {${statusInfo?.color}-fg}${statusInfo?.label}{/} | {${priorityInfo?.color}-fg}${priorityInfo?.label}{/}`,
      tags: true,
      focusable: false,
      mouse: false,
      clickable: false,
    });

    // Main detail box
    const detailContent = [
      `{${T.accent}-fg}Category:{/} ${categoryInfo?.label || bug.category}`,
      `{${T.accent}-fg}Reporter:{/} ${bug.reporter}`,
      `{${T.accent}-fg}Assignee:{/} ${bug.assignee || 'Unassigned'}`,
      `{${T.accent}-fg}Votes:{/} ${bug.votes.length}`,
      `{${T.accent}-fg}Created:{/} ${createdDate} | {${T.accent}-fg}Updated:{/} ${updatedDate}`,
      '',
      '{bold}Description:{/bold}',
      bug.description || 'N/A',
      '',
      '{bold}Steps to Reproduce:{/bold}',
      bug.stepsToReproduce || 'N/A',
      '',
      '{bold}Expected Behavior:{/bold}',
      bug.expectedBehavior || 'N/A',
      '',
      '{bold}Actual Behavior:{/bold}',
      bug.actualBehavior || 'N/A',
    ];

    if (bug.tags.length > 0) {
      detailContent.push('', `{${T.accent}-fg}Tags:{/} ${bug.tags.join(', ')}`);
    }

    const detailBox = createBox({
      parent: this.mainContainer,
      top: 3,
      left: 1,
      width: '68%',
      height: 12,
      border: { type: 'line' },
      label: ' Details ',
      style: {
        fg: T.ink,
        bg: T.ground,
        border: { fg: T.accent },
      },
      content: detailContent.join('\n'),
      tags: true,
      scrollable: true,
      alwaysScroll: true,
      keys: true,
      vi: true,
      mouse: true,
      padding: { left: 1, right: 1 },
    });

    // Actions panel with clickable list
    const isOwner = bug.reporter === this.username;
    const actionLabels: string[] = ['[V] Vote', '[C] Add Comment'];
    const actionHandlers: Array<() => void> = [
      () => this.toggleVote(bugId),
      () => this.showAddComment(bugId),
    ];

    if (isOwner || this.isSysop) {
      actionLabels.push('[E] Edit Bug');
      actionHandlers.push(() => this.showEditBug(bugId));
    }
    if (this.isSysop) {
      actionLabels.push('[S] Change Status');
      actionHandlers.push(() => this.showChangeStatus(bugId));
      actionLabels.push('[A] Assign');
      actionHandlers.push(() => this.showAssignBug(bugId));
      actionLabels.push('[D] Delete');
      actionHandlers.push(() => this.confirmDeleteBug(bugId));
    }
    actionLabels.push('[ESC] Back');
    actionHandlers.push(() => this.showBugList());

    const actionList = createList({
      parent: this.mainContainer,
      top: 3,
      right: 1,
      width: '28%',
      height: 12,
      border: { type: 'line' },
      label: ' Actions ',
      items: actionLabels,
      mouse: true,
      keys: true,
      vi: false,
      style: {
        fg: T.ink,
        bg: T.ground,
        border: { fg: T.warn },
        selected: { fg: T.selectionInk, bg: T.warn },
        item: { fg: T.ink, bg: T.ground },
      },
      padding: { left: 1 },
    });

    actionList.on('select', (_item: any, index: number) => {
      if (this.currentView === 'detail' && actionHandlers[index]) {
        actionHandlers[index]();
      }
    });

    // Comments section
    const commentItems = bug.comments
      .filter(c => !c.isInternal || this.isSysop)
      .map(c => {
        const date = new Date(c.timestamp).toLocaleDateString();
        const prefix = c.isInternal ? `{${T.accentAlt}-fg}[INTERNAL]{/} ` : '';
        return `${prefix}{${T.accent}-fg}${c.author}{/} (${date}):\n  ${c.content}`;
      });

    if (commentItems.length === 0) {
      commentItems.push(`{${T.dim}-fg}No comments yet - press C to add one{/}`);
    }

    createBox({
      parent: this.mainContainer,
      top: 15,
      left: 1,
      width: '98%',
      height: '100%-18',
      border: { type: 'line' },
      label: ` Comments (${bug.comments.length}) `,
      style: {
        fg: T.ink,
        bg: T.ground,
        border: { fg: T.ok },
      },
      content: commentItems.join('\n\n'),
      tags: true,
      scrollable: true,
      alwaysScroll: true,
      keys: true,
      vi: true,
      mouse: true,
      padding: { left: 1, right: 1 },
    });

    // Footer
    createBox({
      parent: this.mainContainer,
      bottom: 0,
      left: 1,
      width: '98%',
      height: 3,
      border: { type: 'line' },
      style: {
        fg: T.dim,
        bg: T.ground,
        border: { fg: T.dim },
      },
      content: ` {${T.accent}-fg}[Enter]{/} Select Action   {${T.accent}-fg}[Hotkey]{/} Quick Action   {${T.alert}-fg}[ESC]{/} Back`,
      tags: true,
      focusable: false,
      mouse: false,
      clickable: false,
    });

    // Key handlers
    this.registerKey(['v', 'V'], () => {
      if (this.currentView === 'detail') {
        this.toggleVote(bugId);
      }
    });

    this.registerKey(['c', 'C'], () => {
      if (this.currentView === 'detail') {
        this.showAddComment(bugId);
      }
    });

    if (isOwner || this.isSysop) {
      this.registerKey(['e', 'E'], () => {
        if (this.currentView === 'detail') {
          this.showEditBug(bugId);
        }
      });
    }

    if (this.isSysop) {
      this.registerKey(['s', 'S'], () => {
        if (this.currentView === 'detail') {
          this.showChangeStatus(bugId);
        }
      });

      this.registerKey(['a', 'A'], () => {
        if (this.currentView === 'detail') {
          this.showAssignBug(bugId);
        }
      });

      this.registerKey(['d', 'D'], () => {
        if (this.currentView === 'detail') {
          this.confirmDeleteBug(bugId);
        }
      });
    }

    // ESC goes back to bug list (deferred to avoid race with global handler)
    this.registerKey(['escape'], () => {
      if (this.currentView === 'detail') {
        setImmediate(() => this.showBugList());
      }
    });

    actionList.focus();
    this.screen.render();
  }

  // ============================================================================
  // Create Bug
  // ============================================================================

  private showCreateBug(): void {
    this.currentView = 'create';
    this.clearMain();

    // Form fields data
    const fields: { name: string; value: string; multiline?: boolean }[] = [
      { name: 'Title', value: '' },
      { name: 'Category', value: 'general' },
      { name: 'Priority', value: 'medium' },
      { name: 'Description', value: '', multiline: true },
      { name: 'Steps to Reproduce', value: '', multiline: true },
      { name: 'Expected Behavior', value: '' },
      { name: 'Actual Behavior', value: '' },
    ];

    // Header with instructions
    createBox({
      parent: this.mainContainer,
      top: 0,
      left: 1,
      width: '98%',
      height: 3,
      border: { type: 'line' },
      label: ' New Bug Report ',
      style: {
        fg: T.ink,
        bg: T.ground,
        border: { fg: T.warn },
      },
      content: ' Use arrows/mouse to select field. Enter to edit. F10 to submit. ESC to cancel.',
      tags: true,
      focusable: false,
      mouse: false,
      clickable: false,
    });

    // Generate list items from fields
    const generateItems = (): string[] => {
      return fields.map(field => {
        let displayValue = field.value || `{${T.dim}-fg}(empty){/}`;

        if (field.name === 'Category') {
          const cat = CATEGORIES.find(c => c.value === field.value);
          displayValue = cat?.label || field.value;
        } else if (field.name === 'Priority') {
          const pri = PRIORITIES.find(p => p.value === field.value);
          displayValue = `{${pri?.color || 'white'}-fg}${pri?.label || field.value}{/}`;
        } else if (field.value.length > 50) {
          displayValue = field.value.substring(0, 50) + '...';
        }

        return `{bold}${field.name.padEnd(20)}{/} ${displayValue}`;
      });
    };

    // Create navigable list for form fields
    const fieldList = createList({
      parent: this.mainContainer,
      top: 3,
      left: 1,
      width: '98%',
      height: '100%-6',
      border: { type: 'line' },
      style: {
        fg: T.ink,
        bg: T.ground,
        border: { fg: T.accent },
        selected: { fg: T.selectionInk, bg: T.accent },
        item: { fg: T.ink, bg: T.ground },
      },
      items: generateItems(),
      keys: true,
      vi: true,
      mouse: true,
      tags: true,
      scrollable: true,
      alwaysScroll: true,
      padding: { left: 1, right: 1 },
    });

    // Footer with actions
    createBox({
      parent: this.mainContainer,
      bottom: 0,
      left: 1,
      width: '98%',
      height: 3,
      border: { type: 'line' },
      style: {
        fg: T.dim,
        bg: T.ground,
        border: { fg: T.dim },
      },
      content: ` {${T.accent}-fg}[Enter]{/} Edit Field   {${T.accent}-fg}[F10]{/} Submit   {${T.alert}-fg}[ESC]{/} Cancel`,
      tags: true,
      focusable: false,
      mouse: false,
      clickable: false,
    });

    const editField = (fieldIdx: number) => {
      const field = fields[fieldIdx];

      if (field.name === 'Category') {
        this.showSelector('Select Category', CATEGORIES.map(c => c.label), (idx) => {
          if (idx !== -1) {
            field.value = CATEGORIES[idx].value;
          }
          fieldList.setItems(generateItems());
          fieldList.select(fieldIdx);
          this.screen.render();
        });
      } else if (field.name === 'Priority') {
        this.showSelector('Select Priority', PRIORITIES.map(p => p.label), (idx) => {
          if (idx !== -1) {
            field.value = PRIORITIES[idx].value;
          }
          fieldList.setItems(generateItems());
          fieldList.select(fieldIdx);
          this.screen.render();
        });
      } else {
        this.showTextInput(field.name, field.value, field.multiline || false, (value) => {
          if (value !== null) {
            field.value = value;
          }
          fieldList.setItems(generateItems());
          fieldList.select(fieldIdx);
          this.screen.render();
        });
      }
    };

    const submitForm = () => {
      const title = fields.find(f => f.name === 'Title')?.value.trim();
      if (!title) {
        this.showMessage('Error', 'Title is required');
        return;
      }

      const bug = this.storage.createBug({
        title,
        description: fields.find(f => f.name === 'Description')?.value || '',
        category: fields.find(f => f.name === 'Category')?.value as BugCategory || 'general',
        priority: fields.find(f => f.name === 'Priority')?.value as BugPriority || 'medium',
        status: 'new',
        reporter: this.username,
        assignee: null,
        stepsToReproduce: fields.find(f => f.name === 'Steps to Reproduce')?.value || '',
        expectedBehavior: fields.find(f => f.name === 'Expected Behavior')?.value || '',
        actualBehavior: fields.find(f => f.name === 'Actual Behavior')?.value || '',
        systemInfo: '',
        tags: [],
        attachments: [],
      });

      sendWebhook(this.storage, 'create', bug);

      this.showMessage('Success', `Bug #${bug.id} created successfully!`, () => {
        this.showBugDetail(bug.id);
      });
    };

    // List selection handler for Enter/mouse click
    fieldList.on('select', (_: any, idx: number) => {
      editField(idx);
    });

    // Key handlers
    this.registerKey(['f10'], () => {
      if (this.currentView === 'create') {
        submitForm();
      }
    });

    // ESC goes back to main menu (deferred to avoid race with global handler)
    this.registerKey(['escape'], () => {
      if (this.currentView === 'create') {
        setImmediate(() => this.showMainMenu());
      }
    });

    fieldList.focus();
    this.screen.render();
  }

  // ============================================================================
  // Analytics Dashboard
  // ============================================================================

  private showAnalytics(): void {
    this.currentView = 'stats';
    this.clearMain();

    const stats = this.storage.getStats();

    // Calculate percentages
    const openBugs = stats.byStatus.new + stats.byStatus.acknowledged + stats.byStatus['in-progress'];
    const closedBugs = stats.byStatus.fixed + stats.byStatus.closed + stats.byStatus['wont-fix'];
    const openPct = stats.total > 0 ? Math.round((openBugs / stats.total) * 100) : 0;

    // Header
    createBox({
      parent: this.mainContainer,
      top: 0,
      left: 1,
      width: '98%',
      height: 3,
      border: { type: 'line' },
      label: ' Analytics Dashboard ',
      style: {
        fg: T.ink,
        bg: T.ground,
        border: { fg: T.ok },
      },
      content: ` Total: ${stats.total} bugs | Open: ${openBugs} (${openPct}%) | Closed: ${closedBugs}`,
      tags: true,
      focusable: false,
      mouse: false,
      clickable: false,
    });

    // Create bar chart for priorities
    const priorityBars: string[] = [];
    const maxPriority = Math.max(...Object.values(stats.byPriority), 1);
    PRIORITIES.forEach(p => {
      const count = stats.byPriority[p.value];
      const barLen = Math.round((count / maxPriority) * 30);
      const bar = '='.repeat(barLen);
      priorityBars.push(`{${p.color}-fg}${p.label.padEnd(8)}{/} [${bar.padEnd(30)}] ${count}`);
    });

    // Create bar chart for categories
    const categoryBars: string[] = [];
    const maxCategory = Math.max(...Object.values(stats.byCategory), 1);
    CATEGORIES.forEach(c => {
      const count = stats.byCategory[c.value];
      const barLen = Math.round((count / maxCategory) * 25);
      const bar = '#'.repeat(barLen);
      categoryBars.push(`${c.label.padEnd(15)} [${bar.padEnd(25)}] ${count}`);
    });

    // Status breakdown
    const statusLines: string[] = [];
    STATUSES.forEach(s => {
      const count = stats.byStatus[s.value];
      statusLines.push(`  {${s.color}-fg}${s.label.padEnd(12)}{/}: ${count}`);
    });

    const content = [
      `{bold}This Week:{/}`,
      `  New Bugs Created: ${stats.recentlyCreated}`,
      `  Bugs Resolved: ${stats.recentlyClosed}`,
      '',
      '{bold}By Priority:{/bold}',
      ...priorityBars,
      '',
      '{bold}By Category:{/bold}',
      ...categoryBars,
      '',
      '{bold}Status Breakdown:{/bold}',
      ...statusLines,
    ];

    // Main content area (scrollable)
    const analyticsBox = createBox({
      parent: this.mainContainer,
      top: 3,
      left: 1,
      width: '98%',
      height: '100%-6',
      border: { type: 'line' },
      style: {
        fg: T.ink,
        bg: T.ground,
        border: { fg: T.accent },
      },
      content: content.join('\n'),
      tags: true,
      scrollable: true,
      alwaysScroll: true,
      keys: true,
      vi: true,
      mouse: true,
      padding: { left: 1, right: 1 },
    });

    // Footer
    createBox({
      parent: this.mainContainer,
      bottom: 0,
      left: 1,
      width: '98%',
      height: 3,
      border: { type: 'line' },
      style: {
        fg: T.dim,
        bg: T.ground,
        border: { fg: T.dim },
      },
      content: ` {${T.accent}-fg}[Up/Down]{/} Scroll   {${T.alert}-fg}[ESC]{/} Back to Menu`,
      tags: true,
      focusable: false,
      mouse: false,
      clickable: false,
    });

    analyticsBox.focus();

    // ESC goes back to main menu (deferred to avoid race with global handler)
    this.registerKey(['escape'], () => {
      if (this.currentView === 'stats') {
        setImmediate(() => this.showMainMenu());
      }
    });

    this.screen.render();
  }

  // ============================================================================
  // Webhook Settings (Sysop only)
  // ============================================================================

  private showWebhookSettings(): void {
    if (!this.isSysop) return;

    this.currentView = 'settings';
    this.clearMain();

    const webhooks = this.storage.getWebhooks();

    // Header
    createBox({
      parent: this.mainContainer,
      top: 0,
      left: 1,
      width: '98%',
      height: 3,
      border: { type: 'line' },
      label: ' Webhook Settings ',
      style: {
        fg: T.ink,
        bg: T.ground,
        border: { fg: T.warn },
      },
      content: ` ${webhooks.length} webhook(s) configured | Notifications for bug events`,
      tags: true,
      focusable: false,
      mouse: false,
      clickable: false,
    });

    const listItems = webhooks.map((w, idx) => {
      const status = w.enabled ? `{${T.ok}-fg}[ON]{/}` : `{${T.alert}-fg}[OFF]{/}`;
      return `${status} ${w.type.toUpperCase().padEnd(8)} ${w.url.substring(0, 50)}${w.url.length > 50 ? '...' : ''}`;
    });

    if (listItems.length === 0) {
      listItems.push(`{${T.dim}-fg}No webhooks configured - press A to add one{/}`);
    }

    const webhookList = createList({
      parent: this.mainContainer,
      top: 3,
      left: 1,
      width: '98%',
      height: '100%-6',
      border: { type: 'line' },
      label: ' Webhooks ',
      style: {
        fg: T.ink,
        bg: T.ground,
        border: { fg: T.accent },
        selected: { fg: T.selectionInk, bg: T.accent },
        item: { fg: T.ink, bg: T.ground },
      },
      items: listItems,
      tags: true,
      keys: true,
      vi: true,
      mouse: true,
      padding: { left: 1 },
    });

    // Footer
    createBox({
      parent: this.mainContainer,
      bottom: 0,
      left: 1,
      width: '98%',
      height: 3,
      border: { type: 'line' },
      style: {
        fg: T.dim,
        bg: T.ground,
        border: { fg: T.dim },
      },
      content: ` {${T.accent}-fg}[A]{/} Add   {${T.accent}-fg}[D]{/} Delete   {${T.accent}-fg}[T]{/} Toggle   {${T.alert}-fg}[ESC]{/} Back`,
      tags: true,
      focusable: false,
      mouse: false,
      clickable: false,
    });

    webhookList.focus();

    this.registerKey(['a', 'A'], () => {
      if (this.currentView === 'settings') {
        this.showAddWebhook();
      }
    });

    this.registerKey(['d', 'D'], () => {
      if (this.currentView === 'settings' && webhooks.length > 0) {
        const idx = (webhookList as any).selected || 0;
        this.storage.removeWebhook(idx);
        this.showWebhookSettings();
      }
    });

    this.registerKey(['t', 'T'], () => {
      if (this.currentView === 'settings' && webhooks.length > 0) {
        const idx = (webhookList as any).selected || 0;
        webhooks[idx].enabled = !webhooks[idx].enabled;
        this.storage.save();
        this.showWebhookSettings();
      }
    });

    // ESC goes back to main menu (deferred to avoid race with global handler)
    this.registerKey(['escape'], () => {
      if (this.currentView === 'settings') {
        setImmediate(() => this.showMainMenu());
      }
    });

    this.screen.render();
  }

  private showAddWebhook(): void {
    this.showSelector('Webhook Type', ['Discord', 'Slack', 'Generic'], (typeIdx) => {
      if (typeIdx === -1) {
        this.showWebhookSettings();
        return;
      }

      const type = ['discord', 'slack', 'generic'][typeIdx] as 'discord' | 'slack' | 'generic';

      this.showTextInput('Webhook URL', '', false, (url) => {
        if (url && url.trim()) {
          this.storage.addWebhook({
            enabled: true,
            url: url.trim(),
            type,
            events: ['create', 'update', 'close', 'comment'],
          });
        }
        this.showWebhookSettings();
      });
    });
  }

  // ============================================================================
  // Sysop Tools (Sysop only)
  // ============================================================================

  private showSysopTools(): void {
    if (!this.isSysop) return;

    this.currentView = 'settings';
    this.clearMain();

    const stats = this.storage.getStats();
    const openBugs = stats.byStatus.new + stats.byStatus.acknowledged + stats.byStatus['in-progress'];
    const fixedBugs = stats.byStatus.fixed;
    const closedBugs = stats.byStatus.closed + stats.byStatus['wont-fix'];

    // Header
    createBox({
      parent: this.mainContainer,
      top: 0,
      left: 1,
      width: '98%',
      height: 3,
      border: { type: 'line' },
      label: ' Sysop Tools ',
      style: {
        fg: T.ink,
        bg: T.ground,
        border: { fg: T.alert },
      },
      content: ` Open: ${openBugs} | Fixed (pending close): ${fixedBugs} | Closed: ${closedBugs}`,
      tags: true,
      focusable: false,
      mouse: false,
      clickable: false,
    });

    const toolLabels = [
      '[B] Bulk Status Change',
      '[A] Bulk Assign',
      '[C] Close All Fixed Bugs',
      '[P] Purge Closed Bugs',
      '[R] Report by User',
      '[X] Back to Menu',
    ];

    const toolActions: Array<() => void> = [
      () => this.showBulkStatusChange(),
      () => this.showBulkAssign(),
      () => this.closeAllFixedBugs(),
      () => this.purgeClosedBugs(),
      () => this.showUserReport(),
      () => this.showMainMenu(),
    ];

    const toolList = createList({
      parent: this.mainContainer,
      top: 3,
      left: 1,
      width: '98%',
      height: '100%-6',
      border: { type: 'line' },
      label: ' Available Tools ',
      style: {
        fg: T.ink,
        bg: T.ground,
        border: { fg: T.accent },
        selected: { fg: T.selectionInk, bg: T.alert },
        item: { fg: T.ink, bg: T.ground },
      },
      items: toolLabels,
      tags: true,
      keys: true,
      vi: true,
      mouse: true,
      padding: { left: 1 },
    });

    // Footer
    createBox({
      parent: this.mainContainer,
      bottom: 0,
      left: 1,
      width: '98%',
      height: 3,
      border: { type: 'line' },
      style: {
        fg: T.dim,
        bg: T.ground,
        border: { fg: T.dim },
      },
      content: ` {${T.accent}-fg}[Enter]{/} Select Tool   {${T.accent}-fg}[Hotkey]{/} Quick Action   {${T.alert}-fg}[ESC]{/} Back`,
      tags: true,
      focusable: false,
      mouse: false,
      clickable: false,
    });

    toolList.focus();

    toolList.on('select', (_item: any, index: number) => {
      if (toolActions[index]) {
        toolActions[index]();
      }
    });

    // Hotkeys
    this.registerKey(['b', 'B'], () => { if (this.currentView === 'settings') this.showBulkStatusChange(); });
    this.registerKey(['a', 'A'], () => { if (this.currentView === 'settings') this.showBulkAssign(); });
    this.registerKey(['c', 'C'], () => { if (this.currentView === 'settings') this.closeAllFixedBugs(); });
    this.registerKey(['p', 'P'], () => { if (this.currentView === 'settings') this.purgeClosedBugs(); });
    this.registerKey(['r', 'R'], () => { if (this.currentView === 'settings') this.showUserReport(); });
    this.registerKey(['x', 'X'], () => { if (this.currentView === 'settings') this.showMainMenu(); });

    // ESC goes back to main menu (deferred to avoid race with global handler)
    this.registerKey(['escape'], () => {
      if (this.currentView === 'settings') {
        setImmediate(() => this.showMainMenu());
      }
    });

    this.screen.render();
  }

  private showBulkStatusChange(): void {
    // First select which bugs to change (by current status)
    const statusOptions = STATUSES.map(s => `${s.label} bugs`);
    statusOptions.unshift('All Open Bugs');

    this.showSelector('Select Bugs to Change', statusOptions, (fromIdx) => {
      if (fromIdx === -1) {
        this.showSysopTools();
        return;
      }

      // Then select target status
      this.showSelector('Change To Status', STATUSES.map(s => s.label), (toIdx) => {
        if (toIdx === -1) {
          this.showSysopTools();
          return;
        }

        const targetStatus = STATUSES[toIdx].value;
        let bugs = this.storage.getBugs();

        if (fromIdx === 0) {
          // All open bugs
          bugs = bugs.filter(b => !['closed', 'fixed', 'wont-fix'].includes(b.status));
        } else {
          // Specific status
          const fromStatus = STATUSES[fromIdx - 1].value;
          bugs = bugs.filter(b => b.status === fromStatus);
        }

        let changed = 0;
        bugs.forEach(bug => {
          this.storage.updateBug(bug.id, { status: targetStatus });
          changed++;
        });

        this.showMessage('Bulk Update', `Changed ${changed} bugs to ${STATUSES[toIdx].label}.`, () => {
          this.showSysopTools();
        });
      });
    });
  }

  private showBulkAssign(): void {
    // Get known users
    const bugs = this.storage.getBugs();
    const knownUsers = new Set<string>();
    bugs.forEach(b => {
      if (b.reporter) knownUsers.add(b.reporter);
      if (b.assignee) knownUsers.add(b.assignee);
    });

    const userList = ['(Unassign All)', '(Enter custom username)', ...Array.from(knownUsers).sort()];

    // First select which bugs
    const filterOptions = [
      'All Unassigned Bugs',
      'All Open Bugs',
      'All Critical/High Bugs',
    ];

    this.showSelector('Select Bugs to Assign', filterOptions, (filterIdx) => {
      if (filterIdx === -1) {
        this.showSysopTools();
        return;
      }

      this.showSelector('Assign To', userList, (userIdx) => {
        if (userIdx === -1) {
          this.showSysopTools();
          return;
        }

        const handleAssignment = (assignee: string | null) => {
          let bugsToAssign = this.storage.getBugs();

          switch (filterIdx) {
            case 0: // Unassigned
              bugsToAssign = bugsToAssign.filter(b => !b.assignee);
              break;
            case 1: // Open
              bugsToAssign = bugsToAssign.filter(b => !['closed', 'fixed', 'wont-fix'].includes(b.status));
              break;
            case 2: // Critical/High
              bugsToAssign = bugsToAssign.filter(b => b.priority === 'critical' || b.priority === 'high');
              break;
          }

          let assigned = 0;
          bugsToAssign.forEach(bug => {
            this.storage.updateBug(bug.id, { assignee });
            assigned++;
          });

          const msg = assignee ? `Assigned ${assigned} bugs to ${assignee}.` : `Unassigned ${assigned} bugs.`;
          this.showMessage('Bulk Assign', msg, () => this.showSysopTools());
        };

        if (userIdx === 0) {
          // Unassign all
          handleAssignment(null);
        } else if (userIdx === 1) {
          // Custom username
          this.showTextInput('Enter Username', '', false, (username) => {
            if (username && username.trim()) {
              handleAssignment(username.trim());
            } else {
              this.showSysopTools();
            }
          });
        } else {
          // Selected user
          handleAssignment(Array.from(knownUsers).sort()[userIdx - 2]);
        }
      });
    });
  }

  private closeAllFixedBugs(): void {
    const fixedBugs = this.storage.getBugs().filter(b => b.status === 'fixed');

    if (fixedBugs.length === 0) {
      this.showMessage('No Bugs', 'No fixed bugs to close.', () => this.showSysopTools());
      return;
    }

    this.showConfirm('Close Fixed Bugs', `Close all ${fixedBugs.length} fixed bugs?`, (confirmed) => {
      if (confirmed) {
        fixedBugs.forEach(bug => {
          this.storage.updateBug(bug.id, { status: 'closed' });
        });
        this.showMessage('Done', `Closed ${fixedBugs.length} bugs.`, () => this.showSysopTools());
      } else {
        this.showSysopTools();
      }
    });
  }

  private purgeClosedBugs(): void {
    const closedBugs = this.storage.getBugs().filter(b => b.status === 'closed' || b.status === 'wont-fix');

    if (closedBugs.length === 0) {
      this.showMessage('No Bugs', 'No closed bugs to purge.', () => this.showSysopTools());
      return;
    }

    this.showConfirm('Purge Closed Bugs', `PERMANENTLY DELETE ${closedBugs.length} closed bugs?`, (confirmed) => {
      if (confirmed) {
        closedBugs.forEach(bug => {
          this.storage.deleteBug(bug.id);
        });
        this.showMessage('Purged', `Deleted ${closedBugs.length} bugs.`, () => this.showSysopTools());
      } else {
        this.showSysopTools();
      }
    });
  }

  private showUserReport(): void {
    const bugs = this.storage.getBugs();
    const userStats: Record<string, { reported: number; assigned: number; commented: number }> = {};

    bugs.forEach(bug => {
      // Reporter stats
      if (bug.reporter) {
        if (!userStats[bug.reporter]) {
          userStats[bug.reporter] = { reported: 0, assigned: 0, commented: 0 };
        }
        userStats[bug.reporter].reported++;
      }

      // Assignee stats
      if (bug.assignee) {
        if (!userStats[bug.assignee]) {
          userStats[bug.assignee] = { reported: 0, assigned: 0, commented: 0 };
        }
        userStats[bug.assignee].assigned++;
      }

      // Comment stats
      bug.comments.forEach(comment => {
        if (comment.author) {
          if (!userStats[comment.author]) {
            userStats[comment.author] = { reported: 0, assigned: 0, commented: 0 };
          }
          userStats[comment.author].commented++;
        }
      });
    });

    this.currentView = 'stats';
    this.clearMain();

    const userCount = Object.keys(userStats).length;

    // Header
    createBox({
      parent: this.mainContainer,
      top: 0,
      left: 1,
      width: '98%',
      height: 3,
      border: { type: 'line' },
      label: ' User Activity Report ',
      style: {
        fg: T.ink,
        bg: T.ground,
        border: { fg: T.accentAlt },
      },
      content: ` Tracking ${userCount} user(s) across ${bugs.length} bug(s)`,
      tags: true,
      focusable: false,
      mouse: false,
      clickable: false,
    });

    // Generate report lines
    const lines: string[] = [
      '{bold}User                 Reported  Assigned  Comments{/}',
      `{${T.dim}-fg}` + '-'.repeat(55) + '{/}',
    ];

    Object.entries(userStats)
      .sort((a, b) => (b[1].reported + b[1].assigned) - (a[1].reported + a[1].assigned))
      .forEach(([user, stats]) => {
        const row = `${user.padEnd(20)} ${stats.reported.toString().padStart(8)}  ${stats.assigned.toString().padStart(8)}  ${stats.commented.toString().padStart(8)}`;
        lines.push(row);
      });

    if (userCount === 0) {
      lines.push(`{${T.dim}-fg}No user activity yet{/}`);
    }

    // Main content (scrollable)
    const reportBox = createBox({
      parent: this.mainContainer,
      top: 3,
      left: 1,
      width: '98%',
      height: '100%-6',
      border: { type: 'line' },
      style: {
        fg: T.ink,
        bg: T.ground,
        border: { fg: T.accent },
      },
      content: lines.join('\n'),
      tags: true,
      scrollable: true,
      alwaysScroll: true,
      keys: true,
      vi: true,
      mouse: true,
      padding: { left: 1, right: 1 },
    });

    // Footer
    createBox({
      parent: this.mainContainer,
      bottom: 0,
      left: 1,
      width: '98%',
      height: 3,
      border: { type: 'line' },
      style: {
        fg: T.dim,
        bg: T.ground,
        border: { fg: T.dim },
      },
      content: ` {${T.accent}-fg}[Up/Down]{/} Scroll   {${T.alert}-fg}[ESC]{/} Back to Sysop Tools`,
      tags: true,
      focusable: false,
      mouse: false,
      clickable: false,
    });

    reportBox.focus();

    // ESC goes back to sysop tools (deferred to avoid race with global handler)
    this.registerKey(['escape'], () => {
      if (this.currentView === 'stats') {
        setImmediate(() => this.showSysopTools());
      }
    });

    this.screen.render();
  }

  // ============================================================================
  // Helper Actions
  // ============================================================================

  private toggleVote(bugId: number): void {
    const bug = this.storage.getBug(bugId);
    if (!bug) return;

    if (bug.votes.includes(this.username)) {
      this.storage.unvoteBug(bugId, this.username);
      this.showMessage('Vote Removed', 'Your vote has been removed.');
    } else {
      this.storage.voteBug(bugId, this.username);
      this.showMessage('Voted', 'Your vote has been recorded!');
    }

    this.showBugDetail(bugId);
  }

  private showAddComment(bugId: number): void {
    this.showTextInput('Add Comment', '', true, (content) => {
      if (content && content.trim()) {
        const isInternal = this.isSysop && content.startsWith('[INTERNAL]');
        const cleanContent = isInternal ? content.substring(10).trim() : content.trim();

        this.storage.addComment(bugId, {
          author: this.username,
          content: cleanContent,
          isInternal,
        });

        const bug = this.storage.getBug(bugId);
        if (bug) {
          sendWebhook(this.storage, 'comment', bug);
        }
      }
      this.showBugDetail(bugId);
    });
  }

  private showEditBug(bugId: number): void {
    const bug = this.storage.getBug(bugId);
    if (!bug) return;

    // Simplified edit - just title and description for now
    this.showTextInput('Edit Title', bug.title, false, (title) => {
      if (title && title.trim()) {
        this.storage.updateBug(bugId, { title: title.trim() });
        const updatedBug = this.storage.getBug(bugId);
        if (updatedBug) {
          sendWebhook(this.storage, 'update', updatedBug);
        }
      }
      this.showBugDetail(bugId);
    });
  }

  private showChangeStatus(bugId: number): void {
    this.showSelector('Change Status', STATUSES.map(s => s.label), (idx) => {
      if (idx !== -1) {
        this.storage.updateBug(bugId, { status: STATUSES[idx].value });
        const bug = this.storage.getBug(bugId);
        if (bug) {
          const event = bug.status === 'closed' || bug.status === 'fixed' ? 'close' : 'update';
          sendWebhook(this.storage, event, bug);
        }
      }
      this.showBugDetail(bugId);
    });
  }

  private showAssignBug(bugId: number): void {
    // Get known users from bug data (reporters + existing assignees)
    const bugs = this.storage.getBugs();
    const knownUsers = new Set<string>();
    bugs.forEach(b => {
      if (b.reporter) knownUsers.add(b.reporter);
      if (b.assignee) knownUsers.add(b.assignee);
      b.comments.forEach(c => {
        if (c.author) knownUsers.add(c.author);
      });
    });

    // Build selection list
    const userList = Array.from(knownUsers).sort();
    const options = [
      '(Unassign)',
      '(Enter custom username)',
      ...userList
    ];

    this.showSelector('Assign Bug To', options, (idx) => {
      if (idx === -1) {
        // Cancelled
        this.showBugDetail(bugId);
        return;
      }

      if (idx === 0) {
        // Unassign
        this.storage.updateBug(bugId, { assignee: null });
        const bug = this.storage.getBug(bugId);
        if (bug) sendWebhook(this.storage, 'update', bug);
        this.showMessage('Updated', 'Bug unassigned.', () => this.showBugDetail(bugId));
      } else if (idx === 1) {
        // Custom username
        this.showTextInput('Enter Username', '', false, (assignee) => {
          if (assignee && assignee.trim()) {
            this.storage.updateBug(bugId, { assignee: assignee.trim() });
            const bug = this.storage.getBug(bugId);
            if (bug) sendWebhook(this.storage, 'update', bug);
            this.showMessage('Assigned', `Bug assigned to ${assignee.trim()}.`, () => this.showBugDetail(bugId));
          } else {
            this.showBugDetail(bugId);
          }
        });
      } else {
        // Selected from list
        const selectedUser = userList[idx - 2];
        this.storage.updateBug(bugId, { assignee: selectedUser });
        const bug = this.storage.getBug(bugId);
        if (bug) sendWebhook(this.storage, 'update', bug);
        this.showMessage('Assigned', `Bug assigned to ${selectedUser}.`, () => this.showBugDetail(bugId));
      }
    });
  }

  private confirmDeleteBug(bugId: number): void {
    const bug = this.storage.getBug(bugId);
    if (!bug) return;

    this.showConfirm(`Delete Bug #${bugId}?`, `Are you sure you want to delete "${bug.title}"?`, (confirmed) => {
      if (confirmed) {
        this.storage.deleteBug(bugId);
        this.showMessage('Deleted', `Bug #${bugId} has been deleted.`, () => {
          this.showBugList();
        });
      } else {
        this.showBugDetail(bugId);
      }
    });
  }

  // ============================================================================
  // UI Helpers
  // ============================================================================

  // The dialogs themselves live in dialogs.ts - they know nothing about
  // bugs, and app.ts was over the line-count ceiling. These keep the call
  // sites unchanged, and keep their types: a `...args: any[]` bridge made
  // every callback parameter implicitly any at the caller.
  private showSelector(title: string, items: string[], callback: (idx: number) => void): void {
    dialogs.showSelector(this, title, items, callback);
  }
  private showTextInput(
    title: string,
    defaultValue: string,
    multiline: boolean,
    callback: (value: string | null) => void
  ): void {
    dialogs.showTextInput(this, title, defaultValue, multiline, callback);
  }
  private showMessage(title: string, message: string, callback?: () => void): void {
    dialogs.showMessage(this, title, message, callback);
  }
  private showConfirm(title: string, message: string, callback: (confirmed: boolean) => void): void {
    dialogs.showConfirm(this, title, message, callback);
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  private quit(): void {
    this.inputManager.disable();
    this.screen.destroy();
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export async function createApp(session: DoorSession, mode?: string): Promise<void> {
  const app = new BugTrackerApp(session);
  await app.run(mode);
}
