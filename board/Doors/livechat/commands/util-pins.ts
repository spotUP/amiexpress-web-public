import type { SlashCommand, CommandRegistry } from './types';

/** /pin - Pin a message */
export const pinCmd: SlashCommand = {
  name: 'pin',
  description: 'Pin a message',
  usage: '/pin [message-id]',
  minSecLevel: 80,
  handler: (ctx, args) => {
    const msgId = args[0];
    return { handled: true, data: { type: 'pin', msgId } };
  }
};

/** /pins - Show pinned messages */
export const pinsCmd: SlashCommand = {
  name: 'pins',
  description: 'Show pinned messages',
  usage: '/pins',
  handler: (ctx) => {
    return { handled: true, data: { type: 'list_pins', channel: ctx.currentChannel } };
  }
};

/** /help - Show available commands */
export const helpCmd = (registry: CommandRegistry): SlashCommand => ({
  name: 'help',
  description: 'Show available commands',
  usage: '/help [command]',
  aliases: ['?', 'commands'],
  handler: (ctx, args) => {
    if (args[0]) {
      const cmd = registry.get(args[0]);
      if (!cmd) return { handled: true, error: `Unknown: ${args[0]}` };
      return { handled: true, message: `/${cmd.name} - ${cmd.description}\n${cmd.usage}` };
    }
    const cmds = registry.getAll()
      .filter(c => !c.minSecLevel || ctx.secLevel >= c.minSecLevel)
      .map(c => `/${c.name}`).join(', ');
    return { handled: true, message: `Commands: ${cmds}` };
  }
});
