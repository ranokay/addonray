import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Test-only WebExtension fixture for the #17 grant-dispatch diagnostic. The
// approved shape is optional webRequest with an optional host template; the
// fixture is loaded by command line so Chrome derives its ID from this path.
// Nothing here enters the product manifest, package or source archives.
export const fixtureManifest = {
  manifest_version: 3,
  name: 'AddonRay request grant dispatch diagnostic',
  version: '1.0',
  optional_permissions: ['webRequest'],
  optional_host_permissions: ['*://*/*'],
  background: { service_worker: 'bg.js' },
};

const background = `
const api = globalThis.chrome;
const state = {
  loadedAt: Date.now(),
  loadSerial: crypto.randomUUID(),
  namespaceAtLoad: Boolean(api.webRequest),
  attempts: [],
  events: [],
  counters: { allUrls: 0, exactHost: 0 },
  grantEvents: [],
  maxEvents: 40,
};
self.__diag = state;
const registered = new Set();
const filters = { allUrls: '<all_urls>', exactHost: 'http://127.0.0.1/*' };
function register(stage) {
  for (const filter of ['allUrls', 'exactHost']) {
    if (registered.has(filter)) {
      state.attempts.push({
        stage,
        filter,
        namespace: Boolean(api.webRequest),
        result: 'already-registered',
        at: Date.now(),
      });
      continue;
    }
    const entry = {
      stage,
      filter,
      namespace: Boolean(api.webRequest),
      at: Date.now(),
    };
    try {
      api.webRequest.onCompleted.addListener(
        (details) => {
          state.counters[filter]++;
          if (state.events.length < state.maxEvents) {
            state.events.push({
              filter,
              at: Date.now(),
              url: String(details.url),
              statusCode: details.statusCode ?? null,
              type: details.type,
              tabId: details.tabId,
              initiator: details.initiator ?? null,
            });
          }
        },
        { urls: [filters[filter]] },
      );
      registered.add(filter);
      entry.result = 'ok';
    } catch (error) {
      entry.result = String(error?.message ?? error);
    }
    state.attempts.push(entry);
  }
}
register('top-level');
try {
  api.permissions.onAdded.addListener((permissions) => {
    state.grantEvents.push({ kind: 'onAdded', at: Date.now(), permissions });
    register('permissions.onAdded');
  });
  api.permissions.onRemoved.addListener((permissions) => {
    state.grantEvents.push({ kind: 'onRemoved', at: Date.now(), permissions });
  });
} catch (error) {
  state.permissionsListenerError = String(error?.message ?? error);
}
api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'state') {
    sendResponse({
      state,
      manifest: api.runtime.getManifest(),
      runtimeId: api.runtime.id,
    });
    return true;
  }
  if (message?.type === 'arm') {
    register('message:arm');
    sendResponse({ state });
    return true;
  }
  if (message?.type === 'reload') {
    sendResponse({ ok: true });
    setTimeout(() => api.runtime.reload(), 100);
    return true;
  }
  return false;
});
`;

const ownerPage = `<!doctype html>
<html><head><meta charset="utf-8"><title>Request grant dispatch diagnostic</title></head>
<body>
<h1>Request grant dispatch diagnostic</h1>
<pre id="out">idle</pre>
<button id="start" disabled>Start</button>
<script src="owner.js"></script>
</body></html>
`;

const ownerScript = `
const api = globalThis.chrome;
const results = {};
window.__results = results;
window.__startDisabledAtLoad = document.getElementById('start').disabled;
window.__state = () => api.runtime.sendMessage({ type: 'state' });
window.__arm = () => api.runtime.sendMessage({ type: 'arm' });
window.__reload = () => api.runtime.sendMessage({ type: 'reload' });
window.__contains = () =>
  api.permissions.contains({
    permissions: ['webRequest'],
    origins: ['http://127.0.0.1/*'],
  });
window.__all = () => api.permissions.getAll();
window.__activation = () => navigator.userActivation?.isActive ?? null;
// Start stays disabled until the live grant snapshot is ready.
api.permissions
  .contains({ permissions: ['webRequest'], origins: ['http://127.0.0.1/*'] })
  .then((granted) => {
    window.__snapshot = { granted, at: Date.now() };
    window.__snapshotReadyAt = Date.now();
    document.getElementById('start').disabled = false;
  });
document.getElementById('start').addEventListener('click', () => {
  results.activation = navigator.userActivation?.isActive ?? null;
  results.requestedAt = Date.now();
  // Direct request as the first asynchronous action of the user gesture.
  api.permissions
    .request({ permissions: ['webRequest'], origins: ['http://127.0.0.1/*'] })
    .then(
      (granted) => {
        results.granted = granted;
        results.resolvedAt = Date.now();
        document.getElementById('out').textContent = JSON.stringify(results);
      },
      (error) => {
        results.error = {
          name: error?.name ?? null,
          message: String(error?.message ?? error),
        };
        document.getElementById('out').textContent = JSON.stringify(results);
      },
    );
});
`;

export const sourcePage = `<!doctype html>
<html><head><meta charset="utf-8"><title>Controlled source</title></head>
<body><h1>Controlled source</h1>
<script>
window.__documentId = crypto.randomUUID?.() ?? String(Date.now()) + '-' + Math.random();
window.__fire = async (paths) => {
  const output = [];
  for (const path of paths) {
    const startedAt = Date.now();
    const response = await fetch(path);
    output.push({ path, status: response.status, startedAt, endedAt: Date.now() });
  }
  return output;
};
</script></body></html>
`;

const sha256 = (value) =>
  createHash('sha256').update(Buffer.from(value, 'utf8')).digest('hex');

export async function writeDispatchFixture(directory) {
  await mkdir(directory, { recursive: true });
  const files = {
    manifest: JSON.stringify(fixtureManifest, null, 2),
    background,
    ownerPage,
    ownerScript,
  };
  await writeFile(join(directory, 'manifest.json'), files.manifest);
  await writeFile(join(directory, 'bg.js'), files.background);
  await writeFile(join(directory, 'owner.html'), files.ownerPage);
  await writeFile(join(directory, 'owner.js'), files.ownerScript);
  return {
    directory,
    hashes: {
      manifestSha256: sha256(files.manifest),
      backgroundSha256: sha256(files.background),
      ownerScriptSha256: sha256(files.ownerScript),
    },
    verify: async () => {
      const manifest = JSON.parse(
        await readFile(join(directory, 'manifest.json'), 'utf8'),
      );
      for (const [name, expected] of [
        ['manifest.json', files.manifest],
        ['bg.js', files.background],
        ['owner.html', files.ownerPage],
        ['owner.js', files.ownerScript],
      ]) {
        const actual = await readFile(join(directory, name), 'utf8');
        if (actual !== expected) throw new Error(`fixture ${name} changed`);
      }
      return manifest;
    },
  };
}
