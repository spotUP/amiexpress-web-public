const MAX_EVENTS = 60;
const log: string[] = [];

export function pushEvent(box: any, text: string): void {
  log.unshift('{cyan-fg}>{/} ' + text);
  if (log.length > MAX_EVENTS) log.pop();
  box.setContent(log.join('\n'));
}

export function clearEvents(box: any): void {
  log.length = 0;
  box.setContent('');
}
