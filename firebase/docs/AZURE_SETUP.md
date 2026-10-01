# Excel sync: Azure setup checklist

This connects FreshBliss to a Microsoft 365 Excel workbook. Every new order is added to it as a new row, automatically, within a few seconds of the order being created.

Firestore stays the source of truth. Excel is a **copy for reporting**. If the copy ever fails, the order is not affected: the failure is logged and can be retried (see [When something goes wrong](#6-when-something-goes-wrong)).

You will do four things: **(1)** make the workbook, **(2)** register an app in Azure, **(3)** collect five values, **(4)** give those values to Firebase.

> **Before you start**
> - You need a **Microsoft 365 work or school tenant** that includes OneDrive for Business or SharePoint (for example Microsoft 365 Business Basic or higher). Personal Microsoft accounts (outlook.com, hotmail.com) do **not** work for this.
> - You need an account that can **register apps and grant admin consent**: usually a *Global Administrator*, or an *Application Administrator* together with someone who can give consent.
> - Menu names in the Azure portal change from time to time. If a label below does not match exactly, look for the closest one. If a step is truly different, tell the person maintaining this repo so the guide can be fixed.

---

## 1. Create the Excel workbook

The workbook must contain a **Table** (not just cells). Microsoft Graph can add rows to a table, but it has no way to "append to a worksheet".

- [ ] **1.1** In OneDrive or a SharePoint document library, create a new Excel workbook. Suggested path: `FreshBliss/Orders.xlsx`.
- [ ] **1.2** Rename the first sheet to **`Orders`**.
- [ ] **1.3** In row 1, type these **18 headers, one per column, from A1 to R1, in exactly this order**:

| Col | Header |
|---|---|
| A | Order ID |
| B | Received (IST) |
| C | Customer |
| D | Phone |
| E | Address |
| F | Pincode |
| G | Zone |
| H | Items |
| I | Subtotal (INR) |
| J | Discount (INR) |
| K | Delivery fee (INR) |
| L | Tip (INR) |
| M | Total (INR) |
| N | Razorpay payment ID |
| O | Note |
| P | Payment status |
| Q | Order status |
| R | Last updated (IST) |

> **Columns P, Q and R are "live".** They change as the order moves along (see [How rows are kept up to date](EXCEL_SYNC.md)). Everything else is written once, when the order is created. You can add your own columns **to the right of R**; the sync never touches them.

- [ ] **1.4** Click any header cell, then **Insert → Table**. Tick **My table has headers**, then **OK**.
- [ ] **1.5** With the table selected, open **Table Design** (called **Table** on some versions). In the **Table Name** box type **`OrdersTable`** and press Enter.
- [ ] **1.6** Save and close the workbook (close it fully; a locked file can cause occasional errors).

> The columns come from `EXCEL_COLUMNS` in `functions/excelSync.js`. The number and order of columns must match, or Microsoft rejects the row with a `400` error. If you add a column in the code later, add it at the **end** here too.
>
> **The first column must stay "Order ID".** The sync finds an order's row by reading that column. Sorting, filtering and hiding rows in Excel are all fine; deleting the table or moving columns around is not.

**Good to know about the data:**
- **Payment status, Order status and Last updated (columns P to R) are kept up to date automatically** when an order is prepared, packed, delivered, cancelled or refunded. If Microsoft is ever unreachable, a staff member can press **Retry Excel sync** on the dashboard (see [EXCEL_SYNC.md](EXCEL_SYNC.md)).
- "Customer" shows **Guest** until customers have real accounts (orders do not store a name yet). "Phone" is blank for the same reason.
- The sheet contains **customer addresses and phone numbers**. Share the file only with people who need it.

---

## 2. Register the app in Azure

- [ ] **2.1** Sign in to the Azure portal at <https://portal.azure.com> (or the Microsoft Entra admin center at <https://entra.microsoft.com>) with your admin account.
- [ ] **2.2** Search for **Microsoft Entra ID** and open it. (Older name: *Azure Active Directory*.)
- [ ] **2.3** In the left menu choose **App registrations**, then **+ New registration**.
- [ ] **2.4** Fill in:
  - **Name:** `FreshBliss Excel Sync`
  - **Supported account types:** **Accounts in this organizational directory only** (Single tenant)
  - **Redirect URI:** leave **empty**
- [ ] **2.5** Click **Register**. You land on the app's **Overview** page. Keep it open.

---

## 3. Collect the values

### 3a. Tenant ID and Client ID
Both are on the app's **Overview** page, under **Essentials**:

- [ ] **`GRAPH_TENANT_ID`** = **Directory (tenant) ID** (a GUID like `11111111-2222-3333-4444-555555555555`)
- [ ] **`GRAPH_CLIENT_ID`** = **Application (client) ID** (another GUID)

> If you cannot find the Tenant ID: Microsoft Entra ID → **Overview** → **Tenant ID**.

### 3b. Create the client secret
- [ ] **3b.1** In the left menu of the app: **Certificates & secrets** → **Client secrets** tab → **+ New client secret**.
- [ ] **3b.2** **Description:** `FreshBliss Firebase`. **Expires:** choose 12 or 24 months (the maximum offered).
- [ ] **3b.3** Click **Add**.
- [ ] **3b.4** **Copy the `Value` column immediately.** This is **`GRAPH_CLIENT_SECRET`**.
  - Copy **Value**, **not** "Secret ID". The Secret ID will not work.
  - Microsoft shows the Value **only once**. If you lose it, delete the secret and create another.
- [ ] **3b.5** Put a reminder in your calendar **2 weeks before the expiry date**. When the secret expires, the Excel sync stops (orders keep working). To renew: create a new secret, update `GRAPH_CLIENT_SECRET` (step 4), then delete the old one.

### 3c. Give the app permission to write to Excel files
- [ ] **3c.1** In the app's left menu: **API permissions** → **+ Add a permission**.
- [ ] **3c.2** Choose **Microsoft Graph**.
- [ ] **3c.3** Choose **Application permissions**. **Not** "Delegated permissions". (Application permissions are what let the server act without a person signed in.)
- [ ] **3c.4** Search for and tick **`Files.ReadWrite.All`**, then **Add permissions**.
- [ ] **3c.5** ⚠️ **Grant admin consent.** On the same API permissions page click **Grant admin consent for _your organisation name_**, then **Yes**.
  - Until you do this, the permission shows an orange warning and **every request fails with `403`**. This is the step people most often forget.
- [ ] **3c.6** Check the **Status** column shows a green tick and **Granted for _your organisation_**.

> **A note on how broad this is.** `Files.ReadWrite.All` lets the app read and write **every file** in your organisation's OneDrive and SharePoint, not just the Orders workbook. That is fine for trying this out, but anyone who obtains the client secret could use it that widely. Keep the secret in Firebase Secret Manager only (step 4). **For production, consider the narrower option below.**

<details>
<summary><strong>Optional (recommended for production): limit the app to one SharePoint site with <code>Sites.Selected</code></strong></summary>

This is more work but means the app can touch **only** the one site that holds the workbook.

1. Put the workbook in a **SharePoint** site (not someone's personal OneDrive), for example a site called `FreshBliss`.
2. In step 3c, add **`Sites.Selected`** (Application) instead of `Files.ReadWrite.All`, and grant admin consent.
3. Now tell SharePoint which site the app may use. An admin does this once, in [Graph Explorer](https://developer.microsoft.com/graph/graph-explorer), signed in as an admin who has consented to `Sites.FullControl.All`:
   - `GET https://graph.microsoft.com/v1.0/sites/{your-tenant}.sharepoint.com:/sites/FreshBliss` and copy the site `id`.
   - `POST https://graph.microsoft.com/v1.0/sites/{site-id}/permissions` with this body:
     ```json
     {
       "roles": ["write"],
       "grantedToIdentities": [
         { "application": { "id": "<your Client ID>", "displayName": "FreshBliss Excel Sync" } }
       ]
     }
     ```
4. Use that site's document library for `EXCEL_DRIVE_ID` (step 3d).

After granting, run the check in step 5 to confirm it works.
</details>

### 3d. Find the Drive ID and Item ID (where the workbook lives)
Microsoft needs to be told exactly which file. You look both ids up once, using Graph Explorer.

- [ ] **3d.1** Open <https://developer.microsoft.com/graph/graph-explorer> and **sign in** with your admin account.
- [ ] **3d.2** Find the **Drive ID**. Run **one** of these (a GET request), depending on where the file is:
  - In a **person's OneDrive:** `https://graph.microsoft.com/v1.0/users/{their-email}/drive`
  - In a **SharePoint site:** first `https://graph.microsoft.com/v1.0/sites/{your-tenant}.sharepoint.com:/sites/{site-name}` (copy the `id`), then `https://graph.microsoft.com/v1.0/sites/{that-id}/drive`
  - If Graph Explorer says it needs permission, open the **Modify permissions** tab, consent to `Files.Read.All` (and `Sites.Read.All` for SharePoint), and run it again.
  - In the result, copy **`id`** (it starts with `b!`). This is **`EXCEL_DRIVE_ID`**.
- [ ] **3d.3** Find the **Item ID** of the workbook. GET:
  `https://graph.microsoft.com/v1.0/drives/{EXCEL_DRIVE_ID}/root:/FreshBliss/Orders.xlsx`
  (use the folder and file name you chose in step 1.1). Copy **`id`**. This is **`EXCEL_ITEM_ID`**.
- [ ] **3d.4** Confirm the table is visible. GET:
  `https://graph.microsoft.com/v1.0/drives/{EXCEL_DRIVE_ID}/items/{EXCEL_ITEM_ID}/workbook/tables`
  You should see an entry named **`OrdersTable`**. If the list is empty, the cells are not formatted as a table (redo steps 1.4 and 1.5).

You now have all five values:

| Setting | Where it came from |
|---|---|
| `GRAPH_TENANT_ID` | 3a, Directory (tenant) ID |
| `GRAPH_CLIENT_ID` | 3a, Application (client) ID |
| `GRAPH_CLIENT_SECRET` | 3b, the secret **Value** |
| `EXCEL_DRIVE_ID` | 3d.2, the drive `id` |
| `EXCEL_ITEM_ID` | 3d.3, the file `id` |

(`EXCEL_TABLE_NAME` is `OrdersTable` unless you named the table something else.)

---

## 4. Give the values to Firebase

### On your computer (the emulator)
- [ ] In `firebase/functions/.env.local` add (these four are not secret). **If the file already has empty `GRAPH_TENANT_ID=`, `GRAPH_CLIENT_ID=`, `EXCEL_DRIVE_ID=` and `EXCEL_ITEM_ID=` lines, fill those in rather than adding duplicates.** The emulator creates them the first time you start it, and values in `.env.local` win over any other env file:
  ```
  GRAPH_TENANT_ID=11111111-2222-3333-4444-555555555555
  GRAPH_CLIENT_ID=66666666-7777-8888-9999-000000000000
  EXCEL_DRIVE_ID=b!xxxxxxxxxxxxxxxxxxxxxxxx
  EXCEL_ITEM_ID=01ABCDEFGHIJKLMNOPQRSTUVWXYZ
  ```
- [ ] In `firebase/functions/.secret.local` add the secret, on its own line:
  ```
  GRAPH_CLIENT_SECRET=the-secret-VALUE-you-copied
  ```
  Both files are git-ignored. **Never commit them or paste the secret into chat.**

### In production
- [ ] Store the secret in Firebase Secret Manager:
  ```
  firebase functions:secrets:set GRAPH_CLIENT_SECRET
  ```
  Paste the secret Value when asked.
- [ ] Put the four non-secret values in `firebase/functions/.env.<your-project-id>` (for example `.env.freshbliss-prod`), or answer the prompts the first time you run `firebase deploy`.
- [ ] Firebase Functions and Secret Manager need the **Blaze (pay-as-you-go)** plan. This sync's usage is tiny, and Blaze includes a free monthly allowance, but a billing account is required.
- [ ] The function listens to Firestore, so it must run **in the same region as your Firestore database**. The functions here use `asia-south1` (Mumbai), so create the Firestore database in **Mumbai (asia-south1)**. This cannot be changed later.

---

## 5. Test it

- [ ] **5.1** Start the emulator (`npm run emulators` in `firebase/`) with the values from step 4 in place.
- [ ] **5.2** Place a test order through the website, or create one in the emulator. Within a few seconds a new row should appear at the bottom of `OrdersTable`.
- [ ] **5.3** Check the record of what happened. In the Firestore emulator UI (<http://localhost:4000/firestore>) open the **`excelSync`** collection and find a document named after the order id:
  - `state: DONE` means the row was added.
  - `state: FAILED` means it was not. The `error.message` and `error.hint` fields say why.
- [ ] **5.4** Check that Microsoft can **find a row by Order ID** (this is what keeps rows up to date). In Graph Explorer, run this GET (use your own ids):
  `https://graph.microsoft.com/v1.0/drives/{EXCEL_DRIVE_ID}/items/{EXCEL_ITEM_ID}/workbook/tables/OrdersTable/columns('Order%20ID')/dataBodyRange`
  The reply must contain an `address` such as `Orders!A2:A5` and a `values` list of your order ids. If it returns an error, tell the person maintaining this repo before going live: this is the one Microsoft address that could not be tried against a real tenant while building.
- [ ] **5.5** Change the test order's status (for example press **Mark as Preparing** on the staff dashboard). Within a few seconds columns **P, Q and R** on that order's row change. The rest of the row stays as it was.
- [ ] **5.6** The function's log (shown in the emulator terminal, and under **Functions → Logs** in production) says either `excelSync: order added to Excel.` or `excelSync: could not add the order to Excel. The order itself is fine.` with the reason and a hint.

---

## 6. When something goes wrong

A failed sync **never** affects the order, the customer or the dashboard. It is recorded in `excelSync/{orderId}` with `state: FAILED`, and the log explains why.

| What you see | Likely cause | Fix |
|---|---|---|
| `AADSTS7000215` "Invalid client secret" | You copied the **Secret ID** instead of the secret **Value**, or made a typo. | Create a new secret and copy the **Value** (step 3b). |
| `AADSTS7000222` "client secret keys expired" | The secret passed its expiry date. | Create a new secret, update `GRAPH_CLIENT_SECRET`, redeploy. |
| `AADSTS700016` "Application not found in the directory" | Wrong `GRAPH_CLIENT_ID`, or wrong `GRAPH_TENANT_ID`. | Re-copy both from the app's Overview page. |
| `AADSTS90002` / `AADSTS900023` "Tenant not found" | Wrong `GRAPH_TENANT_ID`. | Re-copy it (step 3a). |
| `403` / `accessDenied` when adding the row | Admin consent was not granted, or the wrong permission type (Delegated instead of Application). | Redo step 3c, especially **3c.5**. After consenting, wait a few minutes. |
| `404` / `itemNotFound` | Wrong `EXCEL_DRIVE_ID`, `EXCEL_ITEM_ID` or table name. | Redo step 3d and check **3d.4** lists `OrdersTable`. |
| `400` "invalid argument" / row rejected | The table has a different number of columns than the code sends (18). | Make the table match step 1.3 exactly. |
| `423` / `resourceLocked`, `409`, `429`, `503` | Excel is busy, or Microsoft is slowing requests down. | Nothing to do. These are retried automatically (up to 4 tries). |
| A status change did not reach Excel (`updateState: FAILED`) | Microsoft was unreachable, or one of the causes above. | Fix the cause, then press **Retry Excel sync** on the staff dashboard. |
| `updateState: ROW_MISSING` | The order's row is not in the table any more (someone deleted it). | Nothing is added back automatically. Add the row by hand if it was deleted by mistake. |
| "timed out" or a failure marked `maybeAppended: true` | Microsoft did not answer, so we cannot know whether the row was added. | Check the sheet. If the order is there, set `state` to `DONE` on that `excelSync` document. If not, set `maybeAppended` to `false` and run the retry below. |

### Retrying
After fixing the cause (for example, renewing the secret), a staff member presses **Retry Excel sync** at the bottom of the staff dashboard (`/admin/orders`). It re-sends rows that are missing and fixes rows that are out of date, and tells you what it did. It is safe to press at any time. Full instructions: [EXCEL_SYNC.md](EXCEL_SYNC.md).

---

## 7. Security checklist

- [ ] The client secret exists **only** in Firebase Secret Manager and your git-ignored `.secret.local`. It is never in the repo, in chat, or in an email.
- [ ] The Excel file is shared only with people who need it (it holds customer addresses).
- [ ] You know the secret's expiry date and have a reminder (step 3b.5).
- [ ] For production, you considered limiting the app to one site with `Sites.Selected` (step 3c).
- [ ] If the secret is ever exposed: in Azure open **Certificates & secrets**, **delete** it, create a new one, and update Firebase.
- [ ] Text that starts with `=`, `+`, `-` or `@` (a customer's address, or a phone number such as `+91...`) is written to Excel with a leading `'`, so it can never run as an Excel formula. Excel normally hides that apostrophe. If you see a visible `'` at the start of a cell, tell the person maintaining this repo.
