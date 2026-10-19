import { test, expect } from '@playwright/test';
import { copyFileSync } from 'node:fs';
import { fixtureSession, sendPrompt, waitForReply, readCalls } from './helpers/demo';

test('openui_check returns structured results for correct and incorrect source in a real Host', async ({ page }) => {
  test.skip(!process.env.DSH_FIXTURE_CHECK_SOURCES, 'Requires the opt-in fake tool-call fixture');
  await fixtureSession(page);
  const before = readCalls().length;
  await sendPrompt(page, '检查两段 OpenUI 程序');
  await waitForReply(page);
  const calls = readCalls().slice(before) as { toolMessages?: { content: { type: string; text?: string }[] }[] }[];
  expect(calls).toHaveLength(2);
  const messages = calls[1].toolMessages;
  expect(messages).toHaveLength(2);
  const results = messages!.map(message => JSON.parse(message.content.filter(block => block.type === 'text').map(block => block.text).join('')));
  expect(results[0]).toEqual({ ok: true, errors: [] });
  expect(results[1].ok).toBe(false);
  expect(results[1].errors[0]).toMatchObject({ line: 1, code: 'unknown-component' });
  expect(results[1].errors[0].message).toContain('Missing');
  expect(results[1].errors[0].suggestion).toBeTruthy();
});

test('invalid OpenUI shows a readable statement error and preserves the entire source', async ({ page }) => {
  expect(process.env.DSH_FIXTURE_REPLY).toBeTruthy();
  copyFileSync('packages/dsh-openui/examples/invalid-reply.md', process.env.DSH_FIXTURE_REPLY!);
  await fixtureSession(page);
  const before = readCalls().length;
  await sendPrompt(page, '显示一个带错误的界面供校验');
  await waitForReply(page);
  const notice = page.locator('[data-dsh-openui-error]');
  await expect(notice).toBeVisible();
  await expect(notice.locator('p')).toContainText('第 2 行');
  await expect(notice.locator('p')).toContainText('Missing');
  await expect(notice.locator('p')).toContainText('建议');
  const code = page.locator('pre code').filter({ hasText: 'Missing(1)' });
  await expect(code).toBeVisible();
  await expect(code).toHaveText('title = "错误示例"\nroot = Card(title, [Missing(1)])');
  expect(readCalls().length).toBe(before + 1);
  await page.getByRole('button', { name: 'New session', exact: true }).first().click();
  await expect(notice).toHaveCount(0);
});
