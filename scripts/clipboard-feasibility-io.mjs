import { By } from 'selenium-webdriver';

export function clipboardIO(driver, writerHandle, readerHandle) {
  async function readClipboard() {
    await driver.switchTo().window(readerHandle);
    await driver.executeScript(() => {
      globalThis.__clipboardReadResult = null;
    });
    await driver.findElement(By.id('read')).click();
    const result = await driver.wait(
      async () => {
        const value = await driver.executeScript(
          () => globalThis.__clipboardReadResult ?? null,
        );
        return value ?? false;
      },
      15000,
      'The test-only reader did not return a clipboard result',
    );
    return result;
  }
  const restoreClipboard = async (text) => {
    await driver.switchTo().window(writerHandle);
    if (text) await driver.findElement(By.id('restore-text')).sendKeys(text);
    await driver.findElement(By.id('restore')).click();
    const result = await driver.wait(async () => {
      const value = await driver.executeScript(
        () => globalThis.__clipboardResults?.restore ?? null,
      );
      return value ?? false;
    }, 15000);
    return { write: result, read: await readClipboard() };
  };

  return { readClipboard, restoreClipboard };
}
