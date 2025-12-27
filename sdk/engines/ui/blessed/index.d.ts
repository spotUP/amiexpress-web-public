/**
 * Blessed - Full-featured terminal UI library
 * A complete 1:1 port of neo-blessed for browser and Node.js
 */
export { Screen } from './core/screen';
export { Element } from './core/element';
export { Program } from './core/program';
export { EventEmitter } from './core/events';
export * as colors from './core/colors';
export type * from './core/types';
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
import { Screen } from './core/screen';
import { Program } from './core/program';
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
import { Checkbox, CheckboxOptions } from './widgets/checkbox';
import { RadioButton, RadioButtonOptions } from './widgets/radiobutton';
import { RadioSet, RadioSetOptions } from './widgets/radioset';
import { Message, MessageOptions } from './widgets/message';
import { Question, QuestionOptions } from './widgets/question';
import { Prompt, PromptOptions } from './widgets/prompt';
import { Loading, LoadingOptions } from './widgets/loading';
import { Line, LineOptions } from './widgets/line';
import { Listbar, ListbarOptions } from './widgets/listbar';
import { BigText, BigTextOptions } from './widgets/bigtext';
import { FileManager, FileManagerOptions } from './widgets/filemanager';
import { Overlay, OverlayOptions } from './widgets/overlay';
import { ListTable, ListTableOptions } from './widgets/listtable';
import { ANSIImage, ANSIImageOptions } from './widgets/ansiimage';
import { Terminal, TerminalOptions } from './widgets/terminal';
import { Layout, LayoutOptions } from './widgets/layout';
import { PassBox, PassBoxOptions } from './widgets/passbox';
import { FileBox, FileBoxOptions } from './widgets/filebox';
import { Image, ImageOptions } from './widgets/image';
import { Viewport, ViewportOptions } from './widgets/viewport';
import { Canvas, CanvasOptions } from './widgets/canvas';
import { IFrame, IFrameOptions } from './widgets/iframe';
import { Video, VideoOptions } from './widgets/video';
import type { ScreenOptions, ElementOptions, ListOptions, FormOptions, TextboxOptions, ButtonOptions, ProgressBarOptions, TableOptions, LogOptions } from './core/types';
/**
 * Create a new screen
 */
export declare function screen(options?: ScreenOptions & {
    output?: (data: string) => void;
}): Screen;
/**
 * Create a box widget (tags: true by default)
 */
export declare function box(options?: ElementOptions): Box;
/**
 * Create a text widget (tags: true by default)
 */
export declare function text(options?: ElementOptions): Text;
/**
 * Create a list widget (tags: true by default)
 */
export declare function list(options?: ListOptions): List;
/**
 * Create a form widget (tags: true by default)
 */
export declare function form(options?: FormOptions): Form;
/**
 * Create a textbox/input widget (tags: true by default)
 */
export declare function textbox(options?: TextboxOptions): Textbox;
export declare function input(options?: TextboxOptions): Input;
export declare function textarea(options?: TextboxOptions): Textarea;
/**
 * Create a button widget (tags: true by default)
 */
export declare function button(options?: ButtonOptions): Button;
/**
 * Create a progress bar widget (tags: true by default)
 */
export declare function progressbar(options?: ProgressBarOptions): ProgressBar;
/**
 * Create a table widget (tags: true by default)
 */
export declare function table(options?: TableOptions): Table;
/**
 * Create a log widget (tags: true by default)
 */
export declare function log(options?: LogOptions): Log;
/**
 * Create a scrollable box widget (tags: true by default)
 */
export declare function scrollablebox(options?: ElementOptions): ScrollableBox;
/**
 * Create a scrollable text widget (tags: true by default)
 */
export declare function scrollabletext(options?: ElementOptions): ScrollableText;
/**
 * Create a checkbox widget (tags: true by default)
 */
export declare function checkbox(options?: CheckboxOptions): Checkbox;
/**
 * Create a radio button widget (tags: true by default)
 */
export declare function radiobutton(options?: RadioButtonOptions): RadioButton;
/**
 * Create a radio set widget (tags: true by default)
 */
export declare function radioset(options?: RadioSetOptions): RadioSet;
/**
 * Create a message dialog widget (tags: true by default)
 */
export declare function message(options?: MessageOptions): Message;
/**
 * Create a question dialog widget (tags: true by default)
 */
export declare function question(options?: QuestionOptions): Question;
/**
 * Create a prompt dialog widget (tags: true by default)
 */
export declare function prompt(options?: PromptOptions): Prompt;
/**
 * Create a loading indicator widget (tags: true by default)
 */
export declare function loading(options?: LoadingOptions): Loading;
/**
 * Create a line widget (tags: true by default)
 */
export declare function line(options?: LineOptions): Line;
/**
 * Create a listbar widget (tags: true by default)
 */
export declare function listbar(options?: ListbarOptions): Listbar;
/**
 * Create a big text widget (tags: true by default)
 */
export declare function bigtext(options?: BigTextOptions): BigText;
/**
 * Create a file manager widget (tags: true by default)
 */
export declare function filemanager(options?: FileManagerOptions): FileManager;
/**
 * Create an overlay widget (tags: true by default)
 */
export declare function overlay(options?: OverlayOptions): Overlay;
/**
 * Create a list table widget (tags: true by default)
 */
export declare function listtable(options?: ListTableOptions): ListTable;
/**
 * Create an ANSI image widget (tags: true by default)
 */
export declare function ansiimage(options?: ANSIImageOptions): ANSIImage;
/**
 * Create a terminal widget (tags: true by default)
 */
export declare function terminal(options?: TerminalOptions): Terminal;
/**
 * Create a layout widget (tags: true by default)
 */
export declare function layout(options?: LayoutOptions): Layout;
/**
 * Create a password box widget (tags: true by default)
 */
export declare function passbox(options?: PassBoxOptions): PassBox;
/**
 * Create a file box widget (tags: true by default)
 */
export declare function filebox(options?: FileBoxOptions): FileBox;
/**
 * Create an image widget (tags: true by default)
 */
export declare function image(options?: ImageOptions): Image;
/**
 * Create a viewport widget (tags: true by default)
 */
export declare function viewport(options?: ViewportOptions): Viewport;
/**
 * Create a canvas widget (tags: true by default)
 */
export declare function canvas(options?: CanvasOptions): Canvas;
/**
 * Create an iframe widget (tags: true by default)
 */
export declare function iframe(options?: IFrameOptions): IFrame;
/**
 * Create a video widget (tags: true by default)
 */
export declare function video(options?: VideoOptions): Video;
import { Element as ElementClass } from './core/element';
import * as colorsExport from './core/colors';
import { EventEmitter as EventEmitterExport } from './core/events';
declare const _default: {
    Screen: typeof Screen;
    Element: typeof ElementClass;
    Program: typeof Program;
    EventEmitter: typeof EventEmitterExport;
    colors: typeof colorsExport;
    Box: typeof Box;
    Text: typeof Text;
    List: typeof List;
    Form: typeof Form;
    Textbox: typeof Textbox;
    Input: typeof Input;
    Textarea: typeof Textarea;
    Button: typeof Button;
    ProgressBar: typeof ProgressBar;
    Table: typeof Table;
    Log: typeof Log;
    ScrollableBox: typeof ScrollableBox;
    ScrollableText: typeof ScrollableText;
    Checkbox: typeof Checkbox;
    RadioButton: typeof RadioButton;
    RadioSet: typeof RadioSet;
    Message: typeof Message;
    Question: typeof Question;
    Prompt: typeof Prompt;
    Loading: typeof Loading;
    Line: typeof Line;
    Listbar: typeof Listbar;
    BigText: typeof BigText;
    FileManager: typeof FileManager;
    Overlay: typeof Overlay;
    ListTable: typeof ListTable;
    ANSIImage: typeof ANSIImage;
    Terminal: typeof Terminal;
    Layout: typeof Layout;
    PassBox: typeof PassBox;
    FileBox: typeof FileBox;
    Image: typeof Image;
    Viewport: typeof Viewport;
    Canvas: typeof Canvas;
    IFrame: typeof IFrame;
    Video: typeof Video;
    screen: typeof screen;
    box: typeof box;
    text: typeof text;
    list: typeof list;
    form: typeof form;
    textbox: typeof textbox;
    input: typeof input;
    textarea: typeof textarea;
    button: typeof button;
    progressbar: typeof progressbar;
    table: typeof table;
    log: typeof log;
    scrollablebox: typeof scrollablebox;
    scrollabletext: typeof scrollabletext;
    checkbox: typeof checkbox;
    radiobutton: typeof radiobutton;
    radioset: typeof radioset;
    message: typeof message;
    question: typeof question;
    prompt: typeof prompt;
    loading: typeof loading;
    line: typeof line;
    listbar: typeof listbar;
    bigtext: typeof bigtext;
    filemanager: typeof filemanager;
    overlay: typeof overlay;
    listtable: typeof listtable;
    ansiimage: typeof ansiimage;
    terminal: typeof terminal;
    layout: typeof layout;
    passbox: typeof passbox;
    filebox: typeof filebox;
    image: typeof image;
    viewport: typeof viewport;
    canvas: typeof canvas;
    iframe: typeof iframe;
    video: typeof video;
};
export default _default;
//# sourceMappingURL=index.d.ts.map