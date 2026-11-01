import { REPORT_FILENAME } from './investigation-report';

export type ReportFormat = 'markdown' | 'json';

const formats: Record<ReportFormat, { filename: string; type: string }> = {
  markdown: { filename: REPORT_FILENAME, type: 'text/markdown;charset=utf-8' },
  json: {
    filename: 'addonray-investigation.json',
    type: 'application/json;charset=utf-8',
  },
};

// Dispatch is not browser acceptance or completed saving. Closing the owning
// document can cancel a pending request, so do not retain a URL or claim success.
export function requestReportDownload(
  text: string,
  format: ReportFormat = 'markdown',
) {
  const { filename, type } = formats[format];
  const url = URL.createObjectURL(new Blob([text], { type }));
  let anchor: HTMLAnchorElement | null = null;
  try {
    anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
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
