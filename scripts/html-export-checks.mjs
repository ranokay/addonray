import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { By } from 'selenium-webdriver';
import {
  observeExactDownload,
  snapshotDownloads,
} from './download-observation.mjs';

const htmlNamePattern = /^addonray-investigation(?: ?\(\d+\))?\.html$/;
const limitBytes = 1024 * 1024;
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export const snapshotHtmlDownloads = snapshotDownloads;

export function observeExactHtmlDownload(options) {
  return observeExactDownload({
    ...options,
    pattern: htmlNamePattern,
    description: 'generic HTML',
  });
}

export async function waitForHtmlPreview(driver, frameId, timeout = 10000) {
  return driver.wait(
    async () => {
      const state = await driver.executeScript((id) => {
        const frame = document.getElementById(id);
        if (!(frame instanceof HTMLIFrameElement)) return null;
        const loaded = frame.contentDocument;
        return {
          hasSrcdoc:
            typeof frame.srcdoc === 'string' && frame.srcdoc.length > 0,
          readyState: loaded?.readyState ?? null,
          hasRoot: Boolean(loaded?.documentElement),
          frameElement: loaded?.defaultView?.frameElement === frame,
        };
      }, frameId);
      return state?.hasSrcdoc &&
        state.readyState === 'complete' &&
        state.hasRoot &&
        state.frameElement
        ? state
        : false;
    },
    timeout,
    'The printable preview did not finish loading its exact document',
  );
}

export async function readHtmlPreview(driver, frameId) {
  return driver.executeScript((id) => {
    const frame = document.getElementById(id);
    if (!(frame instanceof HTMLIFrameElement))
      throw new Error(`Missing printable preview frame: ${id}`);
    const loaded = frame.contentDocument;
    const view = frame.contentWindow;
    if (!loaded || !view) throw new Error('Printable frame is not loaded');
    const expected = new DOMParser().parseFromString(
      frame.srcdoc,
      'text/html',
    ).documentElement;
    return {
      srcdoc: frame.srcdoc,
      readyState: loaded.readyState,
      sameFrame: view.frameElement === frame,
      sameDocument: view.document === loaded,
      loadedOuterHtml: loaded.documentElement.outerHTML,
      expectedOuterHtml: expected.outerHTML,
      title: loaded.title,
      scriptCount: loaded.querySelectorAll(
        'script, img, link, iframe, object, embed, form, input, button',
      ).length,
      attributeResources: loaded.querySelectorAll(
        '[src], [href], [action], [style]',
      ).length,
      inlineStyleCount: loaded.querySelectorAll('style').length,
      sandbox: [...frame.sandbox].sort((a, b) => a.localeCompare(b)),
      allowScripts: frame.sandbox.contains('allow-scripts'),
      printMedia: {
        headerGroup:
          getComputedStyle(loaded.querySelector('thead')).display ?? null,
        headingBreak: getComputedStyle(loaded.querySelector('h2')).breakAfter,
        wrap: getComputedStyle(
          loaded.querySelector('.entry-name') ?? loaded.body,
        ).overflowWrap,
      },
    };
  }, frameId);
}

export async function assertHtmlPreview(
  driver,
  {
    frameId,
    fixtureName,
    fixtureId,
    investigationLabel,
    imported = false,
    claimedProvenance = null,
  },
) {
  await waitForHtmlPreview(driver, frameId);
  const preview = await readHtmlPreview(driver, frameId);
  assert.match(preview.srcdoc, /^<!doctype html>/);
  assert.equal(preview.readyState, 'complete');
  assert.equal(preview.sameFrame, true);
  assert.equal(preview.sameDocument, true);
  assert.equal(
    preview.loadedOuterHtml,
    preview.expectedOuterHtml,
    'The loaded preview tree must match the exact srcdoc document',
  );
  assert.equal(preview.title, 'AddonRay investigation report');
  assert.equal(preview.scriptCount, 0);
  assert.equal(
    preview.attributeResources,
    0,
    'Printable document must not load or reference resources',
  );
  assert.equal(preview.inlineStyleCount, 1);
  assert.deepEqual(preview.sandbox, ['allow-modals', 'allow-same-origin']);
  assert.equal(preview.allowScripts, false);
  assert(
    Buffer.byteLength(preview.srcdoc, 'utf8') <= limitBytes,
    'Printable HTML must stay within 1 MiB',
  );
  const text = preview.srcdoc;
  assert(text.includes('<style>'));
  assert(!text.includes('<link'));
  assert(!text.includes('<script'));

  if (fixtureName)
    assert(
      text.includes(
        fixtureName
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;')
          .replaceAll('"', '&quot;')
          .replaceAll('\\', '\\u{5C}'),
      ),
      'Printable HTML must include the escaped fixture name',
    );
  if (fixtureId)
    assert(
      !text.includes(fixtureId),
      'Printable HTML must omit the fixture ID',
    );
  if (investigationLabel)
    assert(
      !text.includes(investigationLabel),
      'Printable HTML must omit the live investigation label',
    );
  if (imported) {
    assert(text.includes('Imported report'));
    assert(text.includes('did not observe this content'));
    assert(!text.includes('Captured report.'));
    if (claimedProvenance) {
      assert(text.includes('claims provenance'));
      assert(text.includes('not authenticated'));
    }
  } else {
    assert(text.includes('Captured report.'));
    assert(!text.includes('Imported report'));
  }
  assert(
    text.includes('This list was computed from the extension-ID comparison'),
  );
  assert(text.includes('Extension names and versions can duplicate'));
  assert(text.includes('never recomputed from names'));
  assert(text.includes('Not attached'));
  return {
    preview,
    reviewedHtml: preview.srcdoc,
    reviewedBytes: Buffer.byteLength(preview.srcdoc, 'utf8'),
    reviewedSha256: sha256(Buffer.from(preview.srcdoc, 'utf8')),
    loadedMatchesSrcdoc: true,
    executableResourceCount: preview.scriptCount,
    reviewedTitle: preview.title,
  };
}

// Test-only capture of the product's print call. The production adapter calls
// contentWindow.print(); replacing that method records the exact loaded tree so
// the check can prove which representation would have opened the dialog.
export async function installPrintCapture(driver, frameId) {
  return driver.executeScript((id) => {
    const frame = document.getElementById(id);
    if (!(frame instanceof HTMLIFrameElement) || !frame.contentWindow)
      return false;
    window.__addonrayPrintCapture = null;
    frame.contentWindow.print = () => {
      window.__addonrayPrintCapture = {
        frameId: id,
        srcdoc: frame.srcdoc,
        outerHtml: frame.contentDocument?.documentElement.outerHTML ?? null,
        title: frame.contentDocument?.title ?? null,
      };
    };
    return true;
  }, frameId);
}

export async function requestAndAssertPrint(
  driver,
  {
    buttonId,
    frameId,
    sectionSelector,
    reviewedHtml,
    expectedTitle = 'AddonRay investigation report',
  },
) {
  assert.equal(
    await installPrintCapture(driver, frameId),
    true,
    'The product must expose the exact preview frame before print',
  );
  await driver.findElement(By.id(buttonId)).click();
  await driver.wait(
    async () =>
      (await driver.executeScript(() => window.__addonrayPrintCapture)) !==
      null,
    10000,
    'The product did not request the browser print dialog',
  );
  const capture = await driver.executeScript(
    () => window.__addonrayPrintCapture,
  );
  assert.equal(capture.frameId, frameId);
  assert.equal(capture.srcdoc, reviewedHtml);
  assert.equal(capture.title, expectedTitle);
  const expectedTree = await driver.executeScript(
    (html) =>
      new DOMParser().parseFromString(html, 'text/html').documentElement
        .outerHTML,
    reviewedHtml,
  );
  assert.equal(capture.outerHtml, expectedTree);
  const status = await driver.findElement(By.css(sectionSelector)).getText();
  assert(
    status.includes(
      'Print dialog requested. AddonRay cannot observe whether it was printed, cancelled or saved as a PDF.',
    ),
    `Print request must be reported as a request, saw: ${status.slice(-300)}`,
  );
  assert(!status.includes('printed successfully'));
  assert(!status.includes('PDF saved'));
  return {
    printRequested: true,
    frameId,
    exactSrcdoc: true,
    exactLoadedTree: true,
    requestOnlyWording: true,
  };
}

export async function assertPrintableLayout(driver, frameId) {
  return driver.executeScript((id) => {
    const frame = document.getElementById(id);
    if (!(frame instanceof HTMLIFrameElement) || !frame.contentDocument)
      throw new Error('Missing loaded printable frame');
    const previousWidth = frame.style.width;
    const previousHeight = frame.style.height;
    frame.style.width = '794px';
    frame.style.height = '1123px';
    const loaded = frame.contentDocument;
    const documentElement = loaded.documentElement;
    const body = loaded.body;
    const overflowing = [...loaded.querySelectorAll('h1, h2, table, li, p')]
      .filter((element) => {
        const box = element.getBoundingClientRect();
        return box.right > documentElement.clientWidth + 1;
      })
      .map((element) => element.tagName);
    const result = {
      viewportWidth: documentElement.clientWidth,
      horizontalOverflow: Math.max(
        documentElement.scrollWidth,
        body.scrollWidth,
      ),
      overflowing,
      headerGroup: getComputedStyle(loaded.querySelector('thead')).display,
      headingBreak: getComputedStyle(loaded.querySelector('h2')).breakAfter,
      entryWrap: getComputedStyle(loaded.querySelector('.entry-name') ?? body)
        .overflowWrap,
      entryCount: loaded.querySelectorAll('.entry-name').length,
    };
    frame.style.width = previousWidth;
    frame.style.height = previousHeight;
    return result;
  }, frameId);
}
