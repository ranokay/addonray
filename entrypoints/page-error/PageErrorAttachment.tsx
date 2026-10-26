import { useEffect, useRef, useState } from 'react';
import type { Result } from '../../lib/inspector';
import type { PageErrorCheck } from '../../lib/page-error-check';
import type {
  PageErrorDestination,
  PageErrorHandoff,
  PageErrorSide,
} from '../../lib/page-error-handoff';

const sideLabels: Record<PageErrorSide, string> = {
  before: 'Before',
  after: 'After',
};
const usedMessage =
  'This completed check has been used and cannot be attached again. Review the chosen investigation; it may contain the copy.';

export function PageErrorAttachment({
  check,
  generation,
  handoff,
}: {
  check: PageErrorCheck;
  generation: number;
  handoff: PageErrorHandoff;
}) {
  const [destinations, setDestinations] = useState<
    PageErrorDestination[] | null
  >(null);
  const [identity, setIdentity] = useState('');
  const [side, setSide] = useState<PageErrorSide | ''>('');
  const [busy, setBusy] = useState<'discovering' | 'attaching' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const busyGuard = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  function sameAttempt() {
    const state = check.getSnapshot();
    return (
      check.getGeneration() === generation &&
      state.phase === 'finished' &&
      state.outcome?.status === 'success'
    );
  }
  function available() {
    return sameAttempt() && !check.isAttachmentUsed();
  }
  function showFailure(
    result: Exclude<Result<unknown>, { status: 'success' }>,
  ) {
    const headings = {
      denied: 'Attachment access declined.',
      unavailable: 'Page-error attachment unavailable.',
      cancelled: 'Page-error attachment cancelled.',
      error: 'Page-error attachment failed.',
    };
    setMessage(`${headings[result.status]} ${result.reason}`);
  }

  async function discover() {
    if (busyGuard.current || !available()) return;
    busyGuard.current = true;
    setBusy('discovering');
    setDestinations(null);
    setIdentity('');
    setSide('');
    setMessage(null);
    try {
      const result = await handoff.listDestinations();
      if (!mounted.current || !sameAttempt()) return;
      if (check.isAttachmentUsed()) {
        setMessage(usedMessage);
      } else if (result.status !== 'success') {
        showFailure(result);
      } else {
        setDestinations(result.value);
        setMessage(
          result.value.length === 0
            ? 'No eligible investigation is open. Capture its Before inventory first. Attach Before error counts before starting its After inventory.'
            : 'Choose an investigation and side, then confirm the attachment.',
        );
      }
    } catch {
      if (mounted.current && sameAttempt()) {
        setMessage(
          check.isAttachmentUsed()
            ? usedMessage
            : 'Investigation destinations could not be read. Choose Attach to investigation to try again.',
        );
      }
    } finally {
      busyGuard.current = false;
      if (mounted.current) setBusy(null);
    }
  }

  const destination = destinations?.find((item) => item.identity === identity);
  async function attach() {
    if (
      busyGuard.current ||
      !available() ||
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
      if (!mounted.current || !sameAttempt()) return;
      if (result.status === 'success') {
        setMessage(
          `Error counts attached to ${destination.label}, ${sideLabels[side]}. This completed check has been used. Its result remains readable here.`,
        );
        setDestinations(null);
        setIdentity('');
        setSide('');
      } else if (check.isAttachmentUsed()) {
        setMessage(usedMessage);
      } else {
        showFailure(result);
      }
    } catch {
      if (mounted.current && sameAttempt()) {
        setMessage(
          check.isAttachmentUsed()
            ? usedMessage
            : 'The check could not be attached. Refresh destinations and explicitly choose the investigation and side again.',
        );
      }
    } finally {
      busyGuard.current = false;
      if (mounted.current) setBusy(null);
    }
  }

  const used = check.isAttachmentUsed();
  const current = available();
  return (
    <section
      aria-labelledby="error-attachment-heading"
      aria-busy={busy !== null}
      className="page-error-attachment"
    >
      <h2 id="error-attachment-heading">Optional investigation attachment</h2>
      <p>
        Add these confirmed counts to one investigation. Match its label, then
        choose Before or After. Inventory, timing and error observations are
        collected separately.
      </p>
      {!used && (
        <button
          id="page-error-destinations"
          disabled={busy !== null || !current}
          onClick={() => void discover()}
        >
          {busy === 'discovering'
            ? 'Finding investigations…'
            : destinations === null
              ? 'Attach to investigation'
              : 'Refresh destinations'}
        </button>
      )}
      {!used && destinations !== null && destinations.length > 0 && (
        <div className="error-attachment-selection">
          <label htmlFor="page-error-destination">Investigation</label>
          <select
            id="page-error-destination"
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
          <label htmlFor="page-error-side">Error-count side</label>
          <select
            id="page-error-side"
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
            id="attach-page-error"
            disabled={busy !== null || !current || !destination || side === ''}
            onClick={() => void attach()}
          >
            {busy === 'attaching' ? 'Attaching counts…' : 'Confirm attachment'}
          </button>
          {destination && side !== '' && (
            <p className="metadata">
              Confirm to attach this check to {destination.label},{' '}
              {sideLabels[side]}.
            </p>
          )}
        </div>
      )}
      <p id="page-error-attachment-status" role="status" aria-live="polite">
        {message ?? (used ? usedMessage : '')}
      </p>
      <p className="metadata">
        One successful attachment per completed check. Normal windows only.
        Private or unclassifiable windows are excluded. An accepted copy stays
        in its investigation when this check resets or closes. Start over in the
        investigation discards its copy.
      </p>
    </section>
  );
}
