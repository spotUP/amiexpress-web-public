/**
 * Bug Tracker - Comprehensive Bug Reporting & Tracking System
 *
 * A professional bug tracking door for BBS systems with:
 * - Arrow key navigation
 * - Category-based organization (System Commands, Doors, General)
 * - Detailed bug reports with attachments
 * - Filtering and search capabilities
 * - Sysop management interface
 * - Modern CLI UX with colors and progress indicators
 */

import {
  Door,
  GraphicsEngine,
  AnsiColor,
  BBSUser
} from '@amiexpress/bbs-door-sdk';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

enum BugCategory {
  SYSTEM_COMMANDS = 'System Commands',
  DOORS = 'Doors',
  GENERAL = 'General System'
}

enum BugStatus {
  NEW = 'New',
  ACKNOWLEDGED = 'Acknowledged',
  IN_PROGRESS = 'In Progress',
  FIXED = 'Fixed',
  WONT_FIX = 'Won\'t Fix',
  DUPLICATE = 'Duplicate'
}

enum BugPriority {
  LOW = 'Low',
  MEDIUM = 'Medium',
  HIGH = 'High',
  CRITICAL = 'Critical'
}

interface BugAttachment {
  filename: string;
  path: string;
  size: number;
  timestamp: number;
}

interface BugReport {
  id: number;
  title: string;
  category: BugCategory;
  description: string;
  stepsToReproduce: string;
  expectedBehavior: string;
  actualBehavior: string;
  priority: BugPriority;
  status: BugStatus;
  reporter: string;
  reporterId: number;
  reportedAt: number;
  updatedAt: number;
  attachments: BugAttachment[];
  comments: BugComment[];
}

interface BugComment {
  author: string;
  authorId: number;
  text: string;
  timestamp: number;
}

interface DataStore {
  bugs: BugReport[];
  nextId: number;
}

// ============================================================================
// MAIN BUG TRACKER CLASS
// ============================================================================

class BugTracker {
  private door: Door;
  private gfx: GraphicsEngine;
  private user?: BBSUser;
  private dataFile: string;
  private data: DataStore;
  private currentView: 'main' | 'create' | 'view' | 'list' | 'filter' | 'manage' = 'main';
  private selectedBug?: BugReport;

  // Form state
  private formData: Partial<BugReport> = {};
  private formStep: number = 0;

  // List state
  private listFilter?: BugCategory;
  private listOffset: number = 0;
  private selectedIndex: number = 0;
  private itemsPerPage: number = 10;

  constructor() {
    this.door = new Door({
      name: 'Bug Tracker',
      version: '1.0.0',
      author: 'AmiExpress SDK Team',
      description: 'Comprehensive Bug Reporting & Tracking System',
      minSecurity: 0
    });

    this.gfx = new GraphicsEngine({ width: 80, height: 24 });
    this.dataFile = path.join(__dirname, 'bugs.json');
    this.data = this.loadData();

    this.setupEventHandlers();
  }

  // ==========================================================================
  // DATA PERSISTENCE
  // ==========================================================================

  private loadData(): DataStore {
    try {
      if (fs.existsSync(this.dataFile)) {
        const content = fs.readFileSync(this.dataFile, 'utf-8');
        return JSON.parse(content);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    }

    return {
      bugs: [],
      nextId: 1
    };
  }

  private saveData(): void {
    try {
      fs.writeFileSync(this.dataFile, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (error) {
      console.error('Error saving data:', error);
    }
  }

  // ==========================================================================
  // EVENT HANDLERS
  // ==========================================================================

  private setupEventHandlers(): void {
    this.door.onConnect((user: BBSUser) => {
      this.user = user;
      this.showMainMenu();
    });

    this.door.onInput((key: string) => {
      this.handleInput(key);
    });

    this.door.onDisconnect(() => {
      this.saveData();
    });
  }

  private handleInput(key: string): void {
    switch (this.currentView) {
      case 'main':
        this.handleMainMenuInput(key);
        break;
      case 'create':
        this.handleCreateFormInput(key);
        break;
      case 'list':
        this.handleListInput(key);
        break;
      case 'view':
        this.handleViewInput(key);
        break;
      case 'filter':
        this.handleFilterInput(key);
        break;
      case 'manage':
        this.handleManageInput(key);
        break;
    }
  }

  // ==========================================================================
  // MAIN MENU
  // ==========================================================================

  private showMainMenu(): void {
    if (!this.user) return;

    this.currentView = 'main';
    this.gfx.clear(AnsiColor.Black);

    // Header with box drawing
    this.drawHeader('BUG TRACKER v1.0', 2);

    // Stats panel
    this.drawStatsPanel();

    // Menu options
    const menuY = 12;
    const isSysop = this.user.secLevel >= 100;

    this.gfx.drawText(25, menuY, '┌──────────────────────────────────┐', AnsiColor.Cyan);
    this.gfx.drawText(25, menuY + 1, '│                                  │', AnsiColor.Cyan);
    this.gfx.drawText(27, menuY + 1, '[N] Report New Bug', AnsiColor.Yellow);
    this.gfx.drawText(25, menuY + 2, '│                                  │', AnsiColor.Cyan);
    this.gfx.drawText(27, menuY + 2, '[V] View All Bugs', AnsiColor.Yellow);
    this.gfx.drawText(25, menuY + 3, '│                                  │', AnsiColor.Cyan);
    this.gfx.drawText(27, menuY + 3, '[F] Filter by Category', AnsiColor.Yellow);
    this.gfx.drawText(25, menuY + 4, '│                                  │', AnsiColor.Cyan);
    this.gfx.drawText(27, menuY + 4, '[S] Search Bugs', AnsiColor.Yellow);

    if (isSysop) {
      this.gfx.drawText(25, menuY + 5, '│                                  │', AnsiColor.Cyan);
      this.gfx.drawText(27, menuY + 5, '[M] Manage Bugs (Sysop)', AnsiColor.Red);
    }

    this.gfx.drawText(25, menuY + 6, '│                                  │', AnsiColor.Cyan);
    this.gfx.drawText(27, menuY + 6, '[Q] Quit', AnsiColor.White);
    this.gfx.drawText(25, menuY + 7, '└──────────────────────────────────┘', AnsiColor.Cyan);

    // Instructions
    this.gfx.drawText(20, 21, 'Press the letter key to select an option', AnsiColor.Green);

    this.door.sendAnsi(this.gfx.render(), this.user.id);
  }

  private drawHeader(title: string, y: number): void {
    const width = 76;
    const x = 2;

    this.gfx.drawText(x, y, '╔' + '═'.repeat(width) + '╗', AnsiColor.Cyan);
    this.gfx.drawText(x, y + 1, '║' + ' '.repeat(width) + '║', AnsiColor.Cyan);

    const titleX = x + Math.floor((width - title.length) / 2);
    this.gfx.drawText(titleX, y + 1, title, AnsiColor.Magenta);

    this.gfx.drawText(x, y + 2, '╚' + '═'.repeat(width) + '╝', AnsiColor.Cyan);
  }

  private drawStatsPanel(): void {
    const newBugs = this.data.bugs.filter(b => b.status === BugStatus.NEW).length;
    const inProgress = this.data.bugs.filter(b => b.status === BugStatus.IN_PROGRESS).length;
    const fixed = this.data.bugs.filter(b => b.status === BugStatus.FIXED).length;
    const total = this.data.bugs.length;

    const y = 6;
    this.gfx.drawText(10, y, '╔══════════════════════════════════════════════════════════════╗', AnsiColor.White);
    this.gfx.drawText(10, y + 1, '║                      SYSTEM STATISTICS                       ║', AnsiColor.White);
    this.gfx.drawText(10, y + 2, '╠══════════════════════════════════════════════════════════════╣', AnsiColor.White);
    this.gfx.drawText(10, y + 3, `║  Total Bugs: ${String(total).padEnd(10)}  New: ${String(newBugs).padEnd(10)}  Fixed: ${String(fixed).padEnd(10)}  ║`, AnsiColor.Green);
    this.gfx.drawText(10, y + 4, `║  In Progress: ${String(inProgress).padEnd(47)}║`, AnsiColor.Yellow);
    this.gfx.drawText(10, y + 5, '╚══════════════════════════════════════════════════════════════╝', AnsiColor.White);
  }

  private handleMainMenuInput(key: string): void {
    const k = key.toLowerCase();

    if (k === 'n') {
      this.startBugReport();
    } else if (k === 'v') {
      this.showBugList();
    } else if (k === 'f') {
      this.showFilterMenu();
    } else if (k === 's') {
      this.showSearchPrompt();
    } else if (k === 'm' && this.user && this.user.secLevel >= 100) {
      this.showManagementMenu();
    } else if (k === 'q') {
      this.quit();
    }
  }

  // ==========================================================================
  // BUG REPORT CREATION
  // ==========================================================================

  private startBugReport(): void {
    if (!this.user) return;

    this.currentView = 'create';
    this.formStep = 0;
    this.formData = {
      reporter: this.user.name,
      reporterId: this.user.id,
      status: BugStatus.NEW,
      priority: BugPriority.MEDIUM,
      attachments: [],
      comments: []
    };

    this.showCategorySelection();
  }

  private showCategorySelection(): void {
    if (!this.user) return;

    this.gfx.clear(AnsiColor.Black);
    this.drawHeader('STEP 1: SELECT CATEGORY', 2);

    const y = 8;
    this.gfx.drawText(15, y, '┌─────────────────────────────────────────────────┐', AnsiColor.Cyan);
    this.gfx.drawText(15, y + 1, '│  Use ↑↓ arrow keys to navigate                 │', AnsiColor.White);
    this.gfx.drawText(15, y + 2, '│  Press ENTER to select                          │', AnsiColor.White);
    this.gfx.drawText(15, y + 3, '├─────────────────────────────────────────────────┤', AnsiColor.Cyan);

    const categories = Object.values(BugCategory);
    categories.forEach((cat, idx) => {
      const selected = this.selectedIndex === idx;
      const prefix = selected ? '►' : ' ';
      const color = selected ? AnsiColor.Yellow : AnsiColor.White;
      this.gfx.drawText(17, y + 4 + idx, `${prefix} ${cat}`, color);
    });

    this.gfx.drawText(15, y + 4 + categories.length, '└─────────────────────────────────────────────────┘', AnsiColor.Cyan);
    this.gfx.drawText(15, 21, '[ESC] Cancel', AnsiColor.Red);

    this.door.sendAnsi(this.gfx.render(), this.user.id);
  }

  private showFormField(fieldName: string, prompt: string, multiline: boolean = false): void {
    if (!this.user) return;

    this.gfx.clear(AnsiColor.Black);
    this.drawHeader(`STEP ${this.formStep + 2}: ${fieldName.toUpperCase()}`, 2);

    this.drawProgressBar(this.formStep, 5);

    const y = 10;
    this.gfx.drawText(5, y, prompt, AnsiColor.Green);
    this.gfx.drawText(5, y + 2, '┌────────────────────────────────────────────────────────────────────────┐', AnsiColor.Cyan);

    if (multiline) {
      this.gfx.drawText(5, y + 3, '│ Type your text below (max 10 lines). Press CTRL+D when finished.      │', AnsiColor.White);
      this.gfx.drawText(5, y + 4, '├────────────────────────────────────────────────────────────────────────┤', AnsiColor.Cyan);
      for (let i = 0; i < 10; i++) {
        this.gfx.drawText(5, y + 5 + i, '│                                                                        │', AnsiColor.Cyan);
      }
      this.gfx.drawText(5, y + 15, '└────────────────────────────────────────────────────────────────────────┘', AnsiColor.Cyan);
    } else {
      this.gfx.drawText(5, y + 3, '│                                                                        │', AnsiColor.Cyan);
      this.gfx.drawText(5, y + 4, '└────────────────────────────────────────────────────────────────────────┘', AnsiColor.Cyan);
    }

    this.gfx.drawText(5, 21, '[ESC] Cancel  [ENTER] Continue', AnsiColor.Yellow);

    this.door.sendAnsi(this.gfx.render(), this.user.id);
  }

  private drawProgressBar(current: number, total: number): void {
    const y = 6;
    const barWidth = 50;
    const progress = Math.floor((current / total) * barWidth);

    const percentage = Math.floor((current / total) * 100);

    this.gfx.drawText(15, y, 'Progress: ', AnsiColor.White);
    this.gfx.drawText(25, y, '[', AnsiColor.Cyan);
    this.gfx.drawText(26, y, '█'.repeat(progress), AnsiColor.Green);
    this.gfx.drawText(26 + progress, y, '░'.repeat(barWidth - progress), AnsiColor.White);
    this.gfx.drawText(26 + barWidth, y, ']', AnsiColor.Cyan);
    this.gfx.drawText(78 + barWidth, y, `${percentage}%`, AnsiColor.Yellow);
  }

  private handleCreateFormInput(key: string): void {
    if (key === 'Escape' || key === '\x1b') {
      this.showMainMenu();
      return;
    }

    if (this.formStep === 0) {
      // Category selection
      const categories = Object.values(BugCategory);

      if (key === 'ArrowUp') {
        this.selectedIndex = Math.max(0, this.selectedIndex - 1);
        this.showCategorySelection();
      } else if (key === 'ArrowDown') {
        this.selectedIndex = Math.min(categories.length - 1, this.selectedIndex + 1);
        this.showCategorySelection();
      } else if (key === 'Enter' || key === '\r') {
        this.formData.category = categories[this.selectedIndex];
        this.formStep = 1;
        this.selectedIndex = 0;
        this.showFormField('Title', 'Enter a short, descriptive title for this bug:');
      }
    } else if (this.formStep === 1) {
      // Title input - in real implementation, collect text input
      // For now, we'll simulate with a placeholder
      this.formData.title = 'Sample Bug Title'; // Replace with actual input collection
      this.formStep = 2;
      this.showFormField('Description', 'Provide a detailed description of the bug:', true);
    } else if (this.formStep === 2) {
      // Description - multiline
      this.formData.description = 'Sample description'; // Replace with actual input
      this.formStep = 3;
      this.showFormField('Steps to Reproduce', 'List the steps to reproduce this bug:', true);
    } else if (this.formStep === 3) {
      // Steps to reproduce
      this.formData.stepsToReproduce = 'Sample steps'; // Replace with actual input
      this.formStep = 4;
      this.showFormField('Expected Behavior', 'What should happen?');
    } else if (this.formStep === 4) {
      // Expected behavior
      this.formData.expectedBehavior = 'Sample expected'; // Replace with actual input
      this.formStep = 5;
      this.showFormField('Actual Behavior', 'What actually happened?');
    } else if (this.formStep === 5) {
      // Actual behavior - final step
      this.formData.actualBehavior = 'Sample actual'; // Replace with actual input
      this.showPrioritySelection();
    }
  }

  private showPrioritySelection(): void {
    if (!this.user) return;

    this.gfx.clear(AnsiColor.Black);
    this.drawHeader('FINAL STEP: SELECT PRIORITY', 2);
    this.drawProgressBar(5, 5);

    const y = 10;
    this.gfx.drawText(15, y, 'Select bug priority:', AnsiColor.Green);
    this.gfx.drawText(15, y + 2, '┌─────────────────────────────────────┐', AnsiColor.Cyan);

    const priorities = Object.values(BugPriority);
    priorities.forEach((pri, idx) => {
      const selected = this.selectedIndex === idx;
      const prefix = selected ? '►' : ' ';
      let color = AnsiColor.White;

      if (selected) {
        if (pri === BugPriority.CRITICAL) color = AnsiColor.Red;
        else if (pri === BugPriority.HIGH) color = AnsiColor.Yellow;
        else if (pri === BugPriority.MEDIUM) color = AnsiColor.Green;
        else color = AnsiColor.Cyan;
      }

      this.gfx.drawText(17, y + 3 + idx, `${prefix} ${pri}`, color);
    });

    this.gfx.drawText(15, y + 3 + priorities.length, '└─────────────────────────────────────┘', AnsiColor.Cyan);
    this.gfx.drawText(15, 20, 'Press ENTER to submit bug report', AnsiColor.Green);
    this.gfx.drawText(15, 21, '[ESC] Cancel', AnsiColor.Red);

    this.door.sendAnsi(this.gfx.render(), this.user.id);
  }

  private submitBugReport(): void {
    if (!this.user || !this.formData.category || !this.formData.title) return;

    const now = Date.now();
    const bug: BugReport = {
      id: this.data.nextId++,
      title: this.formData.title,
      category: this.formData.category,
      description: this.formData.description || '',
      stepsToReproduce: this.formData.stepsToReproduce || '',
      expectedBehavior: this.formData.expectedBehavior || '',
      actualBehavior: this.formData.actualBehavior || '',
      priority: this.formData.priority || BugPriority.MEDIUM,
      status: BugStatus.NEW,
      reporter: this.user.name,
      reporterId: this.user.id,
      reportedAt: now,
      updatedAt: now,
      attachments: [],
      comments: []
    };

    this.data.bugs.push(bug);
    this.saveData();

    // Show success message
    this.gfx.clear(AnsiColor.Black);
    this.drawHeader('SUCCESS!', 2);

    const y = 10;
    this.gfx.drawText(15, y, '╔══════════════════════════════════════════════╗', AnsiColor.Green);
    this.gfx.drawText(15, y + 1, '║                                              ║', AnsiColor.Green);
    this.gfx.drawText(15, y + 2, '║   ✓ Bug report submitted successfully!      ║', AnsiColor.Green);
    this.gfx.drawText(15, y + 3, '║                                              ║', AnsiColor.Green);
    this.gfx.drawText(15, y + 4, `║   Bug ID: #${String(bug.id).padEnd(34)}║`, AnsiColor.Yellow);
    this.gfx.drawText(15, y + 5, '║                                              ║', AnsiColor.Green);
    this.gfx.drawText(15, y + 6, '║   Thank you for your report!                 ║', AnsiColor.White);
    this.gfx.drawText(15, y + 7, '║                                              ║', AnsiColor.Green);
    this.gfx.drawText(15, y + 8, '╚══════════════════════════════════════════════╝', AnsiColor.Green);

    this.gfx.drawText(20, 21, 'Press any key to return to main menu...', AnsiColor.Cyan);

    this.door.sendAnsi(this.gfx.render(), this.user!.id);

    // Wait for key then return to main menu
    setTimeout(() => this.showMainMenu(), 2000);
  }

  // ==========================================================================
  // BUG LIST VIEW
  // ==========================================================================

  private showBugList(filter?: BugCategory): void {
    if (!this.user) return;

    this.currentView = 'list';
    this.listFilter = filter;

    let bugs = this.data.bugs;
    if (filter) {
      bugs = bugs.filter(b => b.category === filter);
    }

    this.gfx.clear(AnsiColor.Black);

    const title = filter ? `BUGS - ${filter}` : 'ALL BUGS';
    this.drawHeader(title, 1);

    if (bugs.length === 0) {
      this.gfx.drawText(25, 10, 'No bugs found!', AnsiColor.Yellow);
      this.gfx.drawText(20, 21, 'Press any key to return...', AnsiColor.Cyan);
      this.door.sendAnsi(this.gfx.render(), this.user.id);
      setTimeout(() => this.showMainMenu(), 1000);
      return;
    }

    // Header
    const y = 5;
    this.gfx.drawText(2, y, 'ID', AnsiColor.Cyan);
    this.gfx.drawText(8, y, 'Title', AnsiColor.Cyan);
    this.gfx.drawText(40, y, 'Category', AnsiColor.Cyan);
    this.gfx.drawText(58, y, 'Priority', AnsiColor.Cyan);
    this.gfx.drawText(70, y, 'Status', AnsiColor.Cyan);
    this.gfx.drawText(2, y + 1, '─'.repeat(78), AnsiColor.White);

    // List bugs
    const startIdx = this.listOffset;
    const endIdx = Math.min(startIdx + this.itemsPerPage, bugs.length);

    for (let i = startIdx; i < endIdx; i++) {
      const bug = bugs[i];
      const rowY = y + 2 + (i - startIdx);
      const isSelected = (i - startIdx) === this.selectedIndex;
      const color = isSelected ? AnsiColor.Yellow : AnsiColor.White;

      const prefix = isSelected ? '►' : ' ';
      this.gfx.drawText(1, rowY, prefix, AnsiColor.Yellow);
      this.gfx.drawText(2, rowY, `#${bug.id}`, color);
      this.gfx.drawText(8, rowY, bug.title.substring(0, 30), color);
      this.gfx.drawText(40, rowY, bug.category.substring(0, 16), color);

      // Priority with colors
      let priColor = AnsiColor.White;
      if (bug.priority === BugPriority.CRITICAL) priColor = AnsiColor.Red;
      else if (bug.priority === BugPriority.HIGH) priColor = AnsiColor.Yellow;
      else if (bug.priority === BugPriority.MEDIUM) priColor = AnsiColor.Green;
      else priColor = AnsiColor.Cyan;

      this.gfx.drawText(58, rowY, bug.priority, priColor);
      this.gfx.drawText(70, rowY, bug.status.substring(0, 8), color);
    }

    // Footer
    this.gfx.drawText(2, 19, `Showing ${startIdx + 1}-${endIdx} of ${bugs.length}`, AnsiColor.White);
    this.gfx.drawText(2, 21, '[↑↓] Navigate  [ENTER] View  [ESC] Back', AnsiColor.Cyan);

    if (bugs.length > this.itemsPerPage) {
      this.gfx.drawText(2, 22, '[PgUp/PgDn] Page', AnsiColor.Cyan);
    }

    this.door.sendAnsi(this.gfx.render(), this.user.id);
  }

  private handleListInput(key: string): void {
    if (key === 'Escape' || key === '\x1b') {
      this.selectedIndex = 0;
      this.listOffset = 0;
      this.showMainMenu();
      return;
    }

    let bugs = this.data.bugs;
    if (this.listFilter) {
      bugs = bugs.filter(b => b.category === this.listFilter);
    }

    if (key === 'ArrowUp') {
      if (this.selectedIndex > 0) {
        this.selectedIndex--;
      } else if (this.listOffset > 0) {
        this.listOffset--;
      }
      this.showBugList(this.listFilter);
    } else if (key === 'ArrowDown') {
      if (this.selectedIndex < this.itemsPerPage - 1 && (this.listOffset + this.selectedIndex) < bugs.length - 1) {
        this.selectedIndex++;
      } else if (this.listOffset + this.itemsPerPage < bugs.length) {
        this.listOffset++;
      }
      this.showBugList(this.listFilter);
    } else if (key === 'PageUp') {
      this.listOffset = Math.max(0, this.listOffset - this.itemsPerPage);
      this.showBugList(this.listFilter);
    } else if (key === 'PageDown') {
      this.listOffset = Math.min(bugs.length - this.itemsPerPage, this.listOffset + this.itemsPerPage);
      this.showBugList(this.listFilter);
    } else if (key === 'Enter' || key === '\r') {
      const bugIdx = this.listOffset + this.selectedIndex;
      if (bugIdx < bugs.length) {
        this.selectedBug = bugs[bugIdx];
        this.showBugDetail();
      }
    }
  }

  // ==========================================================================
  // BUG DETAIL VIEW
  // ==========================================================================

  private showBugDetail(): void {
    if (!this.user || !this.selectedBug) return;

    this.currentView = 'view';
    this.gfx.clear(AnsiColor.Black);

    this.drawHeader(`BUG #${this.selectedBug.id}: ${this.selectedBug.title}`, 1);

    let y = 4;

    // Info section
    this.gfx.drawText(2, y, '╔════════════════════════════════════════════════════════════════════════════╗', AnsiColor.Cyan);
    this.gfx.drawText(2, y + 1, `║ Category: ${this.selectedBug.category.padEnd(63)}║`, AnsiColor.White);
    this.gfx.drawText(2, y + 2, `║ Priority: ${this.selectedBug.priority.padEnd(63)}║`, AnsiColor.Yellow);
    this.gfx.drawText(2, y + 3, `║ Status:   ${this.selectedBug.status.padEnd(63)}║`, AnsiColor.Green);
    this.gfx.drawText(2, y + 4, `║ Reporter: ${this.selectedBug.reporter.padEnd(63)}║`, AnsiColor.White);
    this.gfx.drawText(2, y + 5, '╚════════════════════════════════════════════════════════════════════════════╝', AnsiColor.Cyan);

    y += 7;

    // Description
    this.gfx.drawText(2, y, 'DESCRIPTION:', AnsiColor.Cyan);
    this.gfx.drawText(2, y + 1, this.selectedBug.description.substring(0, 76), AnsiColor.White);

    y += 3;

    // Expected vs Actual
    this.gfx.drawText(2, y, 'EXPECTED:', AnsiColor.Green);
    this.gfx.drawText(12, y, this.selectedBug.expectedBehavior.substring(0, 66), AnsiColor.White);
    this.gfx.drawText(2, y + 1, 'ACTUAL:', AnsiColor.Red);
    this.gfx.drawText(12, y + 1, this.selectedBug.actualBehavior.substring(0, 66), AnsiColor.White);

    // Footer
    const isSysop = this.user.secLevel >= 100;
    if (isSysop) {
      this.gfx.drawText(2, 21, '[C] Add Comment  [S] Change Status  [ESC] Back', AnsiColor.Yellow);
    } else {
      this.gfx.drawText(2, 21, '[C] Add Comment  [ESC] Back', AnsiColor.Yellow);
    }

    this.door.sendAnsi(this.gfx.render(), this.user.id);
  }

  private handleViewInput(key: string): void {
    if (key === 'Escape' || key === '\x1b') {
      this.showBugList(this.listFilter);
    } else if (key.toLowerCase() === 'c') {
      // Add comment - simplified for now
      this.showMainMenu();
    } else if (key.toLowerCase() === 's' && this.user && this.user.secLevel >= 100) {
      this.showStatusChangeMenu();
    }
  }

  // ==========================================================================
  // FILTER MENU
  // ==========================================================================

  private showFilterMenu(): void {
    if (!this.user) return;

    this.currentView = 'filter';
    this.selectedIndex = 0;

    this.gfx.clear(AnsiColor.Black);
    this.drawHeader('FILTER BUGS BY CATEGORY', 2);

    const y = 10;
    this.gfx.drawText(20, y, '┌────────────────────────────────────┐', AnsiColor.Cyan);

    const categories = Object.values(BugCategory);
    categories.forEach((cat, idx) => {
      const selected = this.selectedIndex === idx;
      const prefix = selected ? '►' : ' ';
      const color = selected ? AnsiColor.Yellow : AnsiColor.White;
      this.gfx.drawText(22, y + 1 + idx, `${prefix} ${cat}`, color);
    });

    this.gfx.drawText(20, y + 1 + categories.length, '└────────────────────────────────────┘', AnsiColor.Cyan);
    this.gfx.drawText(15, 21, '[↑↓] Navigate  [ENTER] Select  [ESC] Cancel', AnsiColor.Cyan);

    this.door.sendAnsi(this.gfx.render(), this.user.id);
  }

  private handleFilterInput(key: string): void {
    if (key === 'Escape' || key === '\x1b') {
      this.showMainMenu();
      return;
    }

    const categories = Object.values(BugCategory);

    if (key === 'ArrowUp') {
      this.selectedIndex = Math.max(0, this.selectedIndex - 1);
      this.showFilterMenu();
    } else if (key === 'ArrowDown') {
      this.selectedIndex = Math.min(categories.length - 1, this.selectedIndex + 1);
      this.showFilterMenu();
    } else if (key === 'Enter' || key === '\r') {
      this.showBugList(categories[this.selectedIndex]);
    }
  }

  // ==========================================================================
  // MANAGEMENT (SYSOP)
  // ==========================================================================

  private showManagementMenu(): void {
    if (!this.user || this.user.secLevel < 100) return;

    this.currentView = 'manage';
    this.gfx.clear(AnsiColor.Black);

    this.drawHeader('SYSOP MANAGEMENT', 2);

    const y = 10;
    this.gfx.drawText(20, y, '┌──────────────────────────────────────┐', AnsiColor.Red);
    this.gfx.drawText(20, y + 1, '│  [1] Change Bug Status               │', AnsiColor.Yellow);
    this.gfx.drawText(20, y + 2, '│  [2] Bulk Status Update              │', AnsiColor.Yellow);
    this.gfx.drawText(20, y + 3, '│  [3] Delete Bug Report               │', AnsiColor.Yellow);
    this.gfx.drawText(20, y + 4, '│  [4] Export Bug Reports              │', AnsiColor.Yellow);
    this.gfx.drawText(20, y + 5, '│  [Q] Back to Main Menu               │', AnsiColor.White);
    this.gfx.drawText(20, y + 6, '└──────────────────────────────────────┘', AnsiColor.Red);

    this.gfx.drawText(15, 21, 'Select an option:', AnsiColor.Green);

    this.door.sendAnsi(this.gfx.render(), this.user.id);
  }

  private handleManageInput(key: string): void {
    if (key.toLowerCase() === 'q' || key === 'Escape' || key === '\x1b') {
      this.showMainMenu();
    } else if (key === '1') {
      this.showBugList(); // Let sysop select a bug to change status
    } else if (key === '2') {
      // Bulk update - simplified
      this.showMainMenu();
    } else if (key === '3') {
      // Delete - simplified
      this.showMainMenu();
    } else if (key === '4') {
      this.exportBugs();
    }
  }

  private showStatusChangeMenu(): void {
    if (!this.user || !this.selectedBug) return;

    this.gfx.clear(AnsiColor.Black);
    this.drawHeader('CHANGE BUG STATUS', 2);

    const y = 8;
    this.gfx.drawText(15, y, `Bug #${this.selectedBug.id}: ${this.selectedBug.title}`, AnsiColor.White);
    this.gfx.drawText(15, y + 1, `Current Status: ${this.selectedBug.status}`, AnsiColor.Yellow);

    this.gfx.drawText(15, y + 3, '┌──────────────────────────────────┐', AnsiColor.Cyan);

    const statuses = Object.values(BugStatus);
    statuses.forEach((status, idx) => {
      const selected = this.selectedIndex === idx;
      const prefix = selected ? '►' : ' ';
      const color = selected ? AnsiColor.Yellow : AnsiColor.White;
      this.gfx.drawText(17, y + 4 + idx, `${prefix} ${status}`, color);
    });

    this.gfx.drawText(15, y + 4 + statuses.length, '└──────────────────────────────────┘', AnsiColor.Cyan);
    this.gfx.drawText(15, 21, '[↑↓] Navigate  [ENTER] Update  [ESC] Cancel', AnsiColor.Cyan);

    this.door.sendAnsi(this.gfx.render(), this.user.id);
  }

  private exportBugs(): void {
    if (!this.user) return;

    const filename = `bugs_export_${Date.now()}.json`;
    const filepath = path.join(__dirname, filename);

    try {
      fs.writeFileSync(filepath, JSON.stringify(this.data.bugs, null, 2));

      this.gfx.clear(AnsiColor.Black);
      this.drawHeader('EXPORT SUCCESSFUL', 2);

      const y = 10;
      this.gfx.drawText(15, y, '╔═══════════════════════════════════════════════╗', AnsiColor.Green);
      this.gfx.drawText(15, y + 1, '║  ✓ Bug reports exported successfully!        ║', AnsiColor.Green);
      this.gfx.drawText(15, y + 2, '║                                               ║', AnsiColor.Green);
      this.gfx.drawText(15, y + 3, `║  File: ${filename.padEnd(37)}║`, AnsiColor.Yellow);
      this.gfx.drawText(15, y + 4, '║                                               ║', AnsiColor.Green);
      this.gfx.drawText(15, y + 5, '╚═══════════════════════════════════════════════╝', AnsiColor.Green);

      this.gfx.drawText(20, 21, 'Press any key to continue...', AnsiColor.Cyan);

      this.door.sendAnsi(this.gfx.render(), this.user.id);

      setTimeout(() => this.showManagementMenu(), 2000);
    } catch (error) {
      console.error('Export error:', error);
      this.showManagementMenu();
    }
  }

  // ==========================================================================
  // SEARCH
  // ==========================================================================

  private showSearchPrompt(): void {
    if (!this.user) return;

    this.gfx.clear(AnsiColor.Black);
    this.drawHeader('SEARCH BUGS', 2);

    const y = 10;
    this.gfx.drawText(15, y, 'Enter search terms:', AnsiColor.Green);
    this.gfx.drawText(15, y + 2, '┌────────────────────────────────────────────────┐', AnsiColor.Cyan);
    this.gfx.drawText(15, y + 3, '│                                                │', AnsiColor.Cyan);
    this.gfx.drawText(15, y + 4, '└────────────────────────────────────────────────┘', AnsiColor.Cyan);
    this.gfx.drawText(15, 21, '[ENTER] Search  [ESC] Cancel', AnsiColor.Cyan);

    this.door.sendAnsi(this.gfx.render(), this.user.id);

    // In real implementation, collect input then filter bugs
    // For now, return to main menu
    setTimeout(() => this.showMainMenu(), 2000);
  }

  // ==========================================================================
  // UTILITIES
  // ==========================================================================

  private quit(): void {
    if (this.user) {
      this.door.disconnect(this.user.id);
    }
  }

  public start(): void {
    this.door.start();
  }
}

// ============================================================================
// START THE DOOR
// ============================================================================

const bugTracker = new BugTracker();
bugTracker.start();
