# Excel sync: AWS setup checklist

This connects FreshBliss to an Excel workbook (`orders.xlsx`) kept in an **Amazon S3** bucket. Every new order is added to it as a new row, automatically, within a few seconds of the order being created, and the row's status is kept up to date as the order moves along.

Firestore stays the source of truth. The workbook is a **copy for reporting**. If the copy ever fails, the order is not affected: the failure is logged and can be retried (see [When something goes wrong](#6-when-something-goes-wrong)).

You will do four things: **(1)** make a bucket, **(2)** make an AWS user that can use only that one file, **(3)** collect four values, **(4)** give those values to Firebase.

> **Before you start**
> - You need an **AWS account** that can create S3 buckets and IAM users. Nothing else (no Microsoft 365, no Azure) is needed.
> - You do **not** create the workbook yourself. The first order creates `orders.xlsx` with the right headers.
> - Menu names in the AWS console change from time to time. If a label below does not match exactly, look for the closest one.
> - Cost: one small file and a few requests per order. For a small shop this is well under a US dollar a month.

---

## 1. Create the bucket

- [ ] **1.1** In the AWS console open **S3 → Create bucket**.
- [ ] **1.2** **Bucket name:** something unique, for example `freshbliss-orders-yourname`. **Region:** **Asia Pacific (Mumbai) `ap-south-1`**, next to the functions (`EXCEL_AWS_REGION` defaults to this; if you pick another, set it in step 4).
- [ ] **1.3** Leave **Block all public access** **ON** (all four boxes ticked). The file holds customer addresses and must never be public.
- [ ] **1.4** Turn **Bucket Versioning** **On**. S3 then keeps every earlier version of the file, so a damaged workbook can be restored (see [EXCEL_SYNC.md](EXCEL_SYNC.md#if-the-file-is-damaged)). This is strongly recommended.
- [ ] **1.5** Leave **Default encryption** as it is (SSE-S3, on by default).
- [ ] **1.6** Create the bucket.

> **Use a bucket just for this.** The policy in step 2 lets the sync user list the bucket's file names.

## 2. Create an AWS user that can use only that file

- [ ] **2.1** Open **IAM → Policies → Create policy → JSON**, paste this, and replace **both** `YOUR-BUCKET` with your bucket name:

  ```json
  {
    "Version": "2012-10-17",
    "Statement": [
      {
        "Sid": "ReadAndReplaceTheOrdersFile",
        "Effect": "Allow",
        "Action": ["s3:GetObject", "s3:PutObject"],
        "Resource": "arn:aws:s3:::YOUR-BUCKET/orders/orders.xlsx"
      },
      {
        "Sid": "TellMissingFileFromForbidden",
        "Effect": "Allow",
        "Action": "s3:ListBucket",
        "Resource": "arn:aws:s3:::YOUR-BUCKET"
      }
    ]
  }
  ```

  Name it `freshbliss-orders-sync`. If you change `EXCEL_S3_KEY` later, change the first `Resource` to match.

  **Why `s3:ListBucket`?** Without it, S3 answers "access denied" (not "not found") for a file that does not exist yet, so the very first order could not create the workbook.
- [ ] **2.2** Open **IAM → Users → Create user**. Name: `freshbliss-orders-sync`. **Do not** give it console access. Attach the policy from 2.1 directly.
- [ ] **2.3** Open the new user → **Security credentials → Create access key** → use case **Application running outside AWS** → create.
- [ ] **2.4** Copy the **Access key ID** and the **Secret access key**. The secret is shown **only once**.

## 3. The four values

| Setting | Where it came from |
|---|---|
| `EXCEL_S3_BUCKET` | 1.2, the bucket name |
| `EXCEL_AWS_REGION` | 1.2, the region code (`ap-south-1` is the default; leave it out if that is what you used) |
| `EXCEL_AWS_ACCESS_KEY_ID` | 2.4, the Access key ID |
| `EXCEL_AWS_SECRET_ACCESS_KEY` | 2.4, the Secret access key (**secret**) |

Optional: `EXCEL_S3_KEY` is the file's path inside the bucket (default `orders/orders.xlsx`).

---

## 4. Give the values to Firebase

### On your computer (the emulator)
- [ ] In `firebase/functions/.env.local` add (these are not secret). **If the file already has empty lines for them, fill those in rather than adding duplicates.** Values in `.env.local` win over any other env file:
  ```
  EXCEL_S3_BUCKET=freshbliss-orders-yourname
  EXCEL_AWS_REGION=ap-south-1
  EXCEL_AWS_ACCESS_KEY_ID=AKIAXXXXXXXXXXXXXXXX
  ```
- [ ] In `firebase/functions/.secret.local` add the secret, on its own line:
  ```
  EXCEL_AWS_SECRET_ACCESS_KEY=the-secret-access-key-you-copied
  ```
  Both files are git-ignored. **Never commit them or paste the secret into chat.**

### In production
- [ ] Store the secret in Firebase Secret Manager:
  ```
  firebase functions:secrets:set EXCEL_AWS_SECRET_ACCESS_KEY
  ```
  Paste the secret access key when asked.
- [ ] Put the three non-secret values in `firebase/functions/.env.<your-project-id>` (for example `.env.freshbliss-prod`), or answer the prompts the first time you run `firebase deploy`.
- [ ] Firebase Functions and Secret Manager need the **Blaze (pay-as-you-go)** plan. This sync's usage is tiny, but a billing account is required.
- [ ] The function listens to Firestore, so it must run **in the same region as your Firestore database**. The functions here use `asia-south1` (Mumbai), so create the Firestore database in **Mumbai (asia-south1)**. This cannot be changed later. (The S3 bucket's region does not have to match.)

---

## 5. Test it

- [ ] **5.1** Start the emulator (`npm run emulators` in `firebase/`) with the values from step 4 in place.
- [ ] **5.2** Place a test order through the website, or create one in the emulator. Within a few seconds the file `orders/orders.xlsx` appears in the bucket.
- [ ] **5.3** Download and open it: sign in as staff, open `/admin/orders` and press **Download orders sheet** on the **Excel sync** card. (Or in the S3 console: the bucket → `orders/orders.xlsx` → **Download**; or with the AWS CLI: `aws s3 cp s3://YOUR-BUCKET/orders/orders.xlsx .`) You should see the 18 headers below in row 1 and your order in row 2. The button needs no extra AWS permission: the policy in step 2.1 already allows reading the file.
- [ ] **5.4** Check the record of what happened. In the Firestore emulator UI (<http://localhost:4000/firestore>) open the **`excelSync`** collection and find a document named after the order id:
  - `state: DONE` means the row was added.
  - `state: FAILED` means it was not. The `error.message` and `error.hint` fields say why.
- [ ] **5.5** Change the test order's status (for example press **Mark as Preparing** on the staff dashboard). Within a few seconds, download the file again: columns **P, Q and R** on that order's row have changed. The rest of the row stays as it was.
- [ ] **5.6** The function's log (shown in the emulator terminal, and under **Functions → Logs** in production) says either `excelSync: order added to Excel.` or `excelSync: could not add the order to Excel. The order itself is fine.` with the reason and a hint.

### The sheet

The first sheet is called **`Orders`**. Its first row holds these **18 headers, in exactly this order** (created for you; do not rename or move them):

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

> **Columns P, Q and R are "live".** They change as the order moves along (see [how rows are kept up to date](EXCEL_SYNC.md)). Everything else is written once, when the order is created. You can add your own columns **to the right of R**; the sync never touches them.

> The columns come from `EXCEL_COLUMNS` in `functions/excelSync.js`. If you add a column in the code later, add it at the **end** here too.

**Good to know about the data:**
- "Customer" shows **Guest** until customers have real accounts (orders do not store a name yet). "Phone" is blank for the same reason.
- The sheet contains **customer addresses and phone numbers**. Share the file only with people who need it.
- Money columns are numbers, so Excel can add them up.

---

## 6. When something goes wrong

A failed sync **never** affects the order, the customer or the dashboard. It is recorded in `excelSync/{orderId}` with `state: FAILED` (or `updateState: FAILED`), and the log explains why. Each record has an `error` with a plain-English `hint`.

| What you see | Likely cause | Fix |
|---|---|---|
| `AccessDenied` / `403` | The user's policy is wrong, or it lacks `s3:ListBucket` (then a missing file looks like "denied"). | Compare the policy with step 2.1: both statements, both `YOUR-BUCKET` replaced, and the file path right. |
| `InvalidAccessKeyId` | Wrong `EXCEL_AWS_ACCESS_KEY_ID`, or the key was deleted or made inactive. | Check the key under **IAM → Users → Security credentials**; create a new one if needed (step 2.3) and update Firebase. |
| `SignatureDoesNotMatch` | The secret access key is wrong (a typo, or you copied the key ID instead). | Create a new access key (step 2.3) and update `EXCEL_AWS_SECRET_ACCESS_KEY`. |
| `NoSuchBucket` | Wrong `EXCEL_S3_BUCKET` or `EXCEL_AWS_REGION`. | Re-check step 1.2. |
| `PermanentRedirect` | The bucket is in a different region from `EXCEL_AWS_REGION`. | Set `EXCEL_AWS_REGION` to the bucket's region. |
| `RequestTimeTooSkewed` | The server clock is more than 15 minutes out. | Only seen on a mis-set computer or emulator; fix the clock. |
| `SlowDown`, `503`, `500`, timeouts | AWS is busy, or the network dropped. | Nothing to do. Retried automatically (up to 4 tries, 1s, 2s, 4s). |
| `bad-workbook` | The file in S3 is not a valid Excel workbook (someone uploaded something else). | Restore the previous version ([EXCEL_SYNC.md](EXCEL_SYNC.md#if-the-file-is-damaged)) or delete the file; the next order creates a new one. |
| `bad-headers` | Someone changed or moved the first 18 headers. | Put them back as in the table above, or restore the previous version. |
| `no-sheet` | The `Orders` sheet was renamed or deleted. | Rename it back to `Orders`, or restore the previous version. |
| `conflict` ("too many changes at the same moment") | A rush of orders all saving at once. | Nothing to do usually; press **Retry Excel sync** if any stay failed. |
| A status change did not reach the sheet (`updateState: FAILED`) | AWS was unreachable, or one of the causes above. | Fix the cause, then press **Retry Excel sync** on the staff dashboard. |
| `updateState: ROW_MISSING` | The order's row is not in the sheet any more (someone deleted it). | Nothing is added back automatically. Add the row by hand if it was deleted by mistake. |

### Retrying
After fixing the cause, a staff member presses **Retry Excel sync** at the bottom of the staff dashboard (`/admin/orders`). It re-sends rows that are missing and fixes rows that are out of date, and tells you what it did. It is safe to press at any time and never creates duplicate rows. Full instructions: [EXCEL_SYNC.md](EXCEL_SYNC.md).

---

## 7. Security checklist

- [ ] **Block all public access** is on for the bucket, and the bucket is used only for this.
- [ ] The secret access key exists **only** in Firebase Secret Manager and your git-ignored `.secret.local`. It is never in the repo, in chat, or in an email.
- [ ] The IAM user has **only** the policy from step 2.1 and **no console access**.
- [ ] Bucket Versioning is on (step 1.4).
- [ ] The workbook is shared only with people who need it (it holds customer addresses). Give people a copy through the **Download orders sheet** button (staff only, 15-minute link, logged) or by sending them a downloaded copy, never by making the bucket or file public.
- [ ] You rotate the access key now and then: create a second key, update Firebase, test, then delete the old key.
- [ ] If the key is ever exposed: in IAM open the user's **Security credentials**, **delete** the key, create a new one, and update Firebase.
- [ ] Text that starts with `=`, `+`, `-` or `@` (a customer's address, or a phone number such as `+91...`) is written with a leading `'`, so it can never run as an Excel formula, even if the sheet is exported to CSV or pasted elsewhere. In this file that apostrophe **is visible** at the start of the cell. That is expected.
