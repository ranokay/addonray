import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

async function entries(directory) {
  return (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
}

export async function snapshotDownloads(directory) {
  const snapshot = new Map();
  for (const name of await entries(directory)) {
    const details = await stat(join(directory, name), { bigint: true });
    snapshot.set(name, details.mtimeNs);
  }
  return snapshot;
}

// A completed file must be new or have a newer modification time than any
// pre-existing same-name artifact. Snapshot the directory before dispatching
// the download: a fast completion can otherwise look pre-existing. Partial
// downloads never satisfy the exact byte comparison because only the requested
// extension is considered.
export async function observeExactDownload({
  driver,
  directory,
  expected,
  before,
  pattern,
  description,
  timeout = 15000,
}) {
  assert(
    pattern instanceof RegExp,
    'Download observation requires a filename pattern',
  );
  const bytes = Buffer.from(expected, 'utf8');
  const observed = [];
  let changedNames = [];
  try {
    return await driver.wait(
      async () => {
        observed.splice(0, observed.length, ...(await entries(directory)));
        const changed = [];
        for (const name of observed) {
          if (!pattern.test(name)) continue;
          const path = join(directory, name);
          let details;
          try {
            details = await stat(path, { bigint: true });
          } catch (error) {
            if (error.code === 'ENOENT') continue;
            throw error;
          }
          const previous = before.get(name);
          if (previous !== undefined && details.mtimeNs <= previous) continue;
          changed.push({ name, path, details, previous });
        }
        changedNames = changed.map((entry) => entry.name);
        // One action must create or update exactly one generic file. Numbered
        // variants cover browsers that avoid overwriting a file.
        if (changed.length !== 1) return false;
        const [candidate] = changed;
        let content;
        try {
          content = await readFile(candidate.path);
        } catch (error) {
          if (error.code === 'ENOENT') return false;
          throw error;
        }
        if (!content.equals(bytes)) return false;
        return {
          filename: candidate.name,
          path: candidate.path,
          bytes: content.length,
          observedEntries: observed.slice(),
          changedEntries: changedNames.slice(),
          newlyObserved: candidate.previous === undefined,
          modifiedAtNs: candidate.details.mtimeNs.toString(),
          previousModifiedAtNs: candidate.previous?.toString() ?? null,
        };
      },
      timeout,
      `The browser did not create exactly one complete ${description} file with the reviewed UTF-8 bytes`,
    );
  } catch (error) {
    error.message += ` Observed entries: ${JSON.stringify(observed)}; changed matching files: ${JSON.stringify(changedNames)}`;
    throw error;
  }
}
