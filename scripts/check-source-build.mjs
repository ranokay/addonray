import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { platform, arch } from 'node:os';
import { packagePaths } from './package-paths.mjs';
import {
  checkPackage,
  compareFiles,
  directoryFiles,
} from './check-package.mjs';

const { browser } = packagePaths(process.argv[2]);
const { extension, sources } = await checkPackage(browser);
await mkdir('.scratch', { recursive: true });
const work = await mkdtemp(resolve('.scratch/source-build-'));
for (const [path, bytes] of sources.files) {
  const destination = join(work, path);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, bytes);
}
for (const args of [
  ['install', '--frozen-lockfile'],
  ['run', browser === 'firefox' ? 'build' : 'build:chrome'],
]) {
  execFileSync(process.execPath, args, { cwd: work, stdio: 'inherit' });
}
const rebuilt = await directoryFiles(join(work, `.output/${browser}-mv3`));
compareFiles(rebuilt, extension.files);
const report = {
  timestamp: new Date().toISOString(),
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim(),
  sourceDirty: Boolean(
    execFileSync('git', ['status', '--porcelain'], {
      encoding: 'utf8',
    }).trim(),
  ),
  os: `${platform()} ${arch()}`,
  browser,
  manifestVersion: 3,
  bunRevision: Bun.revision,
  extensionSha256: extension.sha256,
  sourceSha256: sources.sha256,
  comparedFiles: [...rebuilt.keys()].sort(),
  result: 'passed',
};
await writeFile(
  `.scratch/source-build-evidence${browser === 'firefox' ? '' : '-chrome'}.json`,
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log('Source archive rebuild matches every packaged extension file.');
