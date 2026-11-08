"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.REACTION_WORDS = exports.EMOJI_UTF8 = exports.EMOJI_DISPLAY = exports.REACTION_EMOJIS = void 0;
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
/** Map reaction names to the ASCII face (latin1 and Amiga callers; also the fallback). */
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
/** Real emoji for callers whose wire is UTF-8 (BBSApi.unicodeCapable). Each is 2 terminal columns. */
exports.EMOJI_UTF8 = {
    '+1': '\u{1F44D}',
    '-1': '\u{1F44E}',
    'heart': '\u2764\uFE0F',
    'fire': '\u{1F525}',
    'laugh': '\u{1F602}',
    'wow': '\u{1F62E}',
    'sad': '\u{1F622}',
    'angry': '\u{1F620}'
};
/** Picker words, in the order of REACTION_EMOJIS. */
exports.REACTION_WORDS = ['Thumbs Up', 'Thumbs Down', 'Heart', 'Fire', 'Laugh', 'Wow', 'Sad', 'Angry'];
