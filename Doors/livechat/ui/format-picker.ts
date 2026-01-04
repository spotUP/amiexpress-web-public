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
    { category: 'markdown', name: 'Code', wrap: (t) => "`" + t + "`" },
  ],
};

export class FormatPicker {
  private overlay: Box;
  private closeButton: Button;
  private categoryList: List;
  private formatList: List;
  private currentCategory: FormatCategory = 'colors';
  private onSelect: ((format: Format) => void) | null = null;
  private onCancel: (() => void) | null = null;
  private globalClickHandler: ((data: any) => void) | null = null;

  constructor(screen: Screen) {
    this.overlay = createBox({
      parent: screen,
      top: 'center',
      left: 'center',
      width: 45,
      height: 10,
      label: ' Format ',
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
      zIndex: 1000,
    });

    // Close button [X] in top-right corner
    this.closeButton = blessed.button({
      parent: this.overlay,
      top: -1,
      right: 1,
      width: 3,
      height: 1,
      content: '[X]',
      mouse: true,
      clickable: true,
      style: {
        fg: 'red',
        bg: 'black',
        hover: { fg: 'white', bg: 'red' },
        focus: { fg: 'white', bg: 'red' }
      },
    }) as unknown as Button;

    this.closeButton.on('press', () => {
      if (this.onCancel) this.onCancel();
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
      tags: true,
      tabIndex: 0,
      style: {
        fg: 'white',
        bg: 'black',
        selected: { fg: 'black', bg: 'green' },
        item: { hover: { fg: 'black', bg: 'green' } },
        focus: { border: { fg: 'white' } }
      } as any,
      items: [' Colors', ' Effects', ' Markdown'],
    });

    // Format list (right panel)
    this.formatList = createList({
      parent: this.overlay,
      top: 0,
      left: 14,
      right: 0,
      height: '100%',
      label: ' Options ',
      border: { type: 'line', fg: 'yellow' },
      mouse: true,
      vi: true,
      keys: true,
      tags: true,
      tabIndex: 0,
      clickable: true,
      interactive: true,
      style: {
        fg: 'white',
        bg: 'black',
        selected: { fg: 'black', bg: 'yellow' },
        item: { hover: { fg: 'black', bg: 'yellow' } },
        focus: { border: { fg: 'white' } }
      } as any,
    });

    this.setupEventHandlers();
    this.loadCategory('colors');
  }

  private setupEventHandlers() {
    // Refresh options when navigating categories with keyboard or mouse
    const updateCategory = () => {
      const selectedIndex = (this.categoryList as any).selected;
      const categories: FormatCategory[] = ['colors', 'effects', 'markdown'];
      const newCat = categories[selectedIndex] || 'colors';
      
      if (newCat !== this.currentCategory) {
        this.currentCategory = newCat;
        this.loadCategory(this.currentCategory);
      }
    };

    this.categoryList.on('move', updateCategory);
    this.categoryList.on('select item', updateCategory);
    this.categoryList.on('action', updateCategory);

    this.categoryList.on('select', () => this.formatList.focus());
    this.formatList.on('select', () => this.selectCurrentFormat());

    const handleTab = () => {
      if (this.categoryList.focused) this.formatList.focus();
      else this.categoryList.focus();
      if (this.overlay.screen) this.overlay.screen.render();
    };

    this.categoryList.key(['tab'], handleTab);
    this.formatList.key(['tab'], handleTab);

    const handleEsc = () => {
      if (this.onCancel) this.onCancel();
      this.hide();
    };

    this.categoryList.key(['escape'], handleEsc);
    this.formatList.key(['escape'], handleEsc);
    this.overlay.key(['escape'], handleEsc);
  }

  private selectCurrentFormat() {
    const selected = (this.formatList as any).selected;
    const formats = FORMATS[this.currentCategory];
    if (selected !== undefined && formats[selected]) {
      if (this.onSelect) this.onSelect(formats[selected]);
      this.hide();
    }
  }

  private loadCategory(category: FormatCategory) {
    const formats = FORMATS[category];
    this.formatList.setItems(formats.map(f => ` ${f.name}`));
    this.formatList.select(0);
    if (this.overlay.screen) this.overlay.screen.render();
  }

  show(screen: Screen, onSelect: (format: Format) => void, onCancel: () => void, position?: { x: number; y: number }) {
    this.onSelect = onSelect;
    this.onCancel = onCancel;

    if (position) {
      const screenWidth = (screen as any).width || 80;
      const overlayWidth = (this.overlay as any).width || 45;
      const overlayHeight = (this.overlay as any).height || 10;

      let top: any = position.y - overlayHeight - 1;
      let left: any = position.x - 2;

      if (top < 0) top = position.y + 1;
      if (left + overlayWidth > screenWidth) left = screenWidth - overlayWidth;
      
      (this.overlay as any).top = top;
      (this.overlay as any).left = Math.max(0, left);
    } else {
      (this.overlay as any).top = 'center-1';
      (this.overlay as any).left = 'center-2';
    }

    this.overlay.show();
    this.overlay.setFront();
    this.categoryList.focus();
    this.categoryList.select(0);
    this.loadCategory('colors');
    
    // Add global click handler to close when clicking outside
    if (this.globalClickHandler) {
      screen.removeListener('click', this.globalClickHandler);
    }
    
    this.globalClickHandler = (data: any) => {
      if (this.isVisible() && !this.overlay.hasMouseOver(data.x, data.y)) {
        if (this.onCancel) this.onCancel();
        this.hide();
      }
    };
    
    screen.on('click', this.globalClickHandler);
    
    screen.render();
  }

  hide() {
    this.overlay.hide();
    
    // Release focus trap
    if (this.overlay.screen) {
      this.overlay.screen.releaseFocusTrap();
      
      // Remove global click handler
      if (this.globalClickHandler) {
        this.overlay.screen.removeListener('click', this.globalClickHandler);
        this.globalClickHandler = null;
      }
    }

    if (this.overlay.screen) this.overlay.screen.render();
  }

  isVisible(): boolean {
    return !this.overlay.hidden;
  }

  destroy() {
    this.closeButton.destroy();
    this.overlay.destroy();
  }
}

export function getAllFormats(): Format[] {
  return [...FORMATS.colors, ...FORMATS.effects, ...FORMATS.markdown];
}

export function getFormatsByCategory(category: FormatCategory): Format[] {
  return FORMATS[category] || [];
}