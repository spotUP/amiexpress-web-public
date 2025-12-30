/**
 * Format Picker Dialog
 * Two-panel interface: Categories | Options
 * For applying formatting to selected text
 */

import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { Screen, Box, List, Button } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
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
    { category: 'colors', name: 'Red', wrap: (t) => `{red}${t}{/red}` },
    { category: 'colors', name: 'Green', wrap: (t) => `{green}${t}{/green}` },
    { category: 'colors', name: 'Blue', wrap: (t) => `{blue}${t}{/blue}` },
    { category: 'colors', name: 'Yellow', wrap: (t) => `{yellow}${t}{/yellow}` },
    { category: 'colors', name: 'Cyan', wrap: (t) => `{cyan}${t}{/cyan}` },
    { category: 'colors', name: 'Magenta', wrap: (t) => `{magenta}${t}{/magenta}` },
    { category: 'colors', name: 'White', wrap: (t) => `{white}${t}{/white}` },
    { category: 'colors', name: 'Gray', wrap: (t) => `{gray}${t}{/gray}` },
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
  private overlay: Box;
  private closeButton: Button;
  private categoryList: List;
  private formatList: List;
  private currentCategory: FormatCategory = 'colors';
  private onSelect: ((format: Format) => void) | null = null;
  private onCancel: (() => void) | null = null;

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
      style: {
        bg: 'black',
        transparent: true,
      },
      // @ts-ignore - zIndex exists but not in types
      zIndex: 999,
    });

    // Close dialog when clicking background
    this.modalBackground.on('click', () => {
      this.hide();
    });

    this.overlay = createBox({
      parent: screen,
      bottom: 5,  // Above status bar and input
      right: 2,
      width: 40,
      height: 16,
      label: ' Format [Tab | Enter] ',
      border: { type: 'line', fg: 'yellow' },
      shadow: true,
      hidden: true,
      mouse: true,
      keys: true,
      clickable: true,
      style: {
        fg: 'white',
        bg: 'black',
      },
      // @ts-ignore - zIndex exists but not in types
      zIndex: 1000,
    });

    // Close button [X] in top-right corner
    this.closeButton = blessed.box({
      parent: this.overlay,
      top: 0,
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
        }
      },
    }) as unknown as Button;

    // Close on button click
    this.closeButton.on('click', () => {
      if (this.onCancel) {
        this.onCancel();
      }
      this.hide();
    });

    // Category list (left panel)
    this.categoryList = createList({
      parent: this.overlay,
      top: 1,
      left: 0,
      width: 14,
      height: 13,
      label: ' Type ',
      border: { type: 'line', fg: 'green' },
      mouse: true,
      clickable: true,
      interactive: true,
      vi: true,
      keys: true,
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
      top: 1,
      left: 14,
      width: 24,
      height: 13,
      label: ' Options ',
      border: { type: 'line', fg: 'yellow' },
      mouse: true,
      vi: true,
      keys: true,
      clickable: true,
      interactive: true,
      scrollbar: {
        ch: ' ',
      },
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

    // Arrow keys for navigation
    this.categoryList.key(['up', 'k'], () => {
      this.categoryList.up(1);
      this.overlay.screen.render();
    });

    this.categoryList.key(['down', 'j'], () => {
      this.categoryList.down(1);
      this.overlay.screen.render();
    });

    this.formatList.key(['up', 'k'], () => {
      this.formatList.up(1);
      this.overlay.screen.render();
    });

    this.formatList.key(['down', 'j'], () => {
      this.formatList.down(1);
      this.overlay.screen.render();
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
    const items = formats.map(f => {
      // Show format name with color preview for colors
      if (category === 'colors') {
        return `{${f.name.toLowerCase()}-fg}${f.name}{/${f.name.toLowerCase()}-fg}`;
      }
      return f.name;
    });
    this.formatList.setItems(items);
    this.overlay.screen.render();
  }

  show(
    screen: any,
    onSelect: (format: Format) => void,
    onCancel: () => void,
    position?: { x: number; y: number }
  ) {
    this.onSelect = onSelect;
    this.onCancel = onCancel;

    // Position overlay relative to selection if provided
    if (position) {
      const overlayWidth = 40;
      const overlayHeight = 16;
      const screenWidth = screen.width || 80;
      const screenHeight = screen.height || 24;

      // Position above the selection point, aligned to it
      let left = position.x;
      let top = position.y - overlayHeight - 1;

      // Keep within screen bounds
      if (left + overlayWidth > screenWidth) {
        left = screenWidth - overlayWidth - 1;
      }
      if (left < 0) left = 0;

      // If not enough room above, position below
      if (top < 0) {
        top = position.y + 1;
      }
      if (top + overlayHeight > screenHeight) {
        top = screenHeight - overlayHeight - 1;
      }

      (this.overlay as any).left = left;
      (this.overlay as any).top = top;
      // Clear the fixed positioning
      (this.overlay as any).bottom = undefined;
      (this.overlay as any).right = undefined;
    }

    this.modalBackground.show();
    this.overlay.show();
    // Focus the Type panel first
    this.categoryList.focus();
    this.categoryList.select(0);
    this.formatList.select(0);
    screen.render();
  }

  hide() {
    this.modalBackground.hide();
    this.overlay.hide();
    this.overlay.screen.render();
  }

  isVisible(): boolean {
    return !this.overlay.hidden;
  }

  destroy() {
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
