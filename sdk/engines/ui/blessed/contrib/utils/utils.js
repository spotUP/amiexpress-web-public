"use strict";
/**
 * Blessed Contrib Utilities
 *
 * 1:1 port from blessed-contrib/lib/utils.js
 * Provides utility functions for contrib widgets
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MergeRecursive = MergeRecursive;
exports.getTypeName = getTypeName;
exports.abbreviateNumber = abbreviateNumber;
exports.getColorCode = getColorCode;
/**
 * x256 color conversion
 * Converts RGB values to 256-color terminal codes
 * Port of x256 npm package functionality
 */
function x256(r, g, b) {
    // Convert RGB to 256-color palette
    // Standard 256-color palette:
    // 0-15: Standard colors
    // 16-231: 6x6x6 color cube (216 colors)
    // 232-255: Grayscale ramp (24 shades)
    // Check if grayscale
    if (r === g && g === b) {
        if (r < 8)
            return 16;
        if (r > 248)
            return 231;
        return Math.round(((r - 8) / 247) * 24) + 232;
    }
    // Convert to 6x6x6 color cube
    const cr = Math.round((r / 255) * 5);
    const cg = Math.round((g / 255) * 5);
    const cb = Math.round((b / 255) * 5);
    return 16 + (36 * cr) + (6 * cg) + cb;
}
/**
 * Recursively merge properties of two objects
 * @param obj1 First object
 * @param obj2 Second object (properties override obj1)
 * @returns Merged object
 */
function MergeRecursive(obj1, obj2) {
    if (obj1 == null) {
        return obj2;
    }
    if (obj2 == null) {
        return obj1;
    }
    for (const p in obj2) {
        try {
            // Property in destination object set; update its value
            if (obj2[p].constructor === Object) {
                obj1[p] = MergeRecursive(obj1[p], obj2[p]);
            }
            else {
                obj1[p] = obj2[p];
            }
        }
        catch (e) {
            // Property in destination object not set; create it and set its value
            obj1[p] = obj2[p];
        }
    }
    return obj1;
}
/**
 * Get type name of a value
 * @param thing Value to check
 * @returns Type name string
 */
function getTypeName(thing) {
    if (thing === null)
        return '[object Null]'; // special case
    return Object.prototype.toString.call(thing);
}
/**
 * Abbreviate large numbers with suffixes (k, m, b, t)
 * @param value Number to abbreviate
 * @returns Abbreviated string (e.g., "1.5k", "2.3m")
 */
function abbreviateNumber(value) {
    let newValue = value;
    if (value >= 1000) {
        const suffixes = ['', 'k', 'm', 'b', 't'];
        const suffixNum = Math.floor(('' + value).length / 3);
        let shortValue = '';
        for (let precision = 2; precision >= 1; precision--) {
            shortValue = parseFloat((suffixNum !== 0 ? (value / Math.pow(1000, suffixNum)) : value).toPrecision(precision));
            const dotLessShortValue = (shortValue + '').replace(/[^a-zA-Z 0-9]+/g, '');
            if (dotLessShortValue.length <= 2) {
                break;
            }
        }
        newValue = shortValue + suffixes[suffixNum];
    }
    return newValue;
}
/**
 * Get color code from RGB array, color number, or color string
 * @param color RGB array [r, g, b], color code number, or color string
 * @returns Color code (number or string)
 */
function getColorCode(color) {
    if (Array.isArray(color)) {
        if (color.length === 3) {
            return x256(color[0], color[1], color[2]);
        }
        // Invalid array length, return first element or 0
        return color[0] || 0;
    }
    return color;
}
