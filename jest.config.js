/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.json',
    }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  collectCoverageFrom: [
    'src/lib/**/*.ts',
    'src/services/**/*.ts',
    '!src/**/*.d.ts',
  ],
};

module.exports = config;
