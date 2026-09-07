/**
 * THE AUDIT - every tool call the AI co-sysop makes, on the record.
 *
 * Two readers: the CallersLog (what the board itself keeps, per caller,
 * survives restarts) and the sysop's admin chat, live, as an
 * `operator:tool-event` on the `sysops` room. Nothing the model does with a
 * tool is silent.
 */
import { callersLog } from '../../server/database-helpers';

export interface ToolAudit {
  pageId: string;
  userId: string;
  username: string;
  nodeId: number;
  tool: string;
  args: unknown;
  outcome: 'ok' | 'refused' | 'error';
  summary: string;
}

export async function auditToolCall(io: any, entry: ToolAudit): Promise<void> {
  const args = JSON.stringify(entry.args ?? {}).slice(0, 300);
  const line = `AI co-sysop ${entry.tool}(${args}) -> ${entry.outcome}: ${entry.summary.slice(0, 200)}`;
console.log(`[Operator Chat] [tool] ${entry.username}@Node${entry.nodeId}: ${line}`);
  try {
    await callersLog(entry.userId, entry.username, 'AI co-sysop tool', line, entry.nodeId);
  } catch (err) {
console.log(`[Operator Chat] [tool] audit line not written (${(err as Error).message})`);
  }
  try {
    io?.to?.('sysops')?.emit?.('operator:tool-event', {
      pageId: entry.pageId,
      tool: entry.tool,
      args: entry.args,
      outcome: entry.outcome,
      summary: entry.summary,
      timestamp: Date.now(),
    });
  } catch { /* the admin's live view is a convenience; the log is the record */ }
}
