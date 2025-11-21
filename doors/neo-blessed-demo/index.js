"use strict";
/**
 * Neo-Blessed UI Demo - Comprehensive demonstration of UI capabilities
 *
 * This door showcases the power of the UIEngine and neo-blessed integration:
 * - Interactive menus
 * - Forms and input dialogs
 * - Lists and tables
 * - Progress bars
 * - Scrollable text viewers
 * - Dialog boxes
 *
 * Use this as a reference for building your own sophisticated BBS UIs!
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runDoor = runDoor;
var bbs_door_sdk_1 = require("@amiexpress/bbs-door-sdk");
var runDoorSession_1 = require("@amiexpress/bbs-door-sdk/tools/runDoorSession");
var door = new bbs_door_sdk_1.Door({
    name: 'Neo-Blessed UI Demo',
    version: '1.0.0',
    author: 'AmiExpress SDK',
    description: 'Comprehensive UI demonstration using neo-blessed',
});
door.onConnect(function (user) { return __awaiter(void 0, void 0, void 0, function () {
    var ui, helpers, showMainMenu, showFormDemo, showListDemo, showDialogDemo, showProgressDemo, showTextViewer;
    return __generator(this, function (_a) {
        console.log("User ".concat(user.name, " connected to UI demo"));
        ui = new bbs_door_sdk_1.UIEngine({
            width: 80,
            height: 24,
            smartCSR: true,
            enableMouse: true,
            enableKeys: true,
        });
        helpers = new bbs_door_sdk_1.UIHelpers(ui);
        showMainMenu = function () {
            ui.clear();
            // Title bar
            helpers.createTitleBar('Neo-Blessed UI Demo', 'Showcase of Advanced Terminal UI');
            // Status bar
            var statusBar = helpers.createStatusBar({ position: 'bottom' });
            statusBar.setContent(" User: ".concat(user.name, " | Arrow keys to navigate | Enter to select | Q to quit "));
            // Main menu
            var menu = helpers.createMenu({
                top: 4,
                left: 'center',
                width: 40,
                height: 15,
                title: 'Main Menu',
            }, [
                {
                    label: 'Interactive Forms',
                    key: '1',
                    action: function () { return showFormDemo(); },
                },
                {
                    label: 'List and Tables',
                    key: '2',
                    action: function () { return showListDemo(); },
                },
                {
                    label: 'Dialog Boxes',
                    key: '3',
                    action: function () { return showDialogDemo(); },
                },
                {
                    label: 'Progress Bars',
                    key: '4',
                    action: function () { return showProgressDemo(); },
                },
                {
                    label: 'Text Viewer',
                    key: '5',
                    action: function () { return showTextViewer(); },
                },
                {
                    label: 'About',
                    key: 'a',
                    action: function () { return __awaiter(void 0, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0: return [4 /*yield*/, helpers.showAlert({
                                        title: 'About',
                                        message: 'Neo-Blessed UI Demo v1.0.0\n\nShowcases the power of neo-blessed\nfor creating professional BBS UIs.\n\nBuilt with AmiExpress SDK',
                                    })];
                                case 1:
                                    _a.sent();
                                    ui.render();
                                    return [2 /*return*/];
                            }
                        });
                    }); },
                },
                {
                    label: 'Exit',
                    key: 'q',
                    action: function () {
                        ui.destroy();
                        door.disconnect(user.id);
                    },
                },
            ]);
            // Global quit handler
            ui.onKey(['q', 'escape'], function () {
                ui.destroy();
                door.disconnect(user.id);
            });
            ui.render();
        };
        showFormDemo = function () { return __awaiter(void 0, void 0, void 0, function () {
            var form, nameInput, emailInput, submitBtn, cancelBtn;
            return __generator(this, function (_a) {
                ui.clear();
                helpers.createTitleBar('Form Demo', 'Interactive input forms');
                form = ui.createForm({
                    top: 3,
                    left: 'center',
                    width: 60,
                    height: 18,
                    border: { type: 'line' },
                    label: ' User Information ',
                    keys: true,
                    style: {
                        border: { fg: 'cyan' },
                    },
                });
                // Name input
                ui.createText({
                    parent: form,
                    top: 1,
                    left: 2,
                    content: 'Name:',
                    style: { fg: 'yellow' },
                });
                nameInput = ui.createTextbox({
                    parent: form,
                    top: 2,
                    left: 2,
                    width: 40,
                    height: 3,
                    border: { type: 'line' },
                    value: user.name,
                    name: 'name',
                    style: {
                        focus: {
                            border: { fg: 'green' },
                        },
                    },
                });
                // Email input
                ui.createText({
                    parent: form,
                    top: 6,
                    left: 2,
                    content: 'Email:',
                    style: { fg: 'yellow' },
                });
                emailInput = ui.createTextbox({
                    parent: form,
                    top: 7,
                    left: 2,
                    width: 40,
                    height: 3,
                    border: { type: 'line' },
                    name: 'email',
                    style: {
                        focus: {
                            border: { fg: 'green' },
                        },
                    },
                });
                submitBtn = ui.createButton({
                    parent: form,
                    bottom: 2,
                    left: 10,
                    width: 12,
                    height: 3,
                    content: 'Submit',
                    border: { type: 'line' },
                    style: {
                        fg: 'white',
                        bg: 'green',
                        focus: {
                            bg: 'cyan',
                        },
                    },
                });
                cancelBtn = ui.createButton({
                    parent: form,
                    bottom: 2,
                    right: 10,
                    width: 12,
                    height: 3,
                    content: 'Cancel',
                    border: { type: 'line' },
                    style: {
                        fg: 'white',
                        bg: 'red',
                        focus: {
                            bg: 'cyan',
                        },
                    },
                });
                submitBtn.on('press', function () { return __awaiter(void 0, void 0, void 0, function () {
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0: return [4 /*yield*/, helpers.showAlert({
                                    title: 'Form Submitted',
                                    message: "Name: ".concat(nameInput.getValue(), "\nEmail: ").concat(emailInput.getValue()),
                                })];
                            case 1:
                                _a.sent();
                                showMainMenu();
                                return [2 /*return*/];
                        }
                    });
                }); });
                cancelBtn.on('press', function () {
                    showMainMenu();
                });
                cancelBtn.key(['escape'], function () {
                    cancelBtn.press();
                });
                nameInput.focus();
                ui.render();
                return [2 /*return*/];
            });
        }); };
        showListDemo = function () {
            ui.clear();
            helpers.createTitleBar('List and Table Demo', 'Scrollable lists and data tables');
            // List
            var list = ui.createList({
                top: 3,
                left: 2,
                width: 35,
                height: 18,
                border: { type: 'line' },
                label: ' Items ',
                items: [
                    'Apple',
                    'Banana',
                    'Cherry',
                    'Date',
                    'Elderberry',
                    'Fig',
                    'Grape',
                    'Honeydew',
                    'Kiwi',
                    'Lemon',
                    'Mango',
                    'Nectarine',
                    'Orange',
                    'Papaya',
                    'Quince',
                ],
                style: {
                    selected: { bg: 'blue', fg: 'white' },
                    border: { fg: 'cyan' },
                },
            });
            // Table
            var table = helpers.createDataTable({
                top: 3,
                left: 40,
                width: 38,
                height: 18,
                title: 'High Scores',
                data: [
                    ['Rank', 'Name', 'Score'],
                    ['1', 'Alice', '15000'],
                    ['2', 'Bob', '12500'],
                    ['3', 'Carol', '10000'],
                    ['4', 'Dave', '9500'],
                    ['5', 'Eve', '8000'],
                    ['6', 'Frank', '7500'],
                    ['7', 'Grace', '6000'],
                ],
            });
            list.on('select', function (item, index) { return __awaiter(void 0, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, helpers.showAlert({
                                title: 'Item Selected',
                                message: "You selected: ".concat(item.content, "\nAt index: ").concat(index),
                            })];
                        case 1:
                            _a.sent();
                            ui.render();
                            return [2 /*return*/];
                    }
                });
            }); });
            list.key(['escape'], function () {
                showMainMenu();
            });
            list.focus();
            ui.render();
        };
        showDialogDemo = function () { return __awaiter(void 0, void 0, void 0, function () {
            var menu;
            return __generator(this, function (_a) {
                ui.clear();
                helpers.createTitleBar('Dialog Demo', 'Alert, confirm, and input dialogs');
                menu = helpers.createMenu({
                    top: 4,
                    left: 'center',
                    width: 40,
                    height: 12,
                    title: 'Dialog Types',
                }, [
                    {
                        label: 'Alert Dialog',
                        key: '1',
                        action: function () { return __awaiter(void 0, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, helpers.showAlert({
                                            title: 'Alert',
                                            message: 'This is an alert dialog!\n\nPress OK to continue.',
                                        })];
                                    case 1:
                                        _a.sent();
                                        ui.render();
                                        return [2 /*return*/];
                                }
                            });
                        }); },
                    },
                    {
                        label: 'Confirm Dialog',
                        key: '2',
                        action: function () { return __awaiter(void 0, void 0, void 0, function () {
                            var confirmed;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, helpers.showConfirm({
                                            title: 'Confirm',
                                            message: 'Are you sure you want to proceed?',
                                        })];
                                    case 1:
                                        confirmed = _a.sent();
                                        return [4 /*yield*/, helpers.showAlert({
                                                title: 'Result',
                                                message: confirmed ? 'You clicked Yes!' : 'You clicked No!',
                                            })];
                                    case 2:
                                        _a.sent();
                                        ui.render();
                                        return [2 /*return*/];
                                }
                            });
                        }); },
                    },
                    {
                        label: 'Input Dialog',
                        key: '3',
                        action: function () { return __awaiter(void 0, void 0, void 0, function () {
                            var name;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, helpers.showInput({
                                            title: 'Input',
                                            label: 'Enter your name:',
                                            defaultValue: user.name,
                                        })];
                                    case 1:
                                        name = _a.sent();
                                        if (!name) return [3 /*break*/, 3];
                                        return [4 /*yield*/, helpers.showAlert({
                                                title: 'Input Received',
                                                message: "Hello, ".concat(name, "!"),
                                            })];
                                    case 2:
                                        _a.sent();
                                        _a.label = 3;
                                    case 3:
                                        ui.render();
                                        return [2 /*return*/];
                                }
                            });
                        }); },
                    },
                    {
                        label: 'Back to Main Menu',
                        key: 'b',
                        action: function () { return showMainMenu(); },
                    },
                ]);
                ui.render();
                return [2 /*return*/];
            });
        }); };
        showProgressDemo = function () {
            ui.clear();
            helpers.createTitleBar('Progress Bar Demo', 'Animated progress indicators');
            var _a = helpers.createProgressIndicator({
                top: 4,
                left: 10,
                width: 60,
                label: 'Download Progress:',
            }), bar1 = _a.bar, label1 = _a.label;
            var _b = helpers.createProgressIndicator({
                top: 9,
                left: 10,
                width: 60,
                label: 'Upload Progress:',
            }), bar2 = _b.bar, label2 = _b.label;
            var _c = helpers.createProgressIndicator({
                top: 14,
                left: 10,
                width: 60,
                label: 'Processing:',
            }), bar3 = _c.bar, label3 = _c.label;
            var statusText = ui.createText({
                top: 19,
                left: 'center',
                content: '{cyan-fg}Press ESC to return to menu{/cyan-fg}',
                tags: true,
            });
            ui.render();
            // Animate progress bars
            var progress1 = 0;
            var progress2 = 0;
            var progress3 = 0;
            var interval = setInterval(function () {
                progress1 += 2;
                progress2 += 1.5;
                progress3 += 1;
                if (progress1 <= 100)
                    bar1.setProgress(progress1);
                if (progress2 <= 100)
                    bar2.setProgress(progress2);
                if (progress3 <= 100)
                    bar3.setProgress(progress3);
                ui.render();
                if (progress1 >= 100 && progress2 >= 100 && progress3 >= 100) {
                    clearInterval(interval);
                    statusText.setContent('{green-fg}{bold}All operations complete! Press ESC to continue.{/bold}{/green-fg}');
                    ui.render();
                }
            }, 100);
            ui.onKey(['escape'], function () {
                clearInterval(interval);
                showMainMenu();
            });
        };
        showTextViewer = function () {
            ui.clear();
            helpers.createTitleBar('Text Viewer Demo', 'Scrollable text with vi-style navigation');
            var longText = "\n=== Neo-Blessed UI Engine ===\n\nThe UIEngine provides a powerful ncurses-like widget system for creating\nsophisticated ASCII/ANSI user interfaces in BBS doors.\n\nKey Features:\n- Rich widget library (20+ widgets)\n- Efficient rendering (only redraws changes)\n- Mouse + keyboard support\n- Focus management\n- Scrolling and navigation\n- Styling and theming\n\nAvailable Widgets:\n* Box - Fundamental building block\n* Text - Simple text display\n* Line - Horizontal/vertical dividers\n* List - Scrollable, selectable lists\n* Form - Input containers\n* Textbox - Single-line input\n* Textarea - Multi-line input\n* Button - Clickable buttons\n* Checkbox - Boolean selection\n* Table - Data tables\n* ProgressBar - Progress indicators\n* Message - Alert dialogs\n* Prompt - Input prompts\n* Log - Scrollable output logs\n\nNavigation:\n- Arrow keys: Scroll up/down\n- j/k: Vi-style scrolling\n- Page Up/Down: Fast scrolling\n- g/G: Jump to top/bottom\n- ESC: Return to menu\n\nThis text viewer demonstrates scrolling capabilities. Try scrolling through\nthis content using the arrow keys or vi-style navigation (j/k).\n\nThe viewer supports:\n- Automatic word wrapping\n- Scrollbar indicators\n- Mouse wheel scrolling\n- Keyboard navigation\n- Tag-based markup\n\nYou can use this for:\n- Help text\n- Documentation\n- File viewing\n- Log displays\n- News bulletins\n- Any long-form text\n\n=== Building Your Own UIs ===\n\nTo create your own sophisticated UIs:\n\n1. Import the UIEngine and UIHelpers:\n   import { UIEngine, UIHelpers } from '@amiexpress/bbs-door-sdk';\n\n2. Create a UI instance:\n   const ui = new UIEngine({ width: 80, height: 24 });\n   const helpers = new UIHelpers(ui);\n\n3. Create widgets:\n   const box = ui.createBox({ ... });\n   const list = ui.createList({ ... });\n   const form = ui.createForm({ ... });\n\n4. Handle events:\n   list.on('select', (item, index) => { ... });\n   button.on('press', () => { ... });\n\n5. Render the screen:\n   ui.render();\n\n6. Clean up when done:\n   ui.destroy();\n\nCheck out the SDK documentation for more details and examples!\n\n=== Performance Tips ===\n\n- Enable smartCSR and fastCSR for optimal rendering\n- Call render() after multiple changes, not each change\n- Use useBCE for faster background color fills\n- Destroy unused elements to free memory\n- Batch updates when possible\n\n=== Styling ===\n\nWidgets support comprehensive styling:\n\nstyle: {\n  fg: 'white',        // Foreground color\n  bg: 'blue',         // Background color\n  bold: true,         // Text attributes\n  border: {           // Border styling\n    fg: 'cyan'\n  },\n  focus: {            // Focus state\n    bg: 'cyan'\n  },\n  hover: {            // Hover state\n    fg: 'yellow'\n  }\n}\n\nSupported colors: black, red, green, yellow, blue, magenta, cyan, white,\nbrightred, brightgreen, brightyellow, brightblue, brightmagenta,\nbrightcyan, brightwhite\n\n=== Content Markup ===\n\nUse tags for inline styling:\n\n{bold}Bold text{/bold}\n{red-fg}Red text{/red-fg}\n{center}Centered{/center}\n{right}Right-aligned{/right}\n\n=== Events ===\n\nAll elements support events:\n\n- Mouse: click, mousedown, mouseup, mousemove, wheelup, wheeldown\n- Focus: focus, blur\n- Visibility: show, hide\n- Layout: move, resize\n- Rendering: prerender, render\n\n=== Conclusion ===\n\nNeo-blessed provides professional-grade terminal UI capabilities for BBS doors.\nUse it to create interactive menus, forms, file browsers, games, and more!\n\nHappy coding! \uD83D\uDE80\n\n(Press ESC to return to main menu)\n";
            var viewer = helpers.createTextViewer({
                top: 3,
                left: 2,
                width: 76,
                height: 19,
                title: 'Neo-Blessed Documentation',
                content: longText,
            });
            viewer.key(['escape'], function () {
                showMainMenu();
            });
            viewer.focus();
            ui.render();
        };
        // Start with main menu
        showMainMenu();
        return [2 /*return*/];
    });
}); });
door.onDisconnect(function (user) {
    console.log("User ".concat(user.name, " disconnected from UI demo"));
});
function runDoor(doorSession) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, runDoorSession_1.runDoorWithSession)(door, doorSession)];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
