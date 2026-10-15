import type { BBSEvent } from '../types';
import { EVENT_PREFIXES } from '../types';
import { formatTime } from '../utils/format';
import { color } from '../utils/ansi';
import { getEventMessage } from './event-msg';

/** Format BBS event for display */
export function formatBBSEvent(event: BBSEvent): string {
  const time = formatTime(event.timestamp);
  const prefix = EVENT_PREFIXES[event.type] || '[SYS]';
  const { msg, c } = getEventMessage(event);
  return color(`[${time}] ${prefix} ${msg}`, c);
}
