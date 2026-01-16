/**
 * ANSIEditor - Full-featured ANSI/ASCII art editor widget
 *
 * Features:
 * - Text and Draw modes
 * - Full drawing toolset (draw, line, box, ellipse, fill, pick, select)
 * - ANSI color picker and character picker
 * - Search and replace
 * - Undo/redo
 * - Mouse and keyboard support
 * - File save/load support
 *
 * This widget uses the core ANSI Editor library for all canvas operations
 * and drawing tools, making the core functionality reusable for other doors.
 */
import { Box } from './box';
import type { ElementOptions } from '../core/types';
import type { Cell } from '../../ansi-editor/types';
export interface ANSIEditorOptions extends ElementOptions {
    title?: string;
    initialContent?: string;
    initialMode?: EditorMode;
    maxLines?: number;
    maxLineLength?: number;
    showLineNumbers?: boolean;
    showToolbar?: boolean;
    showStatusBar?: boolean;
    showMenuBar?: boolean;
    showSidebar?: boolean;
    onSave?: (content: string) => Promise<boolean>;
    onSaveAs?: () => Promise<void>;
    onOpen?: () => Promise<void>;
    onOpenBBS?: () => Promise<void>;
    onExit?: () => void;
    hideUIHotkey?: string;
}
export type EditorMode = 'text' | 'draw';
/**
 * Brush modes for drawing - Moebius-style
 */
export type BrushMode = 'text' | 'half-block' | 'custom' | 'shading' | 'colorize';
/**
 * Main ANSI Editor Widget
 */
export declare class ANSIEditor extends Box {
    private viewport;
    private drawCanvas;
    private drawCursor;
    private statusBar;
    private menuBar?;
    private fkeyToolbar?;
    private sidebar?;
    private colorPalette?;
    private toolPanel?;
    private fileMenu?;
    private editMenu?;
    private selectionMenu?;
    private colorsMenu?;
    private viewMenu?;
    private helpMenu?;
    private fkeySetIndex;
    private fkeyButtons;
    private mode;
    private lines;
    private cursor;
    private scrollTop;
    private scrollLeft;
    private modified;
    private currentFg;
    private currentBg;
    private currentChar;
    private cellCanvas;
    private currentTool;
    private isDrawing;
    private drawStartPos;
    private coreState;
    private undoStack;
    private redoStack;
    private layers;
    private activeLayerIndex;
    private nextLayerId;
    private layerPanel?;
    private layerMenu?;
    private sauce;
    private iceColorsEnabled;
    private clipboard;
    private selection;
    private brushMode;
    private halfBlockSubY;
    private previewCanvas;
    private previewOverlay?;
    private lastPreviewPos;
    private maxLines;
    private maxLineLength;
    private showLineNumbers;
    private onSaveCallback?;
    private onSaveAsCallback?;
    private onOpenCallback?;
    private onOpenBBSCallback?;
    private onExitCallback?;
    private hideUIHotkey;
    private uiVisible;
    private modalOpen;
    constructor(options?: ANSIEditorOptions);
    private createUI;
    /**
     * Create Moebius-style menu bar with dropdown menus
     */
    private createMenuBar;
    /**
     * Create dropdown menus for the menu bar
     */
    private createDropdownMenus;
    /**
     * Open a dropdown menu
     */
    private openMenu;
    /**
     * Create F-key character toolbar (Moebius-style)
     */
    private createFkeyToolbar;
    /**
     * Get F-key button content (e.g., "F1█")
     */
    private getFkeyButtonContent;
    /**
     * Update F-key toolbar characters
     */
    private updateFkeyToolbar;
    /**
     * Go to previous F-key character set
     */
    private prevFkeySet;
    /**
     * Go to next F-key character set
     */
    private nextFkeySet;
    /**
     * Select a character from F-key toolbar
     */
    private selectFkeyChar;
    /**
     * Create left sidebar with color palette and tool buttons (Moebius-style)
     */
    private createSidebar;
    /**
     * FG/BG indicator reference
     */
    private fgBgIndicator?;
    /**
     * Get FG/BG content string
     */
    private getFGBGContent;
    /**
     * Update FG/BG indicator in sidebar
     */
    private updateSidebarFGBG;
    /**
     * Create brush mode panel in sidebar (compact)
     */
    private createBrushModePanel;
    private halfBlockBtn?;
    private getBrushModeContent;
    private getHalfBlockContent;
    /**
     * Create layer panel in sidebar
     */
    private createLayerPanel;
    /**
     * Update layer panel display
     */
    private updateLayerPanel;
    /**
     * Add new layer
     */
    private addLayer;
    /**
     * Delete current layer
     */
    private deleteLayer;
    /**
     * Merge current layer down into layer below
     */
    private mergeLayerDown;
    /**
     * Toggle layer visibility
     */
    private toggleLayerVisibility;
    /**
     * Toggle layer lock
     */
    private toggleLayerLock;
    /**
     * Compose all visible layers into a single output canvas
     */
    private composeLayers;
    /**
     * Flatten all layers into one
     */
    private flattenLayers;
    /**
     * Move current layer up (toward front)
     */
    private moveLayerUp;
    /**
     * Move current layer down (toward back)
     */
    private moveLayerDown;
    /**
     * Toggle iCE Colors mode (16 BG colors vs 8 + blink)
     */
    private toggleIceColors;
    /**
     * Cut selection to clipboard
     */
    private cutSelection;
    /**
     * Copy selection to clipboard
     */
    private copySelection;
    /**
     * Copy a region to clipboard
     */
    private copyRegion;
    /**
     * Paste clipboard at cursor position
     */
    private pasteClipboard;
    /**
     * Insert a blank row at cursor position
     */
    private insertRow;
    /**
     * Delete row at cursor position
     */
    private deleteRow;
    /**
     * Select entire canvas
     */
    private selectAll;
    /**
     * Clear selection
     */
    private deselect;
    /**
     * Move selected block to cursor position
     */
    private moveBlock;
    /**
     * Copy selected block to cursor position
     */
    private copyBlock;
    /**
     * Flip selection or canvas horizontally
     */
    private flipHorizontal;
    /**
     * Flip selection or canvas vertically
     */
    private flipVertical;
    /**
     * Show About dialog
     */
    private showAbout;
    /**
     * Show SAUCE metadata editor dialog
     */
    private showSauceEditor;
    /**
     * Update sidebar tool selection highlighting
     */
    private updateSidebarToolSelection;
    /**
     * Toggle sidebar visibility
     */
    private toggleSidebar;
    /**
     * Toggle F-key toolbar visibility
     */
    private toggleFkeyToolbar;
    /**
     * Swap foreground and background colors
     */
    private swapColors;
    /**
     * Reset colors to default (white on black)
     */
    private resetColors;
    /**
     * Create new document (clear canvas)
     */
    private newDocument;
    private setupKeyHandlers;
    private setupMouseHandlers;
    private toggleUI;
    private handleTextKey;
    private handleDrawKey;
    /**
     * Switch to a different drawing tool
     */
    private switchTool;
    /**
     * Type a character at cursor position (for text tool)
     */
    private typeCharAtCursor;
    private moveCursor;
    private insertTextAtCursor;
    private overwriteTextAtCursor;
    private insertNewLine;
    private deleteChar;
    private toggleMode;
    private updateDrawCursor;
    private drawAtCursor;
    private eraseAtCursor;
    /**
     * Draw with background color (Moebius-style RMB drawing)
     * Swaps FG and BG colors so RMB draws with the current background color
     */
    private drawWithBackgroundColor;
    /**
     * Draw in half-block mode at cursor position
     * Each cell represents 2 vertical "pixels" using ▀▄█ characters
     * FG color = upper half, BG color = lower half
     */
    private drawHalfBlock;
    /**
     * Erase in half-block mode at cursor position
     */
    private eraseHalfBlock;
    /**
     * Draw half-block with background color (Moebius-style RMB)
     * Uses background color instead of foreground for the half being drawn
     */
    private drawHalfBlockWithBg;
    /**
     * Get sub-Y position from mouse Y coordinate
     * Each cell is 1 character tall, but we track upper/lower half
     */
    private getSubYFromMouseY;
    /**
     * Toggle which half-block sub-row is active
     */
    private toggleHalfBlockSubY;
    /**
     * Switch brush mode
     */
    private switchBrushMode;
    /**
     * Update sidebar to show current brush mode
     */
    private updateSidebarBrushMode;
    /**
     * Initialize preview canvas (same size as main canvas)
     */
    private initPreviewCanvas;
    /**
     * Clear preview canvas
     */
    private clearPreview;
    /**
     * Update preview for shape tools (line, box, ellipse)
     * Called on mouse move while drawing
     */
    private updateShapePreview;
    /**
     * Draw preview line using Bresenham algorithm
     */
    private previewLine;
    /**
     * Draw preview box/rectangle
     */
    private previewBox;
    /**
     * Draw preview ellipse using midpoint algorithm
     */
    private previewEllipse;
    /**
     * Draw preview selection rectangle (marching ants style)
     */
    private previewSelection;
    /**
     * Render preview overlay on top of main canvas
     */
    private renderPreview;
    /**
     * Apply preview to main canvas (commit the shape)
     */
    private applyPreview;
    /**
     * Handle tool-specific click behavior using core library
     * Shape tools use preview system for real-time feedback
     */
    private handleToolClick;
    /**
     * Sync core canvas to blessed Canvas widget for display
     * Standard 80x25 ANSI art canvas with 1 character per cell
     */
    private syncCoreCanvasToDisplay;
    private updateDisplay;
    private renderTextMode;
    private updateStatusBar;
    private updateToolbar;
    private save;
    private confirmExit;
    private restoreFocusAfterDialog;
    private showColorPicker;
    private showCharacterPicker;
    private showHelp;
    private saveUndoState;
    private undo;
    private redo;
    /**
     * Get current content
     */
    getContent(): string;
    /**
     * Get the core canvas (Cell[][]) for advanced operations
     */
    getCoreCanvas(): Cell[][] | null;
    /**
     * Set the core canvas directly
     */
    setCoreCanvas(canvas: Cell[][]): void;
    /**
     * Check if content has been modified
     */
    isModified(): boolean;
    /**
     * Set content - parses ANSI and updates both text lines and cell canvas
     */
    setContent(content: string): void;
}
/**
 * Helper function to create ANSIEditor
 */
export declare function ansiEditor(options?: ANSIEditorOptions): ANSIEditor;
