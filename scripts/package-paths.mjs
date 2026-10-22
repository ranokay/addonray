import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const metadata = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8'),
);

export const extensionArchive = resolve(
  `.output/addonray-${metadata.version}-firefox.xpi`,
);
export const sourceArchive = resolve(
  `.output/addonray-${metadata.version}-sources.zip`,
);
