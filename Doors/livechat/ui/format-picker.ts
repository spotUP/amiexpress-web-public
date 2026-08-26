/**
 * Format Picker Dialog - uses SDK CategoryPicker widget
 */

import { Screen, CategoryPicker } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { PANEL_BORDER } from './theme';
import type { CategoryItem } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

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

const CATEGORY_MAP: Record<string, FormatCategory> = {
  'Colors': 'colors',
  'Effects': 'effects',
  'Markdown': 'markdown',
};

const CATEGORIES = ['Colors', 'Effects', 'Markdown'];

export class FormatPicker {
  private picker: CategoryPicker;
  private screen: Screen;

  constructor(screen: Screen) {
    this.screen = screen;

    this.picker = new CategoryPicker({
      parent: screen,
      title: 'Format',
      width: 45,
      height: 10,
      categories: CATEGORIES,
      categoryWidth: 14,
      debounceMs: 80,
      borderColor: PANEL_BORDER,
      categoryStyle: {
        fg: 'white',
        bg: 'black',
        selected: { fg: 'black', bg: 'green' },
      },
      itemStyle: {
        fg: 'white',
        bg: 'black',
        selected: { fg: 'black', bg: 'yellow' },
      },
      getItems: (category: string) => {
        const formatCategory = CATEGORY_MAP[category] || 'colors';
        const formats = FORMATS[formatCategory];
        return formats.map(f => ({
          id: f.name.toLowerCase(),
          label: f.name,
          format: f,  // Store the full format object
        }));
      },
      renderItem: (item: CategoryItem) => {
        const format = item.format as Format;
        if (!format) return ` ${item.label}`;

        // Render item with its own effect/color applied for visual preview
        switch (format.category) {
          case 'colors':
            // Show color name in that color (use blessed tags)
            const colorName = format.name.toLowerCase();
            return ` {${colorName}-fg}${item.label}{/}`;

          case 'effects':
            // Show effect name with visual representation
            const effectName = format.name.toLowerCase();
            if (effectName === 'rainbow') return ` {magenta-fg}{bold}${item.label}{/bold}{/}`;
            if (effectName === 'pulse') return ` {cyan-fg}{bold}${item.label}{/bold}{/}`;
            if (effectName === 'sparkle') return ` {yellow-fg}{bold}${item.label}{/bold}{/}`;
            if (effectName === 'shake') return ` {red-fg}{bold}${item.label}{/bold}{/}`;
            if (effectName === 'wave') return ` {blue-fg}{bold}${item.label}{/bold}{/}`;
            if (effectName === 'gradient') return ` {cyan-fg}${item.label}{/}`;
            return ` ${item.label}`;

          case 'markdown':
            // Show markdown symbols applied
            if (format.name === 'Bold') return ` {bold}${item.label}{/bold}`;
            if (format.name === 'Italic') return ` {underline}${item.label}{/underline}`; // Italic not supported, use underline
            if (format.name === 'Underline') return ` {underline}${item.label}{/underline}`;
            if (format.name === 'Strike') return ` {gray-fg}${item.label}{/}`;
            if (format.name === 'Code') return ` {black-bg}{white-fg}${item.label}{/}{/}`;
            return ` ${item.label}`;

          default:
            return ` ${item.label}`;
        }
      },
    });
  }

  show(screen: Screen, onSelect: (format: Format) => void, onCancel: () => void, position?: { x: number; y: number }) {
    this.picker.onSelect((item: CategoryItem, category: string) => {
      if (item.format) {
        onSelect(item.format as Format);
      }
    });

    this.picker.onCancel(onCancel);

    this.picker.display(position);
  }

  hide() {
    this.picker.hide();
  }

  isVisible(): boolean {
    return this.picker.isVisible();
  }

  destroy() {
    this.picker.destroy();
  }
}

export function getAllFormats(): Format[] {
  return [...FORMATS.colors, ...FORMATS.effects, ...FORMATS.markdown];
}

export function getFormatsByCategory(category: FormatCategory): Format[] {
  return FORMATS[category] || [];
}
