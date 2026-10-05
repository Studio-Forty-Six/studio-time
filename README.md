# Studio Time

**Version 0.10** — 26 August 2026

A small local app for time tracking, invoicing, and estimates — built for a
solo design business paid by bank transfer. No subscription, no cloud, no
payment processing. Your data lives in one file on this Mac:
`data/db.json`.

## First-time setup (one time only)

1. **Install Node.js** if you don't already have it: go to
   [nodejs.org](https://nodejs.org), download the **LTS** version, and run
   the installer. (This is the only "developer tool" you need — everything
   else is already in this folder.)
2. Double-click **`Start Studio Time.command`**. A Terminal window will
   open, install a few things the very first time, and then open the app in
   your browser at `http://localhost:4173`.
3. Keep that Terminal window open while you use the app — it's the app
   running. Closing it (or pressing `Ctrl+C` in it) stops the app. Just
   double-click the `.command` file again whenever you want to use it.

If macOS warns that the file is from an unidentified developer: right-click
it → **Open** → **Open** again. You only need to do this once.

## What's in here

- **Timer** — start/stop/pause a timer against a client + project + task
  type, or add time manually with just a date and a duration (e.g. "2h
  15m") — no need to fiddle with exact start/end clock times.
- **Marking time as billed without an invoice** — for fixed-fee work
  where you still track hours to watch your budget: on **Time Entries**,
  tick the entries you've already been paid for some other way and hit
  **Mark as billed** (with an optional note for your own reference). Or
  from a **Project**'s page, click **Mark as billed** next to "Unbilled
  value" to clear everything unbilled on that project in one go. Either
  way, that time stops showing as unbilled and won't be offered again next
  time you build an invoice — but it still counts toward that project's
  budget/fixed-fee tracking, since the work still happened. A "Billed"
  entry can be unmarked again from Time Entries if you flagged something
  by mistake; entries actually attached to a real invoice can't be
  unmarked that way — edit or delete the invoice instead.
- **Clients** and **Projects** — contact info and project grouping. Each
  project can have a **project code** (e.g. `DRA004`, matching your design
  folder naming — there's a "Suggest" button that builds one from the
  client name plus the next free number) and an optional **budget**, either
  a not-to-exceed hourly cap or a fixed fee. Click into a project to see
  its budget progress, hours by task type, billed vs. unbilled value, and
  every time entry logged against it.
- **Task types & rates** (in Settings) — e.g. Web Design, Packaging Design,
  Advertising, Social Media, each with its own hourly rate. Rates auto-fill
  when you pick a task type, and you can still override per entry.
- **Invoices** — pick a client, select the unbilled time you want to bill
  (grouped by task type, or itemized), add any flat-fee line items, and
  generate a PDF with your bank transfer details printed on it. Email it
  straight to the client if you've set up email in Settings, or just
  download and send it yourself.
- **Estimates** — build a quote with line items and hourly rates, send it as
  a PDF, and mark it **Approved** or **Declined** once the client responds.
  See the note below on how approval actually works.
- **Reports** — invoiced/paid/outstanding totals, tracked hours and value,
  revenue by client, and hours by task type, all filterable by month/year/
  custom range. A separate **Project Budgets** table (not affected by the
  date filter, since budgets run for the life of the project) flags any
  project that's near or over its budget or fixed fee, with a progress bar
  per project.
- **Settings** — business info, bank details, tax (off by default), invoice
  and estimate numbering, task types, and email.

## About estimate "approval"

Because this app runs locally on your Mac rather than on a public website,
a client can't click a link to approve an estimate themselves. Send them
the PDF as usual — once they confirm by email, phone, or in person, open
the estimate and click **Approve** (or **Decline**) yourself. The estimate
still gets a clear status and a stamp on the PDF; it's just a step you
trigger rather than the client.

## About emailing invoices

To email a PDF directly from the app, add your email account's SMTP
details under **Settings → Email**. For Gmail, Outlook, or similar, you'll
need an **app-specific password**, not your normal login password — your
provider's help pages explain how to create one (search "app password"
plus your provider's name). This is stored in the local `data/db.json`
file only, in plain text — never sent anywhere else, but also not
encrypted, so don't use this on a shared or public computer. If you'd
rather not set this up, every invoice and estimate can be downloaded as a
PDF and sent from your own Mail app instead.

## Backing up your data

Everything lives in `data/db.json`. It's worth occasionally copying that
one file somewhere safe (Time Machine, iCloud Drive, a backup folder) —
especially before any macOS or Node.js updates. If you ever want to start
fresh, just delete `data/db.json` and restart the app.

## Limitations, on purpose

This was scoped to exactly what was asked for: time tracking, clients,
projects, per-task billing rates, invoices, estimates with an approval
step, and emailing PDFs. It does **not** include:

- Online payment collection (Stripe, PayPal, card payments)
- Recurring/automatic invoices or payment reminders
- Multi-user access or cloud sync (it's single-user, single-machine)

If any of that becomes useful later, all of it can be added — just ask.

## Version history

This is the first version with a formal number — earlier rounds of changes
(the initial build, project codes and budgets, Studio46 branding, timer
pause/resume, the date-and-duration entry redesign, and marking time as
billed without a full invoice) weren't individually numbered, so this log
starts here and will grow with each future update.

- **V0.10** (26 Aug 2026) — You can now CC someone when emailing an
  invoice or estimate, and set a default CC in Settings → Email (handy
  for CC'ing yourself as proof it was sent, or keeping a bookkeeper in
  the loop). The default pre-fills the CC field every time you send, but
  stays fully editable or clearable for any individual email.
- **V0.9** (25 Aug 2026) — Invoices now list every time entry on its own
  line (date, description, hours, rate, amount) instead of collapsing
  same-task entries into a single summary row — this is the new default.
  The old "combine into one line per task type" option is still there if
  you want it occasionally, and now shows a compact date range (e.g.
  "15–18 Aug 2026") when used. Added this version number/history.

