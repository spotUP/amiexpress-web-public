/** Command execution context */
export interface CommandContext {
  userId: number;
  username: string;
  secLevel: number;
  currentChannel: string;
  emit: (event: string, data: any) => void;
  systemMsg: (text: string) => void;
  errorMsg: (text: string) => void;
}

/** Command result */
export interface CommandResult {
  handled: boolean;
  message?: string;
  error?: string;
  action?: 'quit' | 'join' | 'leave' | 'switch';
  data?: any;
}

/** Slash command definition */
export interface SlashCommand {
  name: string;
  description: string;
  usage: string;
  aliases?: string[];
  minSecLevel?: number;
  handler: (ctx: CommandContext, args: string[]) => Promise<CommandResult> | CommandResult;
}

/** Command registry */
export class CommandRegistry {
  private commands = new Map<string, SlashCommand>();

  register(cmd: SlashCommand): void {
    this.commands.set(cmd.name.toLowerCase(), cmd);
    if (cmd.aliases) {
      for (const alias of cmd.aliases) {
        this.commands.set(alias.toLowerCase(), cmd);
      }
    }
  }

  get(name: string): SlashCommand | undefined {
    return this.commands.get(name.toLowerCase());
  }

  getAll(): SlashCommand[] {
    const seen = new Set<string>();
    const cmds: SlashCommand[] = [];
    for (const cmd of this.commands.values()) {
      if (!seen.has(cmd.name)) {
        seen.add(cmd.name);
        cmds.push(cmd);
      }
    }
    return cmds;
  }
}
