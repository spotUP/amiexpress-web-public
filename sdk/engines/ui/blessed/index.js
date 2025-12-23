"use strict";
/**
 * Blessed - Full-featured terminal UI library
 * A complete 1:1 port of neo-blessed for browser and Node.js
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.Video = exports.IFrame = exports.Canvas = exports.Viewport = exports.Image = exports.FileBox = exports.PassBox = exports.Layout = exports.Terminal = exports.ANSIImage = exports.ListTable = exports.Overlay = exports.FileManager = exports.BigText = exports.Listbar = exports.Line = exports.Loading = exports.Prompt = exports.Question = exports.Message = exports.RadioSet = exports.RadioButton = exports.Checkbox = exports.ScrollableText = exports.ScrollableBox = exports.Log = exports.Table = exports.ProgressBar = exports.Button = exports.Textarea = exports.Input = exports.Textbox = exports.Form = exports.List = exports.Text = exports.Box = exports.colors = exports.EventEmitter = exports.Program = exports.Element = exports.Screen = void 0;
exports.screen = screen;
exports.box = box;
exports.text = text;
exports.list = list;
exports.form = form;
exports.textbox = textbox;
exports.input = input;
exports.textarea = textarea;
exports.button = button;
exports.progressbar = progressbar;
exports.table = table;
exports.log = log;
exports.scrollablebox = scrollablebox;
exports.scrollabletext = scrollabletext;
exports.checkbox = checkbox;
exports.radiobutton = radiobutton;
exports.radioset = radioset;
exports.message = message;
exports.question = question;
exports.prompt = prompt;
exports.loading = loading;
exports.line = line;
exports.listbar = listbar;
exports.bigtext = bigtext;
exports.filemanager = filemanager;
exports.overlay = overlay;
exports.listtable = listtable;
exports.ansiimage = ansiimage;
exports.terminal = terminal;
exports.layout = layout;
exports.passbox = passbox;
exports.filebox = filebox;
exports.image = image;
exports.viewport = viewport;
exports.canvas = canvas;
exports.iframe = iframe;
exports.video = video;
// Core
var screen_1 = require("./core/screen");
Object.defineProperty(exports, "Screen", { enumerable: true, get: function () { return screen_1.Screen; } });
var element_1 = require("./core/element");
Object.defineProperty(exports, "Element", { enumerable: true, get: function () { return element_1.Element; } });
var program_1 = require("./core/program");
Object.defineProperty(exports, "Program", { enumerable: true, get: function () { return program_1.Program; } });
var events_1 = require("./core/events");
Object.defineProperty(exports, "EventEmitter", { enumerable: true, get: function () { return events_1.EventEmitter; } });
exports.colors = __importStar(require("./core/colors"));
// Widgets
var box_1 = require("./widgets/box");
Object.defineProperty(exports, "Box", { enumerable: true, get: function () { return box_1.Box; } });
var text_1 = require("./widgets/text");
Object.defineProperty(exports, "Text", { enumerable: true, get: function () { return text_1.Text; } });
var list_1 = require("./widgets/list");
Object.defineProperty(exports, "List", { enumerable: true, get: function () { return list_1.List; } });
var form_1 = require("./widgets/form");
Object.defineProperty(exports, "Form", { enumerable: true, get: function () { return form_1.Form; } });
var textbox_1 = require("./widgets/textbox");
Object.defineProperty(exports, "Textbox", { enumerable: true, get: function () { return textbox_1.Textbox; } });
Object.defineProperty(exports, "Input", { enumerable: true, get: function () { return textbox_1.Input; } });
Object.defineProperty(exports, "Textarea", { enumerable: true, get: function () { return textbox_1.Textarea; } });
var button_1 = require("./widgets/button");
Object.defineProperty(exports, "Button", { enumerable: true, get: function () { return button_1.Button; } });
var progressbar_1 = require("./widgets/progressbar");
Object.defineProperty(exports, "ProgressBar", { enumerable: true, get: function () { return progressbar_1.ProgressBar; } });
var table_1 = require("./widgets/table");
Object.defineProperty(exports, "Table", { enumerable: true, get: function () { return table_1.Table; } });
var log_1 = require("./widgets/log");
Object.defineProperty(exports, "Log", { enumerable: true, get: function () { return log_1.Log; } });
var scrollablebox_1 = require("./widgets/scrollablebox");
Object.defineProperty(exports, "ScrollableBox", { enumerable: true, get: function () { return scrollablebox_1.ScrollableBox; } });
var scrollabletext_1 = require("./widgets/scrollabletext");
Object.defineProperty(exports, "ScrollableText", { enumerable: true, get: function () { return scrollabletext_1.ScrollableText; } });
var checkbox_1 = require("./widgets/checkbox");
Object.defineProperty(exports, "Checkbox", { enumerable: true, get: function () { return checkbox_1.Checkbox; } });
var radiobutton_1 = require("./widgets/radiobutton");
Object.defineProperty(exports, "RadioButton", { enumerable: true, get: function () { return radiobutton_1.RadioButton; } });
var radioset_1 = require("./widgets/radioset");
Object.defineProperty(exports, "RadioSet", { enumerable: true, get: function () { return radioset_1.RadioSet; } });
var message_1 = require("./widgets/message");
Object.defineProperty(exports, "Message", { enumerable: true, get: function () { return message_1.Message; } });
var question_1 = require("./widgets/question");
Object.defineProperty(exports, "Question", { enumerable: true, get: function () { return question_1.Question; } });
var prompt_1 = require("./widgets/prompt");
Object.defineProperty(exports, "Prompt", { enumerable: true, get: function () { return prompt_1.Prompt; } });
var loading_1 = require("./widgets/loading");
Object.defineProperty(exports, "Loading", { enumerable: true, get: function () { return loading_1.Loading; } });
var line_1 = require("./widgets/line");
Object.defineProperty(exports, "Line", { enumerable: true, get: function () { return line_1.Line; } });
var listbar_1 = require("./widgets/listbar");
Object.defineProperty(exports, "Listbar", { enumerable: true, get: function () { return listbar_1.Listbar; } });
var bigtext_1 = require("./widgets/bigtext");
Object.defineProperty(exports, "BigText", { enumerable: true, get: function () { return bigtext_1.BigText; } });
var filemanager_1 = require("./widgets/filemanager");
Object.defineProperty(exports, "FileManager", { enumerable: true, get: function () { return filemanager_1.FileManager; } });
var overlay_1 = require("./widgets/overlay");
Object.defineProperty(exports, "Overlay", { enumerable: true, get: function () { return overlay_1.Overlay; } });
var listtable_1 = require("./widgets/listtable");
Object.defineProperty(exports, "ListTable", { enumerable: true, get: function () { return listtable_1.ListTable; } });
var ansiimage_1 = require("./widgets/ansiimage");
Object.defineProperty(exports, "ANSIImage", { enumerable: true, get: function () { return ansiimage_1.ANSIImage; } });
var terminal_1 = require("./widgets/terminal");
Object.defineProperty(exports, "Terminal", { enumerable: true, get: function () { return terminal_1.Terminal; } });
var layout_1 = require("./widgets/layout");
Object.defineProperty(exports, "Layout", { enumerable: true, get: function () { return layout_1.Layout; } });
var passbox_1 = require("./widgets/passbox");
Object.defineProperty(exports, "PassBox", { enumerable: true, get: function () { return passbox_1.PassBox; } });
var filebox_1 = require("./widgets/filebox");
Object.defineProperty(exports, "FileBox", { enumerable: true, get: function () { return filebox_1.FileBox; } });
var image_1 = require("./widgets/image");
Object.defineProperty(exports, "Image", { enumerable: true, get: function () { return image_1.Image; } });
var viewport_1 = require("./widgets/viewport");
Object.defineProperty(exports, "Viewport", { enumerable: true, get: function () { return viewport_1.Viewport; } });
var canvas_1 = require("./widgets/canvas");
Object.defineProperty(exports, "Canvas", { enumerable: true, get: function () { return canvas_1.Canvas; } });
var iframe_1 = require("./widgets/iframe");
Object.defineProperty(exports, "IFrame", { enumerable: true, get: function () { return iframe_1.IFrame; } });
var video_1 = require("./widgets/video");
Object.defineProperty(exports, "Video", { enumerable: true, get: function () { return video_1.Video; } });
// Factory functions (blessed-style API)
const screen_2 = require("./core/screen");
const box_2 = require("./widgets/box");
const text_2 = require("./widgets/text");
const list_2 = require("./widgets/list");
const form_2 = require("./widgets/form");
const textbox_2 = require("./widgets/textbox");
const button_2 = require("./widgets/button");
const progressbar_2 = require("./widgets/progressbar");
const table_2 = require("./widgets/table");
const log_2 = require("./widgets/log");
const scrollablebox_2 = require("./widgets/scrollablebox");
const scrollabletext_2 = require("./widgets/scrollabletext");
const checkbox_2 = require("./widgets/checkbox");
const radiobutton_2 = require("./widgets/radiobutton");
const radioset_2 = require("./widgets/radioset");
const message_2 = require("./widgets/message");
const question_2 = require("./widgets/question");
const prompt_2 = require("./widgets/prompt");
const loading_2 = require("./widgets/loading");
const line_2 = require("./widgets/line");
const listbar_2 = require("./widgets/listbar");
const bigtext_2 = require("./widgets/bigtext");
const filemanager_2 = require("./widgets/filemanager");
const overlay_2 = require("./widgets/overlay");
const listtable_2 = require("./widgets/listtable");
const ansiimage_2 = require("./widgets/ansiimage");
const terminal_2 = require("./widgets/terminal");
const layout_2 = require("./widgets/layout");
const passbox_2 = require("./widgets/passbox");
const filebox_2 = require("./widgets/filebox");
const image_2 = require("./widgets/image");
const viewport_2 = require("./widgets/viewport");
const canvas_2 = require("./widgets/canvas");
const iframe_2 = require("./widgets/iframe");
const video_2 = require("./widgets/video");
/**
 * Create a new screen
 */
function screen(options) {
    return new screen_2.Screen(options);
}
/**
 * Create a box widget
 */
function box(options) {
    return new box_2.Box(options);
}
/**
 * Create a text widget
 */
function text(options) {
    return new text_2.Text(options);
}
/**
 * Create a list widget
 */
function list(options) {
    return new list_2.List(options);
}
/**
 * Create a form widget
 */
function form(options) {
    return new form_2.Form(options);
}
/**
 * Create a textbox/input widget
 */
function textbox(options) {
    return new textbox_2.Textbox(options);
}
function input(options) {
    return new textbox_2.Input(options);
}
function textarea(options) {
    return new textbox_2.Textarea(options);
}
/**
 * Create a button widget
 */
function button(options) {
    return new button_2.Button(options);
}
/**
 * Create a progress bar widget
 */
function progressbar(options) {
    return new progressbar_2.ProgressBar(options);
}
/**
 * Create a table widget
 */
function table(options) {
    return new table_2.Table(options);
}
/**
 * Create a log widget
 */
function log(options) {
    return new log_2.Log(options);
}
/**
 * Create a scrollable box widget
 */
function scrollablebox(options) {
    return new scrollablebox_2.ScrollableBox(options);
}
/**
 * Create a scrollable text widget
 */
function scrollabletext(options) {
    return new scrollabletext_2.ScrollableText(options);
}
/**
 * Create a checkbox widget
 */
function checkbox(options) {
    return new checkbox_2.Checkbox(options);
}
/**
 * Create a radio button widget
 */
function radiobutton(options) {
    return new radiobutton_2.RadioButton(options);
}
/**
 * Create a radio set widget
 */
function radioset(options) {
    return new radioset_2.RadioSet(options);
}
/**
 * Create a message dialog widget
 */
function message(options) {
    return new message_2.Message(options);
}
/**
 * Create a question dialog widget
 */
function question(options) {
    return new question_2.Question(options);
}
/**
 * Create a prompt dialog widget
 */
function prompt(options) {
    return new prompt_2.Prompt(options);
}
/**
 * Create a loading indicator widget
 */
function loading(options) {
    return new loading_2.Loading(options);
}
/**
 * Create a line widget
 */
function line(options) {
    return new line_2.Line(options);
}
/**
 * Create a listbar widget
 */
function listbar(options) {
    return new listbar_2.Listbar(options);
}
/**
 * Create a big text widget
 */
function bigtext(options) {
    return new bigtext_2.BigText(options);
}
/**
 * Create a file manager widget
 */
function filemanager(options) {
    return new filemanager_2.FileManager(options);
}
/**
 * Create an overlay widget
 */
function overlay(options) {
    return new overlay_2.Overlay(options);
}
/**
 * Create a list table widget
 */
function listtable(options) {
    return new listtable_2.ListTable(options);
}
/**
 * Create an ANSI image widget
 */
function ansiimage(options) {
    return new ansiimage_2.ANSIImage(options);
}
/**
 * Create a terminal widget
 */
function terminal(options) {
    return new terminal_2.Terminal(options);
}
/**
 * Create a layout widget
 */
function layout(options) {
    return new layout_2.Layout(options);
}
/**
 * Create a password box widget
 */
function passbox(options) {
    return new passbox_2.PassBox(options);
}
/**
 * Create a file box widget
 */
function filebox(options) {
    return new filebox_2.FileBox(options);
}
/**
 * Create an image widget
 */
function image(options) {
    return new image_2.Image(options);
}
/**
 * Create a viewport widget
 */
function viewport(options) {
    return new viewport_2.Viewport(options);
}
/**
 * Create a canvas widget
 */
function canvas(options) {
    return new canvas_2.Canvas(options);
}
/**
 * Create an iframe widget
 */
function iframe(options) {
    return new iframe_2.IFrame(options);
}
/**
 * Create a video widget
 */
function video(options) {
    return new video_2.Video(options);
}
// Default export with all factory functions
// Import all classes so they're available for the default export
const screen_3 = require("./core/screen");
const element_2 = require("./core/element");
const program_2 = require("./core/program");
const colorsExport = __importStar(require("./core/colors"));
const events_2 = require("./core/events");
// Import all widgets
const box_3 = require("./widgets/box");
const text_3 = require("./widgets/text");
const list_3 = require("./widgets/list");
const form_3 = require("./widgets/form");
const textbox_3 = require("./widgets/textbox");
const button_3 = require("./widgets/button");
const progressbar_3 = require("./widgets/progressbar");
const table_3 = require("./widgets/table");
const log_3 = require("./widgets/log");
const scrollablebox_3 = require("./widgets/scrollablebox");
const scrollabletext_3 = require("./widgets/scrollabletext");
const checkbox_3 = require("./widgets/checkbox");
const radiobutton_3 = require("./widgets/radiobutton");
const radioset_3 = require("./widgets/radioset");
const message_3 = require("./widgets/message");
const question_3 = require("./widgets/question");
const prompt_3 = require("./widgets/prompt");
const loading_3 = require("./widgets/loading");
const line_3 = require("./widgets/line");
const listbar_3 = require("./widgets/listbar");
const bigtext_3 = require("./widgets/bigtext");
const filemanager_3 = require("./widgets/filemanager");
const overlay_3 = require("./widgets/overlay");
const listtable_3 = require("./widgets/listtable");
const ansiimage_3 = require("./widgets/ansiimage");
const terminal_3 = require("./widgets/terminal");
const layout_3 = require("./widgets/layout");
const passbox_3 = require("./widgets/passbox");
const filebox_3 = require("./widgets/filebox");
const image_3 = require("./widgets/image");
const viewport_3 = require("./widgets/viewport");
const canvas_3 = require("./widgets/canvas");
const iframe_3 = require("./widgets/iframe");
const video_3 = require("./widgets/video");
exports.default = {
    // Core
    Screen: screen_3.Screen,
    Element: element_2.Element,
    Program: program_2.Program,
    EventEmitter: events_2.EventEmitter,
    colors: colorsExport,
    // Widgets
    Box: box_3.Box,
    Text: text_3.Text,
    List: list_3.List,
    Form: form_3.Form,
    Textbox: textbox_3.Textbox,
    Input: textbox_3.Input,
    Textarea: textbox_3.Textarea,
    Button: button_3.Button,
    ProgressBar: progressbar_3.ProgressBar,
    Table: table_3.Table,
    Log: log_3.Log,
    ScrollableBox: scrollablebox_3.ScrollableBox,
    ScrollableText: scrollabletext_3.ScrollableText,
    Checkbox: checkbox_3.Checkbox,
    RadioButton: radiobutton_3.RadioButton,
    RadioSet: radioset_3.RadioSet,
    Message: message_3.Message,
    Question: question_3.Question,
    Prompt: prompt_3.Prompt,
    Loading: loading_3.Loading,
    Line: line_3.Line,
    Listbar: listbar_3.Listbar,
    BigText: bigtext_3.BigText,
    FileManager: filemanager_3.FileManager,
    Overlay: overlay_3.Overlay,
    ListTable: listtable_3.ListTable,
    ANSIImage: ansiimage_3.ANSIImage,
    Terminal: terminal_3.Terminal,
    Layout: layout_3.Layout,
    PassBox: passbox_3.PassBox,
    FileBox: filebox_3.FileBox,
    Image: image_3.Image,
    Viewport: viewport_3.Viewport,
    Canvas: canvas_3.Canvas,
    IFrame: iframe_3.IFrame,
    Video: video_3.Video,
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
