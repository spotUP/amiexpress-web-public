"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MergeRecursive = MergeRecursive;
exports.getTypeName = getTypeName;
exports.abbreviateNumber = abbreviateNumber;
exports.getColorCode = getColorCode;
function x256(r, g, b) {
    if (r === g && g === b) {
        if (r < 8)
            return 16;
        if (r > 248)
            return 231;
        return Math.round(((r - 8) / 247) * 24) + 232;
    }
    const cr = Math.round((r / 255) * 5);
    const cg = Math.round((g / 255) * 5);
    const cb = Math.round((b / 255) * 5);
    return 16 + (36 * cr) + (6 * cg) + cb;
}
function MergeRecursive(obj1, obj2) {
    if (obj1 == null) {
        return obj2;
    }
    if (obj2 == null) {
        return obj1;
    }
    for (const p in obj2) {
        try {
            if (obj2[p].constructor === Object) {
                obj1[p] = MergeRecursive(obj1[p], obj2[p]);
            }
            else {
                obj1[p] = obj2[p];
            }
        }
        catch (e) {
            obj1[p] = obj2[p];
        }
    }
    return obj1;
}
function getTypeName(thing) {
    if (thing === null)
        return '[object Null]';
    return Object.prototype.toString.call(thing);
}
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
function getColorCode(color) {
    if (Array.isArray(color)) {
        if (color.length === 3) {
            return x256(color[0], color[1], color[2]);
        }
        return color[0] || 0;
    }
    return color;
}
