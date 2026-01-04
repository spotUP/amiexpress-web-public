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
import { InfoFileParser } from './info-file-parser';
import { ConferenceSetupService } from './conference-setup.service';

export interface HealthIssue {
  severity: 'error' | 'warning' | 'info';
  category: string;
  description: string;
  path?: string;
  autoFixable: boolean;
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
    categories.push(await this.checkCommands());
    categories.push(await this.checkDoors());
    categories.push(await this.checkProtocols());
    categories.push(await this.checkSystemDirectories());

    // Calculate summary
    const totalIssues = categories.reduce((sum, cat) => sum + cat.issues.length, 0);
    const autoFixableIssues = categories.reduce(
      (sum, cat) => sum + cat.issues.filter(i => i.autoFixable).length,
      0
    );
    const hasErrors = categories.some(cat => cat.errorCount > 0);
    const hasWarnings = categories.some(cat => cat.warningCount > 0);

    return {
      timestamp: new Date().toISOString(),
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
        autoFixable: false,
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
        autoFixable: true,
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
        autoFixable: true,
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
        path: usersDbPath,
        autoFixable: false
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
            autoFixable: check.canAutoFix,
            fixAction: check.canAutoFix ? 'Auto-fix will create missing files/directories' : 'Manual fix required'
          });
        }
      }
    } catch (error) {
      issues.push({
        severity: 'error',
        category: 'Conferences',
        description: `Failed to check conferences: ${error}`,
        autoFixable: false
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
          autoFixable: true,
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
            autoFixable: true,
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
          autoFixable: true,
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
        autoFixable: true,
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
              autoFixable: false,
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

    // Check at least Conf1 has MENU
    const conf1ScreensDir = path.join(this.bbsRoot, 'Conf1', 'Screens');
    if (fs.existsSync(conf1ScreensDir)) {
      for (const screen of confScreens) {
        checkedCount++;
        if (!screenExists(conf1ScreensDir, screen)) {
          issues.push({
            severity: 'warning',
            category: 'Screens',
            description: `Conf1: ${screen} screen missing (.SEQ or .TXT)`,
            path: conf1ScreensDir,
            autoFixable: false,
            fixAction: `Create ${screen}.SEQ or ${screen}.TXT in Conf1/Screens/`
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
            autoFixable: false,
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
        autoFixable: true,
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
        autoFixable: true,
        fixAction: 'Create Commands/BBSCmd/ directory'
      });
    }

    if (!fs.existsSync(sysCmdPath)) {
      issues.push({
        severity: 'warning',
        category: 'Commands',
        description: 'Commands/SysCmd/ directory missing',
        path: sysCmdPath,
        autoFixable: true,
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
        autoFixable: false,
        fixAction: 'Install command .info files in Commands/BBSCmd/'
      });
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

    const doorsDirPath = path.join(this.bbsRoot, 'doors');
    if (!fs.existsSync(doorsDirPath)) {
      issues.push({
        severity: 'info',
        category: 'Doors',
        description: 'doors/ directory missing - no external programs available',
        path: doorsDirPath,
        autoFixable: true,
        fixAction: 'Create doors/ directory'
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
        description: 'No door .info files found - install doors to add games/utilities',
        autoFixable: false
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
        autoFixable: true,
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

    // Check for XPR protocol files
    const xprFiles = fs.readdirSync(protocolsDirPath).filter(f => f.startsWith('xpr') || f.endsWith('.xpr'));

    if (xprFiles.length === 0) {
      issues.push({
        severity: 'warning',
        category: 'Protocols',
        description: 'No XPR protocol files found - file transfers will use built-in protocols only',
        autoFixable: false,
        fixAction: 'Install XPR protocol libraries (xprzmodem, xprymodem, etc.)'
      });
    }

    return {
      category: 'File Transfer Protocols',
      passed: true,
      issues,
      checkedCount: xprFiles.length,
      errorCount: 0,
      warningCount: issues.filter(i => i.severity === 'warning').length
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
          autoFixable: true,
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
  async autoFixAll(report: BBSHealthReport): Promise<{ fixed: number; failed: number }> {
    let fixed = 0;
    let failed = 0;

    for (const category of report.categories) {
      for (const issue of category.issues) {
        if (!issue.autoFixable || !issue.path) continue;

        try {
          await this.autoFixIssue(issue);
          fixed++;
console.log(`[HealthCheck] Fixed: ${issue.description}`);
        } catch (error) {
          failed++;
console.error(`[HealthCheck] Failed to fix: ${issue.description}`, error);
        }
      }
    }

    return { fixed, failed };
  }

  /**
   * Auto-fix a single issue
   */
  private async autoFixIssue(issue: HealthIssue): Promise<void> {
    if (!issue.path) return;

    // Determine what type of fix is needed
    if (issue.description.includes('directory missing')) {
      // Create missing directory
      fs.mkdirSync(issue.path, { recursive: true });
    } else if (issue.description.includes('file missing')) {
      // Create empty file
      fs.writeFileSync(issue.path, '', 'utf8');
    }
    // Other fixes handled by category-specific services
  }
}
