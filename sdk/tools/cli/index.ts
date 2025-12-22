#!/usr/bin/env node

/**
 * AmiExpress SDK CLI
 *
 * Command-line interface for BBS door development.
 *
 * Commands:
 * - create-door: Scaffold a new door project
 * - pack: Create BBS-ready release archive
 * - validate: Check door for common issues
 * - deploy: Deploy door to BBS
 *
 * @example
 * ```bash
 * amiexpress-sdk create-door my-game
 * amiexpress-sdk pack my-game
 * amiexpress-sdk validate my-game
 * ```
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { createDoor } from './create-door';
import { packDoor } from './pack-door';
import { validateDoor } from './validate-door';
import { deployDoor } from './deploy-door';

const program = new Command();

// Package info
const pkg = require('../../package.json');

program
  .name('amiexpress-sdk')
  .description('AmiExpress BBS Door SDK - Command Line Interface')
  .version(pkg.version);

// create-door command
program
  .command('create-door')
  .alias('create')
  .alias('new')
  .description('Create a new BBS door project')
  .argument('[name]', 'Door name (interactive if not provided)')
  .option('-t, --template <type>', 'Template type (typescript, arexx, python)', 'typescript')
  .option('-d, --dir <directory>', 'Output directory', '.')
  .option('-y, --yes', 'Skip prompts and use defaults', false)
  .action(async (name, options) => {
    console.log(chalk.cyan.bold('\n[SDK] AmiExpress SDK - Create Door\n'));
    try {
      await createDoor(name, options);
    } catch (error: any) {
      console.error(chalk.red('\n[ERROR] Error:'), error.message);
      process.exit(1);
    }
  });

// pack command
program
  .command('pack')
  .description('Create BBS-ready release archive (zip for TypeScript, lha for native)')
  .argument('[door-name]', 'Door name or path')
  .option('-o, --output <dir>', 'Output directory', './releases')
  .option('-v, --version <version>', 'Override version number')
  .option('-f, --format <format>', 'Archive format (zip|lha)', 'zip')
  .action(async (doorName, options) => {
    console.log(chalk.cyan.bold('\n[SDK] AmiExpress SDK - Pack Door\n'));
    try {
      await packDoor(doorName, options);
    } catch (error: any) {
      console.error(chalk.red('\n[ERROR] Error:'), error.message);
      process.exit(1);
    }
  });

// validate command
program
  .command('validate')
  .description('Validate door for common issues and BBS compatibility')
  .argument('[door-path]', 'Door directory path', '.')
  .option('--fix', 'Automatically fix issues where possible', false)
  .option('--strict', 'Use strict validation rules', false)
  .action(async (doorPath, options) => {
    console.log(chalk.cyan.bold('\n[SDK] AmiExpress SDK - Validate Door\n'));
    try {
      await validateDoor(doorPath, options);
    } catch (error: any) {
      console.error(chalk.red('\n[ERROR] Error:'), error.message);
      process.exit(1);
    }
  });

// deploy command
program
  .command('deploy')
  .description('Deploy door to BBS server')
  .argument('[door-path]', 'Door directory path', '.')
  .option('-h, --host <host>', 'BBS server hostname')
  .option('-u, --user <user>', 'SSH username')
  .option('-p, --port <port>', 'SSH port', '22')
  .option('--path <path>', 'Remote installation path')
  .action(async (doorPath, options) => {
    console.log(chalk.cyan.bold('\n[SDK] AmiExpress SDK - Deploy Door\n'));
    try {
      await deployDoor(doorPath, options);
    } catch (error: any) {
      console.error(chalk.red('\n[ERROR] Error:'), error.message);
      process.exit(1);
    }
  });

// Preview command (convenience wrapper)
program
  .command('preview')
  .description('Start preview server for testing doors in browser')
  .option('-p, --port <port>', 'Server port', '8080')
  .action((options) => {
    console.log(chalk.cyan.bold('\n[SDK] Starting preview server...\n'));
    console.log(chalk.gray('This will run: npm run preview\n'));

    const { spawn } = require('child_process');
    const proc = spawn('npm', ['run', 'preview'], {
      stdio: 'inherit',
      shell: true
    });

    proc.on('exit', (code: number) => {
      process.exit(code);
    });
  });

// Help examples
program.on('--help', () => {
  console.log('');
  console.log(chalk.bold('Examples:'));
  console.log('  $ amiexpress-sdk create-door my-game');
  console.log('  $ amiexpress-sdk create-door --template python --yes');
  console.log('  $ amiexpress-sdk pack my-game');
  console.log('  $ amiexpress-sdk validate ./my-game --fix');
  console.log('  $ amiexpress-sdk deploy my-game --host bbs.example.com');
  console.log('  $ amiexpress-sdk preview');
  console.log('');
});

// Parse arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
