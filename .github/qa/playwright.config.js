// Studio26 QA — Playwright Configuration
const path = require('path');
const projectRoot = path.resolve(__dirname, '../..');

const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: __dirname,
  testMatch: 'qa.spec.js',
  timeout: 30_000,
  retries: 0,

  reporter: [
    ['list'],
    ['html', { outputFolder: path.join(projectRoot, 'playwright-report'), open: 'on-failure' }],
  ],

  use: {
    baseURL: 'http://localhost:3000',
    screenshot: 'only-on-failure',
    video: 'off',
    trace: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],

  outputDir: path.join(projectRoot, 'qa-screenshots'),
});
