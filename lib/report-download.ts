import { REPORT_FILENAME } from './investigation-report';

// Dispatch is not browser acceptance or completed saving. Closing the owning
// document can cancel a pending request, so do not retain a URL or claim success.
export function requestReportDownload(markdown: string) {
  const url = URL.createObjectURL(
    new Blob([markdown], { type: 'text/markdown;charset=utf-8' }),
  );
  let anchor: HTMLAnchorElement | null = null;
  try {
    anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = REPORT_FILENAME;
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
  } finally {
    try {
      anchor?.remove();
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}
