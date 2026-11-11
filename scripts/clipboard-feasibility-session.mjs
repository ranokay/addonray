/* global WebExtensionPolicy */
import assert from 'node:assert/strict';
import { Builder } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js';
import { installTemporaryExtension } from './firefox-install.mjs';
import { launchChrome, installChromeExtension } from './chrome-session.mjs';
import { writerId, readerId } from './clipboard-feasibility-fixtures.mjs';

export async function startSession({
  target,
  requestedVersion,
  writer,
  reader,
  report,
  onDriver,
}) {
  let driver;
  let writerHandle;
  let readerHandle;
  if (target === 'firefox') {
    const options = new firefox.Options().addArguments('-headless');
    if (requestedVersion) options.setBrowserVersion(requestedVersion);
    driver = await new Builder()
      .forBrowser('firefox')
      .setFirefoxService(
        new firefox.ServiceBuilder().addArguments('--allow-system-access'),
      )
      .setFirefoxOptions(options)
      .build();
    onDriver(driver);
    await driver.manage().setTimeouts({ script: 30000, pageLoad: 30000 });
    report.browserVersion = (await driver.getCapabilities()).get(
      'browserVersion',
    );
    report.driverVersion = (await driver.getCapabilities()).get(
      'moz:geckodriverVersion',
    );
    if (requestedVersion)
      assert.equal(report.browserVersion, requestedVersion.replace(/esr$/, ''));
    await installTemporaryExtension(driver, writer);
    await installTemporaryExtension(driver, reader);
    async function extensionUrl(id, path) {
      await driver.setContext('chrome');
      const url = await driver.executeScript(
        (extensionId, resource) =>
          WebExtensionPolicy.getByID(extensionId).getURL(resource),
        id,
        path,
      );
      await driver.setContext('content');
      return url;
    }
    writerHandle = await driver.getWindowHandle();
    await driver.get(await extensionUrl(writerId, 'writer.html'));
    await driver.switchTo().newWindow('tab');
    readerHandle = await driver.getWindowHandle();
    await driver.get(await extensionUrl(readerId, 'reader.html'));
  } else {
    const session = await launchChrome();
    driver = session.driver;
    onDriver(driver);
    report.browserVersion = session.version;
    report.driverVersion = session.driverVersion;
    const fixtureWriterId = await installChromeExtension(session.cdp, writer);
    const fixtureReaderId = await installChromeExtension(session.cdp, reader);
    report.writer.id = fixtureWriterId;
    report.reader.id = fixtureReaderId;
    writerHandle = await driver.getWindowHandle();
    await driver.get(`chrome-extension://${fixtureWriterId}/writer.html`);
    await driver.switchTo().newWindow('tab');
    readerHandle = await driver.getWindowHandle();
    await driver.get(`chrome-extension://${fixtureReaderId}/reader.html`);
  }
  return { writerHandle, readerHandle };
}
