import type { TimingMeasurement, TimingSnapshot } from '../../lib/inspector';

const milestones = [
  {
    key: 'domContentLoaded',
    label: 'DOM content loaded',
    description: "When this document's DOMContentLoaded handlers finished.",
  },
  {
    key: 'loadEvent',
    label: 'Load event completed',
    description:
      "When this document's load handlers finished. Later work can continue.",
  },
  {
    key: 'firstContentfulPaint',
    label: 'First content displayed',
    description: 'The first qualifying text or image paint, when reported.',
  },
] as const;

function describeMeasurement(measurement: TimingMeasurement) {
  if (measurement.status === 'unavailable') return 'Unavailable at capture';
  if (measurement.status === 'unrecorded') return 'Not recorded at capture';
  const milliseconds = measurement.milliseconds;
  if (milliseconds > 0 && milliseconds < 0.01) return '<0.01 ms';
  return `${new Intl.NumberFormat('en', {
    maximumFractionDigits: 2,
  }).format(milliseconds)} ms`;
}

export function PageTimings({ timings }: { timings: TimingSnapshot }) {
  return (
    <section aria-labelledby="timing-heading" className="page-timings">
      <h3 id="timing-heading">Recorded loading milestones</h3>
      <p className="metadata">
        Milliseconds since navigation began, for the document loaded in the
        selected tab when this check ran.
      </p>
      <dl>
        {milestones.map(({ key, label, description }) => (
          <div className="timing" key={key}>
            <dt>{label}</dt>
            <dd data-testid={`timing-${key}`}>
              {describeMeasurement(timings[key])}
            </dd>
            <dd className="metadata">{description}</dd>
          </div>
        ))}
      </dl>
      <details className="guidance">
        <summary>How to read these timings</summary>
        <p>
          These values can describe the original document load after an app
          changes its view without loading a new document, or after a page is
          restored. Browser clock precision can reduce numeric detail.
        </p>
        <p>
          This check reads existing observations once. It does not reload the
          page, record scrolling or typing, or identify an extension that caused
          a delay. Unavailable and unrecorded values have no assumed cause; a
          later check may still have no value.
        </p>
      </details>
    </section>
  );
}
