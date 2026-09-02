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
}

export class StatusBar extends Box {
  private _sections: Map<string, StatusBarSection> = new Map();
  private _separator: string;
  private _baseFg: string;

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
      plain.push(content);

      // Apply section color if different from base
      if (section.fg && section.fg !== this._baseFg) {
        content = `{${section.fg}-fg}${content}{/${section.fg}-fg}`;
      }

      parts.push(content);
    }

    this.setContent(' ' + this._fit(parts, plain).join(this._separator) + ' ');
    this.screen?.render();
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
