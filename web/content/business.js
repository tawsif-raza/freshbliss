// Who the shop is. Used on the receipt, in the footer and on the privacy page. Fill in what applies;
// anything left empty is simply not shown (nothing is made up).
//
// REVIEW BEFORE LAUNCH (docs/GO_LIVE.md, section 8.3):
//   hours    shown in the footer when filled in, for example "Every day, 9 am to 9 pm". Left empty, the
//            footer shows no opening hours rather than guessing them.
//   supportEmail  where the "Still have questions?" button on the FAQ page sends email.
//   contact  a phone number or email customers can reach. Also shown on the privacy page as the way to
//            ask about their data.
//
// TAX: a customer's order does not store a tax breakdown, so the receipt prints the amounts the
// customer was charged (items, delivery, tip, discount) and NO tax line. If the business is registered
// for GST and must issue tax invoices, that needs a decision (are prices tax-inclusive, which rate)
// and a change to what an order stores. Do not guess one here. Ask the business's accountant.

export const BUSINESS = {
  name: 'FreshBliss',
  legalName: '', // for example "FreshBliss Foods Private Limited"
  address: '', // for example "Indiranagar, Bengaluru 560038"
  gstin: '', // printed on the receipt as "GSTIN: ..." when filled in
  fssai: '', // 14-digit FSSAI licence/registration number. FSSAI requires it on invoices/receipts and shop listings of food businesses; printed on the receipt and in the footer when filled in
  supportEmail: 'support@freshbliss.in', // make sure this mailbox exists and is read
  contact: '', // a phone number or email customers can reach
  hours: '', // for example "Every day, 9 am to 9 pm"
};
