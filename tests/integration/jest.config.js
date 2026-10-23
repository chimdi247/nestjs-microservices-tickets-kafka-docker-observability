module.exports = {
  rootDir: '.',
  testRegex: '.*\\.it-spec\\.ts$',
  testEnvironment: 'node',
  testTimeout: 120_000,
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.integration.json', isolatedModules: true }] },
  maxWorkers: 1, // the gateway has per-IP rate limits; keep tests sequential
};
