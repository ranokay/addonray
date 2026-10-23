import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { platform, arch } from 'node:os';
import { createInterface } from 'node:readline/promises';
import { Builder } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js';
import { installTemporaryExtension } from './firefox-install.mjs';
import { extensionArchive } from './package-paths.mjs';
import { checkPackage } from './check-package.mjs';

// This opens a disposable test profile and records no automatic UI verdict.
process.env.SE_AVOID_STATS = 'true';
process.env.SE_DRIVER_VERSION = '0.37.1';
process.env.SE_SKIP_DRIVER_IN_PATH = 'true';
process.env.SE_SKIP_BROWSER_IN_PATH = 'true';
const requestedVersion = process.env.FIREFOX_VERSION ?? '158.0.1';
assert.match(requestedVersion, /^\d+\.\d+(?:\.\d+)?(?:esr)?$/);
await mkdir('.scratch', { recursive: true });
const packaged = process.argv.includes('--package');
const extension = packaged ? (await checkPackage()).extension : null;
const report = {
  timestamp: new Date().toISOString(),
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim(),
  sourceDirty: Boolean(
    execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(),
  ),
  distribution: 'Firefox',
  os: `${platform()} ${arch()}`,
  requestedVersion,
  browserVersion: null,
  geckodriverVersion: null,
  installation: {
    mode: packaged ? 'temporary-unsigned-xpi' : 'temporary-unpacked',
    artifactSha256: extension?.sha256 ?? null,
  },
  result: 'pending',
};
const directory = await mkdtemp(resolve('.scratch/native-popup-'));
const fixture = join(directory, 'fixture');
await mkdir(fixture);
await writeFile(
  join(fixture, 'manifest.json'),
  JSON.stringify({
    manifest_version: 3,
    name: 'Controlled popup fixture',
    version: '1.0',
    permissions: ['storage'],
    browser_specific_settings: {
      gecko: { id: 'popup-fixture@addonray.test' },
    },
  }),
);

const server = createServer((_request, response) => {
  response.setHeader('Content-Type', 'text/html');
  response.end(
    '<!doctype html><title>AddonRay disposable popup check</title><h1>Controlled local page</h1>',
  );
});
await new Promise((accept) => server.listen(0, '127.0.0.1', accept));
let driver;
let input;
try {
  driver = await new Builder()
    .forBrowser('firefox')
    .setFirefoxOptions(
      new firefox.Options().setBrowserVersion(requestedVersion),
    )
    .build();
  const actualVersion = (await driver.getCapabilities()).get('browserVersion');
  assert.equal(actualVersion, requestedVersion.replace(/esr$/, ''));
  report.browserVersion = actualVersion;
  report.geckodriverVersion = (await driver.getCapabilities()).get(
    'moz:geckodriverVersion',
  );
  assert.equal(report.geckodriverVersion, '0.37.1');
  await installTemporaryExtension(driver, fixture);
  await installTemporaryExtension(
    driver,
    packaged ? extensionArchive : resolve('.output/firefox-mv3'),
  );
  await driver.get(`http://127.0.0.1:${server.address().port}/`);
  console.log(`Disposable Firefox ${actualVersion} is ready.`);
  console.log(
    'Follow docs/testing.md, including native New investigation consent, captures, manual assessment, Start over and reload. This helper does not verify UI outcomes.',
  );
  input = createInterface({ input: process.stdin, output: process.stdout });
  await input.question(
    'Press Enter after recording observations to close the test browser. ',
  );
  report.result = 'setup-and-cleanup-only';
} catch (error) {
  report.result = 'failed';
  report.failure = String(error);
  process.exitCode = 1;
  console.error(error);
} finally {
  input?.close();
  process.stdin.pause();
  try {
    if (driver) await driver.quit();
  } catch (error) {
    report.cleanupFailure = String(error);
    process.exitCode = 1;
  } finally {
    await new Promise((done) => {
      server.closeAllConnections();
      server.close(done);
    });
    await writeFile(
      `.scratch/firefox-native-${requestedVersion}.json`,
      `${JSON.stringify(report, null, 2)}\n`,
    );
  }
}
