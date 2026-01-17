/**
 * Voice Channel Commands
 *
 * /voice - Show voice status
 * /voice join <channel> - Join voice channel
 * /voice leave - Leave current voice channel
 * /voice mute - Mute microphone
 * /voice unmute - Unmute microphone
 * /deafen - Mute audio output
 * /undeafen - Unmute audio output
 */
import type { SlashCommand } from './types';
export declare const voiceCmd: SlashCommand;
export declare const deafenCmd: SlashCommand;
export declare const undeafenCmd: SlashCommand;
