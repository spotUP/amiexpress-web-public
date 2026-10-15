/** Slash command handler */
/**
 * Is this input a command, or is it something somebody wants to say?
 *
 * A command is a slash followed by a NAME. `startsWith('/')` alone was too
 * loose: the emoji catalogue contains `/!\`, so picking it into an empty
 * input and pressing Enter ran the command parser, which reported "Unknown
 * command" and swallowed the line - the reported "some emojis cannot be sent
 * because of the characters they start with".
 *
 * Deliberately strict about the first character after the slash: no command
 * begins with a digit or punctuation, and text very well might.
 */
export function looksLikeCommand(input: string): boolean {
  return /^\/[A-Za-z][A-Za-z0-9_-]*(\s|$)/.test(input);
}

export interface CommandResult {
  handled: boolean;
  message?: string;
  error?: string;
}

type CommandFn = (args: string) => CommandResult;

/** Parse and execute slash commands */
export class CommandHandler {
  private commands = new Map<string, CommandFn>();

  constructor() {
    this.registerDefaults();
  }

  private registerDefaults(): void {
    this.register('help', () => ({
      handled: true,
      message: '/join #channel | /msg user | /me action | /quit'
    }));
    this.register('me', (args) => ({
      handled: true,
      message: `ACTION: ${args}`
    }));
    this.register('quit', () => ({
      handled: true,
      message: 'QUIT'
    }));
  }

  /** Register a command */
  register(name: string, fn: CommandFn): void {
    this.commands.set(name.toLowerCase(), fn);
  }

  /** Execute a command */
  execute(input: string): CommandResult {
    if (!looksLikeCommand(input)) {
      return { handled: false };
    }
    const [cmd, ...rest] = input.slice(1).split(' ');
    const fn = this.commands.get(cmd.toLowerCase());
    if (!fn) {
      return { handled: true, error: `Unknown command: /${cmd}` };
    }
    return fn(rest.join(' '));
  }
}
