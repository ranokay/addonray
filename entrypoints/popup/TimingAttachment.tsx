import { useEffect, useRef, useState } from 'react';
import type { Result } from '../../lib/inspector';
import type { InspectorSession } from '../../lib/session';
import type {
  PopupTimingHandoff,
  TimingDestination,
  TimingSide,
} from '../../lib/timing-handoff';

const sideLabels: Record<TimingSide, string> = {
  before: 'Before',
  after: 'After',
};

export function TimingAttachment({
  captureId,
  session,
  handoff,
}: {
  captureId: number;
  session: InspectorSession;
  handoff: PopupTimingHandoff;
}) {
  const [destinations, setDestinations] = useState<TimingDestination[] | null>(
    null,
  );
  const [identity, setIdentity] = useState('');
  const [side, setSide] = useState<TimingSide | ''>('');
  const [busy, setBusy] = useState<'discovering' | 'attaching' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [attached, setAttached] = useState(false);
  const busyGuard = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const current = session.isTimingCaptureCurrent(captureId);
  const destination = destinations?.find((item) => item.identity === identity);

  function showFailure(
    result: Exclude<Result<unknown>, { status: 'success' }>,
  ) {
    const headings = {
      denied: 'Attachment access declined.',
      unavailable: 'Timing attachment unavailable.',
      cancelled: 'Timing attachment cancelled.',
      error: 'Timing attachment failed.',
    };
    setMessage(`${headings[result.status]} ${result.reason}`);
  }

  async function discover() {
    if (busyGuard.current || !current) return;
    busyGuard.current = true;
    setBusy('discovering');
    setDestinations(null);
    setIdentity('');
    setSide('');
    setMessage(null);
    try {
      const result = await handoff.listDestinations();
      if (!mounted.current || !session.isTimingCaptureCurrent(captureId))
        return;
      if (result.status !== 'success') {
        showFailure(result);
        return;
      }
      setDestinations(result.value);
      setMessage(
        result.value.length === 0
          ? 'No eligible investigation is open. Capture its Before inventory first. Before timing must be attached before starting the After inventory.'
          : 'Choose an investigation and side, then confirm the attachment.',
      );
    } catch {
      if (mounted.current && session.isTimingCaptureCurrent(captureId)) {
        setMessage(
          'Timing destinations could not be read. Choose Attach timing to try again.',
        );
      }
    } finally {
      busyGuard.current = false;
      if (mounted.current) setBusy(null);
    }
  }

  async function attach() {
    if (
      busyGuard.current ||
      !session.isTimingCaptureCurrent(captureId) ||
      !destination ||
      side === '' ||
      !destination.sides.includes(side)
    )
      return;
    busyGuard.current = true;
    setBusy('attaching');
    setMessage(null);
    try {
      const result = await handoff.attach(destination, side);
      if (!mounted.current || session.getTimingCapture()?.id !== captureId)
        return;
      if (result.status !== 'success') {
        showFailure(result);
        return;
      }
      setAttached(true);
      setDestinations(null);
      setIdentity('');
      setSide('');
      setMessage(
        `Timing attached to ${destination.label}, ${sideLabels[side]}. This popup capture has been used. Capture the page again to attach another timing.`,
      );
    } catch {
      if (mounted.current && session.isTimingCaptureCurrent(captureId)) {
        setMessage(
          'The timing could not be attached. Refresh destinations and explicitly choose the investigation and side again.',
        );
      }
    } finally {
      busyGuard.current = false;
      if (mounted.current) setBusy(null);
    }
  }

  return (
    <section
      aria-labelledby="attachment-heading"
      aria-busy={busy !== null}
      className="timing-attachment"
    >
      <h3 id="attachment-heading">Optional investigation attachment</h3>
      <p className="metadata">
        Add this timing to one open investigation. Match its label, then choose
        Before or After. Inventory and timing captures are separate.
      </p>
      {!attached && (
        <button
          id="timing-destinations"
          disabled={busy !== null || !current}
          onClick={() => void discover()}
        >
          {busy === 'discovering'
            ? 'Finding investigations…'
            : destinations === null
              ? 'Attach timing'
              : 'Refresh timing destinations'}
        </button>
      )}
      {destinations !== null && destinations.length > 0 && !attached && (
        <div className="attachment-selection">
          <label htmlFor="timing-destination">Investigation</label>
          <select
            id="timing-destination"
            value={identity}
            disabled={busy !== null || !current}
            onChange={(event) => {
              setIdentity(event.target.value);
              setSide('');
            }}
          >
            <option value="">Choose an investigation</option>
            {destinations.map((item) => (
              <option key={item.identity} value={item.identity}>
                {item.label}
              </option>
            ))}
          </select>
          <label htmlFor="timing-side">Timing side</label>
          <select
            id="timing-side"
            value={side}
            disabled={busy !== null || !current || !destination}
            onChange={(event) => {
              const value = event.target.value;
              setSide(value === 'before' || value === 'after' ? value : '');
            }}
          >
            <option value="">Choose Before or After</option>
            {destination?.sides.map((value) => (
              <option key={value} value={value}>
                {sideLabels[value]}
              </option>
            ))}
          </select>
          <button
            id="attach-timing"
            disabled={busy !== null || !current || !destination || side === ''}
            onClick={() => void attach()}
          >
            {busy === 'attaching' ? 'Attaching timing…' : 'Confirm attachment'}
          </button>
        </div>
      )}
      <p id="timing-attachment-status" role="status">
        {message ??
          (!current && !attached
            ? 'This timing is no longer available to attach. Capture the page again.'
            : '')}
      </p>
      <p className="metadata">
        Attachments require normal browser windows. Private or unclassifiable
        windows are excluded. An accepted attachment stays in its investigation
        when this popup closes or is cleared.
      </p>
    </section>
  );
}
