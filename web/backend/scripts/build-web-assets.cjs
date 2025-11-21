const path = require('path');
const { execSync } = require('child_process');
const fs = require('fs');

const projects = [
  {
    name: 'BBS frontend',
    dir: path.resolve(__dirname, '../../frontend')
  },
  {
    name: 'Admin config app',
    dir: path.resolve(__dirname, '../../config-app')
  },
  {
    name: 'SDK preview frontend',
    dir: path.resolve(__dirname, '../../../sdk/tools/preview/frontend')
  }
];

const isCI = process.env.CI === 'true';
const skip = process.env.SKIP_WEB_ASSET_BUILD === '1';

function run(command, cwd) {
  execSync(command, { cwd, stdio: 'inherit' });
}

function installDeps(dir) {
  const hasLock = fs.existsSync(path.join(dir, 'package-lock.json'));
  const commands = [];

  if (isCI && hasLock) {
    commands.push('npm ci --include=dev', 'npm ci');
  } else {
    commands.push('npm install --include=dev', 'npm install');
  }

  let lastError = null;
  for (const cmd of commands) {
    try {
      run(cmd, dir);
      return;
    } catch (error) {
      lastError = error;
      console.warn(`[build-web-assets] Command failed (${cmd}), trying fallback...`);
    }
  }

  if (lastError) {
    throw lastError;
  }
}

if (skip) {
  console.log('[build-web-assets] Skipping asset builds (SKIP_WEB_ASSET_BUILD=1)');
  process.exit(0);
}

for (const project of projects) {
  if (!fs.existsSync(project.dir)) {
    console.warn(`[build-web-assets] Skipping ${project.name} (missing directory: ${project.dir})`);
    continue;
  }

  console.log(`[build-web-assets] Installing deps for ${project.name}...`);
  installDeps(project.dir);
  console.log(`[build-web-assets] Building ${project.name}...`);
  run('npm run build', project.dir);
}
