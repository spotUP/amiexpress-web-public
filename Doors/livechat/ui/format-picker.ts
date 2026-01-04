import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { Screen, Box, List, Button } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { Panel } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createBox, createList } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';

export type FormatCategory = 'colors' | 'effects' | 'markdown';

export interface Format {
  category: FormatCategory;
  name: string;
  wrap: (text: string) => string;  // Function to wrap text with format
}

// Available formats grouped by category
const FORMATS: Record<FormatCategory, Format[]> = {
  colors: [
    { category: 'colors', name: 'Red', wrap: (t) => `{red-fg}${t}{/}` },
    { category: 'colors', name: 'Green', wrap: (t) => `{green-fg}${t}{/}` },
    { category: 'colors', name: 'Blue', wrap: (t) => `{blue-fg}${t}{/}` },
    { category: 'colors', name: 'Yellow', wrap: (t) => `{yellow-fg}${t}{/}` },
    { category: 'colors', name: 'Cyan', wrap: (t) => `{cyan-fg}${t}{/}` },
    { category: 'colors', name: 'Magenta', wrap: (t) => `{magenta-fg}${t}{/}` },
    { category: 'colors', name: 'White', wrap: (t) => `{white-fg}${t}{/}` },
    { category: 'colors', name: 'Gray', wrap: (t) => `{gray-fg}${t}{/}` },
  ],
  effects: [
    { category: 'effects', name: 'Rainbow', wrap: (t) => `~rainbow~${t}~/rainbow~` },
    { category: 'effects', name: 'Pulse', wrap: (t) => `~pulse~${t}~/pulse~` },
    { category: 'effects', name: 'Sparkle', wrap: (t) => `~sparkle~${t}~/sparkle~` },
    { category: 'effects', name: 'Shake', wrap: (t) => `~shake~${t}~/shake~` },
    { category: 'effects', name: 'Wave', wrap: (t) => `~wave~${t}~/wave~` },
    { category: 'effects', name: 'Gradient', wrap: (t) => `~gradient from=red to=blue~${t}~/gradient~` },
  ],
  markdown: [
    { category: 'markdown', name: 'Bold', wrap: (t) => `**${t}**` },
    { category: 'markdown', name: 'Italic', wrap: (t) => `*${t}*` },
    { category: 'markdown', name: 'Underline', wrap: (t) => `__${t}__` },
    { category: 'markdown', name: 'Strike', wrap: (t) => `~~${t}~~` },
    { category: 'markdown', name: 'Code', wrap: (t) => `\`${t}\`` },
  ],
};

export class FormatPicker {
  private modalBackground: Box;
  private overlay: Panel;
  private closeButton: Button;
  private categoryList: List;
  private formatList: List;
  private currentCategory: FormatCategory = 'colors';
  private onSelect: ((format: Format) => void) | null = null;
  private onCancel: (() => void) | null = null;

  private _responsiveCleanup: (() => void) | null = null;

  constructor(screen: Screen) {
    // Modal background - clicking it closes the dialog
    this.modalBackground = createBox({
      parent: screen,
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      hidden: true,
      clickable: true,
      mouse: true,
      ch: ' ', // Fill with spaces to clear background
      style: {
        bg: 'black',
      },
      zIndex: 999,
    });

    // Close dialog when clicking background
    this.modalBackground.on('click', () => {
      this.hide();
    });

    this.overlay = new Panel({
      parent: screen,
      top: 'center',
      left: 'center',
      width: 70, // Wide enough for both panels with content
      height: 14,
      title: ' Format [Tab | Enter] ',
      border: { type: 'line', fg: 'yellow' },
      shadow: false,
      hidden: true,
      mouse: true,
      keys: true,
      clickable: true,
      ch: ' ', // Fill with spaces to clear background
      style: {
        fg: 'white',
        bg: 'black',
      },
      zIndex: 1000,
    });

    // Close button [X] in top-right corner
    this.closeButton = blessed.button({
      parent: this.overlay,
      top: -1, // Position on the top border
      right: 1,
      width: 3,
      height: 1,
      content: '[X]',
      mouse: true,
      clickable: true,
      style: {
        fg: 'red',
        bg: 'black',
        hover: {
          fg: 'white',
          bg: 'red'
        },
        focus: {
          fg: 'white',
          bg: 'red'
        }
      },
    }) as unknown as Button;

    // Close on button click
    this.closeButton.on('press', () => {
      if (this.onCancel) {
        this.onCancel();
      }
      this.hide();
    });

    // Category list (left panel)
    this.categoryList = createList({
      parent: this.overlay,
      top: 0,
      left: 0,
      width: 14,
      height: '100%-2',
      label: ' Type ',
      border: { type: 'line', fg: 'green' },
      mouse: true,
      clickable: true,
      interactive: true,
      vi: true,
      keys: true,
      ch: ' ', // Opaque background
      style: {
        fg: 'white',
        bg: 'black',
        selected: { fg: 'black', bg: 'green' },
        item: {
          hover: { fg: 'black', bg: 'green' },
        },
      } as any,
      items: ['Colors', 'Effects', 'Markdown'],
    });

    // Format list (right panel)
    this.formatList = createList({
      parent: this.overlay,
      top: 0,
      left: 16,
      right: 0,
      height: '100%-2',
      label: ' Options ',
      border: { type: 'line', fg: 'yellow' },
      mouse: true,
      vi: true,
      keys: true,
      clickable: true,
      interactive: true,
      ch: ' ', // Opaque background
      style: {
        fg: 'white',
        bg: 'black',
        selected: { fg: 'black', bg: 'yellow' },
        item: {
          hover: { fg: 'black', bg: 'yellow' },
        },
      } as any,
    });

    // Setup event handlers
    this.setupEventHandlers();

    // Load initial category
    this.loadCategory('colors');
  }

  private setupEventHandlers() {
    // Category selection
    this.categoryList.on('select', (item: any) => {
      const categoryName = typeof item === 'string' ? item : item.content;
      const categoryMap: Record<string, FormatCategory> = {
        'Colors': 'colors',
        'Effects': 'effects',
        'Markdown': 'markdown',
      };
      this.currentCategory = categoryMap[categoryName] || 'colors';
      this.loadCategory(this.currentCategory);
      this.formatList.focus();
    });

    // Format selection (on Enter key or click)
    this.formatList.on('select', () => {
      this.selectCurrentFormat();
    });

    // Also handle Enter key explicitly
    this.formatList.key(['enter', 'return'], () => {
      this.selectCurrentFormat();
    });

    // Tab to switch focus
    this.overlay.key(['tab'], () => {
      if (this.categoryList.focused) {
        this.formatList.focus();
      } else {
        this.categoryList.focus();
      }
      this.overlay.screen.render();
    });

    // ESC to close
    this.overlay.key(['escape'], () => {
      if (this.onCancel) {
        this.onCancel();
      }
      this.hide();
    });
  }

  private selectCurrentFormat() {
    const selected = (this.formatList as any).selected;
    const formats = FORMATS[this.currentCategory];
    if (selected !== undefined && formats[selected]) {
      const format = formats[selected];
      if (this.onSelect) {
        this.onSelect(format);
      }
      this.hide();
    }
  }

  private loadCategory(category: FormatCategory) {
    const formats = FORMATS[category];
    // Use plain text to avoid blessed list item rendering issues with markup
    const items = formats.map(f => f.name);
    this.formatList.setItems(items);
    if (this.overlay.screen) {
      this.overlay.screen.render();
    }
  }

  show(
    screen: any,
    onSelect: (format: Format) => void,
    onCancel: () => void,
    _position?: { x: number; y: number }
  ) {
    this.onSelect = onSelect;
    this.onCancel = onCancel;

    // Show overlay only (not as modal background)
    this.overlay.show();
    this.overlay.setFront();

    // Use SDK's responsive utilities
    const { makeModalResponsive } = require('@amiexpress/bbs-door-sdk/engines/ui/blessed');
    if (this._responsiveCleanup) {
      this._responsiveCleanup();
    }
    this._responsiveCleanup = makeModalResponsive(this.overlay);

    // Focus the Type panel first
    this.categoryList.focus();
    this.categoryList.select(0);
    this.formatList.select(0);
    screen.render();
  }

  hide() {
    if (this._responsiveCleanup) {
      this._responsiveCleanup();
      this._responsiveCleanup = null;
    }
    this.overlay.hide();
    if (this.overlay.screen) {
      this.overlay.screen.render();
    }
  }

  isVisible(): boolean {
    return !this.overlay.hidden;
  }

  destroy() {
    if (this._responsiveCleanup) {
      this._responsiveCleanup();
      this._responsiveCleanup = null;
    }
    this.modalBackground.destroy();
    this.closeButton.destroy();
    this.overlay.destroy();
  }
}

/**
 * Get all available formats
 */
export function getAllFormats(): Format[] {
  return [
    ...FORMATS.colors,
    ...FORMATS.effects,
    ...FORMATS.markdown,
  ];
}

/**
 * Get formats by category
 */
export function getFormatsByCategory(category: FormatCategory): Format[] {
  return FORMATS[category] || [];
}
