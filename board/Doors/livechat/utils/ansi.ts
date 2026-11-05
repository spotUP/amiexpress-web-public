/** ANSI color helpers for blessed tags */

export const colors = {
  user: 'cyan',
  system: 'gray',
  error: 'red',
  success: 'green',
  info: 'yellow',
  highlight: 'magenta',
  muted: 'gray'
} as const;

/** Wrap text in blessed color tag */
export function color(text: string, c: string): string {
  return `{${c}-fg}${text}{/${c}-fg}`;
}

/** Bold text */
export function bold(text: string): string {
  return `{bold}${text}{/bold}`;
}

/** Format username with color */
export function userName(name: string, c: string): string {
  return color(bold(name), c);
}

/** Format timestamp */
export function timestamp(time: string): string {
  return color(`[${time}]`, 'gray');
}

/** Format system message */
export function systemMsg(text: string): string {
  return color(`*** ${text}`, 'gray');
}

/** Format error message */
export function errorMsg(text: string): string {
  return color(`! ${text}`, 'red');
}
