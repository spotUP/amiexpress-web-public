/**
 * The texts of express.e's ccom() (O, page the sysop), shared by the two
 * pagers the port runs: the operator-chat page and the PAGER-door fallback
 * in chat.handler. Both print `cmds.sysopName`, the board's SYSOP_NAME.
 */
import { loadBBSConfig } from '../services/bbs-config-file.service';
import { boardRoot } from './board-root.util';

/** cmds.sysopName: the board's SYSOP_NAME tooltype. */
export function boardSysopName(): string {
  return loadBBSConfig(boardRoot()).sysop_name || 'Sysop';
}

/**
 * express.e:20350-20351. The line before it is the command line's own
 * lineInput break, so the time starts the line.
 */
export function pagingLine(displayTime: string, sysopName: string): string {
  return `${displayTime}\r\n\r\nPaging ${sysopName} (CTRL-C to Abort). .`;
}

/** express.e:20376-20380: the page went unanswered; the caller is free. */
export function pageUnansweredText(sysopName: string): string {
  return '\r\n\r\nThe Sysop has been paged\r\n'
    + 'You may continue using the system\r\n'
    + `until ${sysopName} answers your request.\r\n\r\n`;
}
