import { By } from 'selenium-webdriver';

export const databaseName = 'addonray-saved-investigations';

export async function storedRecords(driver) {
  return driver.executeAsyncScript((name, done) => {
    const request = indexedDB.open(name, 1);
    request.onerror = () => done({ error: String(request.error) });
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction('records', 'readonly');
      const all = transaction.objectStore('records').getAll();
      all.onerror = () => done({ error: String(all.error) });
      all.onsuccess = () => {
        database.close();
        done({ records: all.result });
      };
    };
  }, databaseName);
}

export async function deleteShownRecord(driver) {
  const entry = await driver.findElement(By.css('.library-entry'));
  const deleteButton = await entry.findElement(
    By.xpath('.//button[normalize-space(.)="Delete"]'),
  );
  await driver.wait(async () => deleteButton.isEnabled(), 10000);
  await deleteButton.click();
  await driver
    .findElement(By.xpath('//button[normalize-space(.)="Delete saved record"]'))
    .click();
  await driver.wait(
    async () =>
      (await driver.findElements(By.css('.library-entry'))).length === 0,
    10000,
  );
}
