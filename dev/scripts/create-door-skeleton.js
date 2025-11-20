#!/usr/bin/env node
/**
 * Create a minimal TypeScript door skeleton under doors/<name>
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
  if (!name) {
    console.error('Usage: create-door-skeleton <name>');
    process.exit(1);
  }

  const projectRoot = path.resolve(__dirname, '..', '..');
  const doorRoot = path.join(projectRoot, 'doors', name);
  if (fs.existsSync(doorRoot)) {
    console.error(`Door ${name} already exists at ${doorRoot}`);
    process.exit(1);
  }

  const pkg = {
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

export default class ${name.charAt(0).toUpperCase() + name.slice(1)}Door extends Door {
  async onStart(): Promise<void> {
    this.term.write(AnsiColor.CYAN + 'Hello from ${name}!\\r\\n' + AnsiColor.RESET);
    this.term.write('Press any key to exit...\\r\\n');
    await this.input.readKey();
    this.term.write('Goodbye!\\r\\n');
  }
}
`;

  writeFileSafe(path.join(doorRoot, 'package.json'), JSON.stringify(pkg, null, 2));
  writeFileSafe(path.join(doorRoot, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2));
  writeFileSafe(path.join(doorRoot, 'index.ts'), index);

  console.log(`Created door skeleton at ${doorRoot}`);
  console.log('Next steps:');
  console.log(`  cd ${doorRoot}`);
  console.log('  npm install');
  console.log('  npm run build');
  console.log('  node ../../dev/scripts/install-sdk-doors.js --door', name);
}

main();
