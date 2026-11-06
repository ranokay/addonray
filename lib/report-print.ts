export interface PrintableFrame {
  srcdoc: string;
  contentDocument: Document | null;
  contentWindow: {
    document: Document;
    frameElement: unknown;
    focus(): void;
    print(): void;
  } | null;
}

// The srcdoc attribute alone cannot prove the browser loaded that document.
// Compare the loaded tree with a fresh parse of the reviewed string so a stale
// or still-loading frame can never print a previous representation.
export function printablePreviewMatches(
  frame: PrintableFrame | null,
  expected: string,
) {
  try {
    if (!frame || frame.srcdoc !== expected) return false;
    const document = frame.contentDocument;
    const view = frame.contentWindow;
    if (!document || !view || document.readyState !== 'complete') return false;
    if (view.frameElement !== frame || view.document !== document) return false;
    if (typeof DOMParser !== 'function') return false;
    const parsed = new DOMParser().parseFromString(expected, 'text/html');
    if (!parsed.documentElement) return false;
    return (
      document.documentElement.outerHTML === parsed.documentElement.outerHTML
    );
  } catch {
    return false;
  }
}

export function requestPrintableReport(
  frame: PrintableFrame | null,
  expected: string,
): void {
  if (!printablePreviewMatches(frame, expected))
    throw new Error(
      'The printable preview does not match the reviewed report.',
    );
  frame!.contentWindow!.focus();
  frame!.contentWindow!.print();
}

export function printReportPreview(
  frameId: string,
  expected: string,
  target: Pick<Document, 'getElementById'> = document,
) {
  const frame = target.getElementById(frameId);
  requestPrintableReport(frame as PrintableFrame | null, expected);
}
