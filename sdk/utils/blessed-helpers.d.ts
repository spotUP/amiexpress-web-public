/**
 * Neo-Blessed Helper Functions
 *
 * These helpers ensure tags are always enabled by default, preventing the common issue
 * where {gray-fg} and other tags show as literal text instead of being parsed.
 *
 * ALWAYS use these helpers instead of calling blessed.* directly.
 *
 * IMPORTANT - COLOR SYSTEM:
 * Neo-blessed only supports 16 standard colors. Do NOT use:
 * - Raw ANSI codes like \x1b[38;5;196m (256-color) - they get stripped
 * - Raw ANSI codes like \x1b[31m - use blessed tags instead
 *
 * USE THESE INSTEAD:
 * - Blessed tags in content: {red-fg}text{/red-fg}
 * - Style properties: style: { fg: 'red', bg: 'black' }
 * - The colorize() helper: colorize('text', 'red')
 *
 * SUPPORTED COLORS: black, red, green, yellow, blue, magenta, cyan, white, gray
 *
 * BBS COMPATIBILITY - AUTOMATIC ANSI CODE CONVERSION:
 * All create* functions automatically convert standard ANSI escape codes to blessed tags.
 * This means blessed elements can display content from bbs.write() and legacy BBS
 * doors without manual conversion.
 *
 * Example:
 *   const content = '\x1b[31mError\x1b[0m: Something went wrong';
 *   const box = createBox({ content });  // Auto-converts to: {red-fg}Error{/}: Something went wrong
 *
 * When calling setContent() after creation, use sanitizeContent() or ansiToTags():
 *   box.setContent(sanitizeContent('\x1b[32mSuccess!\x1b[0m'));
 */
import type { ElementOptions, ListOptions, TextboxOptions, ButtonOptions, TableOptions, LogOptions, ScreenOptions } from '../engines/ui/blessed/core/types';
import type { Screen } from '../engines/ui/blessed/core/screen';
import type { Box } from '../engines/ui/blessed/widgets/box';
import type { List } from '../engines/ui/blessed/widgets/list';
import type { Text } from '../engines/ui/blessed/widgets/text';
import type { Textarea } from '../engines/ui/blessed/widgets/textbox';
import type { Button } from '../engines/ui/blessed/widgets/button';
import type { Table } from '../engines/ui/blessed/widgets/table';
import type { Log } from '../engines/ui/blessed/widgets/log';
import type { DockablePanel } from '../engines/ui/blessed/widgets/dockable-panel';
import type { DockablePanelOptions } from '../engines/ui/blessed/widgets/dockable-panel';
/**
 * Convert ANSI escape codes to blessed tags
 *
 * Enables blessed elements to display content with ANSI codes (from bbs.write(), etc.)
 * Supports both legacy and modern ANSI formats.
 *
 * @example
 * ansiToTags('\x1b[31mError\x1b[0m')        // Returns: {red-fg}Error{/}
 * ansiToTags('\x1b[1;36mInfo\x1b[0m')       // Returns: {bold}{cyan-fg}Info{/}
 * ansiToTags('\x1b[32mOK\x1b[0m')           // Returns: {green-fg}OK{/}
 *
 * Supported ANSI codes:
 * - Colors: 30-37 (fg), 40-47 (bg)
 * - Styles: 0 (reset), 1 (bold), 4 (underline), 7 (inverse)
 * - Combined: \x1b[1;31m (bold + red)
 */
export declare function ansiToTags(text: string): string;
/**
 * Create a blessed screen
 *
 * ALWAYS use this instead of blessed.screen() for consistency
 * Note: Tags are enabled per-element (see createBox, createList, etc.)
 */
export declare function createScreen(options?: ScreenOptions & {
    output?: (data: string) => void;
}): Screen;
/**
 * Create a blessed box with tags ALWAYS enabled
 *
 * AUTO-CONVERTS ANSI CODES: If content contains ANSI escape codes (like \x1b[31m),
 * they are automatically converted to blessed tags for proper rendering.
 *
 * NOTE: tags: true is FORCED and cannot be disabled. This prevents color bugs.
 * NOTE: For dialogs/overlays that need opaque backgrounds, explicitly set style.bg.
 */
export declare function createBox(options?: DockablePanelOptions): DockablePanel;
/**
 * Create a dockable panel with tags ALWAYS enabled
 *
 * NOTE: tags: true is FORCED and cannot be disabled. This prevents color bugs.
 */
export declare function createDockablePanel(options?: DockablePanelOptions): DockablePanel;
/**
 * Create a blessed list with tags ALWAYS enabled
 *
 * AUTO-CONVERTS ANSI CODES: List items with ANSI codes are automatically converted to blessed tags.
 *
 * NOTE: tags: true is FORCED and cannot be disabled. This prevents color bugs.
 * NOTE: For dialogs/overlays that need opaque backgrounds, explicitly set style.bg.
 */
export declare function createList(options?: ListOptions): List;
/**
 * Create a blessed text element with tags ALWAYS enabled
 *
 * AUTO-CONVERTS ANSI CODES: Content with ANSI codes is automatically converted to blessed tags.
 *
 * NOTE: tags: true is FORCED and cannot be disabled. This prevents color bugs.
 * NOTE: For dialogs/overlays that need opaque backgrounds, explicitly set style.bg.
 */
export declare function createText(options?: ElementOptions): Text;
/**
 * Create a blessed textarea with tags ALWAYS enabled
 *
 * AUTO-CONVERTS ANSI CODES: Content with ANSI codes is automatically converted to blessed tags.
 *
 * NOTE: tags: true is FORCED and cannot be disabled. This prevents color bugs.
 * NOTE: For dialogs/overlays that need opaque backgrounds, explicitly set style.bg.
 */
export declare function createTextarea(options?: TextboxOptions): Textarea;
/**
 * Create a blessed log with tags ALWAYS enabled
 *
 * AUTO-CONVERTS ANSI CODES: Content with ANSI codes is automatically converted to blessed tags.
 *
 * NOTE: tags: true is FORCED and cannot be disabled. This prevents color bugs.
 * NOTE: For dialogs/overlays that need opaque backgrounds, explicitly set style.bg.
 */
export declare function createLog(options?: LogOptions): Log;
/**
 * Create a blessed table with tags ALWAYS enabled
 *
 * AUTO-CONVERTS ANSI CODES: Content with ANSI codes is automatically converted to blessed tags.
 *
 * NOTE: tags: true is FORCED and cannot be disabled. This prevents color bugs.
 * NOTE: For dialogs/overlays that need opaque backgrounds, explicitly set style.bg.
 */
export declare function createTable(options?: TableOptions): Table;
/**
 * Create a blessed button with tags ALWAYS enabled
 *
 * AUTO-CONVERTS ANSI CODES: Content with ANSI codes is automatically converted to blessed tags.
 *
 * NOTE: tags: true is FORCED and cannot be disabled. This prevents color bugs.
 * NOTE: For dialogs/overlays that need opaque backgrounds, explicitly set style.bg.
 */
export declare function createButton(options?: ButtonOptions): Button;
/**
 * Common Neo-Blessed color tags for easy reference
 * Use these in your content strings: `{red-fg}Error{/red-fg}`
 */
export declare const Tags: {
    readonly fg: {
        readonly black: "{black-fg}";
        readonly red: "{red-fg}";
        readonly green: "{green-fg}";
        readonly yellow: "{yellow-fg}";
        readonly blue: "{blue-fg}";
        readonly magenta: "{magenta-fg}";
        readonly cyan: "{cyan-fg}";
        readonly white: "{white-fg}";
        readonly gray: "{gray-fg}";
        readonly grey: "{gray-fg}";
    };
    readonly bg: {
        readonly black: "{black-bg}";
        readonly red: "{red-bg}";
        readonly green: "{green-bg}";
        readonly yellow: "{yellow-bg}";
        readonly blue: "{blue-bg}";
        readonly magenta: "{magenta-bg}";
        readonly cyan: "{cyan-bg}";
        readonly white: "{white-bg}";
    };
    readonly bold: "{bold}";
    readonly underline: "{underline}";
    readonly blink: "{blink}";
    readonly inverse: "{inverse}";
    readonly reset: "{/}";
    readonly end: "{/}";
};
/**
 * Helper to wrap text in a color tag
 *
 * @example
 * colorize('Error message', 'red')  // Returns: {red-fg}Error message{/}
 */
export declare function colorize(text: string, color: keyof typeof Tags.fg): string;
/**
 * Sanitize content for blessed elements - handles both ANSI codes and blessed tags
 *
 * Use this when displaying content that might have ANSI codes (from bbs.write(), legacy doors, etc.)
 * in blessed elements. It converts ANSI codes to blessed tags so they render correctly.
 *
 * @example
 * const content = '\x1b[31mError:\x1b[0m Something went wrong';
 * createBox({ content: sanitizeContent(content) });
 * // Displays: {red-fg}Error:{/} Something went wrong
 */
export declare function sanitizeContent(content: string): string;
/**
 * CRITICAL: HOW TO CENTER CONTENT IN BLESSED
 *
 * ❌ WRONG - {center} tags DO NOT WORK in blessed:
 *   content: '{center}My Text{/center}'
 *
 * ✅ CORRECT - Use align property:
 *   createBox({
 *     align: 'center',
 *     content: 'My Text'
 *   })
 *
 * For multi-line centered content, use valign too:
 *   createBox({
 *     align: 'center',
 *     valign: 'middle',
 *     content: 'Line 1\nLine 2\nLine 3'
 *   })
 *
 * Supported align values: 'left', 'center', 'right'
 * Supported valign values: 'top', 'middle', 'bottom'
 */
//# sourceMappingURL=blessed-helpers.d.ts.map
