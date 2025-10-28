/**
 * AmigaGuide Viewer
 *
 * Interactive viewer for AmigaGuide documents with keyboard navigation.
 */

import { AmigaGuideParser, AmigaGuideNode, AmigaGuideLink } from './AmigaGuideParser';
import { Socket } from 'socket.io';

export interface ViewerState {
  currentNode: string;
  scrollOffset: number;
  history: string[]; // Navigation history for back button
}

export class AmigaGuideViewer {
  private parser: AmigaGuideParser;
  private state: ViewerState;
  private socket: Socket;
  private width: number = 80;
  private maxLines: number = 20;

  constructor(socket: Socket, parser: AmigaGuideParser, startNode?: string) {
    this.parser = parser;
    this.socket = socket;

    const doc = parser.getDocument();
    const initialNode = startNode || doc.mainNode;

    this.state = {
      currentNode: initialNode,
      scrollOffset: 0,
      history: []
    };
  }

  /**
   * Display the current node
   */
  public display(): void {
    const doc = this.parser.getDocument();
    const node = this.parser.getNode(this.state.currentNode);

    if (!node) {
      this.socket.emit('ansi-output', `\x1b[31mError: Node "${this.state.currentNode}" not found.\x1b[0m\r\n`);
      return;
    }

    // Clear screen
    this.socket.emit('ansi-output', '\x1b[2J\x1b[H');

    // Header
    this.socket.emit('ansi-output', `\x1b[0;36m-= ${doc.database} =-\x1b[0m\r\n`);
    this.socket.emit('ansi-output', `\x1b[0;33m${node.title}\x1b[0m\r\n`);
    this.socket.emit('ansi-output', '-'.repeat(this.width) + '\r\n');

    // Render content
    const rendered = this.parser.renderNode(
      this.state.currentNode,
      this.width,
      this.maxLines,
      this.state.scrollOffset
    );

    // Display content
    for (const line of rendered.lines) {
      this.socket.emit('ansi-output', line + '\r\n');
    }

    // Scroll indicator
    if (rendered.hasMore || this.state.scrollOffset > 0) {
      const scrollInfo = `[Line ${this.state.scrollOffset + 1}-${this.state.scrollOffset + rendered.lines.length} of ${rendered.totalLines}]`;
      this.socket.emit('ansi-output', `\r\n\x1b[90m${scrollInfo}\x1b[0m\r\n`);
    }

    // Footer with navigation and links
    this.socket.emit('ansi-output', '-'.repeat(this.width) + '\r\n');
    this.displayFooter(node, rendered.links);
  }

  /**
   * Display footer with navigation options
   */
  private displayFooter(node: AmigaGuideNode, links: AmigaGuideLink[]): void {
    const nav = this.parser.getNavigationInfo(this.state.currentNode);

    // Navigation links
    const navItems: string[] = [];

    if (this.state.scrollOffset > 0) {
      navItems.push('\x1b[33m[UP]\x1b[0m Scroll Up');
    }

    if (links.length > 0) {
      const firstLink = links[0].index;
      const lastLink = links[links.length - 1].index;
      navItems.push(`\x1b[33m[1-${lastLink}]\x1b[0m Links`);
    }

    if (nav.prev) {
      navItems.push('\x1b[33m[P]\x1b[0m Prev');
    }

    if (nav.next) {
      navItems.push('\x1b[33m[N]\x1b[0m Next');
    }

    if (nav.toc) {
      navItems.push('\x1b[33m[T]\x1b[0m Contents');
    }

    if (nav.index) {
      navItems.push('\x1b[33m[I]\x1b[0m Index');
    }

    if (nav.help) {
      navItems.push('\x1b[33m[H]\x1b[0m Help');
    }

    if (this.state.history.length > 0) {
      navItems.push('\x1b[33m[B]\x1b[0m Back');
    }

    navItems.push('\x1b[33m[Q]\x1b[0m Quit');

    // Display navigation in rows
    const maxItemsPerRow = 4;
    for (let i = 0; i < navItems.length; i += maxItemsPerRow) {
      const rowItems = navItems.slice(i, i + maxItemsPerRow);
      this.socket.emit('ansi-output', rowItems.join('  ') + '\r\n');
    }

    // Link list (if any)
    if (links.length > 0) {
      this.socket.emit('ansi-output', '\r\n\x1b[36mLinks:\x1b[0m\r\n');
      for (const link of links) {
        this.socket.emit('ansi-output', `  \x1b[33m[${link.index}]\x1b[0m ${link.text}\r\n`);
      }
    }
  }

  /**
   * Handle keyboard input
   */
  public handleInput(input: string): boolean {
    const key = input.trim().toUpperCase();

    // Get current node info
    const rendered = this.parser.renderNode(
      this.state.currentNode,
      this.width,
      this.maxLines,
      this.state.scrollOffset
    );
    const nav = this.parser.getNavigationInfo(this.state.currentNode);

    // Handle navigation keys
    switch (key) {
      case '\x1b[A': // Up arrow
      case 'UP':
        if (this.state.scrollOffset > 0) {
          this.state.scrollOffset = Math.max(0, this.state.scrollOffset - 1);
          this.display();
        }
        return true;

      case '\x1b[B': // Down arrow
      case 'DN':
      case 'DOWN':
        if (this.state.scrollOffset + this.maxLines < rendered.totalLines) {
          this.state.scrollOffset++;
          this.display();
        }
        return true;

      case '\x1b[5~': // Page Up
      case 'PGUP':
        this.state.scrollOffset = Math.max(0, this.state.scrollOffset - this.maxLines);
        this.display();
        return true;

      case '\x1b[6~': // Page Down
      case 'PGDN':
        if (this.state.scrollOffset + this.maxLines < rendered.totalLines) {
          this.state.scrollOffset = Math.min(
            rendered.totalLines - this.maxLines,
            this.state.scrollOffset + this.maxLines
          );
          this.display();
        }
        return true;

      case 'P': // Previous node
        if (nav.prev) {
          this.navigateTo(nav.prev);
        } else {
          this.socket.emit('ansi-output', '\r\n\x1b[31mNo previous node.\x1b[0m\r\n');
          setTimeout(() => this.display(), 1000);
        }
        return true;

      case 'N': // Next node
        if (nav.next) {
          this.navigateTo(nav.next);
        } else {
          this.socket.emit('ansi-output', '\r\n\x1b[31mNo next node.\x1b[0m\r\n');
          setTimeout(() => this.display(), 1000);
        }
        return true;

      case 'T': // Table of contents
        if (nav.toc) {
          this.navigateTo(nav.toc);
        } else {
          this.socket.emit('ansi-output', '\r\n\x1b[31mNo table of contents.\x1b[0m\r\n');
          setTimeout(() => this.display(), 1000);
        }
        return true;

      case 'I': // Index
        if (nav.index) {
          this.navigateTo(nav.index);
        } else {
          this.socket.emit('ansi-output', '\r\n\x1b[31mNo index.\x1b[0m\r\n');
          setTimeout(() => this.display(), 1000);
        }
        return true;

      case 'H': // Help
        if (nav.help) {
          this.navigateTo(nav.help);
        } else {
          this.showHelp();
        }
        return true;

      case 'B': // Back
        if (this.state.history.length > 0) {
          const prevNode = this.state.history.pop()!;
          this.state.currentNode = prevNode;
          this.state.scrollOffset = 0;
          this.display();
        } else {
          this.socket.emit('ansi-output', '\r\n\x1b[31mNo history.\x1b[0m\r\n');
          setTimeout(() => this.display(), 1000);
        }
        return true;

      case 'Q': // Quit
        return false;

      default:
        // Check if it's a number (link selection)
        const linkNum = parseInt(key, 10);
        if (!isNaN(linkNum) && linkNum > 0) {
          const link = this.parser.getLinkByIndex(this.state.currentNode, linkNum);
          if (link) {
            this.navigateTo(link.target);
          } else {
            this.socket.emit('ansi-output', `\r\n\x1b[31mInvalid link number: ${linkNum}\x1b[0m\r\n`);
            setTimeout(() => this.display(), 1000);
          }
          return true;
        }

        // Unknown key
        return true;
    }
  }

  /**
   * Navigate to a different node
   */
  private navigateTo(nodeName: string): void {
    // Check if node exists
    const node = this.parser.getNode(nodeName);

    if (!node) {
      this.socket.emit('ansi-output', `\r\n\x1b[31mNode "${nodeName}" not found.\x1b[0m\r\n`);
      setTimeout(() => this.display(), 1500);
      return;
    }

    // Save current node to history
    this.state.history.push(this.state.currentNode);

    // Navigate to new node
    this.state.currentNode = nodeName;
    this.state.scrollOffset = 0;
    this.display();
  }

  /**
   * Show built-in help
   */
  private showHelp(): void {
    this.socket.emit('ansi-output', '\x1b[2J\x1b[H');
    this.socket.emit('ansi-output', '\x1b[0;36m-= AmigaGuide Viewer Help =-\x1b[0m\r\n\r\n');
    this.socket.emit('ansi-output', '\x1b[0mNavigation:\x1b[0m\r\n');
    this.socket.emit('ansi-output', '  \x1b[33mUP/DOWN\x1b[0m  - Scroll content\r\n');
    this.socket.emit('ansi-output', '  \x1b[33mPGUP/PGDN\x1b[0m - Page up/down\r\n');
    this.socket.emit('ansi-output', '  \x1b[33m1-9\x1b[0m      - Follow numbered link\r\n');
    this.socket.emit('ansi-output', '  \x1b[33mN\x1b[0m        - Next node\r\n');
    this.socket.emit('ansi-output', '  \x1b[33mP\x1b[0m        - Previous node\r\n');
    this.socket.emit('ansi-output', '  \x1b[33mT\x1b[0m        - Table of contents\r\n');
    this.socket.emit('ansi-output', '  \x1b[33mI\x1b[0m        - Index\r\n');
    this.socket.emit('ansi-output', '  \x1b[33mH\x1b[0m        - Help\r\n');
    this.socket.emit('ansi-output', '  \x1b[33mB\x1b[0m        - Back\r\n');
    this.socket.emit('ansi-output', '  \x1b[33mQ\x1b[0m        - Quit viewer\r\n');
    this.socket.emit('ansi-output', '\r\n\x1b[90mPress any key to return...\x1b[0m');

    // Wait for keypress then return
    const handler = () => {
      this.socket.off('terminal-input', handler);
      this.display();
    };
    this.socket.once('terminal-input', handler);
  }

  /**
   * Get current state
   */
  public getState(): ViewerState {
    return this.state;
  }
}
