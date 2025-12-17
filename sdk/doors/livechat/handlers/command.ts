/** Slash command handler */
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
    if (!input.startsWith('/')) {
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
