import { defineConfig } from '@playwright/test';
import fs from 'fs';
import path from 'path';

function findLocalChrome(): string | undefined {
  const candidates = [
    process.env.PLAYWRIGHT_CHROME_PATH,
    path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ];
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return undefined;
}

const localChrome = findLocalChrome();

export default defineConfig({
  testDir: './tests',
  timeout: 120000,
  expect: { timeout: 5000 },
  use: {
    headless: true,
    baseURL: process.env.PW_BASE_URL || 'http://localhost:5175',
    viewport: { width: 1280, height: 900 },
    actionTimeout: 10000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        // Prefer an explicit local executable if found; otherwise try the installed channel.
        ...(localChrome ? { launchOptions: { executablePath: localChrome } } : { channel: process.env.PLAYWRIGHT_CHROME_CHANNEL || 'chrome' }),
      },
    },
  ],
});
