import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { Builder } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import { checkPackage } from './check-package.mjs';

export const chromeVersion = '156.0.8078.47';

export function chromeExtensionId(path) {
  const digest = createHash('sha256').update(resolve(path)).digest();
  return [...digest.subarray(0, 16)]
    .flatMap((byte) => [byte >> 4, byte & 0x0f])
    .map((nibble) => String.fromCharCode(97 + nibble))
    .join('');
}

// Browser-root commands must omit sessionId; Selenium's convenience CDP connection attaches a page.
export async function browserProtocol(debuggerAddress) {
  assert.match(debuggerAddress, /^(?:localhost|127\.0\.0\.1):\d+$/);
  const response = await fetch(`http://${debuggerAddress}/json/version`);
  assert(response.ok, 'Chrome browser debugger metadata unavailable');
  const { webSocketDebuggerUrl } = await response.json();
  const socket = new WebSocket(webSocketDebuggerUrl);
  const pending = new Map();
  let sequence = 0;
  const opened = Promise.withResolvers();
  socket.addEventListener('open', () => opened.resolve());
  socket.addEventListener('error', () =>
    opened.reject(new Error('Chrome test debugger connection failed')),
  );
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  });
  socket.addEventListener('close', () => {
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(new Error('Chrome test debugger disconnected'));
    }
    pending.clear();
  });
  const openTimeout = setTimeout(() => {
    opened.reject(new Error('Chrome test debugger connection timed out'));
    socket.close();
  }, 10000);
  try {
    await opened.promise;
  } finally {
    clearTimeout(openTimeout);
  }
  return {
    close: () => socket.close(),
    send(method, params = {}, sessionId) {
      const id = ++sequence;
      const result = Promise.withResolvers();
      const timer = setTimeout(() => {
        pending.delete(id);
        result.reject(new Error(`Chrome test command timed out: ${method}`));
      }, 15000);
      pending.set(id, { ...result, timer });
      socket.send(
        JSON.stringify({
          id,
          method,
          params,
          ...(sessionId ? { sessionId } : {}),
        }),
      );
      return result.promise;
    },
  };
}

export async function launchChrome({
  headless = true,
  userDataDir = null,
  loadExtensions = [],
  incognito = false,
} = {}) {
  const version = process.env.CHROME_VERSION ?? chromeVersion;
  assert.equal(
    version,
    chromeVersion,
    'Update the explicit Chrome qualification pin before selecting another release.',
  );
  process.env.SE_AVOID_STATS = 'true';
  process.env.SE_SKIP_DRIVER_IN_PATH = 'true';
  process.env.SE_SKIP_BROWSER_IN_PATH = 'true';
  process.env.SE_DRIVER_VERSION = version;
  // ChromeDriver otherwise hides extension-created tabs from its window handles.
  const options = new chrome.Options({
    'goog:chromeOptions': { enableExtensionTargets: true },
  })
    .setBrowserVersion(version)
    .addArguments('--no-first-run', '--no-default-browser-check');
  if (headless) options.addArguments('--headless=new');
  if (incognito) options.addArguments('--incognito');
  if (userDataDir)
    options.addArguments(`--user-data-dir=${resolve(userDataDir)}`);
  for (const extension of loadExtensions)
    options.addArguments(`--load-extension=${resolve(extension)}`);
  if (loadExtensions.length)
    options.addArguments(
      `--disable-extensions-except=${loadExtensions
        .map((extension) => resolve(extension))
        .join(',')}`,
    );
  await mkdir('.scratch', { recursive: true });
  const service = new chrome.ServiceBuilder()
    .loggingTo(resolve('.scratch/chromedriver.log'))
    .enableVerboseLogging();
  const driver = await new Builder()
    .forBrowser('chrome')
    .setChromeOptions(options)
    .setChromeService(service)
    .build();
  try {
    const capabilities = await driver.getCapabilities();
    assert.equal(capabilities.get('browserVersion'), version);
    const driverVersion = capabilities
      .get('chrome')
      .chromedriverVersion.split(' ')[0];
    assert.equal(driverVersion, version);
    const cdp = await browserProtocol(
      capabilities.get('goog:chromeOptions').debuggerAddress,
    );
    return { driver, cdp, version, driverVersion };
  } catch (error) {
    await driver.quit();
    throw error;
  }
}

export async function extractChromePackage(directory) {
  const { extension } = await checkPackage('chrome');
  await mkdir(directory, { recursive: true });
  for (const [path, bytes] of extension.files) {
    const destination = join(directory, path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, bytes);
  }
  return extension;
}

export async function installChromeExtension(cdp, path) {
  const result = await cdp.send('Extensions.loadUnpacked', { path });
  assert.match(result.id, /^[a-p]{32}$/);
  return result.id;
}
