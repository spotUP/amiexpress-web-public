/**
 * Create Door Command
 *
 * Interactive wizard for creating new BBS door projects.
 */

import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { execSync } from 'child_process';

interface CreateDoorOptions {
  template: 'typescript' | 'arexx' | 'python';
  dir: string;
  yes: boolean;
}

interface DoorConfig {
  name: string;
  displayName: string;
  version: string;
  author: string;
  description: string;
  category: string;
  template: string;
}

/**
 * Create a new door project
 */
export async function createDoor(
  doorName?: string,
  options?: Partial<CreateDoorOptions>
): Promise<void> {
  const opts: CreateDoorOptions = {
    template: options?.template || 'typescript',
    dir: options?.dir || '.',
    yes: options?.yes || false
  };

  // Get door configuration
  const config = await getDoorConfig(doorName, opts);

  // Show summary
  console.log(chalk.bold('\n📋 Door Configuration:'));
  console.log(chalk.gray('  Name:        ') + chalk.white(config.name));
  console.log(chalk.gray('  Display:     ') + chalk.white(config.displayName));
  console.log(chalk.gray('  Version:     ') + chalk.white(config.version));
  console.log(chalk.gray('  Author:      ') + chalk.white(config.author));
  console.log(chalk.gray('  Description: ') + chalk.white(config.description));
  console.log(chalk.gray('  Category:    ') + chalk.white(config.category));
  console.log(chalk.gray('  Template:    ') + chalk.white(config.template));

  // Confirm
  if (!opts.yes) {
    const { confirmed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmed',
        message: 'Create door with these settings?',
        default: true
      }
    ]);

    if (!confirmed) {
      console.log(chalk.yellow('\n[WARNING] Cancelled'));
      return;
    }
  }

  // Create project
  const spinner = ora('Creating door project...').start();

  try {
    const projectPath = path.join(opts.dir, config.name);

    // Check if directory exists
    if (fs.existsSync(projectPath)) {
      spinner.fail(chalk.red(`Directory ${config.name} already exists`));
      return;
    }

    // Create directory
    fs.mkdirSync(projectPath, { recursive: true });

    // Copy template
    await copyTemplate(config.template, projectPath, config);
    spinner.text = 'Template copied';

    // Install dependencies
    spinner.text = 'Installing dependencies...';
    await installDependencies(projectPath, config.template);

    spinner.succeed(chalk.green('Door created successfully!'));

    // Show next steps
    console.log(chalk.bold('\n[INFO] Next Steps:\n'));
    console.log(chalk.gray('  cd') + ' ' + chalk.cyan(config.name));
    console.log(chalk.gray('  npm run') + ' ' + chalk.cyan('dev'));
    console.log(chalk.gray('  or'));
    console.log(chalk.gray('  npm run') + ' ' + chalk.cyan('preview') + chalk.gray(' # Test in browser'));
    console.log('');

  } catch (error: any) {
    spinner.fail(chalk.red('Failed to create door'));
    throw error;
  }
}

/**
 * Get door configuration from user
 */
async function getDoorConfig(
  doorName?: string,
  options?: Partial<CreateDoorOptions>
): Promise<DoorConfig> {
  if (options?.yes && doorName) {
    // Use defaults
    return {
      name: doorName,
      displayName: toTitleCase(doorName),
      version: '1.0.0',
      author: 'Unknown',
      description: `A BBS door game`,
      category: 'Game',
      template: options.template || 'typescript'
    };
  }

  // Interactive prompts
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Door name (lowercase, no spaces):',
      default: doorName || 'my-door',
      validate: (input: string) => {
        if (!/^[a-z0-9-]+$/.test(input)) {
          return 'Name must be lowercase letters, numbers, and hyphens only';
        }
        return true;
      }
    },
    {
      type: 'input',
      name: 'displayName',
      message: 'Display name:',
      default: (answers: any) => toTitleCase(answers.name)
    },
    {
      type: 'input',
      name: 'version',
      message: 'Version:',
      default: '1.0.0'
    },
    {
      type: 'input',
      name: 'author',
      message: 'Author name:',
      default: process.env.USER || 'Unknown'
    },
    {
      type: 'input',
      name: 'description',
      message: 'Description:',
      default: (answers: any) => `${answers.displayName} - A BBS door game`
    },
    {
      type: 'list',
      name: 'category',
      message: 'Category:',
      choices: [
        'Game',
        'Puzzle Game',
        'Action Game',
        'RPG',
        'Card Game',
        'Board Game',
        'Utility',
        'Chat Tool',
        'File Tool',
        'Other'
      ],
      default: 'Game'
    },
    {
      type: 'list',
      name: 'template',
      message: 'Template language:',
      choices: [
        { name: 'TypeScript (Recommended)', value: 'typescript' },
        { name: 'ARexx (Classic Amiga)', value: 'arexx' },
        { name: 'Python', value: 'python' }
      ],
      default: options?.template || 'typescript'
    }
  ]);

  return answers as DoorConfig;
}

/**
 * Copy template to project directory
 */
async function copyTemplate(
  template: string,
  projectPath: string,
  config: DoorConfig
): Promise<void> {
  const templatePath = path.join(__dirname, '../../templates', template);

  // Check if template exists
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template '${template}' not found at ${templatePath}`);
  }

  // Copy all files
  copyRecursive(templatePath, projectPath);

  // Process template variables
  processTemplateFiles(projectPath, config);
}

/**
 * Recursively copy directory
 */
function copyRecursive(src: string, dest: string): void {
  const stats = fs.statSync(src);

  if (stats.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }

    const files = fs.readdirSync(src);
    for (const file of files) {
      copyRecursive(
        path.join(src, file),
        path.join(dest, file)
      );
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

/**
 * Process template files and replace variables
 */
function processTemplateFiles(projectPath: string, config: DoorConfig): void {
  const files = getAllFiles(projectPath);

  for (const file of files) {
    if (file.endsWith('.json') || file.endsWith('.ts') || file.endsWith('.md') ||
        file.endsWith('.rexx') || file.endsWith('.py')) {

      let content = fs.readFileSync(file, 'utf8');

      // Replace template variables
      content = content
        .replace(/\{\{name\}\}/g, config.name)
        .replace(/\{\{displayName\}\}/g, config.displayName)
        .replace(/\{\{version\}\}/g, config.version)
        .replace(/\{\{author\}\}/g, config.author)
        .replace(/\{\{description\}\}/g, config.description)
        .replace(/\{\{category\}\}/g, config.category);

      fs.writeFileSync(file, content, 'utf8');
    }
  }
}

/**
 * Get all files in directory recursively
 */
function getAllFiles(dirPath: string, arrayOfFiles: string[] = []): string[] {
  const files = fs.readdirSync(dirPath);

  for (const file of files) {
    const filePath = path.join(dirPath, file);

    if (fs.statSync(filePath).isDirectory()) {
      arrayOfFiles = getAllFiles(filePath, arrayOfFiles);
    } else {
      arrayOfFiles.push(filePath);
    }
  }

  return arrayOfFiles;
}

/**
 * Install dependencies
 */
async function installDependencies(
  projectPath: string,
  template: string
): Promise<void> {
  const cwd = process.cwd();

  try {
    process.chdir(projectPath);

    if (template === 'typescript') {
      // Install npm packages
      try {
        execSync('npm install', { stdio: 'inherit' });
      } catch (error: any) {
        console.error(chalk.red('\n[ERROR] npm install failed. Please run it manually:'));
        console.error(chalk.gray(`  cd ${path.basename(projectPath)}`));
        console.error(chalk.gray('  npm install'));
        throw error;
      }
    } else if (template === 'python') {
      // Install pip packages
      if (fs.existsSync('requirements.txt')) {
        try {
          execSync('pip install -r requirements.txt', { stdio: 'inherit' });
        } catch (error: any) {
          console.error(chalk.yellow('\n[WARNING] pip install failed. You may need to install dependencies manually.'));
        }
      }
    }

  } finally {
    process.chdir(cwd);
  }
}

/**
 * Convert string to Title Case
 */
function toTitleCase(str: string): string {
  return str
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
