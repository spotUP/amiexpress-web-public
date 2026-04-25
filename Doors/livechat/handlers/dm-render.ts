/** Pure DM/Group-DM line formatter for blessed rendering. */
export function formatDmLine(d: any): string {
  if (!d) return '';
  if (d.isGroup) {
    const list = Array.isArray(d.participants) ? d.participants.join(', ') : '?';
    const header = d.direction === 'sent'
      ? `[Group DM to ${list}]`
      : `[Group DM from ${d.from}]`;
    return `{magenta-fg}${header}: ${d.message}{/magenta-fg}`;
  }
  const dir = d.direction === 'sent' ? `[DM to ${d.to}]` : `[DM from ${d.from}]`;
  const color = d.direction === 'sent' ? 'magenta-fg' : 'cyan-fg';
  const offlineHint = d.direction === 'sent' && d.delivered === false ? ' {gray-fg}(offline){/gray-fg}' : '';
  return `{${color}}${dir}: ${d.message}${offlineHint}{/${color}}`;
}
