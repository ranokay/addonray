import { execFileSync } from 'node:child_process';
import { arch, platform } from 'node:os';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { writerId, readerId } from './clipboard-feasibility-fixtures.mjs';

// Fixed system installation paths avoid an unverified PATH executable.
// Nonstandard installations fail before any browser or clipboard work.
export function createEvidence(target, requestedVersion) {
  const gitExecutable =
    platform() === 'win32'
      ? 'C:\\Program Files\\Git\\cmd\\git.exe'
      : '/usr/bin/git';
  return {
    target,
    timestamp: new Date().toISOString(),
    os: `${platform()} ${arch()}`,
    sourceCommit: execFileSync(gitExecutable, ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim(),
    sourceDirty: Boolean(
      execFileSync(gitExecutable, ['status', '--porcelain'], {
        encoding: 'utf8',
      }).trim(),
    ),
    requestedVersion: requestedVersion ?? null,
    writer: {
      id: writerId,
      manifestPermissions: [],
      clipboardPermission: false,
    },
    reader: {
      id: readerId,
      manifestPermissions: ['clipboardRead'],
      authority:
        'test-only readback; not part of the product or source package',
    },
    browserVersion: null,
    driverVersion: null,
    checks: [],
    policy: {},
    gaps: [
      'This probe records only the exact browser/OS/architecture it runs on.',
      'The reader fixture uses test-only clipboardRead authority to read exact bytes. It is separate from the writer and product manifests.',
      'The no-activation case records browser policy; it is not a product requirement or a substitute for deterministic rejection tests.',
      'A 1 MiB clipboard write establishes this distribution accepts the bound; it does not establish every OS clipboard consumer handles it.',
    ],
  };
}

export async function writeEvidence(report, target, requestedVersion) {
  const failures = report.checks.filter((check) => check.status === 'failed');
  report.result = failures.length === 0 ? 'passed' : 'failed';
  const suffix =
    target === 'firefox' && requestedVersion ? `-${requestedVersion}` : '';
  const reportName = `clipboard-feasibility-${target}${suffix}.json`;
  const reportPath = resolve('.scratch', reportName);
  await writeFile(
    reportPath,
    `${JSON.stringify(
      report,
      (key, value) =>
        ['text', 'prefix', 'suffix'].includes(key) ? undefined : value,
      2,
    )}\n`,
  );
  console.log(`Report: ${reportPath}`);
  return failures.length === 0;
}
