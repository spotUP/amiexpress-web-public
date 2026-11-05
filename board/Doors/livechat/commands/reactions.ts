import type { SlashCommand } from './types';
import { REACTION_EMOJIS } from '../types';

/** /react - Add reaction to message */
export const reactCmd: SlashCommand = {
  name: 'react',
  description: 'Add reaction to message',
  usage: '/react [emoji] [msg-id]',
  aliases: ['+1', '-1', 'heart', 'fire'],
  handler: (ctx, args) => {
    const emoji = args[0] || '+1';
    const msgId = args[1];
    if (!REACTION_EMOJIS.includes(emoji as any)) {
      const valid = REACTION_EMOJIS.join(', ');
      return { handled: true, error: `Valid emojis: ${valid}` };
    }
    return { handled: true, data: { type: 'react', emoji, msgId } };
  }
};

/** /unreact - Remove reaction */
export const unreactCmd: SlashCommand = {
  name: 'unreact',
  description: 'Remove reaction',
  usage: '/unreact [emoji] [msg-id]',
  handler: (ctx, args) => {
    const emoji = args[0] || '+1';
    const msgId = args[1];
    return { handled: true, data: { type: 'unreact', emoji, msgId } };
  }
};

/** /reactions - Show reactions on a message */
export const reactionsCmd: SlashCommand = {
  name: 'reactions',
  description: 'Show reactions',
  usage: '/reactions [msg-id]',
  handler: (ctx, args) => {
    const msgId = args[0];
    return { handled: true, data: { type: 'list_reactions', msgId } };
  }
};

/** Quick reaction shortcuts */
export const thumbsUpCmd: SlashCommand = {
  name: 'thumbsup',
  description: 'React with thumbs up',
  usage: '/thumbsup [msg-id]',
  aliases: ['like'],
  handler: (ctx, args) => {
    return { handled: true, data: { type: 'react', emoji: '+1', msgId: args[0] } };
  }
};

export const heartCmd: SlashCommand = {
  name: 'love',
  description: 'React with heart',
  usage: '/love [msg-id]',
  handler: (ctx, args) => {
    return { handled: true, data: { type: 'react', emoji: 'heart', msgId: args[0] } };
  }
};
