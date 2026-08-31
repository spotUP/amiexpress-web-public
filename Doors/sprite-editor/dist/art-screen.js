"use strict";
/**
 * Art mode: 'm' on a selected door lists its .ans files (plus a
 * '[new file]' row) and opens the pick in the full ANSIEditor engine,
 * full-screen. Same discipline as EditScreen: this object binds its own
 * screen-level keys and removes them on destroy, so the browser's own
 * bindings come back untouched when it leaves.
 *
 * Two phases, not one screen: a small centred list first (so a file can be
 * picked or a new name typed), then the editor takes the whole screen.
 * screen.key() handlers are GLOBAL - they fire regardless of focus - so
 * the list's keys are unbound before the editor's own internal bindings
 * take over; leaving both live would race Enter/Escape between the two.
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
exports.ArtSession = void 0;
const blessed_1 = __importStar(require("@amiexpress/bbs-door-sdk/engines/ui/blessed"));
const assets_1 = require("./assets");
class ArtSession {
    constructor(screen, door, onExit) {
        this.listBox = null;
        this.editor = null;
        this.files = [];
        this.selected = 0;
        this.naming = null; // non-null while typing a new file name
        this.keyHandlers = [];
        this.screen = screen;
        this.door = door;
        this.onExit = onExit;
        this.showList();
    }
    /** Bind one screen-key group, remembered so unbindKeys can remove it. */
    key(keys, handler) {
        this.screen.key(keys, handler);
        this.keyHandlers.push([keys, handler]);
    }
    unbindKeys() {
        for (const [keys, handler] of this.keyHandlers) {
            if (keys[0] === '__keypress__')
                this.screen.removeListener('keypress', handler);
            else
                this.screen.unkey(keys, handler);
        }
        this.keyHandlers = [];
    }
    /** items(): the door's .ans files, sorted, plus the trailing new-file row. */
    items() {
        return [...this.files, '[new file]'];
    }
    showList() {
        this.files = (0, assets_1.listArt)(this.door);
        this.listBox = blessed_1.default.list({
            parent: this.screen,
            top: 'center', left: 'center', width: '50%', height: '50%',
            label: ` Art: ${this.door} `,
            border: { type: 'line' },
            tags: true, keys: false, mouse: false,
            style: {
                border: { fg: 'lightyellow' },
                selected: { bg: 'blue', fg: 'lightyellow', bold: true },
                item: { fg: 'white' },
            },
        });
        this.selected = 0;
        this.paint();
        this.key(['up', 'k'], () => {
            if (this.naming !== null)
                return;
            this.selected = Math.max(0, this.selected - 1);
            this.paint();
        });
        this.key(['down', 'j'], () => {
            if (this.naming !== null)
                return;
            this.selected = Math.min(this.items().length - 1, this.selected + 1);
            this.paint();
        });
        this.key(['enter'], () => {
            if (this.naming !== null) {
                const name = this.naming;
                if (!name)
                    return; // the pattern is [a-z0-9-]+; an empty name stays in naming
                this.naming = null;
                this.openEditor(`${name}.ans`, '');
                return;
            }
            const isNewFile = this.selected === this.items().length - 1;
            if (isNewFile) {
                this.naming = '';
                this.paint();
                return;
            }
            const file = this.files[this.selected];
            let content = '';
            try {
                content = (0, assets_1.readArt)(this.door, file).toString('latin1');
            }
            catch {
                content = '';
            }
            this.openEditor(file, content);
        });
        this.key(['backspace', 'delete'], () => {
            if (this.naming === null)
                return;
            this.naming = this.naming.slice(0, -1);
            this.paint();
        });
        // 'q' is NOT bound here (unlike the browser's own quit key): a typed
        // filename must be free to contain the letter q. Escape alone cancels,
        // the same restriction EditScreen's naming flow already lives with.
        this.key(['escape'], () => {
            if (this.naming !== null) {
                this.naming = null;
                this.paint();
                return;
            }
            this.exit();
        });
        // Typed characters extend the new-file name while naming; the same
        // [a-z0-9-] pattern EditScreen's '+' animation-naming uses.
        const onKeypress = (ch) => {
            if (this.naming === null)
                return;
            if (!ch || ch.length !== 1)
                return;
            if (/[a-z0-9-]/.test(ch)) {
                this.naming += ch;
                this.paint();
            }
        };
        this.screen.on('keypress', onKeypress);
        this.keyHandlers.push([['__keypress__'], onKeypress]);
    }
    paint() {
        const items = this.naming !== null
            ? [...this.files, `[new file: ${this.naming}_]`]
            : this.items();
        this.listBox.setItems(items);
        this.listBox.select(this.selected);
        this.screen.render();
    }
    /** List phase -> editor phase: the list's keys die before the editor's own take over. */
    openEditor(file, content) {
        this.unbindKeys();
        this.listBox?.destroy();
        this.listBox = null;
        this.editor = new blessed_1.ANSIEditor({
            parent: this.screen,
            top: 0, left: 0, width: '100%', height: '100%',
            title: `Art: ${this.door}/${file}`,
            initialContent: content,
            initialMode: 'draw',
            showLineNumbers: false,
            showMenuBar: true,
            showToolbar: true,
            showSidebar: true,
            showStatusBar: true,
            onSave: async (text) => {
                try {
                    // The widget moves cell chars 1:1 through this string with no
                    // CP437/UTF-8 re-encoding of its own (parseANSIToCanvas and
                    // canvasToANSI both copy cell.char verbatim), so the round trip
                    // to Buffer must be byte-preserving too - 'latin1', the encoding
                    // this codebase already uses everywhere raw Amiga bytes cross a
                    // JS string boundary. UTF-8 here would mangle every high-bit byte,
                    // the exact class of bug logged against the Edit/Write tools.
                    (0, assets_1.writeArt)(this.door, file, Buffer.from(text, 'latin1'));
                    return true;
                }
                catch (error) {
                    console.error(`[sprite-editor] art save failed for ${this.door}/${file}:`, error);
                    return false;
                }
            },
            onExit: () => {
                this.exit();
            },
        });
        this.editor.focus();
        this.screen.render();
    }
    exit() {
        this.destroy();
        this.onExit();
    }
    destroy() {
        this.unbindKeys();
        this.listBox?.destroy();
        this.listBox = null;
        this.editor?.destroy();
        this.editor = null;
    }
}
exports.ArtSession = ArtSession;
