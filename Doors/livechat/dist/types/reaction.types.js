"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EMOJI_DISPLAY = exports.REACTION_EMOJIS = void 0;
/** Available emoji reactions */
exports.REACTION_EMOJIS = [
    '+1', // thumbs up
    '-1', // thumbs down
    'heart',
    'fire',
    'laugh',
    'wow',
    'sad',
    'angry'
];
/** Map emoji codes to ASCII display */
exports.EMOJI_DISPLAY = {
    '+1': '[+]',
    '-1': '[-]',
    'heart': '<3',
    'fire': '*F*',
    'laugh': ':D',
    'wow': ':O',
    'sad': ':(',
    'angry': '>:('
};
