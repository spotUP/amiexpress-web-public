/**
 * Button widget - Clickable button
 */
import { Element } from '../core/element';
export class Button extends Element {
    constructor(options = {}) {
        const baseStyle = options.style ?? {};
        const focusStyle = {
            fg: 'black',
            bg: 'yellow',
            ...(baseStyle.focus ?? {}),
        };
        const hoverStyle = {
            fg: 'black',
            bg: 'cyan',
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
        // Focus/blur handlers - trigger re-render to show focus style
        this.on('focus', () => {
            if (this.screen) {
                this.screen.render();
            }
        });
        this.on('blur', () => {
            if (this.screen) {
                this.screen.render();
            }
        });
    }
    _onKeypress(ch, key) {
        if (!this.focused) {
            return false;
        }
        if (key.name === 'enter' || key.name === 'space') {
            this.press();
            return true;
        }
        return false;
    }
    _onClick() {
        this.press();
    }
    press() {
        this.emit('press');
        this.emit('action');
    }
}
