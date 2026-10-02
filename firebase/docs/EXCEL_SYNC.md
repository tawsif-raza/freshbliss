# Excel sync: how it works and what to do when AWS is down

This page is for the people who **use** the Orders spreadsheet and the people who **look after** it. For first-time setup (AWS, secrets), see [AWS_SETUP.md](AWS_SETUP.md).

## In one minute

```
 Order created ──► new row added to orders.xlsx in S3        (excelSync)
 Order changes ──► columns P, Q, R of that row updated        (excelSyncUpdate)
 AWS down ───────► nothing breaks; staff press "Retry Excel sync" afterwards
```

- **Firebase is the source of truth. The spreadsheet is a copy for reporting.** If the two ever disagree, Firebase is right.
- The sync **never** stops, slows or changes an order. If the copy fails, the customer and the kitchen see nothing different.
- The spreadsheet is a single file, `orders/orders.xlsx`, in an Amazon S3 bucket.

## Opening the spreadsheet

The file lives in a private S3 bucket, so you **download a copy** to read it.

**Easiest: the staff dashboard.** Open `/admin/orders`, go to the **Excel sync** card at the bottom and press **Download orders sheet**. Your browser saves `freshbliss-orders-<date>.xlsx`. You must be signed in as staff.
- The button asks the server for a link that works for **15 minutes** and only for this one file. If you wait longer, press the button again.
- The link is for reading only. It cannot change the file or reach anything else in the bucket.
- Each download is written to the function log with the staff member's user id, because the file holds customer addresses.
- If the button says there is no orders sheet yet, no order has been copied yet (the first order creates it). If it says the sheet could not be opened, see [AWS_SETUP.md](AWS_SETUP.md#6-when-something-goes-wrong); the function log has the reason.

**Without the dashboard** (for whoever looks after the system): in the AWS console open S3 → the bucket → `orders/` → `orders.xlsx` → **Download**, or run `aws s3 cp s3://YOUR-BUCKET/orders/orders.xlsx .`

The copy you download is a snapshot. Download again for newer orders.

## What is in each column

| Columns | What they hold | When they are written |
|---|---|---|
| **A to O** (Order ID … Note) | Who ordered, what, where, how much | **Once**, when the order is created |
| **P, Q, R** (Payment status, Order status, Last updated) | Where the order is now | **Every time** the order's status or payment status changes |

Statuses you will see in **Order status**: `PAYMENT_CONFIRMED`, `PREPARING`, `PACKED`, `OUT_FOR_DELIVERY`, `DELIVERED`, `CANCELLED`.
Statuses in **Payment status**: `PAID`, `REFUND_PENDING`, `REFUNDED`.

An order the system had to cancel because the last box sold out while the customer was paying appears straight away as `CANCELLED` / `REFUND_PENDING`.

## Working with the data

**Do your reporting in your own copy.** Download the file, then filter, sort, add formulas, charts and pivot tables in the downloaded copy (or in a separate workbook that you paste or import the data into). Do **not** upload your edited copy back over `orders/orders.xlsx`.

Why: the sync works by downloading the file, changing one row and saving it back. If you upload your copy, any orders that arrived after you downloaded it are wiped out of the sheet, and the sync will not notice (it believes those rows are already there). Also, the sync keeps only the data, text and formatting of the sheet. **Charts, pivot tables and macros in the live file are lost** the next time an order is saved.

| ✅ Fine | ❌ Please don't |
|---|---|
| Download the file and do anything you like with your copy | Upload an edited file over `orders/orders.xlsx` |
| Share a downloaded copy with your accountant | Make the bucket or file public |
| Add columns **to the right of column R** in the live file (the sync never touches them) | Rename the `Orders` sheet, or move, delete or rename any of the first 18 headers |
| | Delete a row in the live file (the sync will **not** add it back; see below) |

**If you delete a row** in the live file, later status changes for that order are skipped on purpose (so a deliberate delete is never undone). The order's `excelSync` record shows `updateState: ROW_MISSING`. To get it back, add the row by hand.

## When AWS is down

1. **Orders keep working.** Nothing on the website or the staff dashboard depends on the spreadsheet.
2. **Short outages fix themselves.** Each request to AWS is tried up to 4 times, waiting 1, 2 and 4 seconds (or as long as AWS asks) before giving up.
3. **Longer outages are recorded.** Each order that missed a row or an update is noted in the database as `FAILED`, and the reason is written to the function log. Orders handled while AWS was fine are not affected.
4. **When AWS is back, press the retry button** (next section). Do not re-enter orders by hand.

Common causes of failures that are *not* an outage (the log shows a plain-English hint for each): a **deleted or deactivated access key**, a **changed bucket policy**, or someone **replacing the file** with something that is not a workbook. See the troubleshooting table in [AWS_SETUP.md](AWS_SETUP.md#6-when-something-goes-wrong).

## The retry button

**Where:** the staff dashboard (`/admin/orders`), at the bottom, in the card called **Excel sync**. You must be signed in as staff.

**When to press it:**
- after AWS has had an outage, or
- after someone fixes a setup problem (for example, a replaced access key), or
- any time the sheet looks behind (an order missing, or a status that is out of date).

It is **safe to press at any time**. If everything is already in the sheet it simply says so. It never creates duplicate rows: before adding an order it checks whether the order's ID is already there.

**What it does, in order:**
1. **Adds missing rows**: orders whose first copy failed. (Up to 25 at a time.)
2. **Fixes out-of-date rows**: orders whose status change failed to reach the sheet. (Up to 25 at a time.)

**What it tells you:**

| Message | Meaning | What to do |
|---|---|---|
| "Everything is already in Excel." | Nothing was behind. | Nothing. |
| "Added N missing rows. Updated M rows." | It caught up. | Nothing. |
| "N could not be sent" | Still failing, so the cause is not fixed yet. | Check the log hint, fix the cause, press the button again. If more than 25 were behind, press it again to do the next batch. |
| "Excel sync is not set up yet" | The AWS settings are still empty. | Follow [AWS_SETUP.md](AWS_SETUP.md). |

## If the file is damaged

If the log says `bad-workbook`, `bad-headers` or `no-sheet`, the file in S3 is not what the sync expects (for example someone uploaded an edited copy). The sync does **not** overwrite it. To recover:

1. In the S3 console open the bucket → `orders/orders.xlsx` → the **Versions** tab (versioning must be on; see [AWS_SETUP.md](AWS_SETUP.md#1-create-the-bucket)).
2. Find the last good version (look at the dates), and **Download** it.
3. **Upload** it again as `orders/orders.xlsx`; it becomes the newest version.
4. Press **Retry Excel sync** on the staff dashboard. Orders that arrived after that version are added back.

Orders whose rows were lost because someone uploaded an old copy are **not** found by the retry button (their records say `DONE`). To rebuild, set their `excelSync` records' `state` to `FAILED` in the Firebase console and press retry.

If you would rather start clean, **delete** the file. The next new order creates a fresh workbook with only that order, and the retry button adds back every order whose record says `FAILED`.

## Reading the record of what happened (for the person looking after it)

Each order has a record in the `excelSync` collection (visible only in the Firebase console; customers and staff browsers cannot read it).

| Field | Meaning |
|---|---|
| `state` | The **row**: `PENDING` (being added), `DONE` (in the sheet), `FAILED` (not added; see `error`) |
| `synced` | The status and payment status the sheet was last told, so repeats are skipped |
| `updateState` | The **status updates**: `DONE`, `FAILED` (see `updateError`), or `ROW_MISSING` |
| `error`, `updateError` | What went wrong: `message`, which `stage` (`read` or `write`), the HTTP `status`, a `code` and a `hint` |

Records never contain the secret or any customer details.

## How it works (for developers)

**Files** (all under `firebase/functions/`)
- `shared/s3Workbook.js`: everything that touches S3 and the `.xlsx`: reading, changing a row, saving with a version check, the retry rules, the error hints.
- `excelSync.js`: the create trigger, the settings, the row layout (`EXCEL_COLUMNS`), the safety apostrophe, and the ledger.
- `excelSyncUpdate.js`: the update trigger, and `retryExcelSync` (the staff-only function behind the retry button).
- `getOrdersDownloadUrl.js`: the staff-only function behind the download button. It checks the `staff` claim, asks S3 for one byte of the file (so a missing file or bucket is reported now, not later in the browser), then signs a `GetObject` link that expires after 15 minutes and tells the browser to save it as an attachment. Signing happens on the server; the link carries the access key ID and a signature, never the secret.

**Changing one row of one file.** S3 cannot edit part of a file. Every change is: download `orders.xlsx` (and its ETag), change the sheet in memory, upload it with **`If-Match: <that ETag>`**. If somebody else saved in between, S3 answers `412 Precondition Failed`; we read the new version and redo the change. For a brand-new file the upload uses `If-None-Match: *`, so two first orders cannot both create it. This is why concurrent orders never overwrite each other.

**Finding a row.** The sync looks for the order's ID in column A of the current file on every try. A row number is **never stored**, because sorting moves rows. Adding a row first checks that the ID is not already there, so an upload whose reply was lost can be retried without creating a duplicate. An update writes the three live cells and **does not save at all** if they already show the right values.

**Safe under races.** The update function writes what the order says *right now* (it re-reads it), then re-reads again afterwards and writes again if it changed meanwhile (up to 3 rounds), so overlapping updates always end on the latest status. A repeated event, or one where the sheet is already right (`synced` matches), makes no calls to AWS. An update that arrives before its row exists waits up to 30 seconds for the row.

**What is retried.** All in `updateWorkbook()`:

| Situation | What happens |
|---|---|
| Somebody else saved first (`412`, `409 ConditionalRequestConflict`) | Read again and redo the change after a short random pause, up to 30 times (a rush of orders: one writer wins each round) |
| `SlowDown`, `ServiceUnavailable`, `InternalError`, `429`, `5xx`, timeout, dropped connection | Wait 1s, 2s, 4s (or `Retry-After`, at most 15s); up to 4 tries |
| `AccessDenied`, `NoSuchBucket`, `InvalidAccessKeyId`, `SignatureDoesNotMatch`, wrong region | Not retried; a hint is logged |
| File is not a workbook, headers changed, `Orders` sheet missing | Not retried; the file is left untouched; a hint is logged |

Unlike a "add a row" call to a web service, every step here can safely be repeated, so there is no "maybe it worked, check by hand" state.

**Limits.** Each change downloads and uploads the whole file, which is fine for tens of thousands of rows (a few MB); for a very large sheet, archive old orders to another file. Orders created before AWS was set up are not in the sheet and are not updated (there is no backfill tool). Only `status` and `paymentStatus` changes are copied; other changes (for example the delivery code or rider) are not shown.
