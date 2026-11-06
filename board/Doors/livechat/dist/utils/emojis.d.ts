/**
 * Emoji Registry and Replacement System
 * 50+ built-in ASCII emojis across 4 categories
 */
export interface Emoji {
    code: string;
    display: string;
    keywords: string[];
    category: 'emotions' | 'actions' | 'symbols' | 'special';
}
/** A sysop-added emoji as the backend stores it (name without colons). */
export interface CustomEmoji {
    name: string;
    display: string;
    ascii: string;
}
export declare function setEmojiRenderMode(isWeb: boolean): void;
export declare function setCustomEmojis(list: CustomEmoji[]): void;
export declare function getCustomEmojis(): CustomEmoji[];
/** Every emoji the caller can use, custom ones rendered for this caller. */
export declare function allEmojis(): Emoji[];
export declare const EMOJIS: Emoji[];
/** Get all emojis in a category */
export declare function getEmojisByCategory(category: Emoji['category']): Emoji[];
/** Search emojis by keyword */
export declare function searchEmojis(query: string): Emoji[];
/** Get all categories */
export declare function getCategories(): Emoji['category'][];
/** Replace :emoji: codes with display characters */
export declare function replaceEmojis(text: string): string;
/** Get emoji by code */
export declare function getEmoji(code: string): Emoji | undefined;
/** Get autocomplete suggestions */
export declare function getAutocompleteSuggestions(partial: string): Emoji[];
