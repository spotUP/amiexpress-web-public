/**
 * XIM Issue Knowledge Base
 *
 * Provides access to curated database of common 68K door issues
 * with solutions, code examples, and references.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface IssueRecord {
  id: string;
  title: string;
  severity: 'critical' | 'warning' | 'info';
  pattern: string;
  symptoms: string[];
  rootCause: string;
  solution: string;
  codeExample?: {
    before: string;
    after: string;
  };
  references: string[];
  affectedDoors: string[];
  confidence: number;
}

export interface IssueDatabase {
  version: string;
  lastUpdated: string;
  issues: IssueRecord[];
}

export class XIMIssueKnowledgeBase {
  private database: IssueDatabase | null = null;
  private dbPath: string;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || path.join(__dirname, 'xim-issue-database.json');
  }

  /**
   * Load the issue database from disk
   */
  load(): void {
    if (!fs.existsSync(this.dbPath)) {
      throw new Error(`Issue database not found: ${this.dbPath}`);
    }

    const content = fs.readFileSync(this.dbPath, 'utf-8');
    this.database = JSON.parse(content);
  }

  /**
   * Get issue by ID
   */
  getIssue(id: string): IssueRecord | null {
    if (!this.database) this.load();

    const issue = this.database!.issues.find(i => i.id === id);
    return issue || null;
  }

  /**
   * Get all issues matching a pattern
   */
  getIssuesByPattern(pattern: string): IssueRecord[] {
    if (!this.database) this.load();

    return this.database!.issues.filter(i => i.pattern === pattern);
  }

  /**
   * Get issues by severity
   */
  getIssuesBySeverity(severity: 'critical' | 'warning' | 'info'): IssueRecord[] {
    if (!this.database) this.load();

    return this.database!.issues.filter(i => i.severity === severity);
  }

  /**
   * Search issues by keyword in symptoms, root cause, or solution
   */
  search(keyword: string): IssueRecord[] {
    if (!this.database) this.load();

    const lowerKeyword = keyword.toLowerCase();

    return this.database!.issues.filter(issue => {
      // Search in title
      if (issue.title.toLowerCase().includes(lowerKeyword)) return true;

      // Search in symptoms
      if (issue.symptoms.some(s => s.toLowerCase().includes(lowerKeyword))) return true;

      // Search in root cause
      if (issue.rootCause.toLowerCase().includes(lowerKeyword)) return true;

      // Search in solution
      if (issue.solution.toLowerCase().includes(lowerKeyword)) return true;

      return false;
    });
  }

  /**
   * Get issues affecting a specific door
   */
  getIssuesForDoor(doorName: string): IssueRecord[] {
    if (!this.database) this.load();

    return this.database!.issues.filter(issue =>
      issue.affectedDoors.includes(doorName) ||
      issue.affectedDoors.includes('Any door') ||
      issue.affectedDoors.includes('Various')
    );
  }

  /**
   * Get all issues sorted by confidence (high to low)
   */
  getIssuesByConfidence(): IssueRecord[] {
    if (!this.database) this.load();

    return [...this.database!.issues].sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Get critical issues only
   */
  getCriticalIssues(): IssueRecord[] {
    return this.getIssuesBySeverity('critical');
  }

  /**
   * Get total issue count
   */
  getIssueCount(): number {
    if (!this.database) this.load();
    return this.database!.issues.length;
  }

  /**
   * Get database version
   */
  getVersion(): string {
    if (!this.database) this.load();
    return this.database!.version;
  }

  /**
   * Render issue as markdown
   */
  renderIssueMarkdown(issue: IssueRecord): string {
    const lines: string[] = [];

    lines.push(`# ${issue.title}\n`);
    lines.push(`**ID:** ${issue.id}  `);
    lines.push(`**Severity:** ${issue.severity.toUpperCase()}  `);
    lines.push(`**Confidence:** ${issue.confidence}%  `);
    lines.push(`**Pattern:** ${issue.pattern}\n`);

    lines.push('## Symptoms\n');
    issue.symptoms.forEach(symptom => {
      lines.push(`- ${symptom}`);
    });
    lines.push('');

    lines.push('## Root Cause\n');
    lines.push(`${issue.rootCause}\n`);

    lines.push('## Solution\n');
    lines.push(`${issue.solution}\n`);

    if (issue.codeExample) {
      lines.push('## Code Example\n');
      lines.push('**Before (Wrong):**');
      lines.push('```c');
      lines.push(issue.codeExample.before);
      lines.push('```\n');
      lines.push('**After (Correct):**');
      lines.push('```c');
      lines.push(issue.codeExample.after);
      lines.push('```\n');
    }

    lines.push('## References\n');
    issue.references.forEach(ref => {
      lines.push(`- ${ref}`);
    });
    lines.push('');

    lines.push('## Affected Doors\n');
    lines.push(issue.affectedDoors.join(', '));
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Render issue as console output
   */
  renderIssueConsole(issue: IssueRecord): void {
    console.log('\x1b[1;36m' + '═'.repeat(65) + '\x1b[0m');
    console.log(`\x1b[1;37m${issue.title}\x1b[0m`);
    console.log('\x1b[1;36m' + '═'.repeat(65) + '\x1b[0m\n');

    const severityColor = {
      critical: '\x1b[1;31m',
      warning: '\x1b[1;33m',
      info: '\x1b[1;36m'
    }[issue.severity];

    console.log(`  ${severityColor}Severity: ${issue.severity.toUpperCase()}\x1b[0m`);
    console.log(`  Confidence: ${issue.confidence}%`);
    console.log(`  Pattern: ${issue.pattern}`);
    console.log('');

    console.log('  \x1b[1;37mSymptoms:\x1b[0m');
    issue.symptoms.forEach(symptom => {
      console.log(`    - ${symptom}`);
    });
    console.log('');

    console.log('  \x1b[1;37mRoot Cause:\x1b[0m');
    console.log(`    ${issue.rootCause}`);
    console.log('');

    console.log('  \x1b[1;37mSolution:\x1b[0m');
    console.log(`    ${issue.solution}`);
    console.log('');

    if (issue.codeExample) {
      console.log('  \x1b[1;37mCode Example:\x1b[0m');
      console.log('    \x1b[0;31mBefore (Wrong):\x1b[0m');
      issue.codeExample.before.split('\n').forEach(line => {
        console.log(`      ${line}`);
      });
      console.log('');
      console.log('    \x1b[0;32mAfter (Correct):\x1b[0m');
      issue.codeExample.after.split('\n').forEach(line => {
        console.log(`      ${line}`);
      });
      console.log('');
    }

    console.log('  \x1b[1;37mReferences:\x1b[0m');
    issue.references.forEach(ref => {
      console.log(`    - ${ref}`);
    });
    console.log('');

    console.log('  \x1b[1;37mAffected Doors:\x1b[0m');
    console.log(`    ${issue.affectedDoors.join(', ')}`);
    console.log('');
  }

  /**
   * Get statistics about the database
   */
  getStats() {
    if (!this.database) this.load();

    const stats = {
      total: this.database!.issues.length,
      critical: this.database!.issues.filter(i => i.severity === 'critical').length,
      warning: this.database!.issues.filter(i => i.severity === 'warning').length,
      info: this.database!.issues.filter(i => i.severity === 'info').length,
      patterns: new Set(this.database!.issues.map(i => i.pattern)).size,
      averageConfidence: this.database!.issues.reduce((sum, i) => sum + i.confidence, 0) / this.database!.issues.length,
    };

    return stats;
  }
}

// CLI interface for browsing the knowledge base
if (require.main === module) {
  const args = process.argv.slice(2);

  const kb = new XIMIssueKnowledgeBase();

  if (args.length === 0 || args.includes('--help')) {
    console.log(`
XIM Issue Knowledge Base - Browse common door issues and solutions

Usage:
  npx tsx dev/scripts/xim-issue-knowledge-base.ts <command> [options]

Commands:
  list                    List all issues
  show <id>               Show specific issue by ID
  search <keyword>        Search issues by keyword
  pattern <name>          Show issues for pattern
  door <name>             Show issues affecting door
  stats                   Show database statistics

Examples:
  npx tsx dev/scripts/xim-issue-knowledge-base.ts list
  npx tsx dev/scripts/xim-issue-knowledge-base.ts show GETMSG_TIMEOUT
  npx tsx dev/scripts/xim-issue-knowledge-base.ts search "memory leak"
  npx tsx dev/scripts/xim-issue-knowledge-base.ts pattern PROTOCOL_VIOLATION
  npx tsx dev/scripts/xim-issue-knowledge-base.ts door WHO
  npx tsx dev/scripts/xim-issue-knowledge-base.ts stats
`);
    process.exit(0);
  }

  const command = args[0];

  try {
    switch (command) {
      case 'list': {
        const issues = kb.getIssuesByConfidence();
        console.log('\x1b[1;36m╔═══════════════════════════════════════════════════════════════╗\x1b[0m');
        console.log('\x1b[1;36m║              XIM Issue Knowledge Base - All Issues             ║\x1b[0m');
        console.log('\x1b[1;36m╚═══════════════════════════════════════════════════════════════╝\x1b[0m\n');

        issues.forEach((issue, i) => {
          const icon = {
            critical: '\x1b[1;31m✗',
            warning: '\x1b[1;33m!',
            info: '\x1b[1;36mⓘ'
          }[issue.severity];

          console.log(`  ${icon} [${issue.id}]\x1b[0m ${issue.title}`);
          console.log(`     Confidence: ${issue.confidence}% | Pattern: ${issue.pattern}`);
          console.log('');
        });

        console.log(`  \x1b[0;37mTotal: ${issues.length} issues\x1b[0m\n`);
        break;
      }

      case 'show': {
        const id = args[1];
        if (!id) {
          console.error('Error: Issue ID required');
          process.exit(1);
        }

        const issue = kb.getIssue(id);
        if (!issue) {
          console.error(`Error: Issue not found: ${id}`);
          process.exit(1);
        }

        kb.renderIssueConsole(issue);
        break;
      }

      case 'search': {
        const keyword = args.slice(1).join(' ');
        if (!keyword) {
          console.error('Error: Search keyword required');
          process.exit(1);
        }

        const results = kb.search(keyword);

        console.log('\x1b[1;36m╔═══════════════════════════════════════════════════════════════╗\x1b[0m');
        console.log('\x1b[1;36m║              XIM Issue Knowledge Base - Search                 ║\x1b[0m');
        console.log('\x1b[1;36m╚═══════════════════════════════════════════════════════════════╝\x1b[0m\n');
        console.log(`  Query: "${keyword}"\n`);

        if (results.length === 0) {
          console.log('  No results found.\n');
        } else {
          results.forEach(issue => {
            const icon = {
              critical: '\x1b[1;31m✗',
              warning: '\x1b[1;33m!',
              info: '\x1b[1;36mⓘ'
            }[issue.severity];

            console.log(`  ${icon} [${issue.id}]\x1b[0m ${issue.title}`);
            console.log(`     ${issue.solution.substring(0, 80)}...`);
            console.log('');
          });

          console.log(`  \x1b[0;37mFound: ${results.length} issue(s)\x1b[0m\n`);
        }
        break;
      }

      case 'pattern': {
        const pattern = args[1];
        if (!pattern) {
          console.error('Error: Pattern name required');
          process.exit(1);
        }

        const issues = kb.getIssuesByPattern(pattern);

        console.log('\x1b[1;36m╔═══════════════════════════════════════════════════════════════╗\x1b[0m');
        console.log('\x1b[1;36m║              XIM Issue Knowledge Base - Pattern                ║\x1b[0m');
        console.log('\x1b[1;36m╚═══════════════════════════════════════════════════════════════╝\x1b[0m\n');
        console.log(`  Pattern: ${pattern}\n`);

        if (issues.length === 0) {
          console.log('  No issues found for this pattern.\n');
        } else {
          issues.forEach(issue => {
            kb.renderIssueConsole(issue);
          });
        }
        break;
      }

      case 'door': {
        const doorName = args[1];
        if (!doorName) {
          console.error('Error: Door name required');
          process.exit(1);
        }

        const issues = kb.getIssuesForDoor(doorName);

        console.log('\x1b[1;36m╔═══════════════════════════════════════════════════════════════╗\x1b[0m');
        console.log('\x1b[1;36m║              XIM Issue Knowledge Base - Door                   ║\x1b[0m');
        console.log('\x1b[1;36m╚═══════════════════════════════════════════════════════════════╝\x1b[0m\n');
        console.log(`  Door: ${doorName}\n`);

        if (issues.length === 0) {
          console.log('  No known issues for this door.\n');
        } else {
          issues.forEach(issue => {
            const icon = {
              critical: '\x1b[1;31m✗',
              warning: '\x1b[1;33m!',
              info: '\x1b[1;36mⓘ'
            }[issue.severity];

            console.log(`  ${icon} [${issue.id}]\x1b[0m ${issue.title}`);
            console.log(`     ${issue.solution.substring(0, 80)}...`);
            console.log('');
          });

          console.log(`  \x1b[0;37mFound: ${issues.length} issue(s)\x1b[0m\n`);
        }
        break;
      }

      case 'stats': {
        const stats = kb.getStats();

        console.log('\x1b[1;36m╔═══════════════════════════════════════════════════════════════╗\x1b[0m');
        console.log('\x1b[1;36m║              XIM Issue Knowledge Base - Statistics             ║\x1b[0m');
        console.log('\x1b[1;36m╚═══════════════════════════════════════════════════════════════╝\x1b[0m\n');

        console.log(`  Total Issues: ${stats.total}`);
        console.log(`  Critical: ${stats.critical}`);
        console.log(`  Warning: ${stats.warning}`);
        console.log(`  Info: ${stats.info}`);
        console.log(`  Unique Patterns: ${stats.patterns}`);
        console.log(`  Average Confidence: ${Math.floor(stats.averageConfidence)}%`);
        console.log(`  Version: ${kb.getVersion()}`);
        console.log('');
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        console.error('Run with --help for usage');
        process.exit(1);
    }
  } catch (err: any) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

export default XIMIssueKnowledgeBase;
