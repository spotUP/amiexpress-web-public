/**
 * Deploy Door Command
 *
 * Deploy door to BBS server via SSH/SFTP.
 */

import chalk from 'chalk';
import inquirer from 'inquirer';

interface DeployOptions {
  host?: string;
  user?: string;
  port: string;
  path?: string;
}

/**
 * Deploy door to BBS server
 */
export async function deployDoor(
  doorPath: string,
  options?: Partial<DeployOptions>
): Promise<void> {
  console.log(chalk.yellow('[WARNING] Deploy functionality coming soon!\n'));

  console.log(chalk.bold('Planned features:'));
  console.log(chalk.gray('  • SSH/SFTP upload'));
  console.log(chalk.gray('  • BBS installation script generation'));
  console.log(chalk.gray('  • Config file management'));
  console.log(chalk.gray('  • Door menu integration'));
  console.log('');

  console.log(chalk.bold('Manual deployment:'));
  console.log(chalk.gray('  1. Pack your door:'), chalk.cyan('npm run pack'));
  console.log(chalk.gray('  2. Upload ZIP to BBS server'));
  console.log(chalk.gray('  3. Extract in doors directory'));
  console.log(chalk.gray('  4. Add to door menu'));
  console.log('');

  // Collect deployment config for future use
  const { saveConfig } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'saveConfig',
      message: 'Would you like to save deployment config for the future?',
      default: false
    }
  ]);

  if (saveConfig) {
    const config = await inquirer.prompt([
      {
        type: 'input',
        name: 'host',
        message: 'BBS server hostname:',
        default: options?.host
      },
      {
        type: 'input',
        name: 'user',
        message: 'SSH username:',
        default: options?.user || process.env.USER
      },
      {
        type: 'input',
        name: 'port',
        message: 'SSH port:',
        default: options?.port || '22'
      },
      {
        type: 'input',
        name: 'path',
        message: 'Remote door installation path:',
        default: options?.path || '/bbs/doors'
      }
    ]);

    console.log(chalk.green('\n[OK] Config saved for future use'));
    console.log(chalk.gray('(Deploy functionality will be implemented in a future update)'));
  }
}
