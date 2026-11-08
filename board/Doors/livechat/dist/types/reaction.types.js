"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.REACTION_WORDS = exports.EMOJI_DISPLAY = exports.REACTION_EMOJIS = void 0;
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
/** Map reaction names to the text face every caller sees. */
exports.EMOJI_DISPLAY = {
    '+1': ':)',
    '-1': ':/',
    'heart': '<3',
    'fire': '*',
    'laugh': ':D',
    'wow': ':O',
    'sad': ':(',
    'angry': '>('
};
/** Picker words, in the order of REACTION_EMOJIS. */
exports.REACTION_WORDS = ['Thumbs Up', 'Thumbs Down', 'Heart', 'Fire', 'Laugh', 'Wow', 'Sad', 'Angry'];
