"use strict";
/**
 * HUD Builder - Heads-Up Display Components
 *
 * Create professional game HUDs with:
 * - Health/energy bars
 * - Score counters
 * - Timers
 * - Mini-maps
 * - Custom elements
 *
 * @example
 * ```typescript
 * import { HUDBuilder } from '@amiexpress/sdk/components/hud';
 *
 * const hud = new HUDBuilder();
 *
 * hud.addHealthBar({
 *   position: { x: 1, y: 1 },
 *   width: 20,
 *   color: 'red'
 * });
 *
 * hud.addScoreCounter({
 *   position: { x: 60, y: 1 },
 *   format: 'SCORE: {score:06d}'
 * });
 *
 * // Update and render
 * hud.setValue('health', 75);
 * hud.setValue('score', 12000);
 * const output = hud.render();
 * ```
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HUDBuilder = void 0;
const types_1 = require("../../core/types");
class HUDBuilder {
    constructor() {
        /** HUD elements */
        this.elements = new Map();
        /** HUD values (health, score, etc.) */
        this.values = new Map();
        /** Animation states */
        this.animations = new Map();
    }
    /**
     * Add health bar
     *
     * @param config - Health bar configuration
     * @returns Element ID
     *
     * @example
     * ```typescript
     * hud.addHealthBar({
     *   position: { x: 2, y: 1 },
     *   width: 20,
     *   style: 'gradient',
     *   color: AnsiColor.Red
     * });
     *
     * hud.setValue('health', 75); // 75% health
     * ```
     */
    addHealthBar(config) {
        const id = 'health-bar';
        this.elements.set(id, {
            type: 'bar',
            position: config.position,
            size: { width: config.width, height: 1 },
            format: config.style || 'solid',
            color: config.color || types_1.AnsiColor.Red,
            visible: true,
            animate: true,
        });
        this.values.set('health', 100);
        return id;
    }
    /**
     * Add score counter
     *
     * @param config - Score counter configuration
     * @returns Element ID
     *
     * @example
     * ```typescript
     * hud.addScoreCounter({
     *   position: { x: 60, y: 1 },
     *   format: 'SCORE: {score:06d}',
     *   animateOnChange: true
     * });
     * ```
     */
    addScoreCounter(config) {
        const id = 'score';
        this.elements.set(id, {
            type: 'counter',
            position: config.position,
            format: config.format || 'SCORE: {score}',
            color: config.color || types_1.AnsiColor.Yellow,
            visible: true,
            animate: config.animateOnChange ?? true,
        });
        this.values.set('score', 0);
        return id;
    }
    /**
     * Add timer/countdown
     *
     * @param config - Timer configuration
     * @returns Element ID
     *
     * @example
     * ```typescript
     * hud.addTimer({
     *   position: { x: 35, y: 1 },
     *   startTime: 60,
     *   format: 'TIME: {time}',
     *   countDown: true
     * });
     * ```
     */
    addTimer(config) {
        const id = 'timer';
        this.elements.set(id, {
            type: 'timer',
            position: config.position,
            format: config.format || 'TIME: {time}',
            color: types_1.AnsiColor.Cyan,
            visible: true,
            animate: false,
            update: (delta) => {
                const current = this.values.get('time') || config.startTime;
                const change = config.countDown ? -delta / 1000 : delta / 1000;
                this.values.set('time', Math.max(0, current + change));
            },
        });
        this.values.set('time', config.startTime);
        return id;
    }
    /**
     * Add mini-map
     *
     * @param config - Mini-map configuration
     * @returns Element ID
     *
     * @example
     * ```typescript
     * hud.addMiniMap({
     *   position: { x: 70, y: 15 },
     *   size: { width: 10, height: 8 },
     *   zoom: 2
     * });
     * ```
     */
    addMiniMap(config) {
        const id = 'minimap';
        this.elements.set(id, {
            type: 'minimap',
            position: config.position,
            size: config.size,
            visible: true,
            animate: false,
        });
        return id;
    }
    /**
     * Add custom text element
     *
     * @param id - Element ID
     * @param config - Configuration
     * @returns Element ID
     *
     * @example
     * ```typescript
     * hud.addText('level-display', {
     *   position: { x: 30, y: 1 },
     *   format: 'LEVEL {level}',
     *   color: AnsiColor.Green
     * });
     *
     * hud.setValue('level', 5);
     * ```
     */
    addText(id, config) {
        this.elements.set(id, {
            type: 'text',
            position: config.position,
            format: config.format,
            color: config.color || types_1.AnsiColor.White,
            visible: true,
            animate: false,
        });
        return id;
    }
    /**
     * Set HUD value
     *
     * @param key - Value key
     * @param value - New value
     *
     * @example
     * ```typescript
     * hud.setValue('health', 50);
     * hud.setValue('score', 1000);
     * hud.setValue('level', 'Boss Arena');
     * ```
     */
    setValue(key, value) {
        const oldValue = this.values.get(key);
        this.values.set(key, value);
        // Trigger animation if value changed
        if (oldValue !== value) {
            this.animations.set(key, Date.now());
        }
    }
    /**
     * Get HUD value
     *
     * @param key - Value key
     * @returns Current value
     */
    getValue(key) {
        return this.values.get(key);
    }
    /**
     * Update HUD (call each frame)
     *
     * @param delta - Time delta in ms
     */
    update(delta) {
        this.elements.forEach((element) => {
            if (element.update) {
                element.update(delta);
            }
        });
    }
    /**
     * Render HUD to ANSI string
     *
     * @returns ANSI-encoded HUD
     */
    render() {
        let output = '';
        this.elements.forEach((element, id) => {
            if (!element.visible)
                return;
            const { position, type, format, color } = element;
            output += `\x1b[${position.y};${position.x}H`;
            if (type === 'bar') {
                output += this.renderBar(element, id);
            }
            else if (type === 'counter' || type === 'text') {
                output += this.renderText(element, id);
            }
            else if (type === 'timer') {
                output += this.renderTimer(element);
            }
            else if (type === 'minimap') {
                output += this.renderMiniMap(element);
            }
        });
        return output + '\x1b[0m';
    }
    /**
     * Render bar element
     * @private
     */
    renderBar(element, id) {
        const value = this.values.get(id.split('-')[0]) || 100;
        const width = element.size.width;
        const filled = Math.floor((value / 100) * width);
        const empty = width - filled;
        const color = element.color || types_1.AnsiColor.Red;
        const colorCode = `\x1b[${30 + color}m`;
        // Bar style
        const fillChar = element.format === 'blocks' ? '█' : '═';
        const emptyChar = element.format === 'blocks' ? '░' : '─';
        let output = colorCode;
        output += '[';
        output += fillChar.repeat(filled);
        output += emptyChar.repeat(empty);
        output += ']';
        output += ` ${value}%`;
        return output;
    }
    /**
     * Render text/counter element
     * @private
     */
    renderText(element, id) {
        let text = element.format || '';
        // Replace placeholders
        this.values.forEach((value, key) => {
            const regex = new RegExp(`\\{${key}(:([^}]+))?\\}`, 'g');
            text = text.replace(regex, (match, formatSpec, format) => {
                if (typeof value === 'number' && format) {
                    // Apply number formatting (e.g., :06d for zero-padded 6 digits)
                    const padMatch = format.match(/0(\d+)d/);
                    if (padMatch) {
                        const width = parseInt(padMatch[1]);
                        return value.toString().padStart(width, '0');
                    }
                }
                return value.toString();
            });
        });
        const color = element.color || types_1.AnsiColor.White;
        const colorCode = `\x1b[${30 + color}m`;
        // Animate if recently changed
        const animTime = this.animations.get(id);
        const isAnimating = element.animate && animTime && Date.now() - animTime < 500;
        if (isAnimating) {
            return `\x1b[5m${colorCode}${text}\x1b[0m`; // Blinking
        }
        return `${colorCode}${text}`;
    }
    /**
     * Render timer element
     * @private
     */
    renderTimer(element) {
        const time = this.values.get('time') || 0;
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        let text = element.format || 'TIME: {time}';
        text = text.replace('{time}', `${minutes}:${seconds.toString().padStart(2, '0')}`);
        const color = element.color || types_1.AnsiColor.Cyan;
        const colorCode = `\x1b[${30 + color}m`;
        return `${colorCode}${text}`;
    }
    /**
     * Render mini-map element
     * @private
     */
    renderMiniMap(element) {
        const size = element.size;
        let output = '';
        // Simple placeholder mini-map (would be customized per game)
        output += '\x1b[37m┌' + '─'.repeat(size.width - 2) + '┐\n';
        for (let y = 1; y < size.height - 1; y++) {
            output += `\x1b[${element.position.y + y};${element.position.x}H│`;
            output += ' '.repeat(size.width - 2);
            output += '│';
        }
        output += `\x1b[${element.position.y + size.height - 1};${element.position.x}H└`;
        output += '─'.repeat(size.width - 2);
        output += '┘';
        return output;
    }
    /**
     * Show element
     *
     * @param id - Element ID
     */
    show(id) {
        const element = this.elements.get(id);
        if (element)
            element.visible = true;
    }
    /**
     * Hide element
     *
     * @param id - Element ID
     */
    hide(id) {
        const element = this.elements.get(id);
        if (element)
            element.visible = false;
    }
    /**
     * Remove element
     *
     * @param id - Element ID
     */
    remove(id) {
        this.elements.delete(id);
        this.values.delete(id);
        this.animations.delete(id);
    }
    /**
     * Clear all elements
     */
    clear() {
        this.elements.clear();
        this.values.clear();
        this.animations.clear();
    }
    /**
     * Reset - Alias for clear()
     */
    reset() {
        this.clear();
    }
    /**
     * Add a generic bar (health, mana, etc.)
     *
     * @param label - Label for the bar
     * @param value - Current value
     * @param maxValue - Maximum value
     * @param position - Position {x, y}
     * @param width - Width of the bar
     * @param color - Bar color
     * @returns Element ID
     */
    addBar(label, value, maxValue, position, width, color) {
        const id = `bar-${label.toLowerCase()}`;
        this.elements.set(id, {
            type: 'bar',
            position,
            size: { width, height: 1 },
            format: 'solid',
            color: color || types_1.AnsiColor.Green,
            visible: true,
            animate: true,
        });
        this.values.set(label.toLowerCase(), value);
        this.values.set(`${label.toLowerCase()}-max`, maxValue);
        return id;
    }
}
exports.HUDBuilder = HUDBuilder;
exports.default = HUDBuilder;
