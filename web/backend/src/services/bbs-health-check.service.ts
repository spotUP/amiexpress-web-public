/**
 * BBS Health Check Service
 *
 * Comprehensive validation of the entire BBS filesystem structure.
 * Checks conferences, nodes, screens, doors, commands, protocols, and core files.
 *
 * Based on express.e structure requirements.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as amigafs from '../utils/amigafs';
import { conferenceDir, conferenceNumbers } from '../conferences/conference-paths';
import { buildScreenIndex, invalidateScreenIndex } from '../screens/screen-index.service';
import { commandLocationIsLive, loadCommandFromInfo } from '../utils/amiga-command-parser.util';
import { repairOneFile } from '../screens/screen-repair';
import { InfoFileParser } from './info-file-parser';
import { ConferenceSetupService } from './conference-setup.service';
import { getSystemTime } from '../utils/date-time.util';

/**
 * What this issue's auto-fix actually DOES, named rather than described.
 *
 * Dispatch used to read the prose: `description.includes('directory missing')`.
 * Only two spellings were ever matched, so eleven other issues declared
 * themselves auto-fixable, ran nothing, threw nothing, and were counted as
 * fixed - the health page reported "Fixed 47" over an untouched board. Naming
 * the fix means the executor can switch on it, and an issue with a kind
 * nothing handles fails loudly instead of lying.
 */
export type HealthFix =
  /** mkdir -p the issue's path. */
  | { kind: 'create-directory' }
  /** Create the issue's path as an empty file, which is what the board expects. */
  | { kind: 'create-file' }
  /** Put the escape byte back in front of a screen's colour codes. */
  | { kind: 'screen-escape-byte' }
  /** Create what a conference is missing, through ConferenceSetupService. */
  | { kind: 'conference-setup'; conferenceId: number };

export interface HealthIssue {
  severity: 'error' | 'warning' | 'info';
  category: string;
  description: string;
  path?: string;
  /**
   * Derived from `fix` when the report is assembled - never set at the place
   * an issue is raised, which is why it is optional here and always present on
   * the wire. Two fields that could disagree about whether something is
   * fixable is how they came to disagree.
   */
  autoFixable?: boolean;
  /** Absent when a person has to decide something. */
  fix?: HealthFix;
  fixAction?: string;
}

export interface HealthCheckResult {
  category: string;
  passed: boolean;
  issues: HealthIssue[];
  checkedCount: number;
  errorCount: number;
  warningCount: number;
}

export interface BBSHealthReport {
  timestamp: string;
  overallStatus: 'healthy' | 'warnings' | 'errors';
  totalIssues: number;
  autoFixableIssues: number;
  categories: HealthCheckResult[];
}

/**
 * A board directory, found the way the volume finds it.
 *
 * AmigaOS is case-insensitive and every board writes `Doors/`, while this check
 * looked for `doors/` - true on a developer's Mac, false in the Linux
 * container, where it reported "doors/ directory missing" and offered to
 * create a second one beside it.
 */
function boardDir(bbsRoot: string, name: string): string | null {
  return amigafs.findCaseInsensitive(bbsRoot, name);
}

export class BBSHealthCheckService {
  private bbsRoot: string;
  private conferenceSetup: ConferenceSetupService;

  constructor(bbsRoot: string) {
    this.bbsRoot = bbsRoot;
    this.conferenceSetup = new ConferenceSetupService(bbsRoot);
  }

  /**
   * Run full BBS health check
   */
  async runFullHealthCheck(): Promise<BBSHealthReport> {
    const categories: HealthCheckResult[] = [];

    // Check each category
    categories.push(await this.checkCoreFiles());
    categories.push(await this.checkConferences());
    categories.push(await this.checkNodes());
    categories.push(await this.checkScreens());
    categories.push(await this.checkScreenContents());
    categories.push(await this.checkCommands());
    categories.push(await this.checkDoors());
    categories.push(await this.checkProtocols());
    categories.push(await this.checkSystemDirectories());

    /*
     * `autoFixable` is DERIVED, here and nowhere else.
     *
     * It used to be typed in by hand beside each issue, and thirteen of them
     * claimed a fix that autoFixIssue had no branch for. Deriving it means the
     * button's count is the number of issues something will actually act on.
     */
    for (const category of categories) {
      for (const issue of category.issues) issue.autoFixable = issue.fix !== undefined;
    }

    // Calculate summary
    const totalIssues = categories.reduce((sum, cat) => sum + cat.issues.length, 0);
    const autoFixableIssues = categories.reduce(
      (sum, cat) => sum + cat.issues.filter(i => i.autoFixable).length,
      0
    );
    const hasErrors = categories.some(cat => cat.errorCount > 0);
    const hasWarnings = categories.some(cat => cat.warningCount > 0);

    return {
      timestamp: getSystemTime().toISOString(),
      overallStatus: hasErrors ? 'errors' : hasWarnings ? 'warnings' : 'healthy',
      totalIssues,
      autoFixableIssues,
      categories
    };
  }

  /**
   * Check core configuration files (express.e:31791-31868)
   */
  private async checkCoreFiles(): Promise<HealthCheckResult> {
    const issues: HealthIssue[] = [];

    // ConfConfig.info (express.e:31791 - NCONFS)
    const confConfigPath = path.join(this.bbsRoot, 'ConfConfig.info');
    if (!fs.existsSync(confConfigPath)) {
      issues.push({
        severity: 'error',
        category: 'Core Files',
        description: 'ConfConfig.info missing - conference system will not work',
        path: confConfigPath,
        fixAction: 'Create ConfConfig.info with at least NCONFS=1'
      });
    }

    // bbsConfig.info (system configuration)
    const bbsConfigPath = path.join(this.bbsRoot, 'bbsConfig.info');
    if (!fs.existsSync(bbsConfigPath)) {
      issues.push({
        severity: 'warning',
        category: 'Core Files',
        description: 'bbsConfig.info missing - using default system configuration',
        path: bbsConfigPath,
        fixAction: 'Create default bbsConfig.info'
      });
    }

    // Access.info (security levels - express.e uses this)
    const accessInfoPath = path.join(this.bbsRoot, 'Access.info');
    if (!fs.existsSync(accessInfoPath)) {
      issues.push({
        severity: 'warning',
        category: 'Core Files',
        description: 'Access.info missing - using default security levels',
        path: accessInfoPath,
        fixAction: 'Create default Access.info with security levels'
      });
    }

    // Users.DB (user database - express.e:31937)
    const usersDbPath = path.join(this.bbsRoot, 'Users.DB');
    if (!fs.existsSync(usersDbPath)) {
      issues.push({
        severity: 'info',
        category: 'Core Files',
        description: 'Users.DB not found - using SQLite database instead (modern approach)',
        path: usersDbPath
      });
    }

    return {
      category: 'Core Configuration Files',
      passed: issues.filter(i => i.severity === 'error').length === 0,
      issues,
      checkedCount: 4,
      errorCount: issues.filter(i => i.severity === 'error').length,
      warningCount: issues.filter(i => i.severity === 'warning').length
    };
  }

  /**
   * Check all conferences (express.e:31848-31869)
   */
  private async checkConferences(): Promise<HealthCheckResult> {
    const issues: HealthIssue[] = [];
    let conferenceCount = 0;

    try {
      // Use existing conference health check
      const healthChecks = await this.conferenceSetup.checkAllConferences();
      conferenceCount = healthChecks.length;

      for (const check of healthChecks) {
        for (const issue of check.issues) {
          issues.push({
            severity: 'error',
            category: 'Conferences',
            description: `Conf${check.conferenceId} (${check.conferenceName}): ${issue}`,
            // No `path` on purpose: what is missing is a set of files, and
            // ConferenceSetupService is what knows which. autoFixAll used to
            // require a path and skipped every one of these in silence.
            fix: check.canAutoFix
              ? { kind: 'conference-setup', conferenceId: check.conferenceId }
              : undefined,
            fixAction: check.canAutoFix ? 'Auto-fix will create missing files/directories' : 'Manual fix required'
          });
        }
      }
    } catch (error) {
      issues.push({
        severity: 'error',
        category: 'Conferences',
        description: `Failed to check conferences: ${error}`
      });
    }

    return {
      category: 'Conferences',
      passed: issues.length === 0,
      issues,
      checkedCount: conferenceCount,
      errorCount: issues.filter(i => i.severity === 'error').length,
      warningCount: issues.filter(i => i.severity === 'warning').length
    };
  }

  /**
   * Check node directories (express.e:31972 - nodeWorkDir)
   */
  private async checkNodes(): Promise<HealthCheckResult> {
    const issues: HealthIssue[] = [];

    // Read max nodes from config
    const maxNodes = 4; // Could read from bbsConfig.info

    for (let nodeNum = 0; nodeNum < maxNodes; nodeNum++) {
      const nodeDirPath = path.join(this.bbsRoot, `Node${nodeNum}`);

      if (!fs.existsSync(nodeDirPath)) {
        issues.push({
          severity: 'warning',
          category: 'Nodes',
          description: `Node${nodeNum}/ directory missing`,
          path: nodeDirPath,
          fix: { kind: 'create-directory' },
          fixAction: `Create Node${nodeNum}/ directory`
        });
        continue;
      }

      // Check node subdirectories (express.e:31972 - Work directory)
      const requiredDirs = ['Work'];
      for (const dir of requiredDirs) {
        const dirPath = path.join(nodeDirPath, dir);
        if (!fs.existsSync(dirPath)) {
          issues.push({
            severity: 'warning',
            category: 'Nodes',
            description: `Node${nodeNum}/${dir}/ directory missing`,
            path: dirPath,
            fix: { kind: 'create-directory' },
            fixAction: `Create Node${nodeNum}/${dir}/`
          });
        }
      }

      // Check for CallersLog
      const callersLogPath = path.join(nodeDirPath, 'CallersLog');
      if (!fs.existsSync(callersLogPath)) {
        issues.push({
          severity: 'info',
          category: 'Nodes',
          description: `Node${nodeNum}/CallersLog missing - will be created on first call`,
          path: callersLogPath,
          fix: { kind: 'create-file' },
          fixAction: `Create empty Node${nodeNum}/CallersLog`
        });
      }
    }

    return {
      category: 'Node Directories',
      passed: issues.filter(i => i.severity === 'error').length === 0,
      issues,
      checkedCount: maxNodes,
      errorCount: issues.filter(i => i.severity === 'error').length,
      warningCount: issues.filter(i => i.severity === 'warning').length
    };
  }

  /**
   * Check screen files (express.e:6544-6640 - screen directory mapping)
   *
   * Per express.e, screens use SPECIFIC directories:
   * - nodeScreenDir: Node{X}/ or Node{X}/Screens/ for LOGON, BBSTITLE, LOGOFF, JOIN, etc.
   * - confScreenDir: Conf{X}/Screens/ for MENU, CONF_BULL, DOWNLOADMSG, etc.
   * - cmds.bbsLoc: global Screens/ for BULL, GOODBYE
   */
  private async checkScreens(): Promise<HealthCheckResult> {
    const issues: HealthIssue[] = [];
    let checkedCount = 0;

    // Check global Screens/ directory exists
    const screensDirPath = path.join(this.bbsRoot, 'Screens');
    if (!fs.existsSync(screensDirPath)) {
      issues.push({
        severity: 'error',
        category: 'Screens',
        description: 'Screens/ directory missing - BBS will not display properly',
        path: screensDirPath,
        fix: { kind: 'create-directory' },
        fixAction: 'Create Screens/ directory'
      });
    }

    // Helper to check for screen file with any extension
    const screenExists = (dir: string, name: string): boolean => {
      const extensions = ['.SEQ', '.TXT', '.RIP', '.seq', '.txt', '.rip'];
      for (const ext of extensions) {
        if (fs.existsSync(path.join(dir, `${name}${ext}`))) return true;
      }
      return false;
    };

    // =========================================================
    // NODE SCREENS - must be in Node{X}/ or Node{X}/Screens/
    // express.e:6546-6634 - nodeScreenDir screens
    // =========================================================
    const nodeScreens = ['BBSTITLE', 'LOGON', 'LOGOFF', 'JOIN', 'JOINED'];
    const maxNodes = 4;

    for (let nodeNum = 0; nodeNum < maxNodes; nodeNum++) {
      const nodeDir = path.join(this.bbsRoot, `Node${nodeNum}`);
      const nodeScreensDir = path.join(nodeDir, 'Screens');

      if (!fs.existsSync(nodeDir)) continue; // Node dir checked elsewhere

      for (const screen of nodeScreens) {
        checkedCount++;
        // Check both Node{X}/ and Node{X}/Screens/
        const inNodeRoot = screenExists(nodeDir, screen);
        const inNodeScreens = fs.existsSync(nodeScreensDir) && screenExists(nodeScreensDir, screen);

        if (!inNodeRoot && !inNodeScreens) {
          // Only warn for Node0 (main node) - other nodes can inherit
          if (nodeNum === 0) {
            issues.push({
              severity: 'info',
              category: 'Screens',
              description: `Node0: ${screen} screen missing - check Node0/ or Node0/Screens/`,
              path: nodeScreensDir,
              fixAction: `Create ${screen}.SEQ or ${screen}.TXT in Node0/Screens/`
            });
          }
        }
      }
    }

    // =========================================================
    // CONF SCREENS - must be in Conf{X}/Screens/
    // express.e:6557-6608 - confScreenDir screens
    // =========================================================
    const confScreens = ['MENU'];

    // The FIRST conference, wherever it lives. `Conf1` is a directory name, not
    // a conference: this board's conference 1 is in Conf2, because deleting a
    // conference shifts the entries and leaves the directories alone.
    const firstConference = conferenceNumbers(this.bbsRoot)[0];
    const confScreensDir = firstConference === undefined
      ? null
      : path.join(conferenceDir(this.bbsRoot, firstConference), 'Screens');

    if (confScreensDir && fs.existsSync(confScreensDir)) {
      const label = path.basename(path.dirname(confScreensDir));
      for (const screen of confScreens) {
        checkedCount++;
        if (!screenExists(confScreensDir, screen)) {
          issues.push({
            severity: 'warning',
            category: 'Screens',
            description: `${label}: ${screen} screen missing (.SEQ or .TXT)`,
            path: confScreensDir,
            fixAction: `Create ${screen}.SEQ or ${screen}.TXT in ${label}/Screens/`
          });
        }
      }
    }

    // =========================================================
    // GLOBAL SCREENS - in Screens/ directory
    // express.e:6548-6550, 6637-6640 - cmds.bbsLoc screens
    // =========================================================
    const globalScreens = ['GOODBYE'];

    if (fs.existsSync(screensDirPath)) {
      for (const screen of globalScreens) {
        checkedCount++;
        if (!screenExists(screensDirPath, screen)) {
          issues.push({
            severity: 'info',
            category: 'Screens',
            description: `${screen} screen missing from global Screens/`,
            path: screensDirPath,
            fixAction: `Create ${screen}.SEQ or ${screen}.TXT in Screens/`
          });
        }
      }
    }

    return {
      category: 'Screen Files',
      passed: issues.filter(i => i.severity === 'error').length === 0,
      issues,
      checkedCount,
      errorCount: issues.filter(i => i.severity === 'error').length,
      warningCount: issues.filter(i => i.severity === 'warning').length
    };
  }

  /**
   * Check command files (express.e uses Commands/BBSCmd and Commands/SysCmd)
   */
  private async checkCommands(): Promise<HealthCheckResult> {
    const issues: HealthIssue[] = [];

    // Check Commands directory
    const commandsDirPath = path.join(this.bbsRoot, 'Commands');
    if (!fs.existsSync(commandsDirPath)) {
      issues.push({
        severity: 'error',
        category: 'Commands',
        description: 'Commands/ directory missing - no commands available',
        path: commandsDirPath,
        fix: { kind: 'create-directory' },
        fixAction: 'Create Commands/ directory with BBSCmd/ and SysCmd/ subdirectories'
      });
      return {
        category: 'Command Files',
        passed: false,
        issues,
        checkedCount: 0,
        errorCount: 1,
        warningCount: 0
      };
    }

    // Check BBSCmd and SysCmd directories
    const bbsCmdPath = path.join(commandsDirPath, 'BBSCmd');
    const sysCmdPath = path.join(commandsDirPath, 'SysCmd');

    if (!fs.existsSync(bbsCmdPath)) {
      issues.push({
        severity: 'error',
        category: 'Commands',
        description: 'Commands/BBSCmd/ directory missing',
        path: bbsCmdPath,
        fix: { kind: 'create-directory' },
        fixAction: 'Create Commands/BBSCmd/ directory'
      });
    }

    if (!fs.existsSync(sysCmdPath)) {
      issues.push({
        severity: 'warning',
        category: 'Commands',
        description: 'Commands/SysCmd/ directory missing',
        path: sysCmdPath,
        fix: { kind: 'create-directory' },
        fixAction: 'Create Commands/SysCmd/ directory'
      });
    }

    // Count command .info files
    let commandCount = 0;
    if (fs.existsSync(bbsCmdPath)) {
      const bbsCommands = fs.readdirSync(bbsCmdPath).filter(f => f.endsWith('.info'));
      commandCount += bbsCommands.length;
    }
    if (fs.existsSync(sysCmdPath)) {
      const sysCommands = fs.readdirSync(sysCmdPath).filter(f => f.endsWith('.info'));
      commandCount += sysCommands.length;
    }

    if (commandCount === 0) {
      issues.push({
        severity: 'warning',
        category: 'Commands',
        description: 'No command .info files found - BBS will have limited functionality',
        fixAction: 'Install command .info files in Commands/BBSCmd/'
      });
    }

    /*
     * A registration whose door is gone.
     *
     * The icon still OWNS the command name - dispatch finds it and answers
     * with an error rather than falling through - so an uninstalled door does
     * not merely stop working, it can shadow a working command. A Doors/ wipe
     * on 30 August left 277 of these, one of them registered under the
     * internal goodbye command's name, and logging off was impossible until
     * the .info was removed by hand.
     *
     * commandLocationIsLive is the board's own rule, the same one the loader
     * uses when it decides to skip a registration, so this cannot disagree
     * with what actually runs. Reported because a sysop asked for exactly it:
     * "we have an mci command that doesnt find its door as its not installed
     * but its not listed as a health issue".
     */
    for (const dir of [bbsCmdPath, sysCmdPath]) {
      if (!fs.existsSync(dir)) continue;

      for (const entry of fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.info'))) {
        const full = path.join(dir, entry);
        let definition;
        try {
          definition = loadCommandFromInfo(full);
        } catch {
          continue;
        }
        if (!definition || commandLocationIsLive(this.bbsRoot, definition)) continue;

        issues.push({
          severity: 'warning',
          category: 'Commands',
          description:
            `${entry.replace(/\.info$/i, '')} is registered but its door is not installed`
            + ` - LOCATION is ${definition.location}`,
          path: full,
          fixAction:
            'Install the door, or remove the .info so the command name is free again',
        });
      }
    }

    return {
      category: 'Command Files',
      passed: issues.filter(i => i.severity === 'error').length === 0,
      issues,
      checkedCount: commandCount,
      errorCount: issues.filter(i => i.severity === 'error').length,
      warningCount: issues.filter(i => i.severity === 'warning').length
    };
  }

  /**
   * Check door programs
   */
  private async checkDoors(): Promise<HealthCheckResult> {
    const issues: HealthIssue[] = [];

    const doorsDirPath = boardDir(this.bbsRoot, 'Doors') ?? path.join(this.bbsRoot, 'Doors');
    if (!boardDir(this.bbsRoot, 'Doors')) {
      issues.push({
        severity: 'info',
        category: 'Doors',
        description: 'Doors/ directory missing - no external programs available',
        path: doorsDirPath,
        fix: { kind: 'create-directory' },
        fixAction: 'Create Doors/ directory'
      });
      return {
        category: 'Door Programs',
        passed: true,
        issues,
        checkedCount: 0,
        errorCount: 0,
        warningCount: 0
      };
    }

    // Count door .info files
    const doorInfoFiles: string[] = [];
    const searchDoors = (dir: string) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            searchDoors(fullPath);
          } else if (entry.name.endsWith('.info') && !entry.name.includes('disk.info')) {
            doorInfoFiles.push(fullPath);
          }
        }
      } catch (error) {
        // Ignore read errors
      }
    };

    searchDoors(doorsDirPath);

    if (doorInfoFiles.length === 0) {
      issues.push({
        severity: 'info',
        category: 'Doors',
        description: 'No door .info files found - install doors to add games/utilities'
      });
    }

    return {
      category: 'Door Programs',
      passed: true,
      issues,
      checkedCount: doorInfoFiles.length,
      errorCount: 0,
      warningCount: 0
    };
  }

  /**
   * Check protocol files (XPR libraries)
   */
  private async checkProtocols(): Promise<HealthCheckResult> {
    const issues: HealthIssue[] = [];

    const protocolsDirPath = path.join(this.bbsRoot, 'Protocols');
    if (!fs.existsSync(protocolsDirPath)) {
      issues.push({
        severity: 'warning',
        category: 'Protocols',
        description: 'Protocols/ directory missing - file transfers may not work',
        path: protocolsDirPath,
        fix: { kind: 'create-directory' },
        fixAction: 'Create Protocols/ directory'
      });
      return {
        category: 'File Transfer Protocols',
        passed: false,
        issues,
        checkedCount: 0,
        errorCount: 0,
        warningCount: 1
      };
    }

    // Every file in the directory, and the XPR ones among them.
    //
    // AmiExpress writes `XprZmodem.info`, and this matched `xpr` in lower case
    // only - so a board with eight registered protocols was told it had none.
    // The volume is case-insensitive; so is this now.
    const protocolFiles = fs.readdirSync(protocolsDirPath);
    const xprFiles = protocolFiles.filter(f => {
      const lower = f.toLowerCase();
      return lower.startsWith('xpr') || lower.endsWith('.xpr');
    });

    if (xprFiles.length === 0) {
      issues.push({
        severity: 'warning',
        category: 'Protocols',
        description: 'No XPR protocol files found - file transfers will use built-in protocols only',
        fixAction: 'Install XPR protocol libraries (xprzmodem, xprymodem, etc.)'
      });
    }

    return {
      category: 'File Transfer Protocols',
      passed: true,
      issues,
      // What was LOOKED AT, not what matched: reporting "checked 0" beside a
      // finding is how a check makes a sysop distrust it.
      checkedCount: protocolFiles.length,
      errorCount: 0,
      warningCount: issues.filter(i => i.severity === 'warning').length
    };
  }

  /**
   * What the screen index knows that a health check should say out loud.
   *
   * The manager has been reporting these per file for a while - screens whose
   * colour codes lost their escape byte, screens nothing reads - and a sysop
   * looking at the health page had no way to learn about them. Same facts, one
   * more place, asked for directly.
   *
   * The damaged ones are auto-fixable: putting an escape byte back is
   * mechanical, and the repair writes a backup. The unread ones are NOT - a
   * file nothing reads today is somebody's art, and deleting it is a decision.
   */
  private async checkScreenContents(): Promise<HealthCheckResult> {
    const issues: HealthIssue[] = [];
    let checkedCount = 0;

    try {
      const index = buildScreenIndex(this.bbsRoot);
      const files = Object.values(index.files);
      checkedCount = files.length;

      const damaged = files.filter(f => f.problems?.includes('colour-codes-without-escape'));
      for (const file of damaged) {
        issues.push({
          severity: 'warning',
          category: 'Screens',
          description: `${file.relPath}: colour codes have no escape byte - callers see the codes as text`,
          path: path.join(this.bbsRoot, file.relPath),
          fix: { kind: 'screen-escape-byte' },
          fixAction: 'Put the escape byte back (a backup is written first)'
        });
      }

      /*
       * A screen is a PROGRAM. `~CC_<name>` is a menu item: the caller presses
       * the key, the board looks for that command, and when the door behind it
       * is not installed nothing happens - no error, no message, just a key
       * that does nothing on a screen that still advertises it.
       *
       * Reported 2026-09-02 from the live board: the conference-join screen
       * offers a conference request that runs a door this board does not have.
       * The file panel had been saying so per file all along; the health page,
       * which is where a sysop looks for what is wrong, said nothing.
       *
       * Grouped by the CODE, not the file. This board carries 153 files with a
       * dead reference and exactly FOUR distinct dead codes - 42 copies of one
       * Logoff.txt, 58 of one logon20.txt. A list of 153 is a list nobody
       * reads, and the fix is one decision per code, not per copy.
       *
       * Not auto-fixable either way. The board cannot know whether the answer
       * is to install the door or to stop advertising it.
       */
      const deadRefs = new Map<string, string[]>();
      for (const file of files) {
        for (const ref of file.mci ?? []) {
          if (ref.resolves) continue;
          const code = `~${ref.code}_${ref.target}`;
          if (!deadRefs.has(code)) deadRefs.set(code, []);
          deadRefs.get(code)!.push(file.relPath);
        }
      }

      for (const [code, carriers] of [...deadRefs].sort((a, b) => b[1].length - a[1].length)) {
        const where = carriers.length === 1
          ? carriers[0]
          : `${carriers[0]} and ${carriers.length - 1} other screen${carriers.length === 2 ? '' : 's'}`;
        issues.push({
          severity: 'warning',
          category: 'Screens',
          description:
            `${code} points at something this board does not have`
            + ` - a caller pressing that key gets nothing (${where})`,
          // The first carrier, so the sysop has somewhere to open.
          path: path.join(this.bbsRoot, carriers[0]),
          fixAction: 'Install the missing door or screen, or take the code out',
        });
      }

      const empty = files.filter(f => f.problems?.includes('empty'));
      for (const file of empty) {
        issues.push({
          severity: 'info',
          category: 'Screens',
          description: `${file.relPath}: empty, so it draws nothing`,
          path: path.join(this.bbsRoot, file.relPath),
          fixAction: 'Draw something, or delete it'
        });
      }

      if (index.unused.length > 0) {
        issues.push({
          severity: 'info',
          category: 'Screens',
          description:
            `${index.unused.length} screen file(s) no screen reads - at any security level, `
            + 'in any screen type, and no other screen includes them',
          path: this.bbsRoot,
          fixAction: 'Look at them in Screen Files before removing any - art nobody reads is still art'
        });
      }
    } catch (error) {
      issues.push({
        severity: 'warning',
        category: 'Screens',
        description: `Could not read the screen index: ${(error as Error).message}`,
        path: this.bbsRoot,
        fixAction: 'Manual fix required'
      });
    }

    return {
      category: 'Screen Contents',
      passed: issues.every(i => i.severity === 'info'),
      issues,
      checkedCount,
      errorCount: issues.filter(i => i.severity === 'error').length,
      warningCount: issues.filter(i => i.severity === 'warning').length,
    };
  }

  /**
   * Check system directories (express.e creates these at runtime)
   */
  private async checkSystemDirectories(): Promise<HealthCheckResult> {
    const issues: HealthIssue[] = [];

    const systemDirs = [
      { name: 'SysopStats', critical: false, description: 'System statistics storage' },
      { name: 'Logs', critical: false, description: 'System log files' },
      { name: 'Utils', critical: false, description: 'Utility programs' },
      { name: 'Libs', critical: false, description: 'Shared libraries' }
    ];

    for (const sysDir of systemDirs) {
      const dirPath = path.join(this.bbsRoot, sysDir.name);
      if (!fs.existsSync(dirPath)) {
        issues.push({
          severity: sysDir.critical ? 'error' : 'info',
          category: 'System Directories',
          description: `${sysDir.name}/ directory missing - ${sysDir.description}`,
          path: dirPath,
          fix: { kind: 'create-directory' },
          fixAction: `Create ${sysDir.name}/ directory`
        });
      }
    }

    return {
      category: 'System Directories',
      passed: issues.filter(i => i.severity === 'error').length === 0,
      issues,
      checkedCount: systemDirs.length,
      errorCount: issues.filter(i => i.severity === 'error').length,
      warningCount: issues.filter(i => i.severity === 'warning').length
    };
  }

  /**
   * Auto-fix all fixable issues
   */
  /**
   * Every issue that carries a fix, applied.
   *
   * A failure is REPORTED, not swallowed: this used to count an issue as fixed
   * whenever autoFixIssue returned, and autoFixIssue returned immediately for
   * everything it had no branch for. A sysop pressed Auto-Fix, read "Fixed 47
   * issues", re-ran the check and saw the same 47 - which is a worse bug than
   * having no button, because it costs a person their trust in the page.
   */
  async autoFixAll(report: BBSHealthReport): Promise<{ fixed: number; failed: number; failures: string[] }> {
    let fixed = 0;
    const failures: string[] = [];

    for (const category of report.categories) {
      for (const issue of category.issues) {
        if (!issue.fix) continue;

        try {
          await this.autoFixIssue(issue);
          fixed++;
          console.log(`[HealthCheck] Fixed: ${issue.description}`);
        } catch (error) {
          failures.push(`${issue.description}: ${(error as Error).message}`);
          console.error(`[HealthCheck] Failed to fix: ${issue.description}`, error);
        }
      }
    }

    return { fixed, failed: failures.length, failures };
  }

  /**
   * One issue's fix, chosen by what it says it is.
   *
   * Dispatch reads `fix.kind`, not the description prose. A kind with no
   * branch THROWS - the point of the exhaustive default is that adding a fix
   * kind and forgetting to implement it fails at the type check, and failing
   * that, fails out loud at the sysop rather than reporting success.
   */
  private async autoFixIssue(issue: HealthIssue): Promise<void> {
    const fix = issue.fix;
    if (!fix) throw new Error('No fix is defined for this issue');

    switch (fix.kind) {
      case 'create-directory': {
        if (!issue.path) throw new Error('No path to create');
        fs.mkdirSync(issue.path, { recursive: true });
        return;
      }

      case 'create-file': {
        if (!issue.path) throw new Error('No path to create');
        fs.mkdirSync(path.dirname(issue.path), { recursive: true });
        fs.writeFileSync(issue.path, '', 'utf8');
        return;
      }

      case 'screen-escape-byte': {
        if (!issue.path) throw new Error('No screen to repair');
        const outcome = repairOneFile(issue.path);
        if ('refused' in outcome) throw new Error(outcome.refused);
        // The index caches per-file facts on size and mtime, and the repair
        // changed both - but the damaged-file list is the index's, so it has
        // to be rebuilt before the page asks again.
        invalidateScreenIndex();
        return;
      }

      case 'conference-setup': {
        const check = this.conferenceSetup.checkConferenceHealthSync(fix.conferenceId);
        await this.conferenceSetup.autoFixConference(fix.conferenceId, check);
        return;
      }

      default: {
        const unhandled: never = fix;
        throw new Error(`No auto-fix is implemented for ${JSON.stringify(unhandled)}`);
      }
    }
  }
}
