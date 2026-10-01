'use strict';

// The order lifecycle, in one place.
//
//   PAYMENT_CONFIRMED -> PREPARING -> PACKED -> OUT_FOR_DELIVERY -> DELIVERED
//
// An order only ever moves ONE step forward. No skipping, no going back.
// CANCELLED is a separate end state (not part of this line) and is not handled here.

const { HttpsError } = require('firebase-functions/v2/https');

const ORDER_FLOW = ['PAYMENT_CONFIRMED', 'PREPARING', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED'];

const fail = (code, message) => new HttpsError(code, message);

// The status that comes after `current`, or null if there is none
// (DELIVERED, CANCELLED or anything unknown).
function nextStatus(current) {
  const i = ORDER_FLOW.indexOf(current);
  return i === -1 || i === ORDER_FLOW.length - 1 ? null : ORDER_FLOW[i + 1];
}

// Check the rider details staff type in when an order goes out for delivery.
// Name is required; phone and vehicle are optional. Returns clean values.
function cleanRider(rider) {
  const r = rider && typeof rider === 'object' ? rider : {};
  const name = typeof r.name === 'string' ? r.name.trim() : '';
  const phone = typeof r.phone === 'string' ? r.phone.trim() : '';
  const vehicle = typeof r.vehicle === 'string' ? r.vehicle.trim() : '';

  if (!name || name.length > 60) throw fail('invalid-argument', 'Enter the rider name (up to 60 characters).');
  if (phone.length > 20 || !/^[0-9+() -]*$/.test(phone)) throw fail('invalid-argument', 'The rider phone number is not valid.');
  if (vehicle.length > 40) throw fail('invalid-argument', 'The vehicle details are too long (up to 40 characters).');

  return { name, phone: phone || null, vehicle: vehicle || null };
}

module.exports = { ORDER_FLOW, nextStatus, cleanRider };
