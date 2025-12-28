/**
 * Blessed - Full-featured terminal UI library
 * A complete 1:1 port of neo-blessed for browser and Node.js
 */
// Core
export { Screen } from './core/screen';
export { Element } from './core/element';
export { Program } from './core/program';
export { EventEmitter } from './core/events';
export { KeyBindings } from './core/keybindings';
export { ResponsiveLayoutManager } from './core/responsive-layout';
export * as colors from './core/colors';
// Widgets
export { Box } from './widgets/box';
export { Text } from './widgets/text';
export { List } from './widgets/list';
export { Form } from './widgets/form';
export { Textbox, Input, Textarea } from './widgets/textbox';
export { Button } from './widgets/button';
export { ProgressBar } from './widgets/progressbar';
export { Table } from './widgets/table';
export { Log } from './widgets/log';
export { ScrollableBox } from './widgets/scrollablebox';
export { ScrollableText } from './widgets/scrollabletext';
export { Checkbox } from './widgets/checkbox';
export { RadioButton } from './widgets/radiobutton';
export { RadioSet } from './widgets/radioset';
export { Message } from './widgets/message';
export { Question } from './widgets/question';
export { Prompt } from './widgets/prompt';
export { Loading } from './widgets/loading';
export { Line } from './widgets/line';
export { Listbar } from './widgets/listbar';
export { BigText } from './widgets/bigtext';
export { FileManager } from './widgets/filemanager';
export { Overlay } from './widgets/overlay';
export { ListTable } from './widgets/listtable';
export { ANSIImage } from './widgets/ansiimage';
export { Terminal } from './widgets/terminal';
export { Layout } from './widgets/layout';
export { PassBox } from './widgets/passbox';
export { FileBox } from './widgets/filebox';
export { Image } from './widgets/image';
export { Viewport } from './widgets/viewport';
export { Canvas } from './widgets/canvas';
export { IFrame } from './widgets/iframe';
export { Video } from './widgets/video';
export { ContextMenu } from './widgets/contextmenu';
export { Panel } from './widgets/panel';
export { DockablePanel } from './widgets/dockable-panel';
// Factory functions (blessed-style API)
import { Screen } from './core/screen';
import { Box } from './widgets/box';
import { Text } from './widgets/text';
import { List } from './widgets/list';
import { Form } from './widgets/form';
import { Textbox, Input, Textarea } from './widgets/textbox';
import { Button } from './widgets/button';
import { ProgressBar } from './widgets/progressbar';
import { Table } from './widgets/table';
import { Log } from './widgets/log';
import { ScrollableBox } from './widgets/scrollablebox';
import { ScrollableText } from './widgets/scrollabletext';
import { Checkbox } from './widgets/checkbox';
import { RadioButton } from './widgets/radiobutton';
import { RadioSet } from './widgets/radioset';
import { Message } from './widgets/message';
import { Question } from './widgets/question';
import { Prompt } from './widgets/prompt';
import { Loading } from './widgets/loading';
import { Line } from './widgets/line';
import { Listbar } from './widgets/listbar';
import { BigText } from './widgets/bigtext';
import { FileManager } from './widgets/filemanager';
import { Overlay } from './widgets/overlay';
import { ListTable } from './widgets/listtable';
import { ANSIImage } from './widgets/ansiimage';
import { Terminal } from './widgets/terminal';
import { Layout } from './widgets/layout';
import { PassBox } from './widgets/passbox';
import { FileBox } from './widgets/filebox';
import { Image } from './widgets/image';
import { Viewport } from './widgets/viewport';
import { Canvas } from './widgets/canvas';
import { IFrame } from './widgets/iframe';
import { Video } from './widgets/video';
/**
 * Create a new screen
 */
export function screen(options) {
    return new Screen(options);
}
// ============================================================================
// Factory Functions - ALL default to tags: true for color support
// ============================================================================
/**
 * Create a box widget (tags: true by default, cannot be overridden)
 */
export function box(options) {
    return new Box({ ...options, tags: true });
}
/**
 * Create a text widget (tags: true forced, cannot be overridden)
 */
export function text(options) {
    return new Text({ ...options, tags: true });
}
/**
 * Create a list widget (tags: true forced, cannot be overridden)
 */
export function list(options) {
    return new List({ ...options, tags: true });
}
/**
 * Create a form widget (tags: true forced, cannot be overridden)
 */
export function form(options) {
    return new Form({ ...options, tags: true });
}
/**
 * Create a textbox/input widget (tags: true forced, cannot be overridden)
 */
export function textbox(options) {
    return new Textbox({ ...options, tags: true });
}
export function input(options) {
    return new Input({ ...options, tags: true });
}
export function textarea(options) {
    return new Textarea({ ...options, tags: true });
}
/**
 * Create a button widget (tags: true forced, cannot be overridden)
 */
export function button(options) {
    return new Button({ ...options, tags: true });
}
/**
 * Create a progress bar widget (tags: true forced, cannot be overridden)
 */
export function progressbar(options) {
    return new ProgressBar({ ...options, tags: true });
}
/**
 * Create a table widget (tags: true forced, cannot be overridden)
 */
export function table(options) {
    return new Table({ ...options, tags: true });
}
/**
 * Create a log widget (tags: true forced, cannot be overridden)
 */
export function log(options) {
    return new Log({ ...options, tags: true });
}
/**
 * Create a scrollable box widget (tags: true forced, cannot be overridden)
 */
export function scrollablebox(options) {
    return new ScrollableBox({ ...options, tags: true });
}
/**
 * Create a scrollable text widget (tags: true forced, cannot be overridden)
 */
export function scrollabletext(options) {
    return new ScrollableText({ ...options, tags: true });
}
/**
 * Create a checkbox widget (tags: true forced, cannot be overridden)
 */
export function checkbox(options) {
    return new Checkbox({ ...options, tags: true });
}
/**
 * Create a radio button widget (tags: true forced, cannot be overridden)
 */
export function radiobutton(options) {
    return new RadioButton({ ...options, tags: true });
}
/**
 * Create a radio set widget (tags: true forced, cannot be overridden)
 */
export function radioset(options) {
    return new RadioSet({ ...options, tags: true });
}
/**
 * Create a message dialog widget (tags: true forced, cannot be overridden)
 */
export function message(options) {
    return new Message({ ...options, tags: true });
}
/**
 * Create a question dialog widget (tags: true forced, cannot be overridden)
 */
export function question(options) {
    return new Question({ ...options, tags: true });
}
/**
 * Create a prompt dialog widget (tags: true forced, cannot be overridden)
 */
export function prompt(options) {
    return new Prompt({ ...options, tags: true });
}
/**
 * Create a loading indicator widget (tags: true forced, cannot be overridden)
 */
export function loading(options) {
    return new Loading({ ...options, tags: true });
}
/**
 * Create a line widget (tags: true forced, cannot be overridden)
 */
export function line(options) {
    return new Line({ ...options, tags: true });
}
/**
 * Create a listbar widget (tags: true forced, cannot be overridden)
 */
export function listbar(options) {
    return new Listbar({ ...options, tags: true });
}
/**
 * Create a big text widget (tags: true forced, cannot be overridden)
 */
export function bigtext(options) {
    return new BigText({ ...options, tags: true });
}
/**
 * Create a file manager widget (tags: true forced, cannot be overridden)
 */
export function filemanager(options) {
    return new FileManager({ ...options, tags: true });
}
/**
 * Create an overlay widget (tags: true forced, cannot be overridden)
 */
export function overlay(options) {
    return new Overlay({ ...options, tags: true });
}
/**
 * Create a list table widget (tags: true forced, cannot be overridden)
 */
export function listtable(options) {
    return new ListTable({ ...options, tags: true });
}
/**
 * Create an ANSI image widget (tags: true forced, cannot be overridden)
 */
export function ansiimage(options) {
    return new ANSIImage({ ...options, tags: true });
}
/**
 * Create a terminal widget (tags: true forced, cannot be overridden)
 */
export function terminal(options) {
    return new Terminal({ ...options, tags: true });
}
/**
 * Create a layout widget (tags: true forced, cannot be overridden)
 */
export function layout(options) {
    return new Layout({ ...options, tags: true });
}
/**
 * Create a password box widget (tags: true forced, cannot be overridden)
 */
export function passbox(options) {
    return new PassBox({ ...options, tags: true });
}
/**
 * Create a file box widget (tags: true forced, cannot be overridden)
 */
export function filebox(options) {
    return new FileBox({ ...options, tags: true });
}
/**
 * Create an image widget (tags: true forced, cannot be overridden)
 */
export function image(options) {
    return new Image({ ...options, tags: true });
}
/**
 * Create a viewport widget (tags: true forced, cannot be overridden)
 */
export function viewport(options) {
    return new Viewport({ ...options, tags: true });
}
/**
 * Create a canvas widget (tags: true forced, cannot be overridden)
 */
export function canvas(options) {
    return new Canvas({ ...options, tags: true });
}
/**
 * Create an iframe widget (tags: true forced, cannot be overridden)
 */
export function iframe(options) {
    return new IFrame({ ...options, tags: true });
}
/**
 * Create a video widget (tags: true forced, cannot be overridden)
 */
export function video(options) {
    return new Video({ ...options, tags: true });
}
// Default export with all factory functions
// Import all classes so they're available for the default export
import { Screen as ScreenClass } from './core/screen';
import { Element as ElementClass } from './core/element';
import { Program as ProgramClass } from './core/program';
import * as colorsExport from './core/colors';
import { EventEmitter as EventEmitterExport } from './core/events';
import { KeyBindings as KeyBindingsClass } from './core/keybindings';
// Import all widgets
import { Box as BoxClass } from './widgets/box';
import { Text as TextClass } from './widgets/text';
import { List as ListClass } from './widgets/list';
import { Form as FormClass } from './widgets/form';
import { Textbox as TextboxClass, Input as InputClass, Textarea as TextareaClass } from './widgets/textbox';
import { Button as ButtonClass } from './widgets/button';
import { ProgressBar as ProgressBarClass } from './widgets/progressbar';
import { Table as TableClass } from './widgets/table';
import { Log as LogClass } from './widgets/log';
import { ScrollableBox as ScrollableBoxClass } from './widgets/scrollablebox';
import { ScrollableText as ScrollableTextClass } from './widgets/scrollabletext';
import { Checkbox as CheckboxClass } from './widgets/checkbox';
import { RadioButton as RadioButtonClass } from './widgets/radiobutton';
import { RadioSet as RadioSetClass } from './widgets/radioset';
import { Message as MessageClass } from './widgets/message';
import { Question as QuestionClass } from './widgets/question';
import { Prompt as PromptClass } from './widgets/prompt';
import { Loading as LoadingClass } from './widgets/loading';
import { Line as LineClass } from './widgets/line';
import { Listbar as ListbarClass } from './widgets/listbar';
import { BigText as BigTextClass } from './widgets/bigtext';
import { FileManager as FileManagerClass } from './widgets/filemanager';
import { Overlay as OverlayClass } from './widgets/overlay';
import { ListTable as ListTableClass } from './widgets/listtable';
import { ANSIImage as ANSIImageClass } from './widgets/ansiimage';
import { Terminal as TerminalClass } from './widgets/terminal';
import { Layout as LayoutClass } from './widgets/layout';
import { PassBox as PassBoxClass } from './widgets/passbox';
import { FileBox as FileBoxClass } from './widgets/filebox';
import { Image as ImageClass } from './widgets/image';
import { Viewport as ViewportClass } from './widgets/viewport';
import { Canvas as CanvasClass } from './widgets/canvas';
import { IFrame as IFrameClass } from './widgets/iframe';
import { Video as VideoClass } from './widgets/video';
import { ContextMenu as ContextMenuClass } from './widgets/contextmenu';
import { Panel as PanelClass } from './widgets/panel';
import { DockablePanel as DockablePanelClass } from './widgets/dockable-panel';
import { ResponsiveLayoutManager as ResponsiveLayoutManagerClass } from './core/responsive-layout';
export default {
    // Core
    Screen: ScreenClass,
    Element: ElementClass,
    Program: ProgramClass,
    EventEmitter: EventEmitterExport,
    KeyBindings: KeyBindingsClass,
    colors: colorsExport,
    // Widgets
    Box: BoxClass,
    Text: TextClass,
    List: ListClass,
    Form: FormClass,
    Textbox: TextboxClass,
    Input: InputClass,
    Textarea: TextareaClass,
    Button: ButtonClass,
    ProgressBar: ProgressBarClass,
    Table: TableClass,
    Log: LogClass,
    ScrollableBox: ScrollableBoxClass,
    ScrollableText: ScrollableTextClass,
    Checkbox: CheckboxClass,
    RadioButton: RadioButtonClass,
    RadioSet: RadioSetClass,
    Message: MessageClass,
    Question: QuestionClass,
    Prompt: PromptClass,
    Loading: LoadingClass,
    Line: LineClass,
    Listbar: ListbarClass,
    BigText: BigTextClass,
    FileManager: FileManagerClass,
    Overlay: OverlayClass,
    ListTable: ListTableClass,
    ANSIImage: ANSIImageClass,
    Terminal: TerminalClass,
    Layout: LayoutClass,
    PassBox: PassBoxClass,
    FileBox: FileBoxClass,
    Image: ImageClass,
    Viewport: ViewportClass,
    Canvas: CanvasClass,
    IFrame: IFrameClass,
    Video: VideoClass,
    ContextMenu: ContextMenuClass,
    Panel: PanelClass,
    DockablePanel: DockablePanelClass,
    ResponsiveLayoutManager: ResponsiveLayoutManagerClass,
    // Factory functions
    screen,
    box,
    text,
    list,
    form,
    textbox,
    input,
    textarea,
    button,
    progressbar,
    table,
    log,
    scrollablebox,
    scrollabletext,
    checkbox,
    radiobutton,
    radioset,
    message,
    question,
    prompt,
    loading,
    line,
    listbar,
    bigtext,
    filemanager,
    overlay,
    listtable,
    ansiimage,
    terminal,
    layout,
    passbox,
    filebox,
    image,
    viewport,
    canvas,
    iframe,
    video,
};
// Modal Helpers - Utilities for centering and managing modals
export * as modalHelpers from './utils/modal-helpers';
export { centerElement, makeModalResponsive, createModalBackdrop, showModal } from './utils/modal-helpers';
