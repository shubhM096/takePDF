module.exports = {
  testEnvironment: 'jsdom',
  testTimeout: 10000,
  setupFiles: ['./tests/setup.js'],
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: [
    'utils.js',
    'background.js',
    'content.js',
    'popup.js',
    'settings.js'
  ]
};
