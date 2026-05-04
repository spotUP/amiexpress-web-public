/**
 * AquaScan runtime trace.
 *
 * One-shot diagnostic to capture every XIM DT_* request and DOS file op an
 * AquaScan binary makes during a single run, so the "Scanning dir 1 for
 * 00:00:00" mystery can be solved by observing what AquaScan actually reads.
 *
 * Activation: `AQUASCAN_TRACE=1` env var, OR `start(doorPath)` is called
 * with a path matching /aquascan/i. Output goes to logs/aquascan-trace.log.
 *
 * Each call is a no-op when the trace is not active, so the cost in normal
 * operation is a single boolean check.
 */

import * as fs from 'fs';
import * as path from 'path';

class AquaScanTrace {
  private active = false;
  private logPath: string;
  private startTime = 0;

  constructor() {
    const projectRoot = path.resolve(__dirname, '../../../..');
    this.logPath = path.join(projectRoot, 'logs', 'aquascan-trace.log');
    if (process.env.AQUASCAN_TRACE === '1') {
      this.start('env:AQUASCAN_TRACE');
    }
  }

  start(label: string): void {
    if (this.active) return;
    this.active = true;
    this.startTime = Date.now();
    try {
      fs.mkdirSync(path.dirname(this.logPath), { recursive: true });
      const banner = `\n=== AQUASCAN TRACE START ${new Date().toISOString()} label=${label} ===\n`;
      fs.appendFileSync(this.logPath, banner);
    } catch {
      // ignore
    }
  }

  /** Auto-start if the door path looks like AquaScan. */
  startIfAquaScan(doorPath: string | undefined): void {
    if (!doorPath) return;
    if (this.active) return;
    if (/aquascan/i.test(doorPath)) this.start(`door:${doorPath}`);
  }

  stop(reason: string): void {
    if (!this.active) return;
    try {
      const ms = Date.now() - this.startTime;
      fs.appendFileSync(this.logPath, `=== AQUASCAN TRACE END ${reason} (+${ms}ms) ===\n\n`);
    } catch {
      // ignore
    }
    this.active = false;
  }

  isActive(): boolean {
    return this.active;
  }

  private write(line: string): void {
    if (!this.active) return;
    try {
      const ms = Date.now() - this.startTime;
      fs.appendFileSync(this.logPath, `[+${ms.toString().padStart(6, ' ')}ms] ${line}\n`);
    } catch {
      // ignore
    }
  }

  xim(cmdName: string, isRead: boolean, info: string): void {
    if (!this.active) return;
    const dir = isRead ? 'READ ' : 'WRITE';
    this.write(`XIM  ${dir} ${cmdName.padEnd(20)} ${info}`);
  }

  dos(op: string, amiPath: string, info: string): void {
    if (!this.active) return;
    this.write(`DOS  ${op.padEnd(8)} ${amiPath.padEnd(48)} ${info}`);
  }
}

export const aquascanTrace = new AquaScanTrace();
