// Staff dashboard: /admin/orders
//
// Two live lists, both read straight from the orders collection:
//   Active orders  every order that is not DELIVERED or CANCELLED. Staff push each
//                  one to its next step, or cancel it (which starts a refund).
//   Needs refund   orders that are CANCELLED with paymentStatus REFUND_PENDING:
//                  staff-cancelled ones and ones the system cancelled when the
//                  last box sold out mid-payment. Staff mark each refund done.
//
// Nothing here writes to Firestore directly: the security rules let no browser
// change an order. Every button calls a staff-only Cloud Function (updateOrderStatus,
// cancelOrder, processRefund). The customer's tracking page hears the change
// through its own onSnapshot listener.
//
// Below the lists is the Excel card with the "Download orders sheet" and "Retry Excel sync"
// buttons (see components/admin/ExcelSyncCard.js).
//
// Staff access: a user is staff when their sign-in token has the `staff` claim,
// which only the server can set. Give it with `npm run set-admin -- <uid>` (see
// firebase/scripts/setAdmin.js). While developing in the emulator, "Enable dev
// staff mode" does the same for your own test account; it is hidden in production.

import Head from 'next/head';
import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import ActiveOrderCard from '@/components/admin/ActiveOrderCard';
import AdminTabs from '@/components/admin/AdminTabs';
import ExcelSyncCard from '@/components/admin/ExcelSyncCard';
import RefundCard from '@/components/admin/RefundCard';
import Callout from '@/components/Callout';
import { ensureSignedIn } from '@/lib/auth';
import { friendlyError } from '@/lib/errors';
import { auth, db, functions, usingEmulators } from '@/lib/firebaseClient';
import { ACTIVE_STATUSES } from '@/lib/orderStatus';

const toMillis = (t) => t?.toMillis?.() ?? 0;
const byCreated = (a, b) => toMillis(a.createdAt) - toMillis(b.createdAt); // oldest first
const byCancelled = (a, b) => toMillis(a.timestamps?.CANCELLED) - toMillis(b.timestamps?.CANCELLED); // waiting longest first

// Follows a query live. Returns { docs, state: 'loading' | 'ready' | 'error' }.
// `enabled` is false until the user is known to be staff (the rules would refuse anyone else).
function useLiveOrders(enabled, makeQuery, sorter) {
  const [result, setResult] = useState({ docs: [], state: 'loading' });

  useEffect(() => {
    if (!enabled) return undefined;
    setResult({ docs: [], state: 'loading' });
    const stop = onSnapshot(
      makeQuery(),
      (snap) => setResult({ docs: snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(sorter), state: 'ready' }),
      (err) => {
        console.error('Orders listener failed:', err);
        setResult({ docs: [], state: 'error' });
      },
    );
    return stop; // detach the listener when staff leave the page
    // makeQuery and sorter are module-level constants below, so they never change.
  }, [enabled, makeQuery, sorter]);

  return result;
}

// The two queries (module-level so the hook's effect does not re-run needlessly).
const activeQuery = () => query(collection(db, 'orders'), where('status', 'in', ACTIVE_STATUSES));
const refundQuery = () =>
  query(collection(db, 'orders'), where('status', '==', 'CANCELLED'), where('paymentStatus', '==', 'REFUND_PENDING'));

function ListBody({ list, empty, children }) {
  if (list.state === 'error') {
    return (
      <Callout tone="danger" title="We could not load orders.">
        Check your connection and reload the page.
      </Callout>
    );
  }
  if (list.state === 'loading') {
    return (
      <p role="status" className="text-body text-ink-muted">
        Loading orders...
      </p>
    );
  }
  if (list.docs.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-surface-card p-8 shadow-card">
        <h2 className="text-heading-3 text-ink">{empty.title}</h2>
        <p className="mt-1 text-body text-ink-muted">{empty.text}</p>
      </div>
    );
  }
  return children;
}

export default function AdminOrdersPage() {
  // 'checking' | 'staff' | 'denied' | 'error'
  const [access, setAccess] = useState('checking');
  const [uid, setUid] = useState('');
  const [rechecking, setRechecking] = useState(false);
  const [stillDenied, setStillDenied] = useState(false);
  const [granting, setGranting] = useState(false);
  const [grantError, setGrantError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState('active');

  // Who is this, and are they staff? The role lives in their sign-in token. The
  // browser keeps a saved copy of that token, so after a role is granted `force`
  // must be true to fetch a fresh one.
  async function checkAccess({ force = false } = {}) {
    try {
      const user = await ensureSignedIn();
      setUid(user.uid);
      const { claims } = await user.getIdTokenResult(force);
      setAccess(claims.staff === true ? 'staff' : 'denied');
      return claims.staff === true;
    } catch (err) {
      console.error('Could not check staff access:', err);
      setAccess('error');
      return false;
    }
  }

  useEffect(() => {
    checkAccess();
  }, []);

  // "Check again": used after someone has granted this account the staff role.
  async function recheck() {
    setRechecking(true);
    setStillDenied(false);
    const ok = await checkAccess({ force: true });
    setStillDenied(!ok);
    setRechecking(false);
  }

  // Dev only: ask the emulator to make me staff, then refresh my token to pick it up.
  async function enableDevStaff() {
    setGranting(true);
    setGrantError(null);
    try {
      await httpsCallable(functions, 'devGrantStaff')();
      await auth.currentUser.getIdToken(true);
      await checkAccess({ force: true });
    } catch (err) {
      setGrantError(friendlyError(err));
    } finally {
      setGranting(false);
    }
  }

  async function copyUid() {
    try {
      await navigator.clipboard.writeText(uid);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard not available: the id is on screen to copy by hand */
    }
  }

  const isStaff = access === 'staff';
  const active = useLiveOrders(isStaff, activeQuery, byCreated);
  const refunds = useLiveOrders(isStaff, refundQuery, byCancelled);

  const tabs = [
    { id: 'active', label: 'Active orders', count: active.docs.length },
    { id: 'refunds', label: 'Needs refund', count: refunds.docs.length, attention: true },
  ];

  return (
    <>
      <Head>
        <title>Orders | FreshBliss staff</title>
        <meta name="robots" content="noindex" />
      </Head>

      <div className="fb-container py-14.5">
        <p className="text-label text-gold">Staff</p>
        <h1 className="mt-2 text-heading-2 text-brand-text">Orders</h1>

        {access === 'checking' && (
          <p role="status" className="mt-6 text-body text-ink-muted">
            Checking your access...
          </p>
        )}

        {access === 'error' && (
          <Callout tone="danger" className="mt-6" title="We could not check your access.">
            Check your connection and reload the page.
          </Callout>
        )}

        {access === 'denied' && (
          <div className="mt-6 max-w-xl">
            <Callout title="Staff only">
              You need a staff account to see and update orders. Ask an admin to give this account the staff role, using the Account ID below.
            </Callout>

            <section aria-labelledby="account-id" className="mt-4 rounded-xl border border-line bg-surface-card p-5 shadow-card">
              <h2 id="account-id" className="text-nav-link text-ink">
                Account ID
              </h2>
              <p className="mt-2 break-all text-code text-ink">{uid}</p>
              <div className="mt-3 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={copyUid}
                  className="min-h-11 rounded-pill border border-green-accent px-5 text-nav-link text-brand-text hover:bg-surface-cream"
                >
                  {copied ? 'Copied' : 'Copy ID'}
                </button>
                <button
                  type="button"
                  onClick={recheck}
                  disabled={rechecking}
                  className="min-h-11 rounded-pill bg-brand px-5 text-nav-link text-on-brand hover:brightness-110 disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-muted"
                >
                  {rechecking ? 'Checking...' : 'Check again'}
                </button>
              </div>
              {stillDenied && (
                <p role="status" className="mt-3 text-small font-bold text-danger">
                  This account still does not have the staff role.
                </p>
              )}
              <p className="mt-3 text-small text-ink-muted">After you are given the role, press "Check again".</p>
            </section>

            {usingEmulators && (
              <div className="mt-4">
                <p className="text-small text-ink-muted">Development only: this gives your local test account the staff role.</p>
                {grantError && (
                  <Callout tone="danger" className="mt-3">
                    {grantError}
                  </Callout>
                )}
                <button
                  type="button"
                  onClick={enableDevStaff}
                  disabled={granting}
                  className="mt-3 min-h-11 rounded-pill bg-brand px-6 text-nav-link text-on-brand hover:brightness-110 disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-muted"
                >
                  {granting ? 'Enabling...' : 'Enable dev staff mode'}
                </button>
              </div>
            )}
          </div>
        )}

        {isStaff && (
          <div className="mt-6">
            <AdminTabs label="Order lists" tabs={tabs} active={tab} onChange={setTab} />

            <div role="tabpanel" id="panel-active" aria-labelledby="tab-active" hidden={tab !== 'active'} className="mt-6">
              {tab === 'active' && (
                <ListBody list={active} empty={{ title: 'No active orders', text: 'New paid orders appear here the moment they come in.' }}>
                  <p role="status" className="mb-4.5 text-small text-ink-muted">
                    {active.docs.length} active {active.docs.length === 1 ? 'order' : 'orders'}, oldest first
                  </p>
                  <ul className="grid gap-4.5 md:grid-cols-2">
                    {active.docs.map((order) => (
                      <ActiveOrderCard key={order.id} order={order} />
                    ))}
                  </ul>
                </ListBody>
              )}
            </div>

            <div role="tabpanel" id="panel-refunds" aria-labelledby="tab-refunds" hidden={tab !== 'refunds'} className="mt-6">
              {tab === 'refunds' && (
                <ListBody list={refunds} empty={{ title: 'No refunds waiting', text: 'Cancelled orders that need their money returned appear here.' }}>
                  <p role="status" className="mb-4.5 text-small text-ink-muted">
                    {refunds.docs.length} {refunds.docs.length === 1 ? 'refund' : 'refunds'} waiting, longest first
                  </p>
                  <ul className="grid gap-4.5 md:grid-cols-2">
                    {refunds.docs.map((order) => (
                      <RefundCard key={order.id} order={order} />
                    ))}
                  </ul>
                </ListBody>
              )}
            </div>

            <ExcelSyncCard />
          </div>
        )}
      </div>
    </>
  );
}
