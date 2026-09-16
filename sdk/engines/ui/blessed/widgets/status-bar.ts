/**
 * StatusBar - Footer status bar widget
 *
 * A horizontal bar at the bottom of the screen with configurable sections.
 * Features:
 * - Multiple sections with separators
 * - Individual section updates
 * - Customizable colors and separator
 * - Automatic layout based on content
 */

import { Box } from './box';
import type { ElementOptions } from '../core/types';
import { createScrollText, type ScrollMode, type ScrollText } from '../../text/scroll-text';

export interface StatusBarSection {
  /** Section ID for updates */
  id: string;
  /** Initial content */
  content: string;
  /** Fixed width (if not provided, uses content length) */
  width?: number;
  /** Section color (defaults to bar color) */
  fg?: string;
  /** Align content: left, center, right (default: left) */
  align?: 'left' | 'center' | 'right';
}

export interface StatusBarOptions extends ElementOptions {
  /** Status bar sections */
  sections?: StatusBarSection[];
  /** Separator between sections (default: " | ") */
  separator?: string;
  /** Foreground color (default: "white") */
  fg?: string;
  /** Background color (default: "blue") */
  bg?: string;
  /** Bar position: top or bottom (default: "bottom") */
  position?: 'top' | 'bottom';
  /**
   * SCROLL THE LAST SECTION instead of cutting it off.
   *
   * A status bar is one row and does not wrap, so a notice longer than the
   * room left over is clipped with a full stop - "Showing the cards in front
   * of you. V shows ." on the sysop's screen (2026-09-16). With this on, a
   * section that does not fit travels through the room it has instead, and
   * the whole sentence arrives a piece at a time.
   *
   * OFF BY DEFAULT: it costs a repaint of one row per tick, and a bar that
   * has always fitted should not start animating because the SDK learned a
   * new trick. Doors opt in.
   */
  scroll?: boolean | StatusBarScrollOptions;
}

export interface StatusBarScrollOptions {
  /** Milliseconds per column (default 300 - readable, not frantic). */
  intervalMs?: number;
  /** `loop` carries round; `bounce` walks back (default `loop`). */
  mode?: ScrollMode;
  /** What separates the end of the text from its restart in `loop`. */
  gap?: string;
}

export class StatusBar extends Box {
  private _sections: Map<string, StatusBarSection> = new Map();
  private _separator: string;
  private _baseFg: string;
  private _scroll: Required<StatusBarScrollOptions> | null;
  private _scroller: ScrollText | null = null;
  private _scrollStep = 0;
  private _scrollTimer: ReturnType<typeof setInterval> | null = null;
  /** The text and width the current scroller was built for. */
  private _scrollFor = '';

  constructor(options: StatusBarOptions = {}) {
    const fg = options.fg || 'white';
    const bg = options.bg || 'blue';
    const position = options.position || 'bottom';

    super({
      ...options,
      top: position === 'top' ? 0 : undefined,
      bottom: position === 'bottom' ? 0 : undefined,
      left: 0,
      width: '100%',
      height: 1,
      tags: true,
      ch: ' ',
      style: {
        fg,
        bg,
        ...options.style,
      },
    });

    this._separator = options.separator || ' | ';
    this._baseFg = fg;

    const scroll = options.scroll;
    this._scroll = scroll
      ? {
        intervalMs: (typeof scroll === 'object' && scroll.intervalMs) || 300,
        mode: (typeof scroll === 'object' && scroll.mode) || 'loop',
        gap: (typeof scroll === 'object' && scroll.gap) || '   ',
      }
      : null;

    /*
     * A TIMER MUST NOT OUTLIVE WHAT IT DRAWS. A bar that is hidden, detached
     * or destroyed still holds an interval repainting a widget nobody can
     * see, and keeps the door's process alive after teardown - the shape
     * behind the DOORMAN freeze. Every way out stops it.
     */
    this.on('hide', () => this._stopScrolling());
    this.on('detach', () => this._stopScrolling());
    this.on('destroy', () => this._stopScrolling());

    // Initialize sections
    if (options.sections) {
      for (const section of options.sections) {
        this._sections.set(section.id, { ...section });
      }
    }

    this._render();
  }

  /**
   * Set content for a section
   */
  setSection(id: string, content: string): void {
    const section = this._sections.get(id);
    if (section) {
      section.content = content;
      this._render();
    }
  }

  /**
   * Add a new section
   */
  addSection(section: StatusBarSection): void {
    this._sections.set(section.id, { ...section });
    this._render();
  }

  /**
   * Remove a section
   */
  removeSection(id: string): void {
    this._sections.delete(id);
    this._render();
  }

  /**
   * Get section content
   */
  getSection(id: string): string | undefined {
    return this._sections.get(id)?.content;
  }

  /**
   * Set all sections at once
   */
  setSections(sections: StatusBarSection[]): void {
    this._sections.clear();
    for (const section of sections) {
      this._sections.set(section.id, { ...section });
    }
    this._render();
  }

  /**
   * Render the status bar content
   */
  private _render(): void {
    const parts: string[] = [];
    const plain: string[] = [];

    for (const section of this._sections.values()) {
      let content = section.content;
      /*
       * AN EMPTY SECTION IS NOT A SECTION. A door keeps a slot for a
       * notice and leaves it blank until there is one; joining it in
       * anyway ends the bar with a separator and nothing after it -
       * "sysop | Chips: 658 | Table #8 |" on the sysop's screen
       * (2026-09-16). It also spent that slot's room, so the section
       * before it was clipped to make space for nothing.
       */
      if (content === '') continue;
      plain.push(content);

      // Apply section color if different from base
      if (section.fg && section.fg !== this._baseFg) {
        content = `{${section.fg}-fg}${content}{/${section.fg}-fg}`;
      }

      parts.push(content);
    }

    const room = this._roomForLast(plain);
    if (this._scroll && room !== null && room > 1 && plain.length > 0) {
      // The last section does not fit: scroll it through the room it has
      // rather than cutting it off.
      const text = plain[plain.length - 1];
      const key = `${text}|${room}`;
      if (key !== this._scrollFor) {
        this._scrollFor = key;
        this._scrollStep = 0;
        this._scroller = createScrollText({
          text,
          width: room,
          mode: this._scroll.mode,
          gap: this._scroll.gap,
        });
      }
      this._paintScrolled(parts);
      this._startScrolling();
      return;
    }

    this._stopScrolling();
    this.setContent(' ' + this._fit(parts, plain).join(this._separator) + ' ');
    this.screen?.render();
  }

  /**
   * Columns the LAST section has, or null when everything fits.
   *
   * Same arithmetic `_fit` clips by, asked as a question instead: the
   * fields in front keep their room and the running commentary at the end
   * gives way first.
   */
  private _roomForLast(plain: string[]): number | null {
    const width = Number(this.width) || 0;
    if (width <= 0 || plain.length === 0) return null;

    const sep = this._separator.length;
    const budget = width - 2;
    const total = plain.reduce((sum, p) => sum + p.length, 0) + sep * (plain.length - 1);
    if (total <= budget) return null;

    const others = plain.slice(0, -1).reduce((sum, p) => sum + p.length, 0)
      + sep * Math.max(0, plain.length - 1);
    return budget - others;
  }

  /** The bar with its last section showing the current window. */
  private _paintScrolled(parts: string[]): void {
    if (!this._scroller) return;
    const window = this._scroller.frame(this._scrollStep);
    const head = parts.slice(0, -1);
    this.setContent(' ' + [...head, window].join(this._separator) + ' ');
    this.screen?.render();
  }

  /**
   * Run the window along, one column per tick.
   *
   * Never for text that fits - `overflows` is false and every frame is the
   * same string, so a timer would repaint the row for nothing. Never
   * without a screen to draw on either.
   */
  private _startScrolling(): void {
    if (this._scrollTimer || !this._scroll) return;
    if (!this._scroller?.overflows) return;
    if (!this.screen || this.hidden) return;

    this._scrollTimer = setInterval(() => {
      if (!this._scroller || this.hidden || !this.screen) {
        this._stopScrolling();
        return;
      }
      this._scrollStep = (this._scrollStep + 1) % this._scroller.steps;
      this._paintScrolled(this._partsForScroll());
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }, this._scroll.intervalMs);

    // A door's status bar must never be the reason its process stays up.
    (this._scrollTimer as unknown as { unref?: () => void }).unref?.();
  }

  private _stopScrolling(): void {
    if (this._scrollTimer) {
      clearInterval(this._scrollTimer);
      this._scrollTimer = null;
    }
    this._scroller = null;
    this._scrollFor = '';
  }

  /** The coloured sections in front of the scrolling one. */
  private _partsForScroll(): string[] {
    const parts: string[] = [];
    for (const section of this._sections.values()) {
      let content = section.content;
      if (section.fg && section.fg !== this._baseFg) {
        content = `{${section.fg}-fg}${content}{/${section.fg}-fg}`;
      }
      parts.push(content);
    }
    return parts;
  }

  /**
   * Clip the bar to the row it has.
   *
   * A status bar is one row wide and it does not wrap: whatever runs past the
   * right edge is simply gone. CARD LOBBY's bar ended mid-word - "Table is
   * full of players. Please wait for curren" - because a notice was appended
   * as its own section and nothing measured the result (reported 2026-09-02).
   *
   * The LAST section gives way first, since bars here are built with the
   * identity fields in front and the running commentary at the end. It is
   * clipped with a single ellipsis character, and dropped altogether when
   * even that will not fit, rather than pushing the fields off the row.
   *
   * Measured on the PLAIN text: `{red-fg}` and friends cost no cells.
   */
  private _fit(parts: string[], plain: string[]): string[] {
    const width = Number(this.width) || 0;
    if (width <= 0 || parts.length === 0) return parts;

    const sep = this._separator.length;
    const budget = width - 2;   // the leading and trailing space
    const total = plain.reduce((sum, p) => sum + p.length, 0) + sep * (parts.length - 1);
    if (total <= budget) return parts;

    const others = plain.slice(0, -1).reduce((sum, p) => sum + p.length, 0)
      + sep * Math.max(0, parts.length - 1);
    const room = budget - others;

    // Not even room for the separator plus a character: drop the last section.
    if (room < 2) return parts.slice(0, -1);

    const last = plain[plain.length - 1];
    return [...parts.slice(0, -1), last.slice(0, room - 1) + '.'];
  }

  /**
   * Set full content directly (bypasses sections)
   */
  setFullContent(content: string): void {
    this.setContent(content);
    this.screen?.render();
  }
}

/**
 * Factory function
 */
export function statusBar(options?: StatusBarOptions): StatusBar {
  return new StatusBar(options);
}
