import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Test-only clipboard readback. The reader and writer fixtures are generated in
// ignored scratch space and are never included in the product or source ZIP.
// The reader declares clipboardRead only for verification; the writer declares
// no clipboard permission and exists only to restore the preexisting clipboard
// as text. Other clipboard formats are not captured and are never claimed.
const readerId = 'clipboard-reader@addonray.test';
const writerId = 'clipboard-writer@addonray.test';

const readerPage = `<!doctype html>
<html><head><meta charset="utf-8"><title>Clipboard reader</title></head>
<body><h1>Clipboard reader</h1><button id="read">Read clipboard</button>
<pre id="result">idle</pre><script src="reader.js"></script></body></html>`;

const readerScript = `window.__clipboardRead = async () => {
  try {
    const text = await navigator.clipboard.readText();
    const bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const hash = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
    const result = { status: 'resolved', length: text.length, bytes: bytes.length, hash, text };
    window.__clipboardReadResult = result;
    document.getElementById('result').textContent = JSON.stringify({ ...result, text: null });
    return result;
  } catch (error) {
    const result = { status: 'rejected', error: { name: error?.name ?? null, message: String(error?.message ?? error) } };
    window.__clipboardReadResult = result;
    document.getElementById('result').textContent = JSON.stringify(result);
    return result;
  }
};
document.getElementById('read').addEventListener('click', () => { void window.__clipboardRead(); });`;

const writerPage = `<!doctype html>
<html><head><meta charset="utf-8"><title>Clipboard writer</title></head>
<body><h1>Clipboard writer</h1><textarea id="restore-text" aria-label="Clipboard text"></textarea>
<button id="restore">Restore clipboard</button><pre id="result">idle</pre>
<script src="writer.js"></script></body></html>`;

const writerScript = `window.__clipboardWriteResult = null;
document.getElementById('restore').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(window.__clipboardRestoreText ?? document.getElementById('restore-text').value);
    window.__clipboardWriteResult = { status: 'resolved' };
  } catch (error) {
    window.__clipboardWriteResult = { status: 'rejected', error: { name: error?.name ?? null, message: String(error?.message ?? error) } };
  }
  document.getElementById('result').textContent = JSON.stringify(window.__clipboardWriteResult);
});`;

export async function prepareClipboardFixtures(directory) {
  const reader = join(directory, 'reader');
  const writer = join(directory, 'writer');
  await mkdir(reader, { recursive: true });
  await mkdir(writer, { recursive: true });
  await writeFile(
    join(reader, 'manifest.json'),
    JSON.stringify({
      manifest_version: 3,
      name: 'AddonRay clipboard test reader',
      version: '1.0',
      browser_specific_settings: {
        gecko: {
          id: readerId,
          data_collection_permissions: { required: ['none'] },
        },
      },
      permissions: ['clipboardRead'],
    }),
  );
  await writeFile(join(reader, 'reader.html'), readerPage);
  await writeFile(join(reader, 'reader.js'), readerScript);
  await writeFile(
    join(writer, 'manifest.json'),
    JSON.stringify({
      manifest_version: 3,
      name: 'AddonRay clipboard test writer',
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
  await writeFile(join(writer, 'writer.html'), writerPage);
  await writeFile(join(writer, 'writer.js'), writerScript);
  return { reader, writer, readerId, writerId };
}
