# Excel sync: how it works and what to do when Microsoft is down

This page is for the people who **use** the Orders spreadsheet and the people who **look after** it. For first-time setup (Azure, secrets, workbook), see [AZURE_SETUP.md](AZURE_SETUP.md).

## In one minute

```
 Order created ──► new row added to OrdersTable            (excelSync)
 Order changes ──► columns P, Q, R of that row updated     (excelSyncUpdate)
 Microsoft down ─► nothing breaks; staff press "Retry Excel sync" afterwards
```

- **Firebase is the source of truth. Excel is a copy for reporting.** If the two ever disagree, Firebase is right.
- The sync **never** stops, slows or changes an order. If the copy fails, the customer and the kitchen see nothing different.

## What is in each column

| Columns | What they hold | When they are written |
|---|---|---|
| **A to O** (Order ID … Note) | Who ordered, what, where, how much | **Once**, when the order is created |
| **P, Q, R** (Payment status, Order status, Last updated) | Where the order is now | **Every time** the order's status or payment status changes |

Statuses you will see in **Order status**: `PAYMENT_CONFIRMED`, `PREPARING`, `PACKED`, `OUT_FOR_DELIVERY`, `DELIVERED`, `CANCELLED`.
Statuses in **Payment status**: `PAID`, `REFUND_PENDING`, `REFUNDED`.

An order the system had to cancel because the last box sold out while the customer was paying appears straight away as `CANCELLED` / `REFUND_PENDING`.

## What you can and cannot do in the spreadsheet

| ✅ Fine | ❌ Please don't |
|---|---|
| Sort or filter the table | Delete the table, or rename it (it must stay **`OrdersTable`**) |
| Add your own columns **to the right of column R** (the sync never touches them) | Move, delete or rename the first column, **Order ID** (the sync finds each row by that column) |
| Type notes into any cell | Delete a row (the sync will **not** add it back; see below) |
| Format, colour and add charts or pivot tables | Insert a column in the middle of A to R |

**If you delete a row**, later status changes for that order are skipped on purpose (so a deliberate delete is never undone). The order's `excelSync` record shows `updateState: ROW_MISSING`. To get it back, add the row by hand.

## When Microsoft's service is down

1. **Orders keep working.** Nothing on the website or the staff dashboard depends on Excel.
2. **Short outages fix themselves.** Each Excel request is tried up to 4 times, waiting 1, 2 and 4 seconds (or as long as Microsoft asks) before giving up.
3. **Longer outages are recorded.** Each order that missed a row or an update is noted in the database as `FAILED`, and the reason is written to the function log. Rows and updates for other orders that were sent while Microsoft was fine are not affected.
4. **When Microsoft is back, press the retry button** (next section). Do not re-enter orders by hand.

Common causes of failures that are *not* an outage (the log shows a plain-English hint for each): an **expired client secret** (Azure secrets last at most 24 months), someone **renaming or deleting the workbook**, or **admin consent being removed**. See the troubleshooting table in [AZURE_SETUP.md](AZURE_SETUP.md#6-when-something-goes-wrong).

## The retry button

**Where:** the staff dashboard (`/admin/orders`), at the bottom, in the card called **Excel sync**. You must be signed in as staff.

**When to press it:**
- after Microsoft has had an outage, or
- after someone fixes a setup problem (for example, a renewed secret), or
- any time the sheet looks behind (an order missing, or a status that is out of date).

It is **safe to press at any time**. If everything is already in Excel it simply says so. It never creates duplicate rows.

**What it does, in order:**
1. **Adds missing rows**: orders whose first copy failed. (Up to 25 at a time.)
2. **Fixes out-of-date rows**: orders whose status change failed to reach Excel. (Up to 25 at a time.)

**What it tells you:**

| Message | Meaning | What to do |
|---|---|---|
| "Everything is already in Excel." | Nothing was behind. | Nothing. |
| "Added N missing rows. Updated M rows." | It caught up. | Nothing. |
| "N could not be sent" | Still failing, so the cause is not fixed yet. | Check the log hint, fix the cause, press the button again. If more than 25 were behind, press it again to do the next batch. |
| "Check these orders in Excel by hand: …" | We could not tell whether the row reached Excel (Microsoft did not answer). The tool will **not** guess, to avoid a duplicate row. | Search the sheet for each order ID (below). |
| "Excel sync is not set up yet" | Azure settings are still empty. | Follow [AZURE_SETUP.md](AZURE_SETUP.md). |

**Checking an order by hand.** For each ID listed, press `Ctrl+F` in the sheet and search the Order ID column.
- **Found:** open the order's record in the Firebase console (**Firestore → `excelSync` → the order ID**) and change `state` to `DONE`.
- **Not found:** in the same record change `maybeAppended` to `false`, then press **Retry Excel sync** again.

## Reading the record of what happened (for the person looking after it)

Each order has a record in the `excelSync` collection (visible only in the Firebase console; customers and staff browsers cannot read it).

| Field | Meaning |
|---|---|
| `state` | The **row**: `PENDING` (being added), `DONE` (in Excel), `FAILED` (not added; see `error`) |
| `synced` | The status and payment status Excel was last told, so repeats are skipped |
| `updateState` | The **status updates**: `DONE`, `FAILED` (see `updateError`), or `ROW_MISSING` |
| `error`, `updateError` | What went wrong: `message`, which `stage` (`token`, `append`, `lookup`, `update`), the HTTP `status`, and a `hint` |
| `maybeAppended` | `true` = Microsoft did not answer, so the row may or may not be in Excel |

Records never contain the secret or any customer details.

## How it works (for developers)

**Files** (all under `firebase/functions/`)
- `excelSync.js`: the create trigger, the settings, the row layout (`EXCEL_COLUMNS`), the ledger, and **`callGraph()`**, the single function that talks to Microsoft.
- `excelSyncUpdate.js`: the update trigger, and `retryExcelSync` (the staff-only function behind the button).

**Finding a row.** Microsoft Graph cannot look up a table row by value. So an update (1) reads the **Order ID column** (`GET …/tables/OrdersTable/columns('Order ID')/dataBodyRange`), (2) finds the id, turning its position into a sheet row number, then (3) `PATCH`es just that row's `P:R` cells (`…/worksheets/Orders/range(address='P5:R5')`). A row number is **never stored**, because sorting moves rows. Each update reads the whole Order ID column, which is fine for tens of thousands of rows; for a very large sheet, consider archiving old orders to another table.

**Safe under races.** The function writes what the order says *right now* (it re-reads it), then re-reads again afterwards and writes again if it changed meanwhile (up to 3 rounds), so overlapping updates always end on the latest status. A repeated event, or one where Excel is already right (`synced` matches), makes no Microsoft calls. An update that arrives before its row exists waits up to 30 seconds for the row.

**What is retried.** Same rules everywhere, in `callGraph()`:

| Situation | Adding a row | Reading / updating cells |
|---|---|---|
| 401 (stale token) | new token, retry once | same |
| 409, 423, 429, 503 (busy, locked, slow down) | retry, honouring `Retry-After`, else 1s / 2s / 4s | same |
| 500, 502, 504, timeout, dropped connection | **not retried**; flagged `maybeAppended` | **retried** |
| 400, 403, 404 | not retried; a hint is logged | same |

Adding a row is **not safe to repeat** if the first try may have worked, so unclear failures are flagged for a human instead. Updating cells writes the same values again, which is harmless, so it retries everything that might be temporary.

**Not covered yet.** Orders created before Azure was set up are not in Excel and are not updated (there is no backfill tool). Only `status` and `paymentStatus` changes are copied; other changes (for example the delivery code or rider) are not shown in Excel.
