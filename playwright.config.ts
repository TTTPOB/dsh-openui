import { defineConfig } from '@playwright/test'
export default defineConfig({ testDir: './tests/browser', timeout: 60000, workers: 1, use: { viewport: { width: 1280, height: 900 }, screenshot: 'only-on-failure', headless: true } })
