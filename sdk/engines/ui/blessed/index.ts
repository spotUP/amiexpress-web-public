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
export type { ShortcutAction } from './core/keybindings';
export { ResponsiveLayoutManager } from './core/responsive-layout';
export type { LayoutConstraints, ResponsiveConfig, FlexLayoutOptions, GridLayoutOptions } from './core/responsive-layout';
export * as colors from './core/colors';
export type * from './core/types';

// Responsive/Mobile Support
export * from './core/responsive-constants';
export { TouchGestureHandler, createTouchGestureHandler, enableSwipe, enableLongPress, enableDoubleTap } from './core/touch-gestures';
export type { SwipeDirection, SwipeEvent, SwipeOptions, LongPressOptions, DoubleTapOptions, GestureState } from './core/touch-gestures';
export { ResponsiveBehavior, applyResponsiveMixin, hasResponsiveBehavior, getResponsiveBehavior } from './core/responsive-mixin';
export type { ResponsiveOptions, ResponsiveState, BreakpointChangeHandler, ResizeHandler } from './core/responsive-mixin';

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
export type { LineOptions as LineBaseOptions } from './widgets/line';
export { Line as LineChart, line as lineChart } from './widgets/line-chart';
export type { LineData, LineOptions } from './widgets/line-chart';
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
export type { ContextMenuItem, ContextMenuOptions } from './widgets/contextmenu';
export { Panel } from './widgets/panel';
export type { PanelOptions } from './widgets/panel';
export { DockablePanel } from './widgets/dockable-panel';
export type { DockablePanelOptions, DockPosition, PanelState } from './widgets/dockable-panel';
export { DropdownMenu, dropdownMenu } from './widgets/dropdown-menu';
export type { DropdownMenuOptions, DropdownMenuItem } from './widgets/dropdown-menu';
export { MenuBar } from './widgets/menu-bar';
export type { MenuBarOptions, MenuBarItem } from './widgets/menu-bar';
export { MobileCarousel, mobileCarousel } from './widgets/mobile-carousel';
export type { MobileCarouselOptions } from './widgets/mobile-carousel';
export { Autocomplete } from './widgets/autocomplete';
export { AutocompleteTextbox } from './widgets/autocomplete-textbox';
export type { AutocompleteTextboxOptions } from './widgets/autocomplete-textbox';
export { AutocompleteManager, UsernameProvider, BBSCodeProvider, WordProvider, TemplateProvider } from './utils/AutocompleteManager';
export { TabPanel } from './widgets/tabpanel';
export { Accordion } from './widgets/accordion';
export { Collapsible } from './widgets/collapsible';
export { StackedGauge } from './widgets/stacked-gauge';
export { ColorPicker } from './widgets/colorpicker';
export { FileExplorer } from './widgets/fileexplorer';
export { ANSIEditor, ansiEditor } from './widgets/ansi-editor';
export type { ANSIEditorOptions } from './widgets/ansi-editor';
export { DocModal } from './widgets/doc-modal';
export type { DocModalOptions } from './widgets/doc-modal';
export { LoginModal, loginModal } from './widgets/login-modal';
export type { LoginModalOptions, LoginCredentials } from './widgets/login-modal';
export { CategoryPicker, categoryPicker } from './widgets/category-picker';
export type { CategoryPickerOptions, CategoryItem } from './widgets/category-picker';
export { ConfirmModal, confirmModal } from './widgets/confirm-modal';
export type { ConfirmModalOptions } from './widgets/confirm-modal';
export { FKeyBar, fkeyBar } from './widgets/fkey-bar';
export type { FKeyBarOptions, FKeyItem } from './widgets/fkey-bar';
export { StatusBar, statusBar } from './widgets/status-bar';
export type { StatusBarOptions, StatusBarSection } from './widgets/status-bar';
export { SearchModal, searchModal } from './widgets/search-modal';
export type { SearchModalOptions, SearchField, SearchResult } from './widgets/search-modal';
export { AudioLevelBar, audioLevelBar, renderAudioLevel } from './widgets/audio-level-bar';
export type { AudioLevelBarOptions } from './widgets/audio-level-bar';
export { MultiplayerLobby, multiplayerLobby } from './widgets/multiplayer-lobby';
export type {
  MultiplayerLobbyOptions,
  LobbyPlayerInfo,
  LobbyModeConfig,
  LobbyState,
  LobbyNetworkAdapter,
  LobbyEntryMode,
  LobbyResult,
  LobbyFeatures,
  LobbyGameSetting,
  LobbyChatMessage,
  LobbyLeaderboardEntry,
  LobbyTableEntry,
  LobbyBrowserFilters,
  LobbyBrowserSortBy,
  LobbyBrowserSortOrder,
} from './widgets/multiplayer-lobby';

// Extended Widgets (Consolidated from Contrib)
export { Bar, bar } from './widgets/bar';
export type { BarData, BarOptions } from './widgets/bar';
export { Donut, donut } from './widgets/donut';
export type { DonutData, DonutOptions } from './widgets/donut';
export { Gauge, gauge } from './widgets/gauge';
export type { GaugeStack, GaugeOptions } from './widgets/gauge';
export { GaugeList, gaugeList } from './widgets/gauge-list';
export type { GaugeListStack, GaugeListItem, GaugeListOptions } from './widgets/gauge-list';
export { LCD, lcd } from './widgets/lcd';
export type { LCDOptions } from './widgets/lcd';
export { Map, map } from './widgets/map';
export type { MapMarker, MapOptions } from './widgets/map';
export { Markdown, markdown } from './widgets/markdown';
export type { MarkdownStyle, MarkdownOptions } from './widgets/markdown';
export { Picture, picture } from './widgets/picture';
export type { PictureOptions } from './widgets/picture';
export { Sparkline, sparkline } from './widgets/sparkline';
export type { SparklineOptions } from './widgets/sparkline';
export { StackedBar, stackedBar } from './widgets/stacked-bar';
export type { StackedBarData, StackedBarOptions } from './widgets/stacked-bar';
export { Tree, tree } from './widgets/tree';
export type { TreeNode, TreeTemplate, TreeOptions } from './core/types';

// Renamed extended widgets to avoid conflicts
export { ContribCanvas, contribCanvas } from './widgets/contrib-canvas';
export type { ContribCanvasOptions as CanvasOptions } from './widgets/contrib-canvas';
export { ContribLog, contribLog } from './widgets/contrib-log';
export type { ContribLogOptions as LogOptions } from './widgets/contrib-log';
export { ContribTable, contribTable } from './widgets/contrib-table';
export type { ContribTableOptions as TableOptions } from './widgets/contrib-table';

// Layouts (Consolidated from Contrib)
export { Grid, grid } from './layouts/grid';
export type { GridOptions } from './layouts/grid';
export { Carousel, carousel } from './layouts/carousel';
export type { CarouselOptions, CarouselPage } from './layouts/carousel';

// Utilities
export {
  abbreviateNumber,
  getColorCode,
  MergeRecursive
} from './utils/contrib-utils/utils';

// Factory functions (blessed-style API)
import { Screen } from './core/screen';
import { Program } from './core/program';
import { Box } from './widgets/box';
import { DockablePanel } from './widgets/dockable-panel';
import type { DockablePanelOptions } from './widgets/dockable-panel';
import { Text } from './widgets/text';
import { List } from './widgets/list';
import { Form } from './widgets/form';
import { Textbox, Input, Textarea } from './widgets/textbox';
import { Button } from './widgets/button';
import { ProgressBar } from './widgets/progressbar';
import { Table } from './widgets/table';
import { Log } from './widgets/log';
import { ScrollableBox, ScrollableBoxOptions } from './widgets/scrollablebox';
import { ScrollableText, ScrollableTextOptions } from './widgets/scrollabletext';
import { Checkbox, CheckboxOptions } from './widgets/checkbox';
import { RadioButton, RadioButtonOptions } from './widgets/radiobutton';
import { RadioSet, RadioSetOptions } from './widgets/radioset';
import { Message, MessageOptions } from './widgets/message';
import { Question, QuestionOptions } from './widgets/question';
import { Prompt, PromptOptions } from './widgets/prompt';
import { Loading, LoadingOptions } from './widgets/loading';
import { Line as LineBaseClass, LineOptions as LineBaseOptions, line as lineBase } from './widgets/line';
import { Line as LineClass, LineOptions, line as lineFn } from './widgets/line-chart';
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
import { Video } from './widgets/video';
import { Autocomplete } from './widgets/autocomplete';
import { AutocompleteTextbox, AutocompleteTextboxOptions } from './widgets/autocomplete-textbox';
import { AutocompleteManager, UsernameProvider, BBSCodeProvider, WordProvider, TemplateProvider } from './utils/AutocompleteManager';
import { TabPanel } from './widgets/tabpanel';
import { Accordion } from './widgets/accordion';
import { Collapsible } from './widgets/collapsible';
import { StackedGauge } from './widgets/stacked-gauge';
import { ColorPicker } from './widgets/colorpicker';
import { FileExplorer } from './widgets/fileexplorer';

import type {
  ScreenOptions,
  ElementOptions,
  ListOptions,
  FormOptions,
  TextboxOptions,
  ButtonOptions,
  ProgressBarOptions,
  TableOptions as BaseTableOptions,
  LogOptions as BaseLogOptions,
  AutocompleteOptions,
  TabPanelOptions,
  AccordionOptions,
  CollapsibleOptions,
  StackedGaugeOptions,
  ColorPickerOptions,
  FileExplorerOptions,
  VideoOptions,
} from './core/types';

/**
 * Create a new screen
 */
export function screen(options?: ScreenOptions & { output?: (data: string) => void }): Screen {
  return new Screen(options);
}

// ============================================================================
// Factory Functions - ALL default to tags: true for color support
// ============================================================================

/**
 * Create a box widget (tags: true by default, cannot be overridden)
 */
export function box(options?: DockablePanelOptions): DockablePanel {
  const fixedDefault = options?.fixed ?? (options?.parent instanceof DockablePanel);
  return new DockablePanel({ ...options, fixed: fixedDefault, useTitleBar: false, tags: true });
}

/**
 * Create a text widget (tags: true forced, cannot be overridden)
 */
export function text(options?: ElementOptions): Text {
  return new Text({ ...options, tags: true });
}

/**
 * Create a list widget (tags: true forced, cannot be overridden)
 */
export function list(options?: ListOptions): List {
  return new List({ ...options, tags: true });
}

/**
 * Create a form widget (tags: true forced, cannot be overridden)
 */
export function form(options?: FormOptions): Form {
  return new Form({ ...options, tags: true });
}

/**
 * Create a textbox/input widget (tags: true forced, cannot be overridden)
 */
export function textbox(options?: TextboxOptions): Textbox {
  return new Textbox({ ...options, tags: true });
}

export function input(options?: TextboxOptions): Input {
  return new Input({ ...options, tags: true });
}

export function textarea(options?: TextboxOptions): Textarea {
  return new Textarea({ ...options, tags: true });
}

/**
 * Create a button widget (tags: true forced, cannot be overridden)
 */
export function button(options?: ButtonOptions): Button {
  return new Button({ ...options, tags: true });
}

/**
 * Create a progress bar widget (tags: true forced, cannot be overridden)
 */
export function progressbar(options?: ProgressBarOptions): ProgressBar {
  return new ProgressBar({ ...options, tags: true });
}

/**
 * Create a table widget (tags: true forced, cannot be overridden)
 */
export function table(options?: BaseTableOptions): Table {
  return new Table({ ...options, tags: true });
}

/**
 * Create a log widget (tags: true forced, cannot be overridden)
 */
export function log(options?: BaseLogOptions): Log {
  return new Log({ ...options, tags: true });
}

/**
 * Create a scrollable box widget (tags: true forced, cannot be overridden)
 */
export function scrollablebox(options?: ElementOptions): ScrollableBox {
  return new ScrollableBox({ ...options, tags: true });
}

/**
 * Create a scrollable text widget (tags: true forced, cannot be overridden)
 */
export function scrollabletext(options?: ElementOptions): ScrollableText {
  return new ScrollableText({ ...options, tags: true });
}

/**
 * Create a checkbox widget (tags: true forced, cannot be overridden)
 */
export function checkbox(options?: CheckboxOptions): Checkbox {
  return new Checkbox({ ...options, tags: true });
}

/**
 * Create a radio button widget (tags: true forced, cannot be overridden)
 */
export function radiobutton(options?: RadioButtonOptions): RadioButton {
  return new RadioButton({ ...options, tags: true });
}

/**
 * Create a radio set widget (tags: true forced, cannot be overridden)
 */
export function radioset(options?: RadioSetOptions): RadioSet {
  return new RadioSet({ ...options, tags: true });
}

/**
 * Create a message dialog widget (tags: true forced, cannot be overridden)
 */
export function message(options?: MessageOptions): Message {
  return new Message({ ...options, tags: true });
}

/**
 * Create a question dialog widget (tags: true forced, cannot be overridden)
 */
export function question(options?: QuestionOptions): Question {
  return new Question({ ...options, tags: true });
}

/**
 * Create a prompt dialog widget (tags: true forced, cannot be overridden)
 */
export function prompt(options?: PromptOptions): Prompt {
  return new Prompt({ ...options, tags: true });
}

/**
 * Create a loading indicator widget (tags: true forced, cannot be overridden)
 */
export function loading(options?: LoadingOptions): Loading {
  return new Loading({ ...options, tags: true });
}

/**
 * Create a documentation modal widget (tags: true forced, cannot be overridden)
 */
export { docModal } from './widgets/doc-modal';

/**
 * Create a line widget (tags: true forced, cannot be overridden)
 */
export function line(options?: LineBaseOptions): LineBaseClass {
  return new LineBaseClass({ ...options, tags: true });
}

/**
 * Create a line chart widget
 */
export function linechart(options?: LineOptions): LineClass {
  return new LineClass({ ...options, tags: true });
}

/**
 * Create a listbar widget (tags: true forced, cannot be overridden)
 */
export function listbar(options?: ListbarOptions): Listbar {
  return new Listbar({ ...options, tags: true });
}

/**
 * Create a big text widget (tags: true forced, cannot be overridden)
 */
export function bigtext(options?: BigTextOptions): BigText {
  return new BigText({ ...options, tags: true });
}

/**
 * Create a file manager widget (tags: true forced, cannot be overridden)
 */
export function filemanager(options?: FileManagerOptions): FileManager {
  return new FileManager({ ...options, tags: true });
}

/**
 * Create an overlay widget (tags: true forced, cannot be overridden)
 */
export function overlay(options?: OverlayOptions): Overlay {
  return new Overlay({ ...options, tags: true });
}

/**
 * Create a list table widget (tags: true forced, cannot be overridden)
 */
export function listtable(options?: ListTableOptions): ListTable {
  return new ListTable({ ...options, tags: true });
}

/**
 * Create an ANSI image widget (tags: true forced, cannot be overridden)
 */
export function ansiimage(options?: ANSIImageOptions): ANSIImage {
  return new ANSIImage({ ...options, tags: true });
}

/**
 * Create a terminal widget (tags: true forced, cannot be overridden)
 */
export function terminal(options?: TerminalOptions): Terminal {
  return new Terminal({ ...options, tags: true });
}

/**
 * Create a layout widget (tags: true forced, cannot be overridden)
 */
export function layout(options?: LayoutOptions): Layout {
  return new Layout({ ...options, tags: true });
}

/**
 * Create a password box widget (tags: true forced, cannot be overridden)
 */
export function passbox(options?: PassBoxOptions): PassBox {
  return new PassBox({ ...options, tags: true });
}

/**
 * Create a file box widget (tags: true forced, cannot be overridden)
 */
export function filebox(options?: FileBoxOptions): FileBox {
  return new FileBox({ ...options, tags: true });
}

/**
 * Create an image widget (tags: true forced, cannot be overridden)
 */
export function image(options?: ImageOptions): Image {
  return new Image({ ...options, tags: true });
}

/**
 * Create a viewport widget (tags: true forced, cannot be overridden)
 */
export function viewport(options?: ViewportOptions): Viewport {
  return new Viewport({ ...options, tags: true });
}

/**
 * Create a canvas widget (tags: true forced, cannot be overridden)
 */
export function canvas(options?: CanvasOptions): Canvas {
  return new Canvas({ ...options, tags: true });
}

/**
 * Create an iframe widget (tags: true forced, cannot be overridden)
 */
export function iframe(options?: IFrameOptions): IFrame {
  return new IFrame({ ...options, tags: true });
}

/**
 * Create a video widget (tags: true forced, cannot be overridden)
 */
export function video(options?: VideoOptions): Video {
  return new Video({ ...options, tags: true });
}

/**
 * Create an autocomplete widget (popup list only - use autocompleteTextbox for integrated input)
 */
export function autocomplete(options?: AutocompleteOptions): Autocomplete {
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
export function autocompleteTextbox(options?: AutocompleteTextboxOptions): AutocompleteTextbox {
  return new AutocompleteTextbox({ ...options, tags: true });
}

/**
 * Create a tab panel widget
 */
export function tabpanel(options?: TabPanelOptions): TabPanel {
  return new TabPanel({ ...options, tags: true });
}

/**
 * Create an accordion widget
 */
export function accordion(options?: AccordionOptions): Accordion {
  return new Accordion({ ...options, tags: true });
}

/**
 * Create a collapsible widget
 */
export function collapsible(options?: CollapsibleOptions): Collapsible {
  return new Collapsible({ ...options, tags: true });
}

/**
 * Create a stacked gauge widget
 */
export function stackedgauge(options?: StackedGaugeOptions): StackedGauge {
  return new StackedGauge({ ...options, tags: true });
}

/**
 * Create a color picker widget
 */
export function colorpicker(options?: ColorPickerOptions): ColorPicker {
  return new ColorPicker({ ...options, tags: true });
}

/**
 * Create a file explorer widget
 */
export function fileexplorer(options?: FileExplorerOptions): FileExplorer {
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
import { AudioLevelBar as AudioLevelBarClass } from './widgets/audio-level-bar';
import { MultiplayerLobby as MultiplayerLobbyClass, multiplayerLobby } from './widgets/multiplayer-lobby';
import { ContextMenu as ContextMenuClass } from './widgets/contextmenu';
import { Panel as PanelClass } from './widgets/panel';
import { DockablePanel as DockablePanelClass } from './widgets/dockable-panel';
import { DropdownMenu as DropdownMenuClass, dropdownMenu as dropdownMenuFactory } from './widgets/dropdown-menu';
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
  AudioLevelBar: AudioLevelBarClass,
  MultiplayerLobby: MultiplayerLobbyClass,
  ContextMenu: ContextMenuClass,
  Panel: PanelClass,
  DockablePanel: DockablePanelClass,
  DropdownMenu: DropdownMenuClass,
  dropdownMenu: dropdownMenuFactory,
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
  multiplayerLobby,
};

// Modal Helpers - Utilities for centering and managing modals
export * as modalHelpers from './utils/modal-helpers';
export { centerElement, makeModalResponsive, createModalBackdrop, showModal, trapModalInput } from './utils/modal-helpers';
