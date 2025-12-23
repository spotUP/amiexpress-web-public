"use strict";
/**
 * Button widget - Clickable button
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Button = void 0;
const element_1 = require("../core/element");
class Button extends element_1.Element {
    constructor(options = {}) {
        const baseStyle = options.style ?? {};
        const focusStyle = {
            fg: 'white',
            bg: 'blue',
            ...(baseStyle.focus ?? {}),
        };
        const hoverStyle = {
            fg: 'white',
            bg: 'blue',
            ...(baseStyle.hover ?? {}),
        };
        super({
            focusable: true,
            clickable: true,
            keys: true,
            border: 'line',
            align: 'center',
            valign: 'middle',
            padding: { left: 1, right: 1, top: 0, bottom: 0 },
            ...options,
            style: {
                fg: baseStyle.fg ?? 'white',
                bg: baseStyle.bg ?? 'black',
                ...baseStyle,
                focus: focusStyle,
                hover: hoverStyle,
            },
        });
        // Key handlers
        if (options.keys !== false) {
            this.on('keypress', this._onKeypress.bind(this));
        }
        // Mouse handlers
        if (options.mouse !== false) {
            this.on('click', this._onClick.bind(this));
        }
    }
    _onKeypress(ch, key) {
        if (!this.focused)
            return;
        if (key.name === 'enter' || key.name === 'space') {
            this.press();
        }
    }
    _onClick() {
        this.press();
    }
    press() {
        this.emit('press');
        this.emit('action');
    }
}
exports.Button = Button;
