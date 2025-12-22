/**
 * Button widget - Clickable button
 */
import { Element } from '../core/element';
export class Button extends Element {
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
