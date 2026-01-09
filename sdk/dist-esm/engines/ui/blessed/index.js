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
// Responsive/Mobile Support
export * from './core/responsive-constants';
export { TouchGestureHandler, createTouchGestureHandler, enableSwipe, enableLongPress, enableDoubleTap } from './core/touch-gestures';
export { ResponsiveBehavior, applyResponsiveMixin, hasResponsiveBehavior, getResponsiveBehavior } from './core/responsive-mixin';
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
export { Line as LineBase, line as lineBase } from './widgets/line';
export { Line as LineChart, line as lineChart } from './widgets/line-chart';
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
export { MobileCarousel, mobileCarousel } from './widgets/mobile-carousel';
export { Autocomplete } from './widgets/autocomplete';
export { AutocompleteTextbox } from './widgets/autocomplete-textbox';
export { AutocompleteManager, UsernameProvider, BBSCodeProvider, WordProvider, TemplateProvider } from './utils/AutocompleteManager';
export { TabPanel } from './widgets/tabpanel';
export { Accordion } from './widgets/accordion';
export { Collapsible } from './widgets/collapsible';
export { StackedGauge } from './widgets/stacked-gauge';
export { ColorPicker } from './widgets/colorpicker';
export { FileExplorer } from './widgets/fileexplorer';
export { DocModal } from './widgets/doc-modal';
export { LoginModal, loginModal } from './widgets/login-modal';
export { CategoryPicker, categoryPicker } from './widgets/category-picker';
export { ConfirmModal, confirmModal } from './widgets/confirm-modal';
export { FKeyBar, fkeyBar } from './widgets/fkey-bar';
export { StatusBar, statusBar } from './widgets/status-bar';
export { SearchModal, searchModal } from './widgets/search-modal';
// Extended Widgets (Consolidated from Contrib)
export { Bar, bar } from './widgets/bar';
export { Donut, donut } from './widgets/donut';
export { Gauge, gauge } from './widgets/gauge';
export { GaugeList, gaugeList } from './widgets/gauge-list';
export { LCD, lcd } from './widgets/lcd';
export { Map, map } from './widgets/map';
export { Markdown, markdown } from './widgets/markdown';
export { Picture, picture } from './widgets/picture';
export { Sparkline, sparkline } from './widgets/sparkline';
export { StackedBar, stackedBar } from './widgets/stacked-bar';
export { Tree, tree } from './widgets/tree';
// Renamed extended widgets to avoid conflicts
export { ContribCanvas, contribCanvas } from './widgets/contrib-canvas';
export { ContribLog, contribLog } from './widgets/contrib-log';
export { ContribTable, contribTable } from './widgets/contrib-table';
// Layouts (Consolidated from Contrib)
export { Grid, grid } from './layouts/grid';
export { Carousel, carousel } from './layouts/carousel';
// Utilities
export { abbreviateNumber, getColorCode, MergeRecursive } from './utils/contrib-utils/utils';
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
import { Line as LineBaseClass, line as lineBase } from './widgets/line';
import { Line as LineClass } from './widgets/line-chart';
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
import { Autocomplete } from './widgets/autocomplete';
import { AutocompleteTextbox } from './widgets/autocomplete-textbox';
import { AutocompleteManager, UsernameProvider, BBSCodeProvider, WordProvider, TemplateProvider } from './utils/AutocompleteManager';
import { TabPanel } from './widgets/tabpanel';
import { Accordion } from './widgets/accordion';
import { Collapsible } from './widgets/collapsible';
import { StackedGauge } from './widgets/stacked-gauge';
import { ColorPicker } from './widgets/colorpicker';
import { FileExplorer } from './widgets/fileexplorer';
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
 * Create a documentation modal widget (tags: true forced, cannot be overridden)
 */
export { docModal } from './widgets/doc-modal';
/**
 * Create a line widget (tags: true forced, cannot be overridden)
 */
export function line(options) {
    return new LineBaseClass({ ...options, tags: true });
}
/**
 * Create a line chart widget
 */
export function linechart(options) {
    return new LineClass({ ...options, tags: true });
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
/**
 * Create an autocomplete widget (popup list only - use autocompleteTextbox for integrated input)
 */
export function autocomplete(options) {
    return new Autocomplete({ ...options, tags: true });
}
/**
 * Create an autocomplete textbox - a textbox with integrated suggestion popup
 *
 * Example usage:
 * ```typescript
 * const input = blessed.autocompleteTextbox({
 *   suggestions: ['apple', 'banana', 'cherry'],
 *   // OR dynamic:
 *   getSuggestions: async (text) => users.filter(u => u.startsWith(text)),
 * });
 * input.on('select', (suggestion) => console.log('Selected:', suggestion));
 * ```
 */
export function autocompleteTextbox(options) {
    return new AutocompleteTextbox({ ...options, tags: true });
}
/**
 * Create a tab panel widget
 */
export function tabpanel(options) {
    return new TabPanel({ ...options, tags: true });
}
/**
 * Create an accordion widget
 */
export function accordion(options) {
    return new Accordion({ ...options, tags: true });
}
/**
 * Create a collapsible widget
 */
export function collapsible(options) {
    return new Collapsible({ ...options, tags: true });
}
/**
 * Create a stacked gauge widget
 */
export function stackedgauge(options) {
    return new StackedGauge({ ...options, tags: true });
}
/**
 * Create a color picker widget
 */
export function colorpicker(options) {
    return new ColorPicker({ ...options, tags: true });
}
/**
 * Create a file explorer widget
 */
export function fileexplorer(options) {
    return new FileExplorer({ ...options, tags: true });
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
import { Autocomplete as AutocompleteClass } from './widgets/autocomplete';
import { TabPanel as TabPanelClass } from './widgets/tabpanel';
import { Accordion as AccordionClass } from './widgets/accordion';
import { Collapsible as CollapsibleClass } from './widgets/collapsible';
import { StackedGauge as StackedGaugeClass } from './widgets/stacked-gauge';
import { ColorPicker as ColorPickerClass } from './widgets/colorpicker';
import { FileExplorer as FileExplorerClass } from './widgets/fileexplorer';
import { DocModal as DocModalClass } from './widgets/doc-modal';
import { LoginModal as LoginModalClass } from './widgets/login-modal';
import { CategoryPicker as CategoryPickerClass } from './widgets/category-picker';
import { ConfirmModal as ConfirmModalClass } from './widgets/confirm-modal';
import { FKeyBar as FKeyBarClass } from './widgets/fkey-bar';
import { StatusBar as StatusBarClass } from './widgets/status-bar';
import { SearchModal as SearchModalClass } from './widgets/search-modal';
import { ContextMenu as ContextMenuClass } from './widgets/contextmenu';
import { Panel as PanelClass } from './widgets/panel';
import { DockablePanel as DockablePanelClass } from './widgets/dockable-panel';
import { MobileCarousel as MobileCarouselClass } from './widgets/mobile-carousel';
import { ResponsiveLayoutManager as ResponsiveLayoutManagerClass } from './core/responsive-layout';
// Import extended widgets
import { Bar as BarClass } from './widgets/bar';
import { Donut as DonutClass } from './widgets/donut';
import { Gauge as GaugeClass } from './widgets/gauge';
import { GaugeList as GaugeListClass } from './widgets/gauge-list';
import { LCD as LCDClass } from './widgets/lcd';
import { Map as MapClass } from './widgets/map';
import { Markdown as MarkdownClass } from './widgets/markdown';
import { Picture as PictureClass } from './widgets/picture';
import { Sparkline as SparklineClass } from './widgets/sparkline';
import { StackedBar as StackedBarClass } from './widgets/stacked-bar';
import { Tree as TreeClass } from './widgets/tree';
import { ContribCanvas as ContribCanvasClass } from './widgets/contrib-canvas';
import { ContribLog as ContribLogClass } from './widgets/contrib-log';
import { ContribTable as ContribTableClass } from './widgets/contrib-table';
// Import layouts
import { Grid as GridClass } from './layouts/grid';
import { Carousel as CarouselClass } from './layouts/carousel';
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
    LineBase: LineBaseClass,
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
    Autocomplete: AutocompleteClass,
    AutocompleteManager: AutocompleteManager,
    UsernameProvider: UsernameProvider,
    BBSCodeProvider: BBSCodeProvider,
    WordProvider: WordProvider,
    TemplateProvider: TemplateProvider,
    TabPanel: TabPanelClass,
    Accordion: AccordionClass,
    Collapsible: CollapsibleClass,
    StackedGauge: StackedGaugeClass,
    ColorPicker: ColorPickerClass,
    FileExplorer: FileExplorerClass,
    DocModal: DocModalClass,
    LoginModal: LoginModalClass,
    CategoryPicker: CategoryPickerClass,
    ConfirmModal: ConfirmModalClass,
    FKeyBar: FKeyBarClass,
    StatusBar: StatusBarClass,
    SearchModal: SearchModalClass,
    ContextMenu: ContextMenuClass,
    Panel: PanelClass,
    DockablePanel: DockablePanelClass,
    MobileCarousel: MobileCarouselClass,
    ResponsiveLayoutManager: ResponsiveLayoutManagerClass,
    // Extended Widgets
    Bar: BarClass,
    Donut: DonutClass,
    Gauge: GaugeClass,
    GaugeList: GaugeListClass,
    LCD: LCDClass,
    Map: MapClass,
    Markdown: MarkdownClass,
    Picture: PictureClass,
    Sparkline: SparklineClass,
    StackedBar: StackedBarClass,
    Tree: TreeClass,
    ContribCanvas: ContribCanvasClass,
    ContribLog: ContribLogClass,
    ContribTable: ContribTableClass,
    // Layouts
    Grid: GridClass,
    Carousel: CarouselClass,
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
    linechart,
    lineBase,
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
    autocomplete,
    tabpanel,
    accordion,
    collapsible,
    stackedgauge,
    colorpicker,
    fileexplorer,
};
// Modal Helpers - Utilities for centering and managing modals
export * as modalHelpers from './utils/modal-helpers';
export { centerElement, makeModalResponsive, createModalBackdrop, showModal, trapModalInput } from './utils/modal-helpers';
