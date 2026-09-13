import path from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * End-to-end: pick a file on /, wait for the share dialog, open the download
 * link in a fresh page, and confirm the decrypted bytes land on disk.
 */
test('upload, download and decrypt a single file', async ({
  page,
  context
}) => {
  const fixture = path.join(import.meta.dir, 'fixtures', 'hello.txt');

  await page.goto('/');
  await expect(page.locator('#file-upload')).toBeAttached({ timeout: 15_000 });

  await page.setInputFiles('#file-upload', fixture);

  // The WIP panel with the upload button appears once a file is staged.
  await expect(page.locator('#upload-btn')).toBeVisible();
  await page.locator('#upload-btn').click();

  // Share / copy dialog after a successful upload.
  const shareUrl = page.locator('#share-url');
  await expect(shareUrl).toBeVisible({ timeout: 30_000 });
  const url = await shareUrl.inputValue();
  expect(url).toContain('/download/');
  expect(url).toContain('#');

  // Download in a clean page so we do not reuse upload-page state.
  const downloadPage = await context.newPage();
  await downloadPage.goto(url);
  await expect(downloadPage.locator('#download-btn')).toBeVisible({
    timeout: 15_000
  });

  const [download] = await Promise.all([
    downloadPage.waitForEvent('download'),
    downloadPage.locator('#download-btn').click()
  ]);

  expect(download.suggestedFilename()).toBe('hello.txt');
  const filePath = await download.path();
  expect(filePath).toBeTruthy();
  const bytes = await Bun.file(filePath as string).text();
  expect(bytes).toBe('hello from send e2e\n');
});
