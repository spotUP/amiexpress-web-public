/**
 * Blessed - Full-featured terminal UI library
 * A complete 1:1 port of neo-blessed for browser and Node.js
 */
// Core
export { Screen } from './core/screen';
export { Element } from './core/element';
export { Program } from './core/program';
export { EventEmitter } from './core/events';
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
/**
 * Create a box widget
 */
export function box(options) {
    return new Box(options);
}
/**
 * Create a text widget
 */
export function text(options) {
    return new Text(options);
}
/**
 * Create a list widget
 */
export function list(options) {
    return new List(options);
}
/**
 * Create a form widget
 */
export function form(options) {
    return new Form(options);
}
/**
 * Create a textbox/input widget
 */
export function textbox(options) {
    return new Textbox(options);
}
export function input(options) {
    return new Input(options);
}
export function textarea(options) {
    return new Textarea(options);
}
/**
 * Create a button widget
 */
export function button(options) {
    return new Button(options);
}
/**
 * Create a progress bar widget
 */
export function progressbar(options) {
    return new ProgressBar(options);
}
/**
 * Create a table widget
 */
export function table(options) {
    return new Table(options);
}
/**
 * Create a log widget
 */
export function log(options) {
    return new Log(options);
}
/**
 * Create a scrollable box widget
 */
export function scrollablebox(options) {
    return new ScrollableBox(options);
}
/**
 * Create a scrollable text widget
 */
export function scrollabletext(options) {
    return new ScrollableText(options);
}
/**
 * Create a checkbox widget
 */
export function checkbox(options) {
    return new Checkbox(options);
}
/**
 * Create a radio button widget
 */
export function radiobutton(options) {
    return new RadioButton(options);
}
/**
 * Create a radio set widget
 */
export function radioset(options) {
    return new RadioSet(options);
}
/**
 * Create a message dialog widget
 */
export function message(options) {
    return new Message(options);
}
/**
 * Create a question dialog widget
 */
export function question(options) {
    return new Question(options);
}
/**
 * Create a prompt dialog widget
 */
export function prompt(options) {
    return new Prompt(options);
}
/**
 * Create a loading indicator widget
 */
export function loading(options) {
    return new Loading(options);
}
/**
 * Create a line widget
 */
export function line(options) {
    return new Line(options);
}
/**
 * Create a listbar widget
 */
export function listbar(options) {
    return new Listbar(options);
}
/**
 * Create a big text widget
 */
export function bigtext(options) {
    return new BigText(options);
}
/**
 * Create a file manager widget
 */
export function filemanager(options) {
    return new FileManager(options);
}
/**
 * Create an overlay widget
 */
export function overlay(options) {
    return new Overlay(options);
}
/**
 * Create a list table widget
 */
export function listtable(options) {
    return new ListTable(options);
}
/**
 * Create an ANSI image widget
 */
export function ansiimage(options) {
    return new ANSIImage(options);
}
/**
 * Create a terminal widget
 */
export function terminal(options) {
    return new Terminal(options);
}
/**
 * Create a layout widget
 */
export function layout(options) {
    return new Layout(options);
}
/**
 * Create a password box widget
 */
export function passbox(options) {
    return new PassBox(options);
}
/**
 * Create a file box widget
 */
export function filebox(options) {
    return new FileBox(options);
}
/**
 * Create an image widget
 */
export function image(options) {
    return new Image(options);
}
/**
 * Create a viewport widget
 */
export function viewport(options) {
    return new Viewport(options);
}
/**
 * Create a canvas widget
 */
export function canvas(options) {
    return new Canvas(options);
}
/**
 * Create an iframe widget
 */
export function iframe(options) {
    return new IFrame(options);
}
/**
 * Create a video widget
 */
export function video(options) {
    return new Video(options);
}
// Default export with all factory functions
// Import all classes so they're available for the default export
import { Screen as ScreenClass } from './core/screen';
import { Element as ElementClass } from './core/element';
import { Program as ProgramClass } from './core/program';
import * as colorsExport from './core/colors';
import { EventEmitter as EventEmitterExport } from './core/events';
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
export default {
    // Core
    Screen: ScreenClass,
    Element: ElementClass,
    Program: ProgramClass,
    EventEmitter: EventEmitterExport,
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
