'use strict';

// Scrubs a customer's personal columns out of the Excel order sheet in S3 (shared/erasure.js, step 1).
//
// The sheet has a row per order with the customer's name, mobile number, address and delivery note beside the money and the
// status. Those four cells are overwritten for the given orders; every other cell (amounts, Razorpay payment id, status...) and
// every row is left exactly as it was, so the shop's reporting still adds up.
//
// It reuses updateWorkbook, so it has the same protection against two writers saving at once, and the same retries.
//
// NOTE: if the S3 bucket has VERSIONING on, earlier versions of the file still hold the old values. docs/GO_LIVE.md asks for a
// lifecycle rule that expires old versions, so they disappear on their own.

const { updateWorkbook } = require('./s3Workbook');

// The headers (excelSync.js: EXCEL_COLUMNS) of the cells that hold personal data.
const PERSONAL_HEADERS = ['Customer', 'Phone', 'Address', 'Note'];

// Returns { rows, changed }: how many sheet rows held these orders, and whether any cell had to change.
async function scrubOrderRows(cfg, { orderIds, columns, redacted }, deps = {}) {
  const at = PERSONAL_HEADERS.map((header) => columns.indexOf(header));
  if (at.includes(-1)) throw new Error('The Excel columns changed: erasure does not know where the personal data is.');

  const { rows, changed } = await updateWorkbook(
    cfg,
    {
      columns,
      // May run more than once (if someone else saved first), so it looks at the sheet afresh each time.
      mutate: (sheet) => {
        let rowCount = 0;
        let didChange = false;
        for (const orderId of orderIds) {
          for (const row of sheet.rowsFor(orderId)) {
            rowCount += 1;
            for (const column of at) didChange = sheet.writeCells(row, column, [redacted]) || didChange;
          }
        }
        return { changed: didChange, rows: rowCount };
      },
    },
    deps,
  );
  return { rows, changed };
}

module.exports = { PERSONAL_HEADERS, scrubOrderRows };
