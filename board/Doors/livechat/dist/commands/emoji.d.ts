/**
 * Emoji Commands
 * /emoji, /emojis, /customemoji
 */
import type { SlashCommand } from './types';
import { type EmojiPicker } from '../ui/emoji-picker';
/**
 * /emoji [search] - Open emoji picker or search emojis
 */
export declare function createEmojiCommand(screen: any, emojiPicker: EmojiPicker, inputBox: any, addSystemMessage: (msg: string) => void): SlashCommand;
/**
 * /emojis [category] - List all emojis or emojis in a category
 */
export declare function createEmojiListCommand(addSystemMessage: (msg: string) => void): SlashCommand;
/**
 * /customemoji add <name> <display> <ascii> | remove <name> | list
 * Board-wide emoji the sysop adds. Inserted as :name: like any other; a web
 * caller sees <display>, a telnet or SSH caller sees <ascii>. The backend
 * stores them and refuses a non-sysop add/remove; the list returns as
 * chat:emoji-list and feeds the one lookup in utils/emojis.
 */
export declare function createCustomEmojiCommand(addSystemMessage: (msg: string) => void): SlashCommand;
