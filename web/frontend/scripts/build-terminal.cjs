const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const terminalDir = path.resolve(__dirname, '../../..', 'packages', 'terminal');

function run(command) {
  execSync(command, { cwd: terminalDir, stdio: 'inherit' });
}

try {
  const hasNodeModules = fs.existsSync(path.join(terminalDir, 'node_modules'));
  const isCI = process.env.CI === 'true';

  if (isCI) {
    if (fs.existsSync(path.join(terminalDir, 'package-lock.json'))) {
      run('npm ci');
    } else {
      run('npm install');
    }
  } else if (!hasNodeModules) {
    run('npm install');
  }

  run('npm run build');
} catch (error) {
  console.error('[build-terminal] Failed to build @amiexpress/terminal:', error.message || error);
  process.exit(1);
}
