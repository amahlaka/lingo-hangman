export default {
  testEnvironment: 'jest-fixed-jsdom',
  moduleFileExtensions: ['js', 'jsx'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testMatch: ['<rootDir>/src/**/__tests__/**/*.test.{js,jsx}'],
  transform: {
    '^.+\\.(js|jsx)$': 'babel-jest',
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // Vite-only import.meta.glob; tests read content/ with fs instead.
    '^(.*)/bundledContent$': '$1/bundledContent.node.js',
    '\\.(css|less|scss|sass)$': '<rootDir>/src/__tests__/styleStub.js',
  },
};
