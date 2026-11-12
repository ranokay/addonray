import assert from 'node:assert/strict';
import { By, until } from 'selenium-webdriver';
import {
  assertHeadfulClipboardAllowed,
  CLIPBOARD_RESTORE_SCOPE,
} from './clipboard-guard.ts';

export function clipboardMetadata(result) {
  return result?.status === 'resolved'
    ? {
        status: result.status,
        scope: CLIPBOARD_RESTORE_SCOPE,
        bytes: result.bytes,
        hash: result.hash,
      }
    : { status: result?.status ?? 'missing', error: result?.error ?? null };
}

// The caller passes the product window it expects to return to. All reader and
// writer tabs are owned by this session and closed by close().
export function createClipboardSession({ driver, readerUrl, writerUrl }) {
  // Refuse headful/native host-clipboard runs before any read or write.
  assertHeadfulClipboardAllowed();
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
      assert.equal(
        initial.status,
        'resolved',
        'Initial clipboard must be readable before any copy',
      );
      assert.equal(
        typeof initial.text,
        'string',
        'Initial clipboard text must be retained for restoration',
      );
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
    owns: (handle) => handle === readerHandle || handle === writerHandle,
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
          globalThis.__clipboardRestoreText = value;
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
          scope: CLIPBOARD_RESTORE_SCOPE,
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
