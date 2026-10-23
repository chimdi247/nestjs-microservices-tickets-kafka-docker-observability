// Run from the project root (uses the root toolchain + node_modules):  pnpm test:unit
module.exports = {
  rootDir: '../..',
  roots: ['<rootDir>/tests/unit'],
  testRegex: '.*\\.spec\\.ts$',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testEnvironment: 'node',
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: '<rootDir>/tests/tsconfig.json', isolatedModules: true }],
  },
  moduleNameMapper: {
    '^@app/common(|/.*)$': '<rootDir>/libs/common/src/$1',
    '^@app/database(|/.*)$': '<rootDir>/libs/database/src/$1',
    '^@app/kafka(|/.*)$': '<rootDir>/libs/kafka/src/$1',
    '^@app/observability(|/.*)$': '<rootDir>/libs/observability/src/$1',
  },
  collectCoverageFrom: ['apps/*/src/**/*.service.ts', 'libs/observability/src/**/*.ts'],
  coverageDirectory: '<rootDir>/coverage/unit',
};
