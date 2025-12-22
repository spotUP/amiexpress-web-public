/**
 * Type definitions for Blessed UI engine
 */
export type Color = string | number;
export interface Colors {
    fg?: Color;
    bg?: Color;
    bold?: Color | boolean;
    underline?: Color | boolean;
    blink?: Color | boolean;
    inverse?: Color | boolean;
    invisible?: Color | boolean;
}
export interface Border {
    type?: 'line' | 'bg' | 'none' | 'heavy' | 'double' | 'round' | 'ascii';
    fg?: Color;
    bg?: Color;
    ch?: string;
    style?: Colors;
    label?: string;
    labelStyle?: Colors;
    labelPosition?: 'left' | 'center' | 'right';
}
export interface Padding {
    left?: number;
    right?: number;
    top?: number;
    bottom?: number;
}
export interface Position {
    xi: number;
    xl: number;
    yi: number;
    yl: number;
}
export type TPosition = number | string;
export interface ElementOptions {
    left?: TPosition;
    right?: TPosition;
    top?: TPosition;
    bottom?: TPosition;
    width?: TPosition;
    height?: TPosition;
    align?: 'left' | 'center' | 'right';
    valign?: 'top' | 'middle' | 'bottom';
    style?: Colors & {
        border?: Colors;
        scrollbar?: Colors;
        focus?: Colors;
        hover?: Colors;
    };
    border?: Border | 'line' | 'bg';
    padding?: number | Padding;
    shadow?: boolean;
    ch?: string;
    content?: string;
    tags?: boolean;
    wrap?: boolean;
    hidden?: boolean;
    focusable?: boolean;
    clickable?: boolean;
    keyable?: boolean;
    input?: boolean;
    dockBorders?: boolean;
    ignoreDockContrast?: boolean;
    scrollable?: boolean;
    alwaysScroll?: boolean;
    scrollbar?: {
        ch?: string;
        track?: {
            ch?: string;
        };
        style?: Colors;
    };
    baseLimit?: number;
    mouse?: boolean;
    label?: string;
    parent?: Element;
    screen?: Screen;
}
export interface KeyEvent {
    name: string;
    ctrl: boolean;
    meta: boolean;
    shift: boolean;
    sequence: string;
    full: string;
}
export interface MouseEvent {
    x: number;
    y: number;
    action: 'mousedown' | 'mouseup' | 'mousemove' | 'wheeldown' | 'wheelup';
    button?: 'left' | 'middle' | 'right';
    shift?: boolean;
    ctrl?: boolean;
    meta?: boolean;
}
export type EventHandler = (...args: any[]) => void;
export interface ScreenOptions {
    program?: any;
    smartCSR?: boolean;
    fastCSR?: boolean;
    resizeTimeout?: number;
    tabSize?: number;
    autoPadding?: boolean;
    height?: number;
    cursor?: {
        artificial?: boolean;
        shape?: 'block' | 'underline' | 'line';
        blink?: boolean;
        color?: Color;
    };
    log?: string;
    dump?: boolean;
    debug?: boolean;
    warnings?: boolean;
    title?: string;
    fullUnicode?: boolean;
    dockBorders?: boolean;
    ignoreDockContrast?: boolean;
    ignoreLocked?: string[];
    forceUnicode?: boolean;
    terminal?: string;
    tput?: boolean;
}
export interface ListOptions extends ElementOptions {
    items?: string[];
    selected?: number;
    interactive?: boolean;
    keys?: boolean;
    vi?: boolean;
    wrapItems?: boolean;
    style?: ElementOptions['style'] & {
        selected?: Colors;
        item?: Colors;
    };
}
export interface FormOptions extends ElementOptions {
    keys?: boolean;
    vi?: boolean;
}
export interface TextboxOptions extends ElementOptions {
    keys?: boolean;
    mouse?: boolean;
    inputOnFocus?: boolean;
    value?: string;
    secret?: boolean;
    censor?: boolean;
}
export interface ButtonOptions extends ElementOptions {
    keys?: boolean;
    mouse?: boolean;
}
export interface ProgressBarOptions extends ElementOptions {
    orientation?: 'horizontal' | 'vertical';
    filled?: number;
    value?: number;
    keys?: boolean;
    mouse?: boolean;
    ch?: string;
    pch?: string;
}
export interface TableOptions extends ElementOptions {
    rows?: string[][];
    data?: string[][];
    headers?: string[];
    columnWidth?: number[];
    columnSpacing?: number;
    pad?: number;
    noCellBorders?: boolean;
    fillCellBorders?: boolean;
    style?: ElementOptions['style'] & {
        header?: Colors;
        cell?: Colors;
    };
}
export interface FileManagerOptions extends ElementOptions {
    cwd?: string;
    keys?: boolean;
    vi?: boolean;
    style?: ElementOptions['style'] & {
        selected?: Colors;
    };
}
export interface LogOptions extends ElementOptions {
    scrollback?: number;
    scrollOnInput?: boolean;
}
export interface Element {
    options: ElementOptions;
    parent: Element | null;
    screen: Screen | null;
    children: Element[];
    position: Position;
    lpos?: Position;
    content: string;
    render(): void;
    setContent(content: string): void;
    getContent(): string;
    setText(text: string): void;
    getText(): string;
    insertLine(i: number, line: string): void;
    deleteLine(i: number): void;
    getLine(i: number): string;
    getLines(): string[];
    setLine(i: number, line: string): void;
    clearLine(i: number): void;
    insertTop(line: string): void;
    insertBottom(line: string): void;
    append(element: Element): void;
    prepend(element: Element): void;
    remove(element: Element): void;
    insert(element: Element, i: number): void;
    insertBefore(element: Element, other: Element): void;
    insertAfter(element: Element, other: Element): void;
    detach(): void;
    on(event: string, handler: EventHandler): void;
    once(event: string, handler: EventHandler): void;
    removeListener(event: string, handler: EventHandler): void;
    emit(event: string, ...args: any[]): void;
    focus(): void;
    show(): void;
    hide(): void;
    toggle(): void;
    setFront(): void;
    setBack(): void;
    scroll(offset: number): void;
    scrollTo(index: number): void;
    getScroll(): number;
    setScroll(index: number): void;
    getScrollHeight(): number;
    getScrollPerc(): number;
    setScrollPerc(perc: number): void;
    resetScroll(): void;
    destroy(): void;
    free(): void;
}
export interface Screen extends Element {
    width: number;
    height: number;
    focused: Element | null;
    render(): void;
    draw(start: number, end: number): void;
    clearRegion(xi: number, xl: number, yi: number, yl: number): void;
    fillRegion(attr: string, ch: string, xi: number, xl: number, yi: number, yl: number): void;
    focusPush(element: Element): void;
    focusPop(): Element;
    saveFocus(): Element;
    restoreFocus(): Element;
    rewindFocus(): void;
    key(keys: string | string[], handler: (ch: any, key: KeyEvent) => void): void;
    onceKey(keys: string | string[], handler: (ch: any, key: KeyEvent) => void): void;
    unkey(keys: string | string[], handler: (ch: any, key: KeyEvent) => void): void;
    setTitle(title: string): void;
    showCursor(): void;
    hideCursor(): void;
    destroy(): void;
}
//# sourceMappingURL=types.d.ts.map