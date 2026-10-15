/**
 * Format Picker Dialog - uses SDK CategoryPicker widget
 */
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
export type FormatCategory = 'colors' | 'effects' | 'markdown';
export interface Format {
    category: FormatCategory;
    name: string;
    wrap: (text: string) => string;
}
export declare class FormatPicker {
    private picker;
    private screen;
    constructor(screen: Screen);
    show(screen: Screen, onSelect: (format: Format) => void, onCancel: () => void, position?: {
        x: number;
        y: number;
    }): void;
    hide(): void;
    isVisible(): boolean;
    destroy(): void;
}
export declare function getAllFormats(): Format[];
export declare function getFormatsByCategory(category: FormatCategory): Format[];
