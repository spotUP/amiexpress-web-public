#!/usr/bin/env node
/**
 * Create a minimal door skeleton under doors/<name>
 * Supports templates: ts (default), py, rexx
 */
const fs = require('fs');
const path = require('path');

function writeFileSafe(p, content) {
  if (!fs.existsSync(path.dirname(p))) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
  }
  fs.writeFileSync(p, content);
}

function main() {
  const name = process.argv[2];
  const template = (process.argv[3] || 'ts').toLowerCase();
  if (!name) {
    console.error('Usage: create-door-skeleton <name> [ts|py|rexx]');
    process.exit(1);
  }

  const projectRoot = path.resolve(__dirname, '..', '..');
  const doorRoot = path.join(projectRoot, 'doors', name);
  if (fs.existsSync(doorRoot)) {
    console.error(`Door ${name} already exists at ${doorRoot}`);
    process.exit(1);
  }

  const capital = name.charAt(0).toUpperCase() + name.slice(1);

  let pkg = {};
  let files = {};

  if (template === 'py') {
    pkg = {
      name,
      version: '1.0.0',
      description: `${name} Python door`,
      main: 'main.py',
      bbsCommand: name.toUpperCase(),
      doorType: 'PY',
      scripts: {
        run: 'python3 main.py'
      }
    };
    files['main.py'] = `# ${capital} Python door skeleton
import sys

def main():
    sys.stdout.write("\\u001b[36mHello from ${name}!\\r\\n\\u001b[0m")
    sys.stdout.write("Press Enter to exit...\\r\\n")
    sys.stdout.flush()
    sys.stdin.readline()
    sys.stdout.write("Goodbye!\\r\\n")

if __name__ == "__main__":
    main()
`;
  } else if (template === 'rexx') {
    pkg = {
      name,
      version: '1.0.0',
      description: `${name} AREXX door`,
      main: 'main.rexx',
      bbsCommand: name.toUpperCase(),
      doorType: 'AREXX',
      scripts: {
        run: 'rexx main.rexx'
      }
    };
    files['main.rexx'] = `/* ${capital} AREXX door skeleton */
say "\\e[36mHello from ${name}!\\e[0m"
say "Press Enter to exit..."
parse pull dummy
say "Goodbye!"
`;
  } else {
    pkg = {
      name: name,
      version: '1.0.0',
      description: `${name} door`,
      main: 'dist/index.js',
      bbsCommand: name.toUpperCase(),
      doorType: 'TS',
      scripts: {
        build: 'tsc'
      },
      dependencies: {
        '@amiexpress/bbs-door-sdk': 'file:../../sdk'
      },
      devDependencies: {
        typescript: '^5.9.3'
      }
    };

    const tsconfig = {
      compilerOptions: {
        target: 'ES2020',
        module: 'commonjs',
        outDir: 'dist',
        rootDir: '.',
        esModuleInterop: true,
        moduleResolution: 'node',
        resolveJsonModule: true,
        skipLibCheck: true,
        types: ['node']
      },
      include: ['index.ts']
    };

    const index = `import { Door, AnsiColor } from '@amiexpress/bbs-door-sdk';

export default class ${capital}Door extends Door {
  async onStart(): Promise<void> {
    this.term.write(AnsiColor.CYAN + 'Hello from ${name}!\\r\\n' + AnsiColor.RESET);
    this.term.write('Press any key to exit...\\r\\n');
    await this.input.readKey();
    this.term.write('Goodbye!\\r\\n');
  }
}
`;
    files['tsconfig.json'] = JSON.stringify(tsconfig, null, 2);
    files['index.ts'] = index;
  }

  writeFileSafe(path.join(doorRoot, 'package.json'), JSON.stringify(pkg, null, 2));
  Object.entries(files).forEach(([fname, content]) => writeFileSafe(path.join(doorRoot, fname), content));

  console.log(`Created door skeleton at ${doorRoot}`);
  console.log('Next steps:');
  console.log(`  cd ${doorRoot}`);
  if (template === 'ts') {
    console.log('  npm install');
    console.log('  npm run build');
  } else {
    console.log('  (install deps if needed)');
  }
  console.log('  npx ts-node -P dev/scripts/tsconfig.json dev/scripts/install-sdk-doors.ts --door', name);
}

main();
