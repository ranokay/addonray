import { resolve } from 'node:path';
import { Command } from 'selenium-webdriver/lib/command.js';

// Firefox 140.0 deletes Base64-installed temporary archives too early (Mozilla bug 2045054).
// The browser and driver run locally; retain the directory until the test browser quits.
export function installTemporaryExtension(driver, directory) {
  return driver.execute(
    new Command('install addon')
      .setParameter('path', resolve(directory))
      .setParameter('temporary', true),
  );
}
