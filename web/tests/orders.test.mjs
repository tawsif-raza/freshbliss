import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CUSTOMER_CANCEL_REASONS, TRACKER_STEPS, customerCancelState, trackerStates } from '../lib/orderStatus.js';
import { ORDER_FILTERS, countByFilter, filterOrders, placedAt } from '../lib/orderFilters.js';

describe('order tracker steps', () => {
  it('has the four steps the customer sees, in order', () => {
    assert.deepEqual(TRACKER_STEPS.map((s) => s.label), ['Order Received', 'Preparing', 'Out for Delivery', 'Delivered']);
  });

  it('marks earlier steps done, the current one active, later ones to do', () => {
    assert.deepEqual(trackerStates('PAYMENT_CONFIRMED'), ['active', 'todo', 'todo', 'todo']);
    assert.deepEqual(trackerStates('PREPARING'), ['done', 'active', 'todo', 'todo']);
    assert.deepEqual(trackerStates('OUT_FOR_DELIVERY'), ['done', 'done', 'active', 'todo']);
  });

  it('folds PACKED into Preparing', () => {
    assert.deepEqual(trackerStates('PACKED'), trackerStates('PREPARING'));
  });

  it('shows every step done once delivered', () => {
    assert.deepEqual(trackerStates('DELIVERED'), ['done', 'done', 'done', 'done']);
  });

  it('does not guess for a status it does not know', () => {
    for (const status of ['CANCELLED', 'PENDING_PAYMENT', '', undefined, null]) assert.deepEqual(trackerStates(status), ['todo', 'todo', 'todo', 'todo']);
  });
});

describe('account order filters', () => {
  const NOW = Date.UTC(2026, 9, 3, 12, 0, 0);
  const DAY = 24 * 60 * 60 * 1000;
  const stamp = (daysAgo) => ({ toDate: () => new Date(NOW - daysAgo * DAY) });
  const ORDERS = [
    { id: 'a', status: 'PREPARING', createdAt: stamp(0) },
    { id: 'b', status: 'DELIVERED', createdAt: stamp(10) },
    { id: 'c', status: 'DELIVERED', createdAt: stamp(45) },
    { id: 'd', status: 'CANCELLED', createdAt: stamp(29) },
    { id: 'e', status: 'OUT_FOR_DELIVERY', createdAt: stamp(1) },
    { id: 'f', status: 'DELIVERED' }, // no date at all
  ];
  const ids = (filterId) => filterOrders(ORDERS, filterId, NOW).map((o) => o.id);

  it('All Orders keeps everything, in the same order', () => {
    assert.deepEqual(ids('all'), ['a', 'b', 'c', 'd', 'e', 'f']);
    assert.deepEqual(ids('something-unknown'), ['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('In Progress keeps orders that are neither delivered nor cancelled', () => {
    assert.deepEqual(ids('active'), ['a', 'e']);
  });

  it('Past 30 Days keeps recent orders, and leaves out old ones and ones with no date', () => {
    assert.deepEqual(ids('recent'), ['a', 'b', 'd', 'e']);
  });

  it('Delivered and Cancelled keep just those', () => {
    assert.deepEqual(ids('delivered'), ['b', 'c', 'f']);
    assert.deepEqual(ids('cancelled'), ['d']);
  });

  it('counts what each chip would show', () => {
    assert.deepEqual(countByFilter(ORDERS, NOW), { all: 6, active: 2, recent: 4, delivered: 3, cancelled: 1 });
    assert.deepEqual(Object.keys(countByFilter([], NOW)), ORDER_FILTERS.map((f) => f.id));
  });

  it('reads the placed date from a Timestamp, a Date or {seconds}, else null', () => {
    assert.equal(placedAt({ createdAt: stamp(0) }).getTime(), NOW);
    assert.equal(placedAt({ createdAt: new Date(NOW) }).getTime(), NOW);
    assert.equal(placedAt({ createdAt: { seconds: NOW / 1000 } }).getTime(), NOW);
    for (const bad of [{}, { createdAt: null }, { createdAt: 'yesterday' }, { createdAt: { toDate: () => new Date('x') } }, null]) assert.equal(placedAt(bad), null);
  });
});

describe('customer cancel state', () => {
  const paid = (status) => ({ status, paymentStatus: 'PAID' });

  it('offers the button until the order is packed', () => {
    assert.equal(customerCancelState(paid('PAYMENT_CONFIRMED')), 'yes');
    assert.equal(customerCancelState(paid('PREPARING')), 'yes');
  });

  it('explains instead once it is packed or on its way', () => {
    assert.equal(customerCancelState(paid('PACKED')), 'locked');
    assert.equal(customerCancelState(paid('OUT_FOR_DELIVERY')), 'locked');
  });

  it('shows nothing for delivered, cancelled, unpaid or missing orders', () => {
    assert.equal(customerCancelState(paid('DELIVERED')), 'no');
    assert.equal(customerCancelState({ status: 'CANCELLED', paymentStatus: 'REFUND_PENDING' }), 'no');
    assert.equal(customerCancelState({ status: 'PREPARING', paymentStatus: 'REFUND_PENDING' }), 'no');
    assert.equal(customerCancelState(null), 'no');
  });

  it('keeps the reasons the server accepts (firebase/functions/cancelOrder.js)', () => {
    const server = readFileSync(new URL('../../firebase/functions/cancelOrder.js', import.meta.url), 'utf8');
    const listed = server.match(/CUSTOMER_REASONS = \[(.*?)\];/s)?.[1] ?? '';
    for (const reason of CUSTOMER_CANCEL_REASONS) assert.ok(listed.includes(`'${reason}'`), `server does not accept "${reason}"`);
  });
});
