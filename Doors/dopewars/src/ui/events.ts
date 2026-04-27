const MAX_EVENTS = 40;
const log: string[] = [];

/* Word-wrap a string to fit within `width` visible chars per line.
 * Returns an array of lines (blessed tags don't count toward width). */
function wordWrap(text: string, width: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    // Strip blessed tags for length calculation
    const visibleWord = word.replace(/\{[^}]+\}/g, '');
    const visibleCurrent = current.replace(/\{[^}]+\}/g, '');
    const sep = current ? ' ' : '';
    if (visibleCurrent.length + sep.length + visibleWord.length <= width) {
      current += sep + word;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

export function pushEvent(box: any, text: string, wrapWidth = 26): void {
  // Wrap the text to fit the panel width (38% of 80 = ~30 cols, minus 2 border = 28, minus '> ' = 26)
  const wrapped = wordWrap(text, wrapWidth);
  const first = '{cyan-fg}>{/} ' + wrapped[0];
  const rest  = wrapped.slice(1).map(l => '  ' + l);
  const entry = [first, ...rest].join('\n');

  log.unshift('');        // blank line separator
  log.unshift(entry);
  while (log.length > MAX_EVENTS * 2) log.pop();
  box.setContent(log.join('\n'));
}

export function clearEvents(box: any): void {
  log.length = 0;
  box.setContent('');
}
