// Who the receipt says it is from. Fill in what applies to the business; anything left empty is simply
// not printed.
//
// TAX: a customer's order does not store a tax breakdown, so the receipt prints the amounts the
// customer was charged (items, delivery, tip, discount) and NO tax line. If the business is registered
// for GST and must issue tax invoices, that needs a decision (are prices tax-inclusive, which rate)
// and a change to what an order stores. Do not guess one here. Ask the business's accountant.

export const BUSINESS = {
  name: 'FreshBliss',
  legalName: '', // for example "FreshBliss Foods Private Limited"
  address: '', // for example "Indiranagar, Bengaluru 560038"
  gstin: '', // printed as "GSTIN: ..." when filled in
  contact: '', // a phone number or email customers can reach
};
