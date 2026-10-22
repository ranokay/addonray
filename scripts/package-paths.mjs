import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const metadata = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8'),
);

export function packagePaths(browser = 'firefox') {
  if (browser !== 'firefox' && browser !== 'chrome') {
    throw new Error(`Unsupported package target: ${browser}`);
  }
  return {
    browser,
    outputDirectory: resolve(`.output/${browser}-mv3`),
    extensionArchive: resolve(
      `.output/addonray-${metadata.version}-${browser}.${browser === 'firefox' ? 'xpi' : 'zip'}`,
    ),
    sourceArchive: resolve(
      `.output/addonray-${metadata.version}-${browser}-sources.zip`,
    ),
  };
}

export const { extensionArchive, sourceArchive } = packagePaths();
