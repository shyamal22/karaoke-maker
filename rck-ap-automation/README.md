# RCK AP Automation — Xero draft bill auto-coder

Automates the accounts-payable draft workflow for Jacks Hire Limited T/A RCK Auckland:

1. Fetches every **draft bill** (`Type=ACCPAY, Status=DRAFT`) from Xero — these are created
   automatically when invoices are emailed to the Xero bills inbox.
2. Proposes coding for each line: **account code** (from the supplier rulebook), **tracking**
   (Divisions + Plant/job), and the **RCK bill naming convention**
   (`<invoice #> - <DD.MM.YY> <site> - <job>`) so job-level P&L reporting from bill titles keeps working.
3. Applies the approved proposals back to Xero — bills **stay in Draft** for human review.
   Nothing is ever approved, submitted, or paid by this tool.
4. Emits an HTML report of everything it coded (one email per day via the Claude routine).

## One-time setup

### 1. Create a Xero "Custom Connection" app
Custom Connections are Xero's machine-to-machine auth — no browser login, no expiring refresh
tokens (a standard OAuth app's refresh tokens rotate on every use and cannot be stored reliably
from an ephemeral runner, so Custom Connection is the right choice here).

1. Go to https://developer.xero.com/app/manage → **New app** → type **Custom Connection**.
2. Scopes: `accounting.transactions`, `accounting.contacts.read`, `accounting.settings.read`.
3. Choose the authorising user; they approve the connection for **Jacks Hire Limited T/A RCK Auckland**.
4. Copy the **Client ID** and **Client Secret**.

Note: Custom Connections are a paid Xero add-on in NZ (small monthly fee, billed to the org).

### 2. Store the credentials as environment secrets
In the Claude cloud environment settings (session title bar → cloud environment menu → Edit →
Network secrets / environment variables), add:

- `XERO_CLIENT_ID`
- `XERO_CLIENT_SECRET`

New sessions pick them up automatically. Never paste these into chat.

## Usage

```bash
python3 autocode.py fetch --out out/            # pull draft bills -> out/drafts.json
python3 autocode.py propose --out out/          # rulebook -> out/proposals.json (editable)
python3 autocode.py apply --out out/ --dry-run  # show what would change, change nothing
python3 autocode.py apply --out out/            # write coding to Xero (bills stay DRAFT)
python3 autocode.py report --out out/ > report.html
```

The daily Claude routine runs fetch → propose (then reviews/edits the proposals with judgment,
e.g. job detection from messy OCR text) → apply → report, and emails the report to office@rcknz.co.nz.

## Rules

`rules.json` holds the learned rulebook:
- `supplier_accounts`: supplier name (contains-match, case-insensitive) → default account code
- `keyword_overrides`: line-description keyword → account code (beats the supplier default)
- `division_by_account`: account code → Divisions tracking option
- `job_keywords`: text keyword → Plant tracking option (the customer/job) used for job P&L

Edit it as the business changes; it is plain JSON.

## Safety

- Only bills with `Status=DRAFT` and `Type=ACCPAY` are ever touched.
- Amounts, quantities and tax totals are never modified — only account codes, tracking,
  descriptions (prefix only, never content) and the bill number/reference naming.
- `apply` re-fetches each bill immediately before writing and skips any bill that is no longer
  in Draft (someone may have approved it mid-run).
- Every applied change is listed in the daily report.
