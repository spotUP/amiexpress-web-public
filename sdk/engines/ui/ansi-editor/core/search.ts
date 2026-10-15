/**
 * Search functionality for ANSI editor
 * Supports find and replace operations
 */

import type { Position, SearchOptions, SearchResult } from '../types';
import { ANSIUtils } from './ansi-utils';

export class SearchManager {
  private lines: readonly string[];
  private currentQuery: string = '';
  private currentOptions: SearchOptions = {
    query: '',
    caseSensitive: false,
    regex: false,
    wholeWord: false,
  };
  private lastSearchResults: SearchResult[] = [];
  private currentResultIndex: number = -1;

  constructor(lines: readonly string[]) {
    this.lines = lines;
  }

  /**
   * Update lines reference
   */
  updateLines(lines: readonly string[]): void {
    this.lines = lines;
  }

  /**
   * Search for text in document
   */
  search(query: string, options: Partial<SearchOptions> = {}): SearchResult[] {
    this.currentQuery = query;
    this.currentOptions = {
      query,
      caseSensitive: options.caseSensitive ?? false,
      regex: options.regex ?? false,
      wholeWord: options.wholeWord ?? false,
    };

    this.lastSearchResults = [];
    this.currentResultIndex = -1;

    if (!query) {
      return [];
    }

    // Build search pattern
    let pattern: RegExp;
    try {
      if (this.currentOptions.regex) {
        // User provided regex
        const flags = this.currentOptions.caseSensitive ? 'g' : 'gi';
        pattern = new RegExp(query, flags);
      } else {
        // Escape special regex characters
        const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        // Add word boundary if whole word search
        const searchPattern = this.currentOptions.wholeWord
          ? `\\b${escaped}\\b`
          : escaped;

        const flags = this.currentOptions.caseSensitive ? 'g' : 'gi';
        pattern = new RegExp(searchPattern, flags);
      }
    } catch (e) {
      // Invalid regex
      return [];
    }

    // Search all lines
    for (let lineNum = 0; lineNum < this.lines.length; lineNum++) {
      const line = this.lines[lineNum];
      const plainLine = ANSIUtils.stripANSI(line);

      let match: RegExpExecArray | null;
      pattern.lastIndex = 0; // Reset regex state

      while ((match = pattern.exec(plainLine)) !== null) {
        this.lastSearchResults.push({
          line: lineNum,
          col: match.index,
          length: match[0].length,
          match: match[0],
        });

        // Prevent infinite loop on zero-width matches
        if (match.index === pattern.lastIndex) {
          pattern.lastIndex++;
        }
      }
    }

    return this.lastSearchResults;
  }

  /**
   * Find next occurrence
   */
  findNext(fromPosition?: Position): SearchResult | null {
    if (this.lastSearchResults.length === 0) {
      return null;
    }

    if (!fromPosition) {
      // Start from beginning
      this.currentResultIndex = 0;
      return this.lastSearchResults[0];
    }

    // Find next result after current position
    for (let i = 0; i < this.lastSearchResults.length; i++) {
      const result = this.lastSearchResults[i];

      if (result.line > fromPosition.line ||
          (result.line === fromPosition.line && result.col > fromPosition.col)) {
        this.currentResultIndex = i;
        return result;
      }
    }

    // Wrap around to first result
    this.currentResultIndex = 0;
    return this.lastSearchResults[0];
  }

  /**
   * Find previous occurrence
   */
  findPrevious(fromPosition?: Position): SearchResult | null {
    if (this.lastSearchResults.length === 0) {
      return null;
    }

    if (!fromPosition) {
      // Start from end
      this.currentResultIndex = this.lastSearchResults.length - 1;
      return this.lastSearchResults[this.currentResultIndex];
    }

    // Find previous result before current position
    for (let i = this.lastSearchResults.length - 1; i >= 0; i--) {
      const result = this.lastSearchResults[i];

      if (result.line < fromPosition.line ||
          (result.line === fromPosition.line && result.col < fromPosition.col)) {
        this.currentResultIndex = i;
        return result;
      }
    }

    // Wrap around to last result
    this.currentResultIndex = this.lastSearchResults.length - 1;
    return this.lastSearchResults[this.currentResultIndex];
  }

  /**
   * Replace current match
   */
  replaceCurrent(replacement: string): { position: Position; oldText: string; newText: string } | null {
    if (this.currentResultIndex < 0 || this.currentResultIndex >= this.lastSearchResults.length) {
      return null;
    }

    const result = this.lastSearchResults[this.currentResultIndex];

    return {
      position: { line: result.line, col: result.col },
      oldText: result.match,
      newText: replacement,
    };
  }

  /**
   * Replace all occurrences
   */
  replaceAll(replacement: string): Array<{ position: Position; oldText: string; newText: string }> {
    const replacements: Array<{ position: Position; oldText: string; newText: string }> = [];

    // Process in reverse order to maintain position validity
    for (let i = this.lastSearchResults.length - 1; i >= 0; i--) {
      const result = this.lastSearchResults[i];

      replacements.unshift({
        position: { line: result.line, col: result.col },
        oldText: result.match,
        newText: replacement,
      });
    }

    return replacements;
  }

  /**
   * Get total match count
   */
  getMatchCount(): number {
    return this.lastSearchResults.length;
  }

  /**
   * Get current match index (1-based)
   */
  getCurrentMatchIndex(): number {
    return this.currentResultIndex >= 0 ? this.currentResultIndex + 1 : 0;
  }

  /**
   * Clear search results
   */
  clear(): void {
    this.currentQuery = '';
    this.lastSearchResults = [];
    this.currentResultIndex = -1;
  }
}
