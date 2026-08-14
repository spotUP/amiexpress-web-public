import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';
import { getExtractorForFile, ArchiveEntry } from '../utils/archive-extractor';
import { registerDoor } from '../services/door-install.service';
import { refreshDoorCache } from './amigaDoorManager';
import { parseInfoFile } from '../utils/info-file.util';
import * as amigafs from '../utils/amigafs';

const execAsync = promisify(exec);

export interface InstallResult {
  success: boolean;
  message: string;
  doorName?: string;
  command?: string;
  type?: string;
}

export class DoorInstaller {
  constructor(private readonly bbsRoot: string) {}

  async install(archivePath: string): Promise<InstallResult> {
    const extractor = await getExtractorForFile(archivePath);
    if (!extractor) {
      return { success: false, message: `Unsupported archive format: ${path.basename(archivePath)}` };
    }

    let entries: ArchiveEntry[];
    try {
      entries = await extractor.getEntries(archivePath);
    } catch (err) {
      return { success: false, message: `Extraction failed: ${(err as Error).message}` };
    }

    // Path traversal guard
    for (const entry of entries) {
      if (entry.name.includes('..') || path.isAbsolute(entry.name)) {
        return { success: false, message: `Unsafe path in archive: ${entry.name}` };
      }
    }

    const strippedEntries = stripTopLevelDir(entries);
    const detection = detectArchiveType(strippedEntries);
    if (!detection) {
      const listing = strippedEntries.map(e => e.name).slice(0, 20).join(', ');
      return { success: false, message: `Cannot detect door type. Contents: ${listing}` };
    }

    const doorName = detection.type === 'typescript'
      ? detection.pkgName!
      : path.basename(archivePath, path.extname(archivePath)).toLowerCase().replace(/\s+/g, '-');

    const doorDir = path.join(this.bbsRoot, 'Doors', doorName);
    if (amigafs.existsSync(doorDir)) {
      return { success: false, message: `Door directory already exists: Doors/${doorName}` };
    }

    try {
      fs.mkdirSync(doorDir, { recursive: true });
      for (const entry of strippedEntries) {
        if (!entry.data) continue;
        const dest = path.join(doorDir, entry.name);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, entry.data);
      }
    } catch (err) {
      fs.rmSync(doorDir, { recursive: true, force: true });
      return { success: false, message: `Failed to write files: ${(err as Error).message}` };
    }

    if (detection.type === 'typescript') {
      return this.registerTypeScriptDoor(doorDir, doorName);
    } else {
      return this.register68KDoor(doorDir, doorName, detection.infoEntryName!, strippedEntries);
    }
  }

  private async registerTypeScriptDoor(doorDir: string, doorName: string): Promise<InstallResult> {
    const bbsCommandsDir = path.join(this.bbsRoot, 'Commands', 'BBSCmd');

    const pkgPath = path.join(doorDir, 'package.json');
    let pkg: any = {};
    try { pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')); } catch { /* ignore */ }

    // Normalize: promote amiexpress.command / doorMetadata.command to bbsCommand
    if (!pkg.bbsCommand && (pkg.amiexpress?.command || pkg.doorMetadata?.command)) {
      pkg.bbsCommand = (pkg.amiexpress?.command || pkg.doorMetadata?.command).toUpperCase();
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
    }

    // Build if needed
    const entryPoint = pkg.main || 'dist/index.js';
    if (!fs.existsSync(path.join(doorDir, entryPoint))) {
      try {
        await execAsync('npm install && npm run build', { cwd: doorDir, timeout: 120_000 });
      } catch (err) {
        fs.rmSync(doorDir, { recursive: true, force: true });
        return {
          success: false,
          message: `Build failed: ${(err as any).stderr || (err as Error).message}`,
        };
      }
    }

    const result = registerDoor({ doorPath: doorDir, bbsCommandsDir, force: false });
    if (result.status === 'created' || result.status === 'overwritten') {
      await this.reload();
      return {
        success: true,
        message: `Installed TypeScript door: ${result.bbsCommand}`,
        doorName,
        command: result.bbsCommand,
        type: 'typescript',
      };
    }
    return { success: false, message: `Registration failed: ${result.message ?? result.status}` };
  }

  private async register68KDoor(
    doorDir: string,
    doorName: string,
    infoEntryName: string,
    entries: ArchiveEntry[],
  ): Promise<InstallResult> {
    const bbsCommandsDir = path.join(this.bbsRoot, 'Commands', 'BBSCmd');
    const infoPath = path.join(doorDir, infoEntryName);

    let tooltypes: Array<{ key: string; value: string; commented: boolean }> = [];
    try {
      const parsed = parseInfoFile(infoPath);
      tooltypes = parsed.tooltypes;
    } catch {
      const text = fs.readFileSync(infoPath, 'utf8');
      tooltypes = text.split('\n')
        .filter(l => l.includes('='))
        .map(l => {
          const [key, ...rest] = l.split('=');
          return { key: key.trim(), value: rest.join('=').trim(), commented: false };
        });
    }

    const get = (key: string) =>
      tooltypes.find(t => t.key.toUpperCase() === key)?.value ?? '';

    const cmdName = (get('BBSCMD') || get('CMDNAME') || path.basename(infoEntryName, '.info')).toUpperCase();
    if (!/^[A-Z0-9\-_]{1,20}$/.test(cmdName)) {
      fs.rmSync(doorDir, { recursive: true, force: true });
      return { success: false, message: `Invalid command name in archive .info: '${cmdName}'` };
    }
    const rawLocation = get('LOCATION') || '';
    const execName = rawLocation
      ? rawLocation.replace(/^DOORS:/i, '').replace(/:/g, '/').split('/').pop() || doorName
      : doorName;
    const location = `Doors/${doorName}/${execName}`;

    if (!fs.existsSync(bbsCommandsDir)) fs.mkdirSync(bbsCommandsDir, { recursive: true });

    const binEntry = entries.find(
      e => e.data && e.name !== infoEntryName &&
        (!e.name.includes('.') || /\.(exe|xim|aim|sim|tim|fim)$/i.test(e.name)),
    );
    const doorType = binEntry?.data ? detectDoorType(Buffer.from(binEntry.data)) : 'XIM';

    const outInfoPath = path.join(bbsCommandsDir, `${cmdName}.info`);
    const description = get('DESCRIPTION') || get('TOOLTIP') || '';
    const access = get('ACCESS') || '0';
    const lines = [
      `BBSCMD=${cmdName}`,
      `TYPE=${doorType}`,
      `LOCATION=${location}`,
      description ? `DESCRIPTION=${description}` : null,
      `ACCESS=${access}`,
    ].filter(Boolean).join('\n');

    fs.writeFileSync(outInfoPath, lines);
    await this.reload();

    return { success: true, message: `Installed 68K door: ${cmdName}`, doorName, command: cmdName, type: doorType };
  }

  private async reload(): Promise<void> {
    await refreshDoorCache();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { initializeDoors } = require('../handlers/door.handler');
    await initializeDoors();
  }
}

function stripTopLevelDir(
  entries: ArchiveEntry[],
): ArchiveEntry[] {
  const nonEmpty = entries.filter(e => e.name && e.name !== '/');
  if (nonEmpty.length === 0) return entries;
  const parts = nonEmpty[0].name.split('/');
  if (parts.length < 2) return entries;
  const prefix = parts[0] + '/';
  const allShare = nonEmpty.every(e => e.name.startsWith(prefix) || e.name === prefix.slice(0, -1));
  if (!allShare) return entries;
  return nonEmpty
    .filter(e => e.name !== prefix.slice(0, -1))
    .map(e => ({ ...e, name: e.name.slice(prefix.length) }))
    .filter(e => e.name.length > 0);
}

interface Detection {
  type: 'typescript' | '68k';
  pkgName?: string;
  infoEntryName?: string;
}

function detectArchiveType(
  entries: ArchiveEntry[],
): Detection | null {
  const pkgEntry = entries.find(e => e.name === 'package.json');
  if (pkgEntry?.data) {
    try {
      const pkg = JSON.parse(pkgEntry.data.toString('utf8'));
      const name: string = (pkg.name || 'door').toLowerCase().replace(/\s+/g, '-');
      return { type: 'typescript', pkgName: name };
    } catch { /* fall through */ }
  }

  const infoEntry = entries.find(e => e.name.toLowerCase().endsWith('.info') && !e.name.includes('/'));
  const hasExecutable = entries.some(
    e => !e.name.includes('.') || /\.(exe|xim|aim|sim|tim)$/i.test(e.name),
  );
  if (infoEntry && hasExecutable) {
    return { type: '68k', infoEntryName: infoEntry.name };
  }

  return null;
}

/**
 * Sniff a 68K door binary's IPC engine from its raw bytes.
 *
 * Runs after the caller has already confirmed the buffer is a native Amiga
 * executable (Amiga hunk-magic 0x000003F3 header). Binaries are latin-1
 * Amiga content, so we search bytes with a latin1-encoded needle rather than
 * decoding as UTF-8 (which would corrupt high-bit bytes).
 *
 * FAMEDoorPort is checked before AEDoorPort: FAME (FIM) doors can carry
 * generic Amiga door-port scaffolding alongside their FAME-specific IPC
 * port name, so checking AEDoorPort first would misclassify a FAME binary
 * as XIM. DoorControl (SIM) is checked last since it names a generic
 * message port shared by SIM/TIM/IIM/SUP doors.
 */
export function detectDoorType(buf: Buffer): string {
  if (buf.includes(Buffer.from('FAMEDoorPort', 'latin1'))) return 'FIM';
  if (buf.includes(Buffer.from('AEDoorPort', 'latin1'))) return 'XIM';
  if (buf.includes(Buffer.from('DoorControl', 'latin1'))) return 'SIM';
  return 'XIM';
}
