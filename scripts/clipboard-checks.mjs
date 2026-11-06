import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { platform } from 'node:os';
import { By, until } from 'selenium-webdriver';
import {
  CLIPBOARD_DENIED_MESSAGE,
  CLIPBOARD_SUCCESS_MESSAGE,
  CLIPBOARD_UNAVAILABLE_MESSAGE,
} from '../lib/report-clipboard.ts';

// Test-only clipboard readback. The reader and writer fixtures are generated in
// ignored scratch space and are never included in the product or source ZIP.
// The reader declares clipboardRead only for verification; the writer declares
// no clipboard permission and exists only to preserve the preexisting clipboard.
const readerId = 'clipboard-reader@addonray.test';
const writerId = 'clipboard-writer@addonray.test';

const readerPage = `<!doctype html>
<html><head><meta charset="utf-8"><title>Clipboard reader</title></head>
<body><h1>Clipboard reader</h1><button id="read">Read clipboard</button>
<pre id="result">idle</pre><script src="reader.js"></script></body></html>`;

const readerScript = `window.__clipboardRead = async () => {
  try {
    const text = await navigator.clipboard.readText();
    const bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const hash = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
    const result = { status: 'resolved', length: text.length, bytes: bytes.length, hash, text };
    window.__clipboardReadResult = result;
    document.getElementById('result').textContent = JSON.stringify({ ...result, text: null });
    return result;
  } catch (error) {
    const result = { status: 'rejected', error: { name: error?.name ?? null, message: String(error?.message ?? error) } };
    window.__clipboardReadResult = result;
    document.getElementById('result').textContent = JSON.stringify(result);
    return result;
  }
};
document.getElementById('read').addEventListener('click', () => { void window.__clipboardRead(); });`;

const writerPage = `<!doctype html>
<html><head><meta charset="utf-8"><title>Clipboard writer</title></head>
<body><h1>Clipboard writer</h1><textarea id="restore-text" aria-label="Clipboard text"></textarea>
<button id="restore">Restore clipboard</button><pre id="result">idle</pre>
<script src="writer.js"></script></body></html>`;

const writerScript = `window.__clipboardWriteResult = null;
document.getElementById('restore').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(document.getElementById('restore-text').value);
    window.__clipboardWriteResult = { status: 'resolved' };
  } catch (error) {
    window.__clipboardWriteResult = { status: 'rejected', error: { name: error?.name ?? null, message: String(error?.message ?? error) } };
  }
  document.getElementById('result').textContent = JSON.stringify(window.__clipboardWriteResult);
});`;

export async function prepareClipboardFixtures(directory) {
  const reader = join(directory, 'reader');
  const writer = join(directory, 'writer');
  await mkdir(reader, { recursive: true });
  await mkdir(writer, { recursive: true });
  await writeFile(
    join(reader, 'manifest.json'),
    JSON.stringify({
      manifest_version: 3,
      name: 'AddonRay clipboard test reader',
      version: '1.0',
      browser_specific_settings: {
        gecko: {
          id: readerId,
          data_collection_permissions: { required: ['none'] },
        },
      },
      permissions: ['clipboardRead'],
    }),
  );
  await writeFile(join(reader, 'reader.html'), readerPage);
  await writeFile(join(reader, 'reader.js'), readerScript);
  await writeFile(
    join(writer, 'manifest.json'),
    JSON.stringify({
      manifest_version: 3,
      name: 'AddonRay clipboard test writer',
      version: '1.0',
      browser_specific_settings: {
        gecko: {
          id: writerId,
          data_collection_permissions: { required: ['none'] },
        },
      },
      permissions: [],
    }),
  );
  await writeFile(join(writer, 'writer.html'), writerPage);
  await writeFile(join(writer, 'writer.js'), writerScript);
  return { reader, writer, readerId, writerId };
}

export function clipboardMetadata(result) {
  return result?.status === 'resolved'
    ? {
        status: result.status,
        bytes: result.bytes,
        hash: result.hash,
      }
    : { status: result?.status ?? 'missing', error: result?.error ?? null };
}

// The caller passes the product window it expects to return to. All reader and
// writer tabs are owned by this session and closed by close().
export function createClipboardSession({ driver, readerUrl, writerUrl }) {
  let readerHandle = null;
  let writerHandle = null;
  let initial = null;
  let restored = false;
  let closed = false;

  async function open(url, heading) {
    const before = new Set(await driver.getAllWindowHandles());
    await driver.switchTo().newWindow('tab');
    const handles = await driver.getAllWindowHandles();
    const handle =
      handles.find((candidate) => !before.has(candidate)) ??
      (await driver.getWindowHandle());
    await driver.get(url);
    const title = await driver.wait(until.elementLocated(By.css('h1')), 10000);
    assert.equal(await title.getText(), heading);
    return handle;
  }

  async function ensureReader() {
    if (readerHandle === null)
      readerHandle = await open(readerUrl, 'Clipboard reader');
  }

  async function ensureWriter() {
    if (writerHandle === null)
      writerHandle = await open(writerUrl, 'Clipboard writer');
  }

  async function readRaw() {
    try {
      await ensureReader();
    } catch (error) {
      throw new Error(`clipboard reader open failed: ${error}`, {
        cause: error,
      });
    }
    try {
      await driver.switchTo().window(readerHandle);
    } catch (error) {
      throw new Error(`clipboard reader focus failed: ${error}`, {
        cause: error,
      });
    }
    try {
      await driver.executeScript(() => {
        globalThis.__clipboardReadResult = null;
        return true;
      });
    } catch (error) {
      throw new Error(`clipboard reader reset failed: ${error}`, {
        cause: error,
      });
    }
    try {
      await driver.findElement(By.id('read')).click();
    } catch (error) {
      throw new Error(`clipboard reader click failed: ${error}`, {
        cause: error,
      });
    }
    return driver.wait(
      async () =>
        (await driver.executeScript(
          () => globalThis.__clipboardReadResult ?? null,
        )) ?? false,
      15000,
      'The clipboard test reader did not return a result',
    );
  }

  return {
    async snapshot(productHandle) {
      // Capture the preexisting clipboard once. Later calls must not switch
      // tabs immediately before a trusted copy click, because that can consume
      // the transient activation the write needs.
      if (initial === null) {
        initial = await readRaw();
        if (productHandle) await driver.switchTo().window(productHandle);
      }
      return clipboardMetadata(initial);
    },
    async read(productHandle) {
      const result = await readRaw();
      await driver.switchTo().window(productHandle);
      return result;
    },
    async readMetadata(productHandle) {
      const result = await readRaw();
      await driver.switchTo().window(productHandle);
      return clipboardMetadata(result);
    },
    isRestored: () => restored,
    async restore(productHandle) {
      if (closed)
        return { restored: false, reason: 'clipboard session already closed' };
      if (initial === null)
        return { restored: false, reason: 'no initial clipboard snapshot' };
      if (initial.status !== 'resolved')
        return {
          restored: false,
          reason: 'the preexisting clipboard was not readable',
        };
      try {
        await ensureWriter();
        await driver.switchTo().window(writerHandle);
        await driver.executeScript((value) => {
          document.getElementById('restore-text').value = value;
          globalThis.__clipboardWriteResult = null;
          return true;
        }, initial.text ?? '');
        await driver.findElement(By.id('restore')).click();
        const write = await driver.wait(
          async () =>
            (await driver.executeScript(
              () => globalThis.__clipboardWriteResult ?? null,
            )) ?? false,
          15000,
          'The clipboard test writer did not return a result',
        );
        const read = await readRaw();
        await driver.switchTo().window(productHandle);
        const result = {
          restored:
            write.status === 'resolved' &&
            read.status === 'resolved' &&
            read.hash === initial.hash,
          write,
          read: clipboardMetadata(read),
        };
        if (result.restored) restored = true;
        return result;
      } catch (error) {
        await driver.switchTo().window(productHandle);
        return {
          restored: false,
          reason: String(error?.message ?? error),
        };
      }
    },
    async close(productHandle) {
      closed = true;
      for (const handle of [readerHandle, writerHandle]) {
        if (handle === null) continue;
        try {
          await driver.switchTo().window(handle);
          await driver.close();
        } catch {
          /* The browser may already have closed an owned test tab. */
        }
      }
      readerHandle = null;
      writerHandle = null;
      if (productHandle) await driver.switchTo().window(productHandle);
    },
  };
}

// Deterministic denial/unavailable injection on the production page. It changes
// only the page's Clipboard view; the adapter's real production handling runs.
export async function injectClipboardOutcome(driver, mode) {
  return driver.executeScript((requested) => {
    const clipboard = navigator.clipboard;
    if (!clipboard) return { injected: false, reason: 'no clipboard API' };
    if (requested === 'denied') {
      const original = clipboard.writeText;
      try {
        Object.defineProperty(clipboard, 'writeText', {
          configurable: true,
          value: () =>
            Promise.reject(new DOMException('blocked', 'NotAllowedError')),
        });
      } catch (error) {
        return { injected: false, reason: String(error?.message ?? error) };
      }
      globalThis.__addonrayClipboardRestore = () => {
        Object.defineProperty(clipboard, 'writeText', {
          configurable: true,
          value: original,
        });
      };
      return { injected: true, mode: requested };
    }
    if (requested === 'unavailable') {
      const original = clipboard.writeText;
      try {
        Object.defineProperty(clipboard, 'writeText', {
          configurable: true,
          value: undefined,
        });
      } catch (error) {
        return { injected: false, reason: String(error?.message ?? error) };
      }
      globalThis.__addonrayClipboardRestore = () => {
        Object.defineProperty(clipboard, 'writeText', {
          configurable: true,
          value: original,
        });
      };
      return { injected: true, mode: requested };
    }
    return { injected: false, reason: 'unknown mode' };
  }, mode);
}

export async function restoreClipboardImplementation(driver) {
  return driver.executeScript(() => {
    if (typeof globalThis.__addonrayClipboardRestore !== 'function')
      return false;
    globalThis.__addonrayClipboardRestore();
    delete globalThis.__addonrayClipboardRestore;
    return true;
  });
}

export function clipboardTextHash(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

async function sectionText(driver, selector) {
  return driver.findElement(By.css(selector)).getText();
}

let screenshotSequence = 0;
async function captureScreenshot(driver, label, sectionSelector) {
  const directory = process.env.ADDONRAY_SCREENSHOT_DIR;
  if (!directory) return null;
  if (sectionSelector)
    await driver.executeScript((selector) => {
      const section = document.querySelector(selector);
      const status = section?.querySelector('p[role="status"]');
      status?.scrollIntoView({ block: 'center' });
      return true;
    }, sectionSelector);
  await mkdir(directory, { recursive: true });
  screenshotSequence += 1;
  const path = join(
    directory,
    `${String(screenshotSequence).padStart(2, '0')}-${label}.png`,
  );
  await writeFile(path, Buffer.from(await driver.takeScreenshot(), 'base64'));
  return path;
}

// Local native observation only. The browser test reader still verifies exact
// bytes; this additionally reads the host system clipboard after the write.
function systemClipboard(expected) {
  if (process.env.ADDONRAY_NATIVE_CLIPBOARD !== '1' || platform() !== 'darwin')
    return null;
  const text = execFileSync('/usr/bin/pbpaste', { encoding: 'utf8' });
  assert.equal(text, expected, 'The host system clipboard must match exactly');
  return {
    verified: true,
    bytes: Buffer.byteLength(text, 'utf8'),
    hash: clipboardTextHash(text),
  };
}

async function waitForStatus(driver, selector, message) {
  await driver.wait(
    async () => (await sectionText(driver, selector)).includes(message),
    10000,
    `The clipboard status did not report: ${message}`,
  );
}

// Exact trusted-click success on the production page. Rejection handling is
// verified separately in verifyClipboardFailures so no injected platform state
// can affect later copy flows in the same document.
export async function verifyClipboardOutcomes({
  driver,
  clipboard,
  sectionSelector,
  previewId,
  buttonId,
  expected,
  authority,
  passed,
}) {
  const productHandle = await driver.getWindowHandle();
  const initial = await clipboard.snapshot(productHandle);
  const preview = await driver.findElement(By.id(previewId));
  assert.equal(await preview.getProperty('readOnly'), true);
  assert.equal(await preview.getProperty('value'), expected);

  await driver.findElement(By.id(buttonId)).click();
  await waitForStatus(driver, sectionSelector, CLIPBOARD_SUCCESS_MESSAGE);
  const success = await clipboard.read(productHandle);
  assert.equal(success.status, 'resolved', JSON.stringify(success));
  assert.equal(success.text, expected);
  assert.equal(success.bytes, Buffer.byteLength(expected, 'utf8'));
  assert.equal(success.hash, clipboardTextHash(expected));
  const system = systemClipboard(expected);
  const screenshot = await captureScreenshot(
    driver,
    'clipboard-success',
    sectionSelector,
  );
  assert.equal(
    await driver.findElement(By.id(previewId)).getProperty('value'),
    expected,
    'A successful copy must preserve the reviewed preview',
  );

  const evidence = {
    initial,
    success: {
      bytes: success.bytes,
      hash: success.hash,
      exactMatch: true,
      previewPreserved: true,
      successAfterWrite: true,
      ...(system ? { systemClipboard: system } : {}),
      ...(screenshot ? { screenshot } : {}),
    },
  };
  passed(
    `${authority}: explicit copy writes the exact reviewed Markdown after a trusted click`,
    { clipboard: evidence },
  );
  return evidence;
}

// Final clipboard action for one document. A synthetic click records the
// browser's actual no-activation policy; denial handling is then exercised with
// a deterministic injected rejection where the browser legitimately permits the
// write. Unavailable is injected last, so no restored platform state can leak
// into another copy flow.
export async function verifyClipboardFailures({
  driver,
  sectionSelector,
  previewId,
  buttonId,
  expected,
  authority,
  passed,
}) {
  await new Promise((resolve) => setTimeout(resolve, 6000));
  const policy = await driver.executeScript(() => ({
    activation: navigator.userActivation?.isActive ?? null,
    focus: document.hasFocus(),
  }));
  await driver.executeScript(
    (id) => document.getElementById(id).click(),
    buttonId,
  );
  const noActivation = await driver.wait(
    async () => {
      const text = await sectionText(driver, sectionSelector);
      if (text.includes(CLIPBOARD_SUCCESS_MESSAGE))
        return { outcome: 'permitted', activation: policy };
      if (text.includes(CLIPBOARD_DENIED_MESSAGE))
        return { outcome: 'denied', activation: policy };
      return false;
    },
    15000,
    'The synthetic no-activation copy produced no bounded outcome',
  );

  let denied;
  if (noActivation.outcome === 'denied') {
    const previewPreserved =
      (await driver.findElement(By.id(previewId)).getProperty('value')) ===
      expected;
    assert.equal(previewPreserved, true);
    denied = {
      source: 'real synthetic no-activation click',
      explicitMessage: true,
      previewPreserved,
      screenshot: await captureScreenshot(
        driver,
        'clipboard-denied',
        sectionSelector,
      ),
    };
  } else {
    const injected = await injectClipboardOutcome(driver, 'denied');
    assert.equal(injected.injected, true, JSON.stringify(injected));
    await driver.findElement(By.id(buttonId)).click();
    await waitForStatus(driver, sectionSelector, CLIPBOARD_DENIED_MESSAGE);
    const previewPreserved =
      (await driver.findElement(By.id(previewId)).getProperty('value')) ===
      expected;
    assert.equal(previewPreserved, true);
    denied = {
      source: 'deterministic injected NotAllowedError',
      explicitMessage: true,
      previewPreserved,
      screenshot: await captureScreenshot(
        driver,
        'clipboard-denied',
        sectionSelector,
      ),
    };
  }

  const injected = await injectClipboardOutcome(driver, 'unavailable');
  assert.equal(injected.injected, true, JSON.stringify(injected));
  await driver.findElement(By.id(buttonId)).click();
  await waitForStatus(driver, sectionSelector, CLIPBOARD_UNAVAILABLE_MESSAGE);
  const previewPreserved =
    (await driver.findElement(By.id(previewId)).getProperty('value')) ===
    expected;
  assert.equal(previewPreserved, true);

  const evidence = {
    noActivation,
    denied,
    unavailable: {
      injected: true,
      explicitMessage: true,
      previewPreserved,
      screenshot: await captureScreenshot(
        driver,
        'clipboard-unavailable',
        sectionSelector,
      ),
    },
  };
  passed(
    `${authority}: clipboard denial and unavailable outcomes are explicit and preserve the review`,
    { clipboard: evidence },
  );
  return evidence;
}
