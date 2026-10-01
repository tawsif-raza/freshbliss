// The "Retry Excel sync" button for the staff dashboard.
//
// The Excel copy of the orders is kept up to date automatically. If Microsoft was
// ever unreachable, some rows or status changes may not have arrived. This button
// asks the server to send them again (the staff-only retryExcelSync function).
// It is safe to press at any time: when nothing is behind it just says so, and it
// never creates duplicate rows. See firebase/docs/EXCEL_SYNC.md.

import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import Callout from '@/components/Callout';
import { friendlyError } from '@/lib/errors';
import { functions } from '@/lib/firebaseClient';

// Turn the server's counts into plain sentences.
function summarise({ rowsAdded, rowsUpdated }) {
  const lines = [];
  const needCheck = rowsAdded.checkInExcel ?? [];
  const failing = rowsAdded.stillFailing + rowsUpdated.stillFailing;

  if (rowsAdded.added > 0) lines.push(`Added ${rowsAdded.added} missing ${rowsAdded.added === 1 ? 'row' : 'rows'}.`);
  if (rowsUpdated.updated > 0) lines.push(`Updated ${rowsUpdated.updated} ${rowsUpdated.updated === 1 ? 'row' : 'rows'}.`);
  const nothingToDo = rowsAdded.tried === 0 && rowsUpdated.tried === 0 && needCheck.length === 0;
  if (nothingToDo) lines.push('Everything is already in Excel.');
  return { lines, failing, needCheck };
}

export default function ExcelSyncCard() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function retry() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const { data } = await httpsCallable(functions, 'retryExcelSync')();
      setResult(summarise(data));
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="excel-sync-title" className="mt-14.5 rounded-xl border border-line bg-surface-card p-6 shadow-card">
      <h2 id="excel-sync-title" className="text-heading-3 text-ink">
        Excel sync
      </h2>
      <p className="mt-1 max-w-2xl text-small text-ink-muted">
        Orders are copied to the Excel sheet automatically. If Microsoft was unreachable, press this to send anything that was missed. It is safe to press at any
        time.
      </p>

      <button
        type="button"
        onClick={retry}
        disabled={busy}
        aria-busy={busy}
        className="mt-4 min-h-11 rounded-pill bg-brand px-5 text-nav-link text-on-brand hover:brightness-110 disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-muted"
      >
        {busy ? 'Sending...' : 'Retry Excel sync'}
      </button>

      {/* One live region, so the outcome is announced to screen readers. */}
      <div role="status" aria-live="polite" className="mt-4 empty:hidden">
        {result && (
          <>
            {result.lines.map((line) => (
              <p key={line} className="text-body text-ink">
                {line}
              </p>
            ))}
            {result.failing > 0 && (
              <Callout tone="danger" className="mt-3">
                {result.failing} could not be sent yet, so the problem is not fixed. Check the Excel connection, then press the button again.
              </Callout>
            )}
            {result.needCheck.length > 0 && (
              <Callout className="mt-3" title="Check these orders in Excel by hand">
                We cannot tell whether these reached Excel, and we do not want to add them twice. Search the sheet for each order ID:
                <span className="mt-2 block text-code text-ink">{result.needCheck.join(', ')}</span>
              </Callout>
            )}
          </>
        )}
      </div>

      {error && (
        <Callout tone="danger" className="mt-4">
          {error}
        </Callout>
      )}
    </section>
  );
}
