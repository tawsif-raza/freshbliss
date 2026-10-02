// The "Excel sync" card for the staff dashboard. It has two buttons.
//
// Download orders sheet
//   The orders are copied to an Excel file in a private AWS bucket. This asks the
//   server (the staff-only getOrdersDownloadUrl function) for a link that works for
//   15 minutes, then makes the browser save the file. Staff open that COPY. They
//   should never edit and re-upload the live file (see firebase/docs/EXCEL_SYNC.md).
//
// Retry Excel sync
//   The copy is kept up to date automatically. If AWS (where the spreadsheet is
//   stored) was ever unreachable, some rows or status changes may not have arrived.
//   This asks the server to send them again (the staff-only retryExcelSync function).
//   It is safe to press at any time: when nothing is behind it just says so, and it
//   never creates duplicate rows.

import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import Callout from '@/components/Callout';
import { friendlyError } from '@/lib/errors';
import { functions } from '@/lib/firebaseClient';

// Make the browser save the file at `url`. The server's link tells S3 to send the file as an
// attachment, so this does not navigate away from the dashboard. Only a link to AWS is trusted.
function startDownload(url, filename) {
  const { protocol, hostname } = new URL(url);
  const local = hostname === 'localhost' || hostname === '127.0.0.1'; // a local S3 look-alike, in development
  if (protocol !== 'https:' && !local) throw new Error('Refusing to download from a link that is not secure.');

  const link = document.createElement('a');
  link.href = url;
  link.download = filename; // a hint; the file's own attachment header decides on another site
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

// Turn the server's counts into plain sentences.
function summarise({ rowsAdded, rowsUpdated }) {
  const lines = [];
  const failing = rowsAdded.stillFailing + rowsUpdated.stillFailing;

  if (rowsAdded.added > 0) lines.push(`Added ${rowsAdded.added} missing ${rowsAdded.added === 1 ? 'row' : 'rows'}.`);
  if (rowsUpdated.updated > 0) lines.push(`Updated ${rowsUpdated.updated} ${rowsUpdated.updated === 1 ? 'row' : 'rows'}.`);
  const nothingToDo = rowsAdded.tried === 0 && rowsUpdated.tried === 0;
  if (nothingToDo) lines.push('Everything is already in Excel.');
  return { lines, failing };
}

export default function ExcelSyncCard() {
  const [busy, setBusy] = useState(false); // retrying
  const [downloading, setDownloading] = useState(false);
  const [result, setResult] = useState(null);
  const [downloaded, setDownloaded] = useState(null);
  const [error, setError] = useState(null);
  const working = busy || downloading;

  async function download() {
    if (working) return;
    setDownloading(true);
    setError(null);
    setResult(null);
    setDownloaded(null);
    try {
      const { data } = await httpsCallable(functions, 'getOrdersDownloadUrl')();
      startDownload(data.url, data.filename);
      setDownloaded(data.filename);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setDownloading(false);
    }
  }

  async function retry() {
    if (working) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setDownloaded(null);
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
        Orders are copied to an Excel sheet automatically. Download a copy to open in Excel; the link works for 15 minutes. If AWS was unreachable, use Retry to
        send anything that was missed. Both are safe to press at any time.
      </p>
      <p className="mt-2 max-w-2xl text-small text-ink-muted">Work in your downloaded copy. Please do not upload an edited file back over the live sheet.</p>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={download}
          disabled={working}
          aria-busy={downloading}
          className="min-h-11 rounded-pill bg-brand px-5 text-nav-link text-on-brand hover:brightness-110 disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-muted"
        >
          {downloading ? 'Preparing...' : 'Download orders sheet'}
        </button>
        <button
          type="button"
          onClick={retry}
          disabled={working}
          aria-busy={busy}
          className="min-h-11 rounded-pill border border-green-accent px-5 text-nav-link text-brand-text hover:bg-surface-cream disabled:cursor-not-allowed disabled:text-ink-muted"
        >
          {busy ? 'Sending...' : 'Retry Excel sync'}
        </button>
      </div>

      {/* One live region, so the outcome is announced to screen readers. */}
      <div role="status" aria-live="polite" className="mt-4 empty:hidden">
        {downloaded && <p className="text-body text-ink">Your download has started: {downloaded}. If nothing happened, press the button again.</p>}
        {result && (
          <>
            {result.lines.map((line) => (
              <p key={line} className="text-body text-ink">
                {line}
              </p>
            ))}
            {result.failing > 0 && (
              <Callout tone="danger" className="mt-3">
                {result.failing} could not be sent yet, so the problem is not fixed. Check the AWS connection, then press the button again.
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
