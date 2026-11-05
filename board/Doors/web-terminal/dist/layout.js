"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clip = exports.ROWS = void 0;
exports.valueOf = valueOf;
exports.rowLines = rowLines;
exports.dataLines = dataLines;
exports.ROWS = [
    { id: 'modem', label: 'Modem emulation speed', blurb: "Slows the screen to a real modem's speed" },
    { id: 'font', label: 'Terminal font', blurb: 'The typeface your terminal draws in' },
    { id: 'palette', label: 'PETSCII 80 colours', blurb: 'The sixteen colours of an 80-column PETSCII screen' },
    { id: 'charset', label: 'PETSCII character set', blurb: 'Standard, or the Swedish ROM' },
    { id: 'animations', label: 'Animations', blurb: 'Slides, wipes and effects; games keep theirs' },
    { id: 'data', label: 'View my data', blurb: 'Everything this board keeps about you' },
    { id: 'erase', label: 'Delete my account', blurb: 'Erase your data from this board' },
];
const clip = (text, width) => (text.length > width ? text.slice(0, Math.max(0, width)) : text);
exports.clip = clip;
function valueOf(id, s) {
    switch (id) {
        case 'modem': return s.modemSpeed;
        case 'font': return s.font;
        case 'palette': return s.petsciiPalette;
        case 'charset': return s.petsciiCharset;
        case 'animations': return s.animations;
        default: return '';
    }
}
/** One line at 80 columns and wider, two (label, then value under it) below. */
function rowLines(id, s, width) {
    const row = exports.ROWS.find(r => r.id === id);
    const room = width - 1;
    const value = valueOf(id, s);
    if (width < 80)
        return value ? [(0, exports.clip)(` ${row.label}`, room), (0, exports.clip)(`   ${value}`, room)] : [(0, exports.clip)(` ${row.label}`, room)];
    const base = ` ${row.label.padEnd(24)} ${value}`;
    return [(0, exports.clip)(width >= 100 ? `${base.padEnd(52)} ${row.blurb}` : base, room)];
}
function dataLines(rows, width) {
    const room = width - 1;
    if (width < 80)
        return rows.flatMap(r => [(0, exports.clip)(` ${r.label}`, room), (0, exports.clip)(`   ${r.value}`, room)]);
    return rows.map(r => (0, exports.clip)(` ${r.label.padEnd(17)}: ${r.value}`, room));
}
//# sourceMappingURL=layout.js.map