module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: '.*\.e2e-spec\.ts$',
  transform: {
    '^.+\.(t|j)s$': 'ts-jest'
  },
  testTimeout: 20000,
  collectCoverageFrom: ['src/**/*.ts'],
  coveragePathIgnorePatterns: ['/node_modules/', '/dist/']
};
