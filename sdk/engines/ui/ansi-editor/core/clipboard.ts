/**
 * Clipboard manager for editor
 * Simple in-memory clipboard for copy/cut/paste
 */

export class Clipboard {
  private static content: string = '';

  /**
   * Copy text to clipboard
   */
  static copy(text: string): void {
    this.content = text;
  }

  /**
   * Get clipboard content
   */
  static paste(): string {
    return this.content;
  }

  /**
   * Check if clipboard has content
   */
  static hasContent(): boolean {
    return this.content.length > 0;
  }

  /**
   * Clear clipboard
   */
  static clear(): void {
    this.content = '';
  }
}
