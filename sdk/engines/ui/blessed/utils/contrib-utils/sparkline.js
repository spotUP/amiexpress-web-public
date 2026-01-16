"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sparkline = sparkline;
const ticks = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
function sparkline(numbers, options) {
    if (!numbers || numbers.length === 0) {
        return '';
    }
    const validNumbers = numbers.filter((n) => typeof n === 'number' && !isNaN(n));
    if (validNumbers.length === 0) {
        return '';
    }
    const min = options?.min !== undefined ? options.min : Math.min(...validNumbers);
    const max = options?.max !== undefined ? options.max : Math.max(...validNumbers);
    if (min === max) {
        return ticks[0].repeat(validNumbers.length);
    }
    const range = max - min;
    return validNumbers
        .map((n) => {
        const normalized = (n - min) / range;
        const index = Math.min(Math.floor(normalized * ticks.length), ticks.length - 1);
        return ticks[index];
    })
        .join('');
}
