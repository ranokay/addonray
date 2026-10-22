import { resolve } from 'node:path';
import { Command } from 'selenium-webdriver/lib/command.js';

// Firefox 140.0 deletes Base64-installed temporary archives too early (Mozilla bug 2045054).
// The browser and driver run locally; retain the files until the test browser quits.
export function installTemporaryExtension(driver, path) {
  return driver.execute(
    new Command('install addon')
      .setParameter('path', resolve(path))
      .setParameter('temporary', true),
  );
}
