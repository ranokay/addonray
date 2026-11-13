import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const mib = 1024 * 1024;
export const writerId = 'clipboard-feasibility-writer@addonray.test';
export const readerId = 'clipboard-feasibility-reader@addonray.test';
const writerPage = `<!doctype html>
<html><head><meta charset="utf-8"><title>Clipboard writer</title></head>
<body>
<h1>Clipboard writer</h1>
<button id="write-now">Write immediately</button>
<button id="write-guarded">Write after guards</button>
<button id="write-mib">Write 1 MiB</button>
<button id="write-exec">execCommand copy</button>
<textarea id="restore-text" aria-label="Clipboard text to restore"></textarea>
<button id="restore">Restore clipboard</button>
<pre id="result">idle</pre>
<script src="writer.js"></script>
</body></html>`;

const writerScript = `const marker = 'addonray-feasibility-immediate';
const guardedMarker = 'addonray-feasibility-guarded';
const results = {};
window.__clipboardResults = results;
const detail = () => ({
  hasFocus: document.hasFocus(),
  activation: navigator.userActivation?.isActive ?? null,
  hasClipboard: Boolean(navigator.clipboard),
});
function record(name, value) {
  results[name] = value;
  document.getElementById('result').textContent = JSON.stringify(results);
}
async function write(name, text) {
  const before = detail();
  const started = performance.now();
  try {
    await navigator.clipboard.writeText(text);
    record(name, { status: 'resolved', before, elapsedMs: performance.now() - started });
  } catch (error) {
    record(name, {
      status: 'rejected',
      before,
      elapsedMs: performance.now() - started,
      error: { name: error?.name ?? null, message: String(error?.message ?? error) },
    });
  }
}
document.getElementById('write-now').addEventListener('click', () => {
  void write('immediate', marker);
});
document.getElementById('write-guarded').addEventListener('click', () => {
  void (async () => {
    const before = detail();
    const started = performance.now();
    try {
      const api = globalThis.browser ?? globalThis.chrome;
      // Simulate product revalidation: current-tab classification, a storage-like
      // await, and a final eligibility check before the write.
      await api.tabs.getCurrent();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 250));
      await api.tabs.getCurrent();
      await navigator.clipboard.writeText(guardedMarker);
      record('guarded', { status: 'resolved', before, elapsedMs: performance.now() - started });
    } catch (error) {
      record('guarded', {
        status: 'rejected',
        before,
        elapsedMs: performance.now() - started,
        error: { name: error?.name ?? null, message: String(error?.message ?? error) },
      });
    }
  })();
});
document.getElementById('write-mib').addEventListener('click', () => {
  void write('mib', 'x'.repeat(${mib}));
});
document.getElementById('write-exec').addEventListener('click', () => {
  const before = detail();
  const area = document.createElement('textarea');
  area.value = 'addonray-feasibility-exec';
  area.setAttribute('readonly', 'readonly');
  area.style.position = 'fixed';
  area.style.left = '-1000px';
  area.style.top = '0';
  document.body.append(area);
  area.select();
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch (error) {
    record('exec', { status: 'rejected', before, error: { name: error?.name ?? null, message: String(error?.message ?? error) } });
    area.remove();
    return;
  }
  area.remove();
  record('exec', { status: copied ? 'resolved' : 'rejected', before });
});
document.getElementById('restore').addEventListener('click', () => {
  void write('restore', window.__clipboardRestoreText ?? document.getElementById('restore-text').value);
});
window.__writeWithoutActivation = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await write('no-activation', 'addonray-feasibility-no-activation');
};
`;

const readerPage = `<!doctype html>
<html><head><meta charset="utf-8"><title>Clipboard reader</title></head>
<body>
<h1>Clipboard reader</h1>
<button id="read">Read clipboard</button>
<pre id="result">idle</pre>
<script src="reader.js"></script>
</body></html>`;

const readerScript = `window.__clipboardRead = async () => {
  try {
    const text = await navigator.clipboard.readText();
    const bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const hash = [...new Uint8Array(digest)]
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('');
    const result = {
      status: 'resolved',
      length: text.length,
      bytes: bytes.length,
      hash,
      text,
    };
    window.__clipboardReadResult = result;
    document.getElementById('result').textContent = JSON.stringify({ ...result, text: null });
    return result;
  } catch (error) {
    const result = {
      status: 'rejected',
      error: { name: error?.name ?? null, message: String(error?.message ?? error) },
    };
    window.__clipboardReadResult = result;
    document.getElementById('result').textContent = JSON.stringify({ ...result, text: null });
    return result;
  }
};
document.getElementById('read').addEventListener('click', () => {
  void window.__clipboardRead();
});
`;

export async function writeFixtures(directory) {
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, 'manifest.json'),
    JSON.stringify({
      manifest_version: 3,
      name: 'AddonRay clipboard feasibility writer',
      version: '1.0',
      browser_specific_settings: {
        gecko: {
          id: writerId,
          data_collection_permissions: { required: ['none'] },
        },
      },
      permissions: [],
    }),
  );
  await writeFile(join(directory, 'writer.html'), writerPage);
  await writeFile(join(directory, 'writer.js'), writerScript);
  return directory;
}

export async function writeReader(directory) {
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, 'manifest.json'),
    JSON.stringify({
      manifest_version: 3,
      name: 'AddonRay clipboard feasibility reader',
      version: '1.0',
      browser_specific_settings: {
        gecko: {
          id: readerId,
          data_collection_permissions: { required: ['none'] },
        },
      },
      // Test-only authority. The writer fixture and product manifest never
      // declare clipboardRead or clipboardWrite.
      permissions: ['clipboardRead'],
    }),
  );
  await writeFile(join(directory, 'reader.html'), readerPage);
  await writeFile(join(directory, 'reader.js'), readerScript);
  return directory;
}
