# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: upload-download.e2e.ts >> upload, download and decrypt a single file
- Location: e2e/upload-download.e2e.ts:12:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('#share-url')
Expected: visible
Timeout: 30000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" locator('#share-url') with timeout 30000ms
  - waiting for locator('#share-url')

```

```yaml
- banner:
  - link "Send":
    - /url: /
    - img "Send"
    - img
- main:
  - img
  - heading "hello.txt" [level=1]
  - text: 20B Expires after 1 download or 1d 0h 0m 0%
  - progressbar: 0%
  - button "Cancel"
  - heading "Simple, private file sharing" [level=1]
  - paragraph: Send lets you share files with end-to-end encryption and a link that automatically expires. So you can keep what you share private and make sure your stuff doesn’t stay online forever.
- contentinfo:
  - list:
    - listitem: Not affiliated with Mozilla or Firefox.
  - list:
    - listitem:
      - link "CLI":
        - /url: https://github.com/timvisee/ffsend
    - listitem:
      - link "Source":
        - /url: https://github.com/timvisee/send
```

# Test source

```ts
  1  | import fs from 'node:fs';
  2  | import path from 'node:path';
  3  | import { fileURLToPath } from 'node:url';
  4  | import { expect, test } from '@playwright/test';
  5  | 
  6  | const here = path.dirname(fileURLToPath(import.meta.url));
  7  | 
  8  | /**
  9  |  * End-to-end: pick a file on /, wait for the share dialog, open the download
  10 |  * link in a fresh page, and confirm the decrypted bytes land on disk.
  11 |  */
  12 | test('upload, download and decrypt a single file', async ({
  13 |   page,
  14 |   context
  15 | }) => {
  16 |   const fixture = path.join(here, 'fixtures', 'hello.txt');
  17 | 
  18 |   await page.goto('/');
  19 |   await expect(page.locator('#file-upload')).toBeAttached({ timeout: 15_000 });
  20 | 
  21 |   await page.setInputFiles('#file-upload', fixture);
  22 | 
  23 |   // The WIP panel with the upload button appears once a file is staged.
  24 |   await expect(page.locator('#upload-btn')).toBeVisible();
  25 |   await page.locator('#upload-btn').click();
  26 | 
  27 |   // Share / copy dialog after a successful upload.
  28 |   const shareUrl = page.locator('#share-url');
> 29 |   await expect(shareUrl).toBeVisible({ timeout: 30_000 });
     |                          ^ Error: expect(locator).toBeVisible() failed
  30 |   const url = await shareUrl.inputValue();
  31 |   expect(url).toContain('/download/');
  32 |   expect(url).toContain('#');
  33 | 
  34 |   // Download in a clean page so we do not reuse upload-page state.
  35 |   const downloadPage = await context.newPage();
  36 |   await downloadPage.goto(url);
  37 |   await expect(downloadPage.locator('#download-btn')).toBeVisible({
  38 |     timeout: 15_000
  39 |   });
  40 | 
  41 |   const [download] = await Promise.all([
  42 |     downloadPage.waitForEvent('download'),
  43 |     downloadPage.locator('#download-btn').click()
  44 |   ]);
  45 | 
  46 |   expect(download.suggestedFilename()).toBe('hello.txt');
  47 |   const filePath = await download.path();
  48 |   expect(filePath).toBeTruthy();
  49 |   const bytes = fs.readFileSync(filePath as string, 'utf8');
  50 |   expect(bytes).toBe('hello from send e2e\n');
  51 | });
  52 | 
```