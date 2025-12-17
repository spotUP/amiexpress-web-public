import type { AppState } from './state';
import { CommandRegistry, CommandContext, CommandResult } from '../commands/types';
import { events } from '../services';

/** Create command context */
export function createCommandContext(
  state: AppState,
  user: { id: number; username: string; securityLevel?: number }
): CommandContext {
  return {
    userId: user.id,
    username: user.username,
    secLevel: user.securityLevel || 10,
    currentChannel: state.currentChannel,
    emit: (e, d) => events.emit(e, d),
    systemMsg: () => {},
    errorMsg: () => {}
  };
}

/** Execute a slash command */
export async function executeCommand(
  input: string,
  registry: CommandRegistry,
  ctx: CommandContext
): Promise<CommandResult> {
  const parts = input.slice(1).split(/\s+/);
  const cmdName = parts[0].toLowerCase();
  const args = parts.slice(1);

  const cmd = registry.get(cmdName);
  if (!cmd) {
    return { handled: true, error: `Unknown command: /${cmdName}` };
  }

  if (cmd.minSecLevel && ctx.secLevel < cmd.minSecLevel) {
    return { handled: true, error: `Permission denied. Need level ${cmd.minSecLevel}` };
  }

  try {
    return await cmd.handler(ctx, args);
  } catch (err: any) {
    return { handled: true, error: err.message };
  }
}
