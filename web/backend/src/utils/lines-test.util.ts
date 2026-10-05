/**
 * express.e numberOfLinesTest (11300-11307): count down 70..2, one number a
 * line, then ask which number is at the top. Shared by sign-up and W 7.
 */
export function linesCountdown(): string {
  let text = '';
  for (let n = 70; n >= 2; n--) text += ` ${n}\r\n`;
  return text;
}

export const LINES_PROMPT = '\r\nEnter the number you see at the top of your screen (or 0 for Auto): ';
