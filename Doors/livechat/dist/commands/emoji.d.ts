/**
 * Emoji Commands
 * /emoji, /emojis, /customemoji
 */
import type { SlashCommand } from './types';
import type { EmojiPicker } from '../ui/emoji-picker';
/**
 * /emoji [search] - Open emoji picker or search emojis
 */
export declare function createEmojiCommand(screen: any, emojiPicker: EmojiPicker, inputBox: any, addSystemMessage: (msg: string) => void): SlashCommand;
/**
 * /emojis [category] - List all emojis or emojis in a category
 */
export declare function createEmojiListCommand(addSystemMessage: (msg: string) => void): SlashCommand;
/**
 * /customemoji - Manage custom emojis (placeholder)
 */
export declare function createCustomEmojiCommand(addSystemMessage: (msg: string) => void): SlashCommand;
