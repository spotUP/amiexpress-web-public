/**
 * Autocomplete Manager
 * Manages autocomplete providers and suggestion generation
 */

import type {
  AutocompleteContext,
  AutocompleteSuggestion,
  AutocompleteProvider,
} from '../core/types';

/**
 * Built-in autocomplete providers
 */

/**
 * Username provider - suggests @username completions
 */
export class UsernameProvider implements AutocompleteProvider {
  private usernames: string[];

  constructor(usernames: string[] = []) {
    this.usernames = usernames;
  }

  trigger = '@';

  shouldTrigger(context: AutocompleteContext): boolean {
    const beforeCursor = context.currentLine.substring(0, context.cursorPosition);
    return beforeCursor.includes('@');
  }

  async getSuggestions(context: AutocompleteContext): Promise<AutocompleteSuggestion[]> {
    const beforeCursor = context.currentLine.substring(0, context.cursorPosition);
    const atIndex = beforeCursor.lastIndexOf('@');

    if (atIndex === -1) return [];

    const query = beforeCursor.substring(atIndex + 1).toLowerCase();

    return this.usernames
      .filter(name => name.toLowerCase().startsWith(query))
      .map(name => ({
        label: `@${name}`,
        insertText: name.substring(query.length),
        detail: 'Username',
        kind: 'user' as const,
        sortText: name.toLowerCase(),
      }));
  }

  setUsernames(usernames: string[]) {
    this.usernames = usernames;
  }
}

/**
 * BBSCode provider - suggests BBSCode tags
 */
export class BBSCodeProvider implements AutocompleteProvider {
  private tags = [
    { tag: 'bold', desc: 'Bold text' },
    { tag: 'italic', desc: 'Italic text' },
    { tag: 'underline', desc: 'Underlined text' },
    { tag: 'color', desc: 'Colored text (e.g., [color=red])' },
    { tag: 'center', desc: 'Centered text' },
    { tag: 'quote', desc: 'Quote block' },
    { tag: 'code', desc: 'Code block' },
    { tag: 'url', desc: 'URL link (e.g., [url=http://...])' },
    { tag: 'img', desc: 'Image (e.g., [img]url[/img])' },
    { tag: 'size', desc: 'Font size (e.g., [size=12])' },
  ];

  trigger = '[';

  shouldTrigger(context: AutocompleteContext): boolean {
    const beforeCursor = context.currentLine.substring(0, context.cursorPosition);
    return beforeCursor.includes('[') && !beforeCursor.endsWith(']');
  }

  async getSuggestions(context: AutocompleteContext): Promise<AutocompleteSuggestion[]> {
    const beforeCursor = context.currentLine.substring(0, context.cursorPosition);
    const bracketIndex = beforeCursor.lastIndexOf('[');

    if (bracketIndex === -1) return [];

    const query = beforeCursor.substring(bracketIndex + 1).toLowerCase();

    return this.tags
      .filter(({ tag }) => tag.startsWith(query))
      .map(({ tag, desc }) => ({
        label: `[${tag}]`,
        insertText: `${tag.substring(query.length)}]`,
        detail: desc,
        kind: 'keyword' as const,
        sortText: tag,
      }));
  }
}

/**
 * Word provider - suggests words from document
 */
export class WordProvider implements AutocompleteProvider {
  private minWordLength = 3;
  private maxSuggestions = 10;

  shouldTrigger(context: AutocompleteContext): boolean {
    const beforeCursor = context.currentLine.substring(0, context.cursorPosition);
    const match = beforeCursor.match(/\b(\w+)$/);
    return match ? match[1].length >= this.minWordLength : false;
  }

  async getSuggestions(context: AutocompleteContext): Promise<AutocompleteSuggestion[]> {
    const beforeCursor = context.currentLine.substring(0, context.cursorPosition);
    const match = beforeCursor.match(/\b(\w+)$/);

    if (!match) return [];

    const prefix = match[1].toLowerCase();
    const words = new Set<string>();

    // Extract all words from document
    context.documentContent.forEach((line, idx) => {
      // Skip current line to avoid duplicating partial word
      if (idx === context.lineNumber) return;

      const lineWords = line.match(/\b\w+\b/g) || [];
      lineWords.forEach(word => {
        if (word.toLowerCase().startsWith(prefix) && word.length > prefix.length) {
          words.add(word);
        }
      });
    });

    return Array.from(words)
      .slice(0, this.maxSuggestions)
      .map(word => ({
        label: word,
        insertText: word.substring(prefix.length),
        detail: 'From document',
        kind: 'text' as const,
        sortText: word.toLowerCase(),
      }));
  }
}

/**
 * Template provider - suggests boilerplate templates
 */
export class TemplateProvider implements AutocompleteProvider {
  private templates: Record<string, string>;

  constructor(templates: Record<string, string> = {}) {
    this.templates = templates;
  }

  async getSuggestions(context: AutocompleteContext): Promise<AutocompleteSuggestion[]> {
    const beforeCursor = context.currentLine.substring(0, context.cursorPosition);
    const match = beforeCursor.match(/\b(\w+)$/);
    if (!match) return [];

    const query = match[1].toLowerCase();

    return Object.entries(this.templates)
      .filter(([name]) => name.toLowerCase().startsWith(query))
      .map(([name, content]) => ({
        label: name,
        insertText: content.substring(query.length),
        detail: 'Template',
        kind: 'keyword' as const,
        sortText: name.toLowerCase(),
      }));
  }
}

/**
 * AutocompleteManager - coordinates multiple providers
 */
export class AutocompleteManager {
  private providers: AutocompleteProvider[] = [];
  private enabled = true;

  constructor(providers: AutocompleteProvider[] = []) {
    this.providers = providers;
  }

  /**
   * Add a provider
   */
  addProvider(provider: AutocompleteProvider) {
    this.providers.push(provider);
  }

  /**
   * Remove a provider
   */
  removeProvider(provider: AutocompleteProvider) {
    const index = this.providers.indexOf(provider);
    if (index > -1) {
      this.providers.splice(index, 1);
    }
  }

  /**
   * Enable/disable autocomplete
   */
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  /**
   * Check if autocomplete should trigger
   */
  shouldTrigger(context: AutocompleteContext): boolean {
    if (!this.enabled) return false;
    return this.providers.some(p => p.shouldTrigger?.(context) ?? true);
  }

  /**
   * Get suggestions from all providers
   */
  async getSuggestions(context: AutocompleteContext): Promise<AutocompleteSuggestion[]> {
    if (!this.enabled) return [];

    const allSuggestions: AutocompleteSuggestion[] = [];

    for (const provider of this.providers) {
      if (provider.shouldTrigger && !provider.shouldTrigger(context)) {
        continue;
      }

      try {
        const suggestions = await provider.getSuggestions(context);
        allSuggestions.push(...suggestions);
      } catch (error) {
        console.error('Autocomplete provider error:', error);
      }
    }

    // Sort by sortText or label
    return allSuggestions.sort((a, b) => {
      const aSort = a.sortText || a.label;
      const bSort = b.sortText || b.label;
      return aSort.localeCompare(bSort);
    });
  }

  /**
   * Create default manager with built-in providers
   */
  static createDefault(options: { usernames?: string[]; templates?: Record<string, string> } = {}): AutocompleteManager {
    const providers: AutocompleteProvider[] = [
      new WordProvider(),
      new BBSCodeProvider(),
    ];

    if (options.usernames && options.usernames.length > 0) {
      providers.push(new UsernameProvider(options.usernames));
    }

    if (options.templates) {
      providers.push(new TemplateProvider(options.templates));
    }

    return new AutocompleteManager(providers);
  }
}