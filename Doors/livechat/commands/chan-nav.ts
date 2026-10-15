import type { SlashCommand } from './types';

/** /join - Join a channel */
export const joinCmd: SlashCommand = {
  name: 'join',
  description: 'Join a channel',
  usage: '/join #channel',
  handler: (ctx, args) => {
    const name = args[0]?.replace('#', '');
    if (!name) return { handled: true, error: 'Usage: /join #channel' };
    return { handled: true, action: 'join', data: { channel: name } };
  }
};

/** /leave - Leave current channel */
export const leaveCmd: SlashCommand = {
  name: 'leave',
  description: 'Leave current channel',
  usage: '/leave',
  aliases: ['part'],
  handler: (ctx) => {
    return { handled: true, action: 'leave', data: { channel: ctx.currentChannel } };
  }
};

/** /topic - Set channel topic */
export const topicCmd: SlashCommand = {
  name: 'topic',
  description: 'Set channel topic',
  usage: '/topic <new topic>',
  handler: (ctx, args) => {
    const topic = args.join(' ');
    if (!topic) return { handled: true, error: 'Usage: /topic <new topic>' };
    return { handled: true, message: `Topic: ${topic}`, data: { topic } };
  }
};
