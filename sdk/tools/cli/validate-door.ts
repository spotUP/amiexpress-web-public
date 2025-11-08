/**
 * Validate Door Command
 *
 * Check door for common issues and BBS compatibility.
 */

import * as path from 'path';
import * as fs from 'fs';
import chalk from 'chalk';
import ora from 'ora';

interface ValidateOptions {
  fix: boolean;
  strict: boolean;
}

interface ValidationIssue {
  level: 'error' | 'warning' | 'info';
  message: string;
  fixable: boolean;
}

/**
 * Validate door project
 */
export async function validateDoor(
  doorPath: string,
  options?: Partial<ValidateOptions>
): Promise<void> {
  const opts: ValidateOptions = {
    fix: options?.fix || false,
    strict: options?.strict || false
  };

  const absolutePath = path.resolve(doorPath);

  const spinner = ora('Validating door...').start();

  try {
    const issues = await runValidation(absolutePath, opts);

    spinner.stop();

    // Display results
    const errors = issues.filter(i => i.level === 'error');
    const warnings = issues.filter(i => i.level === 'warning');
    const infos = issues.filter(i => i.level === 'info');

    console.log('');

    if (errors.length === 0 && warnings.length === 0) {
      console.log(chalk.green.bold('✅ Door validation passed!\n'));
      if (infos.length > 0) {
        console.log(chalk.bold('ℹ️  Suggestions:\n'));
        infos.forEach(issue => {
          console.log(chalk.cyan('  •'), chalk.gray(issue.message));
        });
      }
      return;
    }

    if (errors.length > 0) {
      console.log(chalk.red.bold(`❌ ${errors.length} Error(s):\n`));
      errors.forEach(issue => {
        console.log(chalk.red('  ✗'), issue.message);
        if (issue.fixable && !opts.fix) {
          console.log(chalk.gray('    → Run with --fix to auto-fix'));
        }
      });
      console.log('');
    }

    if (warnings.length > 0) {
      console.log(chalk.yellow.bold(`⚠️  ${warnings.length} Warning(s):\n`));
      warnings.forEach(issue => {
        console.log(chalk.yellow('  !'), issue.message);
        if (issue.fixable && !opts.fix) {
          console.log(chalk.gray('    → Run with --fix to auto-fix'));
        }
      });
      console.log('');
    }

    if (infos.length > 0) {
      console.log(chalk.bold('ℹ️  Suggestions:\n'));
      infos.forEach(issue => {
        console.log(chalk.cyan('  •'), chalk.gray(issue.message));
      });
      console.log('');
    }

    if (errors.length > 0) {
      process.exit(1);
    }

  } catch (error: any) {
    spinner.fail(chalk.red('Validation failed'));
    throw error;
  }
}

/**
 * Run validation checks
 */
async function runValidation(
  doorPath: string,
  options: ValidateOptions
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];

  // Check package.json
  const packagePath = path.join(doorPath, 'package.json');
  if (!fs.existsSync(packagePath)) {
    issues.push({
      level: 'error',
      message: 'Missing package.json',
      fixable: false
    });
  } else {
    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

    // Check required fields
    if (!pkg.name) {
      issues.push({
        level: 'error',
        message: 'package.json missing "name" field',
        fixable: false
      });
    }

    if (!pkg.version) {
      issues.push({
        level: 'warning',
        message: 'package.json missing "version" field',
        fixable: true
      });
    }

    if (!pkg.description) {
      issues.push({
        level: 'info',
        message: 'package.json missing "description" field',
        fixable: false
      });
    }

    if (!pkg.author) {
      issues.push({
        level: 'info',
        message: 'package.json missing "author" field',
        fixable: false
      });
    }

    // Check for SDK dependency
    const hasSdkDep = pkg.dependencies?.['@amiexpress/sdk'] ||
                      pkg.devDependencies?.['@amiexpress/sdk'];

    if (!hasSdkDep) {
      issues.push({
        level: 'warning',
        message: 'Missing @amiexpress/sdk dependency',
        fixable: true
      });
    }
  }

  // Check for main file
  const mainFiles = ['index.ts', 'index.js', 'main.ts', 'main.js'];
  const hasMainFile = mainFiles.some(f => fs.existsSync(path.join(doorPath, f)));

  if (!hasMainFile) {
    issues.push({
      level: 'error',
      message: `No main file found (expected one of: ${mainFiles.join(', ')})`,
      fixable: false
    });
  }

  // Check for README
  if (!fs.existsSync(path.join(doorPath, 'README.md'))) {
    issues.push({
      level: 'info',
      message: 'Missing README.md',
      fixable: false
    });
  }

  // Check for tsconfig.json (if TypeScript)
  const hasTsFiles = fs.readdirSync(doorPath).some(f => f.endsWith('.ts'));
  if (hasTsFiles && !fs.existsSync(path.join(doorPath, 'tsconfig.json'))) {
    issues.push({
      level: 'warning',
      message: 'TypeScript files found but no tsconfig.json',
      fixable: true
    });
  }

  // Check for assets directory
  const assetsDir = path.join(doorPath, 'assets');
  if (!fs.existsSync(assetsDir)) {
    issues.push({
      level: 'info',
      message: 'No assets/ directory found',
      fixable: false
    });
  }

  // Check for .gitignore
  if (!fs.existsSync(path.join(doorPath, '.gitignore'))) {
    issues.push({
      level: 'info',
      message: 'Missing .gitignore',
      fixable: true
    });
  }

  return issues;
}
