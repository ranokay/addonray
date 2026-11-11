import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { platform } from 'node:os';
import { By } from 'selenium-webdriver';
import {
  CLIPBOARD_DENIED_MESSAGE,
  CLIPBOARD_SUCCESS_MESSAGE,
  CLIPBOARD_UNAVAILABLE_MESSAGE,
} from '../lib/report-clipboard.ts';

export { prepareClipboardFixtures } from './clipboard-fixtures.mjs';
export {
  clipboardMetadata,
  createClipboardSession,
} from './clipboard-session.mjs';

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

function normalizeClipboardText(text) {
  return text.replaceAll('\r\n', '\n');
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
  assert.equal(
    normalizeClipboardText(success.text),
    normalizeClipboardText(expected),
    'Copied content must equal the reviewed content',
  );
  const exactMatch = success.text === expected;
  const lineEndingNormalization = exactMatch ? null : 'CRLF';
  if (!exactMatch)
    assert.equal(
      success.text,
      expected.replaceAll('\n', '\r\n'),
      'Only platform CRLF normalization is accepted',
    );
  assert.equal(success.bytes, Buffer.byteLength(success.text, 'utf8'));
  assert.equal(success.hash, clipboardTextHash(success.text));
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
      expectedBytes: Buffer.byteLength(expected, 'utf8'),
      expectedHash: clipboardTextHash(expected),
      exactMatch,
      ...(lineEndingNormalization ? { lineEndingNormalization } : {}),
      previewPreserved: true,
      successAfterWrite: true,
      ...(system ? { systemClipboard: system } : {}),
      ...(screenshot ? { screenshot } : {}),
    },
  };
  passed(
    `${authority}: explicit copy writes the reviewed Markdown after a trusted click`,
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
