module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.ts$': ['@swc/jest', {
      jsc: {
        parser: {
          syntax: 'typescript',
          tsx: false,
          decorators: true,
        },
        target: 'es2020',
        transform: {
          decoratorMetadata: true,
          legacyDecorator: true,
        },
        keepClassNames: true,
      },
      module: { type: 'commonjs' },
    }],
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testTimeout: 10000,
  // ESM-style relative imports use `.js` suffixes that swc/jest preserves.
  // Strip them so jest's resolver finds the underlying `.ts` source.
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    // The SDK's settings module, from source. The package root pulls in the
    // server bundle and its audio engine (Tone.js is ESM and jest cannot parse
    // it), and the installed package is a symlink to a built dist that a
    // worktree does not rebuild.
    '^@amiexpress/bbs-door-sdk/settings$': '<rootDir>/../../sdk/core/settings',
    // The PETSCII core is imported by backend source through the package
    // exports map (sdk/dist). Tests resolve it to the SDK SOURCE instead so a
    // RED/GREEN cycle never depends on a stale sdk/dist build.
    '^@amiexpress/bbs-door-sdk/petscii$': '<rootDir>/../../sdk/petscii/index.ts',
    '^@amiexpress/bbs-door-sdk/petscii/frame$': '<rootDir>/../../sdk/petscii/frame/index.ts',
  },
};
