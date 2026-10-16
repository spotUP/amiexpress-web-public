/**
 * The board injects the real checkConfAccess into the command handlers at
 * startup (setUserCommandsDependencies). relConf asks it whenever the board
 * runs relative conference numbers (ConfConfig.info RELATIVE_CONFERENCES, read
 * by getConfRelativeToggle since 7a93f0557), so a test that drives a handler
 * which prints a conference number without booting the board injects it here.
 */
export function injectBoardConfAccess(): void {
  const { setUserCommandsDependencies } = require('../../src/handlers/commands/user-commands.handler');
  const { checkConfAccess } = require('../../src/handlers/message/message-scan.handler');
  setUserCommandsDependencies({
    conferences: [] as any,
    messageBases: [] as any,
    db: {} as any,
    joinConference: jest.fn() as any,
    checkConfAccess,
    displayScreen: jest.fn() as any,
    displayUploadInterface: jest.fn() as any,
  });
}
