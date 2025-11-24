import { AnsiUtil } from './ansi.util';
import { LoggedOnSubState } from '../constants/bbs-states';

export function finalizeCommand(socket: any, session: any, message: string): void {
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', `${AnsiUtil.colorize(message, 'cyan')}\r\n`);
  session.menuPause = false;
  session.subState = LoggedOnSubState.READ_COMMAND;
}
