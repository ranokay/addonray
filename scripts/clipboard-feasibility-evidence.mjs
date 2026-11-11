import { execFileSync } from 'node:child_process';
import { arch, platform } from 'node:os';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { writerId, readerId } from './clipboard-feasibility-fixtures.mjs';

// Use the platform Git binary by absolute path, never a PATH lookup.
export function createEvidence(target, requestedVersion) {
  return {
    target,
    timestamp: new Date().toISOString(),
    os: `${platform()} ${arch()}`,
    sourceCommit: execFileSync('/usr/bin/git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim(),
    sourceDirty: Boolean(
      execFileSync('/usr/bin/git', ['status', '--porcelain'], {
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
  let reportName = 'clipboard-feasibility-firefox.json';
  if (target === 'chrome') reportName = 'clipboard-feasibility-chrome.json';
  else if (requestedVersion === '140.0')
    reportName = 'clipboard-feasibility-firefox-140.0.json';
  else if (requestedVersion === '153.5.1esr')
    reportName = 'clipboard-feasibility-firefox-153.5.1esr.json';
  else if (requestedVersion === '158.0.1')
    reportName = 'clipboard-feasibility-firefox-158.0.1.json';
  const reportPath = resolve('.scratch', reportName);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Report: ${reportPath}`);
  return failures.length === 0;
}
